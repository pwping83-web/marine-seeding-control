/**
 * AI 기상 분석 패널
 *
 * 기능:
 *  1. 기상청 Open API(단기예보) 폴링·탭 복귀 시 재조회 → 없으면 목업 데이터
 *  2. AI 출항 가능 시간대 자동 산정 (scoreHourSlot + buildDeparturePlan)
 *  3. 실시간 기상 악화 감지 → 긴급 회항 콜백 발생 (assessEmergency)
 *
 * props:
 *  onEmergencyReturn(message) — 관제 패널에서 회항 명령 트리거에 연결
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Thermometer,
  Wind,
  Waves,
  CloudRain,
  CalendarCheck,
  Siren,
} from "lucide-react";
import {
  assessEmergency,
  buildDeparturePlan,
  estimatedVisibilityKmFromSlot,
  fetchKmaForecast,
  generateMockForecast,
  kmaForecastPollMs,
  kmaRealtimeCheckMs,
  pickCurrentOrNextKmaSlot,
  sortKmaSlotsByTime,
  type DeparturePlan,
  type EmergencyAssessment,
  type KmaHourSlot,
} from "@/lib/kma-weather";
import {
  analyzeWeatherWithGroq,
  isGroqConfigured,
  type GroqWeatherReport,
} from "@/lib/groq-weather";

// ─── 폴링 주기 (ms) — kma-weather.ts 기본값 + VITE_KMA_*_POLL_MS 로 조절 ───
const FORECAST_POLL_MS = kmaForecastPollMs();
const REALTIME_CHECK_MS = kmaRealtimeCheckMs();
const GROQ_DEBOUNCE_MS = 8 * 1000; // Groq 호출 최소 간격

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** 긴급 회항 판단 시 상위 컴포넌트로 메시지 전달 */
  onEmergencyReturn?: (message: string, assessment: EmergencyAssessment) => void;
  /** 안전 레벨 변경 시 상위 컴포넌트로 전달 (헤더 배지 연동) */
  onSafetyLevelChange?: (level: EmergencyAssessment["level"]) => void;
  /** 예보 슬롯 점수 변경 시 상위 컴포넌트로 전달 (지도 오버레이 타임라인 연동) */
  onScoresChange?: (scores: import("@/lib/kma-weather").SlotScore[]) => void;
  /** Groq AI 한 줄 요약 변경 시 상위 컴포넌트로 전달 */
  onGroqSummaryChange?: (summary: string) => void;
  /** 관제 화면 `weather`와 동기(기상청 예보 또는 현장 상황보고). 전달 시 긴급·Groq·표시 수치가 이 값 우선. */
  liveWeather?: {
    windSpeed: number;
    windDir: number;
    waveHeight: number;
    ptyCode?: number;
    temp?: number;
    pop?: number;
    sky?: number;
  };
  /** Groq 기상 요약에 넣는 ‘지금’ 데이터 출처 문구 */
  groqNowcastContext?: string;
  /** 컴팩트 모드: 헤더 영역 최소화 */
  compact?: boolean;
}

// ─── 서브컴포넌트 ─────────────────────────────────────────────────────────────

function ScoreBadge({ score, verdict }: { score: number; verdict: string }) {
  const color =
    verdict === "가능"
      ? "bg-emerald-600"
      : verdict === "주의"
      ? "bg-amber-500"
      : "bg-red-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-white ${color}`}>
      {verdict} {score}
    </span>
  );
}

