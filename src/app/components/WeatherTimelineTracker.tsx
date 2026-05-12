/**
 * WeatherTimelineTracker — 기상 예측 타임라인 (지도 하단 중앙)
 * 관제 패널·InfoCard와 동일 계열: 다크 네이비, 틸 보더, 기술적 밀도.
 */

import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, Ship, Zap } from "lucide-react";
import type { SlotScore } from "@/lib/kma-weather";

interface Props {
  scores: SlotScore[];
  slotCount?: number;
  safetyLevel: "안전" | "주의" | "긴급";
  /** 지금·예보 데이터 출처 한 줄(예: 상황보고/단기예보) */
  subtitle?: string;
}

function slotHour(offset: number) {
  const d = new Date();
  d.setHours(d.getHours() + offset, 0, 0, 0);
  return d.getHours().toString().padStart(2, "0");
}

function slotColor(verdict: string, score: number) {
  if (verdict === "불가" || score < 50) {
    return { bg: "#dc2626", fill: "rgba(220,38,38,0.88)", dim: "rgba(220,38,38,0.32)", ring: "rgba(248,113,113,0.55)" };
  }
  if (verdict === "주의" || score < 72) {
    return { bg: "#d97706", fill: "rgba(217,119,6,0.88)", dim: "rgba(245,158,11,0.28)", ring: "rgba(251,191,36,0.45)" };
  }
  return { bg: "#0d9488", fill: "rgba(13,148,136,0.85)", dim: "rgba(20,184,166,0.28)", ring: "rgba(45,212,191,0.4)" };
}

