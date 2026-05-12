/**
 * 브라우저 Web Speech API — 한국어 안내 음성(가능하면 자연·신경망·여성 엔진 우선).
 * 품질은 OS·브라우저 설치 음성에 따릅니다(Windows: Microsoft Heami·Seoyeon 등).
 */

const MAX_SPEECH_CHARS = 520;

let voicesReadyPromise: Promise<void> | null = null;

/** 티커 갱신 시: 현재 문장 끝까지 읽은 뒤 마지막 자막만 이어서 읽기 */
let pendingCoalesced: string | null = null;
let internalSpeaking = false;
/** stop/cancel과 비동기 onend 경합 방지 */
let speechGeneration = 0;

function ensureVoicesLoaded(): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve();
  }
  if (window.speechSynthesis.getVoices().length > 0) {
    return Promise.resolve();
  }
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    window.setTimeout(done, 1500);
  });
  return voicesReadyPromise;
}

/** 자막용 이모지·과도 공백 정리(읽기 자연스럽게) */
export function sanitizeTickerForSpeech(text: string): string {
  return text
    .replace(/🚨/g, "긴급. ")
    .replace(/⚠️/g, "주의. ")
    .replace(/✅/g, "")
    .replace(/⚡/g, "")
    .replace(/🌱/g, " ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreKoreanVoice(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (!v.lang.toLowerCase().startsWith("ko")) return -1;
  if (v.lang.toLowerCase() === "ko-kr") s += 4;
  if (
    /female|여성|woman|yuna|heami|heeun|hayoung|sohee|sora|nara|seoyeon|suyeong|inseo|sun-hi|미영|민경|지은|서연|예진|보영|지혜|하준/.test(n)
  ) {
    s += 15;
  }
  if (/neural|natural|premium|enhanced|wavenet|multilingual|azure|polly|onecore|online|hd\b|generative/.test(n)) {
    s += 12;
  }
  if (/google|microsoft|apple|edge|네이버|clova|kakao|naver|cortana/.test(n)) s += 8;
  if (v.localService) s += 3;
  if (/male|남성|bok|hyun|민재/.test(n)) s += 5;
  return s;
}

async function pickBestKoreanVoice(): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  await ensureVoicesLoaded();
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ko"));
  if (voices.length === 0) return null;
  const ranked = [...voices].sort((a, b) => scoreKoreanVoice(b) - scoreKoreanVoice(a));
  return ranked[0] ?? voices[0];
}

/** @deprecated 이름 유지 — 내부적으로 최적 한국어 음성 선택 */
export async function pickKoreanFemaleVoice(): Promise<SpeechSynthesisVoice | null> {
  return pickBestKoreanVoice();
}

export type SpeakAiGuidanceOptions = {
  /** true면 이전 AI 안내 읽기 취소 후 새로 읽음(기본 true). 날씨 급변 등 긴급 멘트용 */
  interrupt?: boolean;
  /**
   * true면 현재 발화를 끊지 않고, 끝난 뒤 **가장 최근** 자막만 이어 읽음(AI 티커 연속 읽기).
   * `interrupt: true`와 함께 쓰이면 대기열을 비우고 즉시 새 멘트만 읽음.
   */
  queueCoalesce?: boolean;
};

function tryDrainCoalesced(): void {
  if (internalSpeaking) return;
  const next = pendingCoalesced;
  if (!next) return;
  pendingCoalesced = null;
  void speakUtteranceRaw(next);
}

function speakUtteranceRaw(raw: string): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve();
  }

  const myGen = speechGeneration;
  internalSpeaking = true;

  return (async () => {
    try {
      await ensureVoicesLoaded();
      if (myGen !== speechGeneration) return;
      const voice = await pickBestKoreanVoice();
      if (myGen !== speechGeneration) {
        tryDrainCoalesced();
        return;
      }
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(raw);
        u.lang = "ko-KR";
        u.rate = 0.9;
        u.pitch = 1.04;
        u.volume = 1;
        if (voice) u.voice = voice;
        const done = () => {
          if (myGen !== speechGeneration) {
            resolve();
            return;
          }
          internalSpeaking = false;
          resolve();
          tryDrainCoalesced();
        };
        u.onend = done;
        u.onerror = done;
        try {
          window.speechSynthesis.resume();
        } catch {
          /* ignore */
        }
        window.speechSynthesis.speak(u);
      });
    } catch {
      if (myGen === speechGeneration) {
        internalSpeaking = false;
        tryDrainCoalesced();
      }
    }
  })();
}

/**
 * AI 자막·안내 문구를 읽어 줌.
 * - 기본: `interrupt`가 true면 진행 중 발화 취소 후 새 텍스트.
 * - `queueCoalesce`: 티커처럼 자주 바뀔 때 끊지 않고, 끝난 뒤 최신 문구만 이어 읽음.
 */
export async function speakAiGuidance(text: string, options?: SpeakAiGuidanceOptions): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  let raw = sanitizeTickerForSpeech(text);
  if (!raw) return;
  if (raw.length > MAX_SPEECH_CHARS) {
    raw = `${raw.slice(0, MAX_SPEECH_CHARS)}… 이하 생략.`;
  }

  const queueCoalesce = options?.queueCoalesce === true;
  const interrupt = options?.interrupt !== false;

  if (queueCoalesce) {
    if (interrupt) {
      stopAiGuidanceSpeech();
      await speakUtteranceRaw(raw);
      return;
    }
    if (internalSpeaking) {
      pendingCoalesced = raw;
      return;
    }
    await speakUtteranceRaw(raw);
    return;
  }

  if (interrupt) {
    stopAiGuidanceSpeech();
  }
  await speakUtteranceRaw(raw);
}

export function stopAiGuidanceSpeech(): void {
  pendingCoalesced = null;
  internalSpeaking = false;
  speechGeneration += 1;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