function AlertBanner({ level, message }: { level: EmergencyAssessment["level"]; message: string }) {
  if (level === "안전") return null;
  const bg = level === "긴급" ? "bg-red-600" : "bg-amber-500";
  const Icon = level === "긴급" ? Siren : AlertTriangle;
  return (
    <div className={`flex items-start gap-2 rounded-lg p-3 text-white ${bg} animate-pulse`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <p className="text-sm font-semibold">{message}</p>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function WeatherAIPanel({
  onEmergencyReturn,
  onSafetyLevelChange,
  onScoresChange,
  onGroqSummaryChange,
  liveWeather,
  groqNowcastContext,
  compact,
}: Props) {
  const [slots, setSlots] = useState<KmaHourSlot[]>([]);
  const [plan, setPlan] = useState<DeparturePlan | null>(null);
  const [emergency, setEmergency] = useState<EmergencyAssessment>({
    returnNow: false,
    level: "안전",
    triggers: [],
    message: "현재 기상: 데이터 로딩 중…",
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [groqReport, setGroqReport] = useState<GroqWeatherReport | null>(null);
  const [groqLoading, setGroqLoading] = useState(false);

  const prevReturnNowRef = useRef(false);
  const groqLastCalledRef = useRef(0);

  // ─── 예보 로드 ─────────────────────────────────────────────────────────────
  const loadForecast = useCallback(async () => {
    setLoading(true);
    try {
      let fetched = await fetchKmaForecast();
      let mock = false;
      if (!fetched || fetched.length === 0) {
        fetched = sortKmaSlotsByTime(generateMockForecast());
        mock = true;
      } else {
        fetched = sortKmaSlotsByTime(fetched);
      }
      const newPlan = buildDeparturePlan(fetched);
      setSlots(fetched);
      setPlan(newPlan);
      setUsingMock(mock);
      setLastUpdated(new Date());
      onScoresChange?.(newPlan.allScores);
    } finally {
      setLoading(false);
    }
  }, [onScoresChange]);

  // 초기 로드 + 주기 폴링
  useEffect(() => {
    loadForecast();
    const id = setInterval(loadForecast, FORECAST_POLL_MS);
    return () => clearInterval(id);
  }, [loadForecast]);

  // 브라우저 탭 복귀 시 즉시 재조회(항차·관제 화면 복귀 시 stale 완화)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void loadForecast();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadForecast]);

  // ─── 긴급 회항 실시간 체크 ─────────────────────────────────────────────────
  useEffect(() => {
    function evaluate() {
      // 실측값이 있으면 우선, 없으면 현재 시각에 가장 가까운 예보 슬롯
      const nowSlot = pickCurrentOrNextKmaSlot(slots);
      const src = liveWeather ?? nowSlot;
      if (!src) return;

      const visSlot = {
        sky: ("sky" in src && src.sky != null ? src.sky : liveWeather?.sky) ?? 1,
        ptyCode: ("ptyCode" in src && src.ptyCode != null ? src.ptyCode : liveWeather?.ptyCode) ?? 0,
        pop: ("pop" in src && src.pop != null ? src.pop : liveWeather?.pop) ?? 0,
      };
      const visibilityKm = estimatedVisibilityKmFromSlot(visSlot);

      const assessment = assessEmergency({
        windSpeed: src.windSpeed,
        windDir: "windDir" in src ? src.windDir : liveWeather?.windDir ?? 0,
        waveHeight: "waveHeight" in src ? src.waveHeight : liveWeather?.waveHeight ?? 0,
        ptyCode: "ptyCode" in src ? src.ptyCode : liveWeather?.ptyCode ?? 0,
        pcp: 0,
        temp: "temp" in src ? src.temp : liveWeather?.temp ?? 15,
        pop: "pop" in src ? src.pop : liveWeather?.pop ?? 0,
        sky: "sky" in src ? src.sky : liveWeather?.sky ?? 1,
      });

      setEmergency(assessment);
      onSafetyLevelChange?.(assessment.level);

      // 새롭게 긴급 상태가 됐을 때만 콜백
      if (assessment.returnNow && !prevReturnNowRef.current) {
        onEmergencyReturn?.(assessment.message, assessment);
      }
      prevReturnNowRef.current = assessment.returnNow;

      // Groq AI 자연어 리포트 (레벨 변화 또는 8초 이상 경과 시)
      if (isGroqConfigured()) {
        const now = Date.now();
        if (now - groqLastCalledRef.current >= GROQ_DEBOUNCE_MS) {
          groqLastCalledRef.current = now;
          setGroqLoading(true);

          // 위험 슬롯까지 남은 분
          const dangerIdx = plan?.allScores.findIndex((s) => s.verdict === "불가") ?? -1;
          const nowMin = new Date().getMinutes();
          const minutesToDanger = dangerIdx > 0
            ? (60 - nowMin) + (dangerIdx - 1) * 60
            : null;

          void analyzeWeatherWithGroq({
            windSpeed: src.windSpeed,
            waveHeight: "waveHeight" in src ? (src as KmaHourSlot).waveHeight : liveWeather?.waveHeight ?? 0,
            temp: "temp" in src ? (src as KmaHourSlot).temp : liveWeather?.temp ?? 15,
            pop: "pop" in src ? (src as KmaHourSlot).pop : liveWeather?.pop ?? 0,
            visibility: visibilityKm,
            assessment,
            minutesToDanger,
            nowcastContext: groqNowcastContext,
          }).then((report) => {
            if (report) {
              setGroqReport(report);
              onGroqSummaryChange?.(report.summary);
            }
          }).finally(() => setGroqLoading(false));
        }
      }
    }

    evaluate();
    const id = setInterval(evaluate, REALTIME_CHECK_MS);
    return () => clearInterval(id);
  }, [slots, plan, liveWeather, groqNowcastContext, onEmergencyReturn, onSafetyLevelChange, onGroqSummaryChange]);

  // ─── 렌더 ──────────────────────────────────────────────────────────────────

  const nowSlot = pickCurrentOrNextKmaSlot(slots);

  // 현재 기상 소스: 실측값 우선, 없으면 예보 첫 슬롯
  const liveWind   = liveWeather?.windSpeed  ?? nowSlot?.windSpeed  ?? 0;
  const liveWave   = liveWeather?.waveHeight ?? nowSlot?.waveHeight ?? 0;
  const liveTemp   = liveWeather?.temp       ?? nowSlot?.temp       ?? 0;
  const livePop    = liveWeather?.pop        ?? nowSlot?.pop        ?? 0;

  const safetyBg =
    emergency.level === "긴급" ? "rgba(120,0,0,0.9)"
    : emergency.level === "주의" ? "rgba(92,58,0,0.9)"
    : "rgba(0,60,20,0.85)";
  const safetyBorder =
    emergency.level === "긴급" ? "rgba(239,68,68,0.8)"
    : emergency.level === "주의" ? "rgba(251,191,36,0.7)"
    : "rgba(16,185,129,0.6)";
  const safetyIcon =
    emergency.level === "긴급" ? "🚨" : emergency.level === "주의" ? "⚠️" : "✅";

  return (
    <div className="flex flex-col gap-2 text-sm">

      {/* ══ 안전 상태 카드 ═══════════════════════════════════════════════════════ */}
      <div
        className="rounded-xl flex flex-col"
        style={{ background: safetyBg, border: `1.5px solid ${safetyBorder}`, padding: compact ? "8px 10px" : "12px" }}
      >
        {/* 레벨 행 */}
        <div className="flex items-center gap-2">
          <span className={compact ? "text-lg leading-none" : "text-2xl leading-none"}>{safetyIcon}</span>
          <p
            className="font-black leading-tight flex-1"
            style={{
              fontSize: compact ? 12 : 14,
              color: emergency.level === "긴급" ? "#fca5a5" : emergency.level === "주의" ? "#fcd34d" : "#6ee7b7",
            }}
          >
            {emergency.level === "긴급" ? "즉시 회항 권고"
              : emergency.level === "주의" ? "기상 주의"
              : "안전 — 작업 가능"}
          </p>
          <button onClick={loadForecast} disabled={loading} title="갱신"
            className="text-white/30 hover:text-white transition-colors shrink-0">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* 경고 조건 (있을 때만) */}
        {emergency.triggers.length > 0 && (
          <p className="text-[10px] mt-1 leading-snug" style={{ color: emergency.level === "긴급" ? "#fca5a5" : "#fcd34d" }}>
            {emergency.triggers[0]}{emergency.triggers.length > 1 ? ` 외 ${emergency.triggers.length - 1}건` : ""}
          </p>
        )}

        {/* 수치 그리드 (compact 아닐 때) */}
        {!compact && (
          <div className="grid grid-cols-4 gap-1.5 mt-2">
            <MiniStat label="풍속" value={liveWind.toFixed(1)} unit="m/s"
              level={liveWind >= 13 ? "danger" : liveWind >= 10 ? "caution" : "ok"} />
            <MiniStat label="파고" value={liveWave.toFixed(1)} unit="m"
              level={liveWave >= 1.5 ? "danger" : liveWave >= 1.0 ? "caution" : "ok"} />
            <MiniStat label="기온" value={String(Math.round(liveTemp))} unit="°C" level="ok" />
            <MiniStat label="강수" value={String(livePop)} unit="%"
              level={livePop >= 70 ? "danger" : livePop >= 50 ? "caution" : "ok"} />
          </div>
        )}

        {/* 갱신 시각 */}
        <p className="text-white/25 text-[9px] text-right mt-1">
          {usingMock && <span className="text-amber-400/60 mr-1">시연</span>}
          {lastUpdated ? lastUpdated.toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" }) : "로딩…"}
        </p>
      </div>

      {/* ══ Groq AI 자연어 리포트 ═══════════════════════════════════════════════ */}
      {isGroqConfigured() && (
        <div
          className="rounded-xl flex flex-col gap-1"
          style={{
            background: "rgba(10,10,30,0.8)",
            border: "1px solid rgba(139,92,246,0.35)",
            padding: compact ? "6px 10px" : "10px 12px",
          }}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[9px] font-black leading-tight tracking-wide text-violet-400 sm:text-[10px]">AI기상 위험 상황 자동 요약 리포트</span>
              {groqLoading && (
                <span className="text-[9px] text-violet-400/60 animate-pulse">분석 중…</span>
              )}
            </div>
            {groqReport && !groqLoading && (
              <p className="text-[10px] sm:text-[11px] text-white/90 font-semibold leading-snug break-words whitespace-normal w-full min-w-0">
                {groqReport.summary}
              </p>
            )}
          </div>
          {groqReport && !compact && (
            <>
              <p className="text-xs text-white/65 leading-snug">{groqReport.detail}</p>
              {groqReport.action && (
                <div
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                  style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}
                >
                  📋 {groqReport.action}
                </div>
              )}
            </>
          )}
          {!groqReport && !groqLoading && !compact && (
            <p className="text-xs text-white/30">기상 데이터 수신 후 AI 분석을 시작합니다…</p>
          )}
        </div>
      )}

      {/* ══ 최적 출항 시간대 (compact 아닐 때만) ═══════════════════════════════ */}
      {!compact && plan && (
        <div className="rounded-lg border border-slate-700 p-3 bg-slate-800/50">
          <p className="text-xs text-slate-400 mb-2 font-semibold flex items-center gap-1.5">
            <CalendarCheck size={12} className="text-sky-400" />
            AI 산정 — 최적 출항 시간대
          </p>
          {plan.bestWindows.length === 0 ? (
            <p className="text-amber-400 text-xs">안전 출항 가능 시간대 없음 — 대기 권고</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {plan.bestWindows.map((w, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-slate-500 w-4 text-xs">{i + 1}.</span>
                  <span className="font-mono text-xs text-sky-300">{w.slot.date} {w.slot.hour}시</span>
                  <ScoreBadge score={w.score} verdict={w.verdict} />
                  {w.warnings.length > 0 && (
                    <span className="text-slate-400 text-xs truncate">{w.warnings[0]}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-slate-500 mt-2">{plan.summary}</p>
        </div>
      )}

      {/* ══ 48시간 타임라인 (compact 아닐 때만) ════════════════════════════════ */}
      {!compact && plan && plan.allScores.length > 0 && (
        <div className="rounded-lg border border-slate-700 p-3 bg-slate-800/50">
          <p className="text-xs text-slate-400 mb-2 font-semibold">48시간 안전 점수 타임라인</p>
          <div className="flex gap-0.5 items-end h-10">
            {plan.allScores.slice(0, 48).map((s, i) => {
              const h = Math.max(4, Math.round((s.score / 100) * 40));
              const col = s.verdict === "가능" ? "bg-emerald-500" : s.verdict === "주의" ? "bg-amber-400" : "bg-red-500";
              return (
                <div
                  key={i}
                  title={`${s.slot.date} ${s.slot.hour}시 — ${s.verdict} (${s.score}점)`}
                  className={`flex-1 rounded-sm ${col} opacity-80 hover:opacity-100 transition-opacity`}
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            <span className="text-emerald-400">■ 가능</span>{" "}
            <span className="text-amber-400">■ 주의</span>{" "}
            <span className="text-red-400">■ 불가</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 보조 컴포넌트 ────────────────────────────────────────────────────────────

function MiniStat({ label, value, unit, level }: {
  label: string;
  value: string;
  unit: string;
  level: "ok" | "caution" | "danger";
}) {
  const valueColor = level === "danger" ? "#fca5a5" : level === "caution" ? "#fcd34d" : "#a7f3d0";
  const bg = level === "danger" ? "rgba(127,29,29,0.5)" : level === "caution" ? "rgba(92,58,0,0.4)" : "rgba(6,78,59,0.4)";
  const border = level === "danger" ? "rgba(239,68,68,0.4)" : level === "caution" ? "rgba(251,191,36,0.3)" : "rgba(16,185,129,0.3)";
  return (
    <div className="rounded-lg px-2 py-1.5 flex flex-col items-center" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-[9px] text-white/50 font-semibold mb-0.5">{label}</p>
      <p className="font-black text-sm leading-none" style={{ color: valueColor }}>
        {value}<span className="text-[9px] font-normal ml-0.5 text-white/50">{unit}</span>
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  danger,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
  warn?: boolean;
}) {
  const cls = danger
    ? "text-red-400"
    : warn
    ? "text-amber-400"
    : "text-white";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-slate-400 text-xs">
        {icon} {label}
      </span>
      <span className={`font-semibold text-xs ${cls}`}>{value}</span>
    </div>
  );
}

function skyLabel(sky: number): string {
  switch (sky) {
    case 1: return "맑음";
    case 2: return "구름조금";
    case 3: return "구름많음";
    case 4: return "흐림";
    default: return "-";
  }
}
