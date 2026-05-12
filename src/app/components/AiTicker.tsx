/**
 * 관제·모바일 공통 — 상단 AI 자막(마퀴) 티커 + 음성 안내(한국어 여성 음성 우선)
 */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  AI_TICKER_SPEECH_FORCE_UNMUTE_EVENT,
  AI_TICKER_SPEECH_MUTED_LS_KEY,
  dispatchAiTickerSpeechMuteChanged,
} from "@/lib/ai-ticker-speech-prefs";
import { sanitizeTickerForSpeech, speakAiGuidance, stopAiGuidanceSpeech } from "@/lib/korean-tts";

export function AiTicker({
  vesselName,
  safetyLevel,
  groqSummary,
  aiMsg,
  windSpeed,
  waveHeight,
  temp,
  attachmentCue,
}: {
  vesselName: string;
  safetyLevel: string;
  groqSummary: string;
  aiMsg: string;
  windSpeed: number;
  waveHeight: number;
  temp: number;
  attachmentCue: string;
}) {
  const [speechMuted, setSpeechMuted] = useState(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const lastSpokenRef = useRef<string>("");

  useEffect(() => {
    try {
      setSpeechMuted(localStorage.getItem(AI_TICKER_SPEECH_MUTED_LS_KEY) === "1");
    } catch {
      /* ignore */
    }
    setPrefsHydrated(true);
  }, []);

  useEffect(() => {
    const onForceUnmute = () => {
      setSpeechMuted(false);
      lastSpokenRef.current = "";
    };
    window.addEventListener(AI_TICKER_SPEECH_FORCE_UNMUTE_EVENT, onForceUnmute);
    return () => window.removeEventListener(AI_TICKER_SPEECH_FORCE_UNMUTE_EVENT, onForceUnmute);
  }, []);

  const color = safetyLevel === "긴급" ? "#fca5a5" : safetyLevel === "주의" ? "#fcd34d" : "#6ee7b7";
  const base = `${safetyLevel === "긴급" ? "🚨 즉시 회항 권고" : safetyLevel === "주의" ? "⚠️ 기상 주의" : "✅ 안전 운항"} · 풍속 ${windSpeed.toFixed(1)}m/s · 파고 ${waveHeight.toFixed(1)}m · 기온 ${temp.toFixed(0)}°C`;
  const g = groqSummary.trim();
  const a = aiMsg.trim();
  const extra = g ? ` · ⚡ ${g}` : a ? ` · ${a}` : "";
  const att = attachmentCue.trim();
  const attPart = att ? ` · 🌱 ${att}` : "";
  const segment = `${vesselName} · ${base}${extra}${attPart}`;
  /** 긴 문구는 스크롤 구간을 늘려 끝까지 지나가게 함 (모바일 좁은 폭에서 특히) */
  const scrollSec = Math.max(26, Math.min(56, 18 + segment.length * 0.072));
  const pauseSec = 30;
  const cycleSec = scrollSec + pauseSec;
  const scrollEndPct = (scrollSec / cycleSec) * 100;

  useEffect(() => {
    if (!prefsHydrated || speechMuted) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const spokenKey = sanitizeTickerForSpeech(segment);
    if (!spokenKey) return;
    if (spokenKey === lastSpokenRef.current) return;

    const timer = window.setTimeout(() => {
      const again = sanitizeTickerForSpeech(segment);
      if (!again || again === lastSpokenRef.current) return;
      lastSpokenRef.current = again;
      void speakAiGuidance(segment, { queueCoalesce: true, interrupt: false });
    }, 680);

    return () => window.clearTimeout(timer);
  }, [prefsHydrated, speechMuted, segment]);

  useEffect(() => {
    if (speechMuted) stopAiGuidanceSpeech();
  }, [speechMuted]);

  const toggleSpeechMuted = () => {
    setSpeechMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AI_TICKER_SPEECH_MUTED_LS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      dispatchAiTickerSpeechMuteChanged(next);
      if (next) {
        stopAiGuidanceSpeech();
      } else {
        lastSpokenRef.current = "";
      }
      return next;
    });
  };

  return (
    <div
      className="w-full min-w-0 shrink-0 overflow-hidden border-b border-white/[0.06]"
      style={{
        background: `${color}0a`,
        borderTop: `1px solid ${color}22`,
        backdropFilter: "blur(6px)",
      }}
      title={segment}
    >
      <style>{`
        @keyframes aiTickerCycle {
          /* 100vw: 화면 오른쪽 밖에서 입장 — %만 쓰면 요소 너비 오인 시 짧게 끊김 */
          0% { transform: translateX(100vw); }
          ${scrollEndPct.toFixed(3)}% { transform: translateX(calc(-100% - 100vw - 1.5rem)); }
          100% { transform: translateX(calc(-100% - 100vw - 1.5rem)); }
        }
        .ai-marquee-track {
          display: inline-block;
          width: max-content;
          max-width: none;
          flex-shrink: 0;
          white-space: nowrap;
          padding-left: 1rem;
          padding-right: 1rem;
          animation: aiTickerCycle ${cycleSec}s linear infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-marquee-track {
            animation: none;
            transform: none;
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
          }
        }
      `}</style>
      <div className="relative flex w-full min-w-0 items-stretch gap-0 py-1.5">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="ai-marquee-track text-[11px] font-semibold sm:text-[13px]" role="presentation" style={{ color }}>
            {segment}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleSpeechMuted}
          className="shrink-0 self-center px-1.5 py-0.5 text-[10px] font-semibold text-white/75 hover:bg-white/10 hover:text-white sm:px-2 sm:text-[11px]"
          aria-pressed={speechMuted}
          aria-label={
            speechMuted
              ? "읽어주기 켜기 — 전체 항해 인원이 들을 수 있습니다"
              : "음소거 — 조용히 할 때"
          }
          title={
            speechMuted
              ? "읽어주기 켜기 — 전체 항해 인원이 들을 수 있게 합니다"
              : "음소거 — AI 자막 음성만 끕니다. 켜 두면 자막이 바뀔 때마다 이어서 읽습니다(가능한 한 좋은 한국어 음성)."
          }
        >
          <span className="tabular-nums" aria-hidden>
            {speechMuted ? "🔇" : "🔊"}
          </span>
          <span className="ml-0.5 hidden min-[380px]:inline">{speechMuted ? "음소거" : "읽어주기"}</span>
        </button>
      </div>
    </div>
  );
}
