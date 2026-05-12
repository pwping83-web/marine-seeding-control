/** localStorage + 이벤트로 AiTicker 음성(읽어주기) 상태 동기화 */

export const AI_TICKER_SPEECH_MUTED_LS_KEY = "marine-ai-ticker-speech-muted";

/** AiTicker가 구독해 음소거 해제·즉시 반영 */
export const AI_TICKER_SPEECH_FORCE_UNMUTE_EVENT = "marine-ai-ticker-force-unmute";

/** 음소거 토글 시 AiWeatherJoltBanner 등이 동기화 */
export const AI_TICKER_SPEECH_MUTE_CHANGED_EVENT = "marine-ai-ticker-mute-changed";

export function readAiTickerSpeechMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AI_TICKER_SPEECH_MUTED_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dispatchAiTickerSpeechMuteChanged(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_TICKER_SPEECH_MUTE_CHANGED_EVENT, { detail: { muted } }));
}

/** AI 보조 화면을 열 때 — 전체 항해 인원이 들을 수 있도록 읽어주기 모드로 맞춤 */
export function forceAiTickerSpeechUnmuteForCrew(): void {
  try {
    localStorage.setItem(AI_TICKER_SPEECH_MUTED_LS_KEY, "0");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    dispatchAiTickerSpeechMuteChanged(false);
    window.dispatchEvent(new CustomEvent(AI_TICKER_SPEECH_FORCE_UNMUTE_EVENT));
  }
}
