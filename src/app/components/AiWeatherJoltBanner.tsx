/**
 * 날씨 급변 시 AI 자막 티커 위에 한 줄 안내 + 음성(읽어주기 모드일 때만).
 * AiTicker 음소거와 동일한 localStorage·이벤트를 따릅니다.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import {
  AI_TICKER_SPEECH_FORCE_UNMUTE_EVENT,
  AI_TICKER_SPEECH_MUTE_CHANGED_EVENT,
  readAiTickerSpeechMuted,
} from "@/lib/ai-ticker-speech-prefs";
import { speakAiGuidance, stopAiGuidanceSpeech } from "@/lib/korean-tts";

const JOLT_MENT =
  "날씨 변화가 급박합니다. AI 판단으로 선박이 출렁일 수 있으니 대비하세요.";

function safetyRank(level: string): number {
  if (level === "긴급") return 2;
  if (level === "주의") return 1;
  return 0;
}

export function AiWeatherJoltBanner({
  windSpeedMps,
  waveHeightM,
  safetyLevel,
}: {
  windSpeedMps: number;
  waveHeightM: number;
  safetyLevel: string;
}) {
  const [visible, setVisible] = useState(false);
  const prevWind = useRef<number | null>(null);
  const prevWave = useRef<number | null>(null);
  const prevLevel = useRef<string | null>(null);
  const primeSamples = useRef(0);
  const lastJoltAt = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMute = () => {
      if (readAiTickerSpeechMuted()) stopAiGuidanceSpeech();
    };
    window.addEventListener(AI_TICKER_SPEECH_MUTE_CHANGED_EVENT, onMute);
    window.addEventListener(AI_TICKER_SPEECH_FORCE_UNMUTE_EVENT, onMute);
    return () => {
      window.removeEventListener(AI_TICKER_SPEECH_MUTE_CHANGED_EVENT, onMute);
      window.removeEventListener(AI_TICKER_SPEECH_FORCE_UNMUTE_EVENT, onMute);
    };
  }, []);

  useEffect(() => {
    const pw = prevWind.current;
    const ph = prevWave.current;
    const pl = prevLevel.current;

    if (pw === null || ph === null || pl === null) {
      prevWind.current = windSpeedMps;
      prevWave.current = waveHeightM;
      prevLevel.current = safetyLevel;
      return;
    }

    if (primeSamples.current < 2) {
      primeSamples.current += 1;
      prevWind.current = windSpeedMps;
      prevWave.current = waveHeightM;
      prevLevel.current = safetyLevel;
      return;
    }

    const dw = Math.abs(windSpeedMps - pw);
    const dh = Math.abs(waveHeightM - ph);
    const levelUp = safetyRank(safetyLevel) > safetyRank(pl);
    const windJump = dw >= 2.4;
    const waveJump = dh >= 0.32;
    const rapid = windJump || waveJump || levelUp;

    prevWind.current = windSpeedMps;
    prevWave.current = waveHeightM;
    prevLevel.current = safetyLevel;

    if (!rapid) return;

    const now = Date.now();
    if (now - lastJoltAt.current < 72_000) return;
    lastJoltAt.current = now;

    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);

    setVisible(true);
    hideTimerRef.current = window.setTimeout(() => setVisible(false), 40_000);

    speakTimerRef.current = window.setTimeout(() => {
      if (typeof window === "undefined") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (readAiTickerSpeechMuted()) return;
      void speakAiGuidance(JOLT_MENT, { interrupt: true });
    }, 520);
  }, [windSpeedMps, waveHeightM, safetyLevel]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="w-full min-w-0 shrink-0 border-b border-amber-400/35 px-3 py-1.5"
      style={{
        background: "linear-gradient(90deg, rgba(120,53,15,0.35) 0%, rgba(12,39,72,0.55) 55%, rgba(8,27,52,0.5) 100%)",
        backdropFilter: "blur(8px)",
      }}
      role="status"
      aria-live="polite"
    >
      <p className="flex items-start gap-2 text-[10.5px] font-semibold leading-snug text-amber-50 sm:text-[11px]">
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" strokeWidth={2.25} aria-hidden />
        <span className="min-w-0">{JOLT_MENT}</span>
      </p>
    </div>
  );
}
