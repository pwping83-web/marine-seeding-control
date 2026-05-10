/**
 * WeatherTimelineTracker — 심플 기상 예측 타임라인
 * 지도 하단 얇은 스트립. 8시간 슬롯을 컬러 칸으로 표시.
 */

import { useMemo, useState, useEffect } from "react";
import type { SlotScore } from "@/lib/kma-weather";

interface Props {
  scores: SlotScore[];
  slotCount?: number;
  safetyLevel: "안전" | "주의" | "긴급";
}

function slotHour(offset: number) {
  const d = new Date();
  d.setHours(d.getHours() + offset, 0, 0, 0);
  return d.getHours().toString().padStart(2, "0");
}

function slotColor(verdict: string, score: number) {
  if (verdict === "불가" || score < 50) return { bg: "#ef4444", text: "#fca5a5", dim: "rgba(239,68,68,0.38)" };
  if (verdict === "주의" || score < 72) return { bg: "#f59e0b", text: "#fcd34d", dim: "rgba(245,158,11,0.36)" };
  return { bg: "#10b981", text: "#6ee7b7", dim: "rgba(16,185,129,0.34)" };
}

export function WeatherTimelineTracker({ scores, slotCount = 8, safetyLevel }: Props) {
  const slots = scores.slice(0, slotCount);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const dangerIdx  = useMemo(() => slots.findIndex((s) => s.verdict === "불가"), [slots]);
  const cautionIdx = useMemo(() => slots.findIndex((s) => s.verdict === "주의"), [slots]);
  const targetIdx  = dangerIdx >= 0 ? dangerIdx : cautionIdx;

  const minsLeft = useMemo(() => {
    if (targetIdx <= 0) return null;
    const minInSlot = new Date().getMinutes();
    return (60 - minInSlot) + (targetIdx - 1) * 60;
  }, [targetIdx]);

  const arrivalTime = useMemo(() => {
    if (!minsLeft) return null;
    const d = new Date();
    d.setMinutes(d.getMinutes() + minsLeft, 0, 0);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }, [minsLeft]);

  if (slots.length === 0) return null;

  const isDanger  = safetyLevel === "긴급";
  const isCaution = safetyLevel === "주의";
  const accentCol = isDanger ? "#ef4444" : isCaution ? "#f59e0b" : "#10b981";

  return (
    <div
      className="pointer-events-none select-none absolute"
      style={{ bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 25, width: "min(420px, 88vw)" }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-2xl"
        style={{
          background: "linear-gradient(180deg, rgba(8,18,42,0.88) 0%, rgba(4,10,24,0.82) 100%)",
          backdropFilter: "blur(12px)",
          border: `1px solid ${accentCol}55`,
          boxShadow: `0 4px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
      >
        {/* 선박 아이콘 */}
        <span style={{ fontSize: 18, lineHeight: 1, filter: "drop-shadow(0 0 6px rgba(0,200,255,0.7))" }}>🚢</span>

        {/* 8시간 슬롯 */}
        <div className="flex flex-1 gap-0.5">
          {slots.map((s, i) => {
            const c = slotColor(s.verdict, s.score);
            const isNow = i === 0;
            const isTarget = i === targetIdx && targetIdx > 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5"
                title={`${slotHour(i)}:00 — ${s.verdict} (${Math.round(s.score)}점)`}>
                {/* 시간 레이블 */}
                <span className="text-[8px] font-mono leading-none"
                  style={{ color: isNow ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.42)" }}>
                  {isNow ? "지금" : `${slotHour(i)}시`}
                </span>
                {/* 컬러 막대 */}
                <div className="w-full rounded-md relative"
                  style={{
                    height: isNow ? 20 : 14,
                    background: isNow ? c.bg : c.dim,
                    border: isTarget ? `1.5px solid ${c.bg}` : isNow ? `1px solid ${c.bg}` : "1px solid transparent",
                    boxShadow: (isNow || isTarget) ? `0 0 6px ${c.bg}60` : "none",
                    animation: isTarget && isDanger ? "pulse 1s infinite" : "none",
                  }}>
                  {isTarget && (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px]">
                      {dangerIdx >= 0 ? "⚡" : "⚠️"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 우측 상태 요약 */}
        <div className="shrink-0 text-right" style={{ minWidth: 72 }}>
          {targetIdx > 0 && arrivalTime ? (
            <>
              <p className="text-[9px] font-bold" style={{ color: dangerIdx >= 0 ? "#fca5a5" : "#fcd34d" }}>
                {dangerIdx >= 0 ? "⚡ 위험" : "⚠️ 주의"}
              </p>
              <p className="text-[13px] font-black text-white leading-tight tabular-nums">{arrivalTime}</p>
              <p className="text-[8px] text-white/50">
                {minsLeft! >= 60 ? `${Math.floor(minsLeft! / 60)}h ${minsLeft! % 60}m 후` : `${minsLeft}분 후`}
              </p>
            </>
          ) : (isDanger || (targetIdx === 0 && dangerIdx === 0)) ? (
            <p className="text-[11px] font-black text-red-400 leading-snug animate-pulse">🚨 지금<br />위험</p>
          ) : (
            <>
              <p className="text-[9px] text-emerald-400 font-bold">✓ 안전</p>
              <p className="text-[11px] font-black text-white">8시간</p>
              <p className="text-[8px] text-white/50">이상 없음</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