export function WeatherTimelineTracker({ scores, slotCount = 8, safetyLevel, subtitle }: Props) {
  const slots = scores.slice(0, slotCount);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const dangerIdx = useMemo(() => slots.findIndex((s) => s.verdict === "불가"), [slots]);
  const cautionIdx = useMemo(() => slots.findIndex((s) => s.verdict === "주의"), [slots]);
  const targetIdx = dangerIdx >= 0 ? dangerIdx : cautionIdx;

  const minsLeft = useMemo(() => {
    if (targetIdx <= 0) return null;
    const minInSlot = new Date().getMinutes();
    return (60 - minInSlot) + (targetIdx - 1) * 60;
  }, [targetIdx]);

  const arrivalTime = useMemo(() => {
    if (minsLeft == null) return null;
    const d = new Date();
    d.setMinutes(d.getMinutes() + minsLeft, 0, 0);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }, [minsLeft]);

  if (slots.length === 0) return null;

  const isDanger = safetyLevel === "긴급";
  const isCaution = safetyLevel === "주의";
  const accentBar = isDanger ? "#f87171" : isCaution ? "#fbbf24" : "#2dd4bf";
  const accentGlow = isDanger ? "rgba(248,113,113,0.22)" : isCaution ? "rgba(251,191,36,0.18)" : "rgba(45,212,191,0.16)";

  return (
    <>
    <div
      className="pointer-events-none absolute z-[25] w-[min(28rem,calc(100vw-2rem))] select-none"
      style={{ bottom: subtitle ? "1.65rem" : "1.15rem", left: "50%", transform: "translateX(-50%)" }}
    >
      <style>{`
        @keyframes wtt-slot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.35); }
          50% { box-shadow: 0 0 0 3px rgba(248,113,113,0.12); }
        }
        .wtt-slot-pulse { animation: wtt-slot-pulse 1.35s ease-in-out infinite; }
      `}</style>
      <div
        className="flex items-stretch gap-2.5 rounded-xl px-3 py-2 sm:gap-3 sm:px-3.5 sm:py-2.5"
        style={{
          background: "linear-gradient(160deg, rgba(12,39,72,0.94) 0%, rgba(8,27,52,0.96) 52%, rgba(6,16,24,0.94) 100%)",
          border: "1px solid rgba(64,224,208,0.22)",
          boxShadow: `0 14px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px ${accentGlow}`,
          backdropFilter: "blur(14px)",
        }}
      >
        <span className="w-1 shrink-0 self-stretch rounded-full" style={{ background: accentBar }} aria-hidden />

        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border sm:h-10 sm:w-10"
          style={{
            borderColor: "rgba(64,224,208,0.28)",
            background: "rgba(8, 27, 52, 0.65)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
          }}
          aria-hidden
        >
          <Ship className="h-4 w-4 text-teal-300/90 sm:h-[1.05rem] sm:w-[1.05rem]" strokeWidth={2} />
        </div>

        <div className="flex min-w-0 flex-1 gap-0.5 sm:gap-1">
          {slots.map((s, i) => {
            const c = slotColor(s.verdict, s.score);
            const isNow = i === 0;
            const isTarget = i === targetIdx && targetIdx > 0;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${slotHour(i)}:00 — ${s.verdict} (${Math.round(s.score)}점)`}>
                <span
                  className="text-[8px] font-semibold tabular-nums leading-none sm:text-[9px]"
                  style={{ color: isNow ? "rgba(204,251,241,0.92)" : "rgba(148,163,184,0.72)" }}
                >
                  {isNow ? "지금" : `${slotHour(i)}시`}
                </span>
                <div
                  className={`relative w-full rounded-md ${isTarget && isDanger ? "wtt-slot-pulse" : ""}`}
                  style={{
                    height: isNow ? 18 : 13,
                    background: isNow ? c.fill : c.dim,
                    border: isTarget ? `1.5px solid ${c.ring}` : isNow ? `1px solid ${c.bg}99` : "1px solid rgba(15,23,42,0.35)",
                    boxShadow: isNow ? `inset 0 1px 0 rgba(255,255,255,0.12), 0 0 8px ${c.bg}33` : "inset 0 1px 0 rgba(0,0,0,0.2)",
                  }}
                >
                  {isTarget ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      {dangerIdx >= 0 ? (
                        <Zap className="h-3 w-3 text-white/95 drop-shadow-sm" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-white/95 drop-shadow-sm" strokeWidth={2.2} aria-hidden />
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="flex min-w-[4.75rem] shrink-0 flex-col justify-center gap-0.5 border-l border-teal-400/15 pl-2.5 sm:min-w-[5.5rem] sm:pl-3"
        >
          {targetIdx > 0 && arrivalTime != null && minsLeft != null ? (
            <>
              <p
                className="flex items-center gap-1 text-[9px] font-bold leading-none"
                style={{ color: dangerIdx >= 0 ? "#fecaca" : "#fde68a" }}
              >
                {dangerIdx >= 0 ? (
                  <Zap className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                ) : (
                  <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.2} aria-hidden />
                )}
                {dangerIdx >= 0 ? "위험 예고" : "주의 예고"}
              </p>
              <p className="font-mono text-sm font-bold tabular-nums leading-tight text-slate-50 sm:text-[15px]">{arrivalTime}</p>
              <p className="text-[8px] font-medium tabular-nums text-slate-500">
                {minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}시간 ${minsLeft % 60}분 후` : `${minsLeft}분 후`}
              </p>
            </>
          ) : isDanger || (targetIdx === 0 && dangerIdx === 0) ? (
            <div
              className="rounded-md border px-2 py-1.5"
              style={{
                borderColor: "rgba(248,113,113,0.45)",
                background: "rgba(69,10,10,0.45)",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2)",
              }}
            >
              <p className="flex items-center gap-1 text-[10px] font-bold leading-tight text-red-100">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-300" strokeWidth={2.4} aria-hidden />
                지금 위험
              </p>
              <p className="mt-0.5 text-[8px] leading-snug text-red-200/75">즉시 기상·관제 확인</p>
            </div>
          ) : (
            <>
              <p className="text-[9px] font-semibold leading-none text-teal-300/90">구간 양호</p>
              <p className="text-xs font-bold tabular-nums text-slate-100 sm:text-sm">8시간</p>
              <p className="text-[8px] text-slate-500">예보 슬롯 기준</p>
            </>
          )}
        </div>
      </div>
    </div>
    {subtitle ? (
      <div
        className="pointer-events-none absolute z-[24] w-[min(28rem,calc(100vw-2rem))] select-none text-center"
        style={{ bottom: "0.35rem", left: "50%", transform: "translateX(-50%)" }}
      >
        <p className="mx-auto max-w-[98%] truncate px-1 text-[8px] leading-tight text-slate-400/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {subtitle}
        </p>
      </div>
    ) : null}
    </>
  );
}
