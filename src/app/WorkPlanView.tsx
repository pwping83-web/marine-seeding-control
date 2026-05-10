import { useMemo, useState, useRef, useEffect } from "react";
import {
  AlertCircle, CheckCircle2, XCircle, Wind, Eye, Droplets,
  Thermometer, ChevronDown, ChevronUp, MapPin, Ship, Clock,
  Plus, X, CalendarPlus, Ban,
} from "lucide-react";
import type { WorkEntry } from "./work-plan-types";
import {
  cancelWorkReservation,
  fetchWorkReservations,
  insertWorkReservation,
  marineDbEnabled,
  replaceWeatherForecastDays,
  seedWorkReservations,
} from "@/lib/marine-db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeatherState {
  windSpeed: number;
  windDir: number;
  windGust: number;
  waveHeight: number;
  visibility: number;
  temp: number;
}

interface ForecastDay {
  date: Date;
  dayKo: string;
  windSpeed: number;
  windDir: number;
  windGust: number;
  waveHeight: number;
  visibility: number;
  precipitation: number;
  temp: number;
  status: "ok" | "caution" | "impossible";
  reasons: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WIND_LIMIT   = 15;
const WAVE_LIMIT   = 1.5;
const VIS_LIMIT    = 5;
const PRECIP_LIMIT = 5;
const KO_DAYS      = ["일", "월", "화", "수", "목", "금", "토"];

const INITIAL_SCHEDULE: WorkEntry[] = [
  { id: "w01", date: "2026-04-21", zone: "제2구역 A", targetSeeds: 850,  vessel: "제3해양살포함", status: "completed",     actual: 862 },
  { id: "w02", date: "2026-04-24", zone: "제3구역 B", targetSeeds: 920,  vessel: "제3해양살포함", status: "completed",     actual: 905 },
  { id: "w03", date: "2026-04-28", zone: "제3구역 C", targetSeeds: 780,  vessel: "제3해양살포함", status: "completed",     actual: 791 },
  { id: "w04", date: "2026-04-30", zone: "제1구역 B", targetSeeds: 860,  vessel: "제3해양살포함", status: "completed",     actual: 848 },
  { id: "w05", date: "2026-05-01", zone: "제3구역 B", targetSeeds: 900,  vessel: "제3해양살포함", status: "completed",     actual: 918 },
  { id: "w06", date: "2026-05-07", zone: "제2구역 B", targetSeeds: 850,  vessel: "제3해양살포함", status: "weather-hold",  note: "풍속 19 kt 초과 — 익일 재예약" },
  { id: "w07", date: "2026-05-08", zone: "제2구역 B", targetSeeds: 850,  vessel: "제3해양살포함", status: "scheduled" },
  { id: "w08", date: "2026-05-12", zone: "제1구역 A", targetSeeds: 960,  vessel: "제3해양살포함", status: "scheduled" },
  { id: "w09", date: "2026-05-15", zone: "제3구역 A", targetSeeds: 800,  vessel: "제3해양살포함", status: "scheduled" },
  { id: "w10", date: "2026-05-20", zone: "제2구역 C", targetSeeds: 880,  vessel: "제3해양살포함", status: "scheduled" },
  { id: "w11", date: "2026-05-22", zone: "제3구역 B", targetSeeds: 920,  vessel: "제3해양살포함", status: "scheduled" },
  { id: "w12", date: "2026-05-27", zone: "제1구역 B", targetSeeds: 750,  vessel: "제3해양살포함", status: "scheduled" },
  { id: "w13", date: "2026-05-29", zone: "제2구역 A", targetSeeds: 900,  vessel: "제3해양살포함", status: "scheduled" },
];

const ZONE_OPTIONS = [
  "제1구역 A", "제1구역 B", "제1구역 C",
  "제2구역 A", "제2구역 B", "제2구역 C",
  "제3구역 A", "제3구역 B", "제3구역 C",
];

// ─── 예약 추가 모달 ───────────────────────────────────────────────────────────
function AddReservationModal({
  onClose,
  onAdd,
  forecastMap,
}: {
  onClose: () => void;
  onAdd: (entry: WorkEntry) => void | Promise<void>;
  forecastMap: Map<string, "ok" | "caution" | "impossible">;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date,         setDate]         = useState(today);
  const [zone,         setZone]         = useState(ZONE_OPTIONS[0]);
  const [targetSeeds,  setTargetSeeds]  = useState(800);
  const [vessel,       setVessel]       = useState("제3해양살포함");
  const [note,         setNote]         = useState("");
  const [submitted,    setSubmitted]    = useState(false);

  const forecast = forecastMap.get(date);

  function handleSubmit() {
    if (!date || !zone || targetSeeds <= 0) return;
    const id = `user-${Date.now()}`;
    onAdd({ id, date, zone, targetSeeds, vessel, status: "scheduled", note: note || undefined });
    setSubmitted(true);
    setTimeout(() => { onClose(); }, 1200);
  }

  const inputCls = "w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-all duration-150 [color-scheme:dark]";
  const inputStyle = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
  };
  const focusStyle = {
    border: "1px solid rgba(64,224,208,0.5)",
    boxShadow: "0 0 0 3px rgba(64,224,208,0.08)",
  };

  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
          border: "1px solid rgba(64,224,208,0.2)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2.5">
            <CalendarPlus className="w-5 h-5 text-cyan-400" />
            <div>
              <p className="text-white font-bold text-sm">작업 예약 추가</p>
              <p className="text-white/35 text-[10px]">새 살포 작업 일정을 등록합니다</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          /* 완료 메시지 */
          <div className="px-6 py-10 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-white font-bold text-lg">예약이 등록되었습니다!</p>
            <p className="text-white/45 text-sm">{date} · {zone}</p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">

            {/* 날짜 */}
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5">작업 날짜 *</label>
              <input type="date" value={date} min={today}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls} style={inputStyle}
                onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}
              />
              {/* 기상 예보 뱃지 */}
              {forecast && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                  {forecast === "ok"
                    ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400"/><span className="text-emerald-400 font-semibold">해당 날짜 기상 예보: 작업 가능</span></>
                    : forecast === "caution"
                    ? <><AlertCircle className="w-3.5 h-3.5 text-amber-400"/><span className="text-amber-400 font-semibold">해당 날짜 기상 예보: 주의</span></>
                    : <><XCircle className="w-3.5 h-3.5 text-red-400"/><span className="text-red-400 font-semibold">해당 날짜 기상 예보: 작업 불가 예상</span></>
                  }
                </div>
              )}
            </div>

            {/* 구역 */}
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5">작업 구역 *</label>
              <select value={zone} onChange={(e) => setZone(e.target.value)}
                className={inputCls} style={{ ...inputStyle, cursor: "pointer" }}
                onFocus={(e) => Object.assign(e.currentTarget.style, { ...inputStyle, ...focusStyle })}
                onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}
              >
                {ZONE_OPTIONS.map((z) => (
                  <option key={z} value={z} style={{ background: "#0c2748" }}>{z}</option>
                ))}
              </select>
            </div>

            {/* 목표 개체수 */}
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5">목표 살포 개체수 *</label>
              <div className="flex gap-2 items-center">
                <input type="number" value={targetSeeds} min={100} max={2000} step={50}
                  onChange={(e) => setTargetSeeds(Number(e.target.value))}
                  className={`${inputCls} flex-1`} style={inputStyle}
                  onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                  onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}
                />
                <span className="text-sm text-white/40 shrink-0">개체</span>
              </div>
              {/* 빠른 선택 버튼 */}
              <div className="flex gap-1.5 mt-1.5">
                {[600, 800, 900, 1000].map((v) => (
                  <button key={v} onClick={() => setTargetSeeds(v)}
                    className="text-[10px] px-2 py-1 rounded-md transition-all"
                    style={{
                      background: targetSeeds === v ? "rgba(64,224,208,0.2)" : "rgba(255,255,255,0.05)",
                      color: targetSeeds === v ? "#40E0D0" : "rgba(255,255,255,0.4)",
                      border: targetSeeds === v ? "1px solid rgba(64,224,208,0.35)" : "1px solid rgba(255,255,255,0.08)",
                    }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* 선박 */}
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5">투입 선박</label>
              <select value={vessel} onChange={(e) => setVessel(e.target.value)}
                className={inputCls} style={{ ...inputStyle, cursor: "pointer" }}
                onFocus={(e) => Object.assign(e.currentTarget.style, { ...inputStyle, ...focusStyle })}
                onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}>
                <option style={{ background: "#0c2748" }}>제3해양살포함</option>
                <option style={{ background: "#0c2748" }}>제1해양살포함</option>
                <option style={{ background: "#0c2748" }}>제2해양살포함</option>
              </select>
            </div>

            {/* 비고 */}
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5">비고 (선택)</label>
              <input type="text" value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="특이사항, 조건 등 입력"
                className={inputCls} style={inputStyle}
                onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                onBlur={(e) => Object.assign(e.currentTarget.style, inputStyle)}
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-2 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50 transition-all hover:bg-white/5"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                취소
              </button>
              <button onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #1FB5A8 0%, #0e7490 100%)",
                  boxShadow: "0 4px 16px rgba(31,181,168,0.35)",
                }}>
                예약 등록
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TIDE = [
  { label: "만조", time: "06:28", height: 3.24, dir: "▲" },
  { label: "간조", time: "12:47", height: 0.81, dir: "▼" },
  { label: "만조", time: "19:02", height: 3.51, dir: "▲" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function windDirLabel(deg: number): string {
  const dirs = ["북","북북동","북동","동북동","동","동남동","남동","남남동",
                 "남","남남서","남서","서남서","서","서북서","북서","북북서"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function buildForecast(base: WeatherState): ForecastDay[] {
  let ws = base.windSpeed, wh = base.waveHeight, vis = base.visibility;
  let tmp = base.temp, dir = base.windDir;
  return Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    ws  = Math.max(2,   Math.min(30,  ws  + (Math.random() - 0.42) * 5));
    wh  = Math.max(0.2, Math.min(4.5, wh  + (Math.random() - 0.44) * 0.35));
    vis = Math.max(1,   Math.min(20,  vis + (Math.random() - 0.4)  * 2.5));
    tmp = Math.max(10,  Math.min(30,  tmp + (Math.random() - 0.5)  * 1.2));
    dir = (dir + (Math.random() - 0.5) * 25 + 360) % 360;
    const gust   = ws * (1.2 + Math.random() * 0.3);
    const precip = Math.random() < 0.28 ? Math.random() * 14 : 0;
    const reasons: string[] = [];
    if (ws     > WIND_LIMIT)   reasons.push(`풍속 ${ws.toFixed(0)} kt 초과`);
    if (wh     > WAVE_LIMIT)   reasons.push(`파고 ${wh.toFixed(1)} m 초과`);
    if (vis    < VIS_LIMIT)    reasons.push(`시정 ${vis.toFixed(0)} km 미달`);
    if (precip > PRECIP_LIMIT) reasons.push(`강수 ${precip.toFixed(0)} mm`);
    const status: ForecastDay["status"] =
      reasons.length === 0 ? "ok" : ws <= 22 && wh <= 2.8 ? "caution" : "impossible";
    return { date, dayKo: KO_DAYS[date.getDay()], windSpeed: ws, windDir: dir,
             windGust: gust, waveHeight: wh, visibility: vis, precipitation: precip,
             temp: tmp, status, reasons };
  });
}

function getMonthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1).getDay();
  const days  = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const STATUS_CFG = {
  ok:        { color: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.25)", label: "작업 가능", Icon: CheckCircle2 },
  caution:   { color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.25)", label: "주의",     Icon: AlertCircle },
  impossible:{ color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",  label: "작업 불가", Icon: XCircle },
};

const WORK_CFG = {
  scheduled:    { color: "#60a5fa", label: "예약" },
  completed:    { color: "#34d399", label: "완료" },
  "weather-hold":{ color: "#fbbf24", label: "기상연기" },
  cancelled:    { color: "#94a3b8", label: "취소" },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkPlanView({
  weather,
  variant = "full",
}: {
  weather: WeatherState;
  /** compact: 제1구역 일정 중심·우측 지도와 연동용 심플 패널 */
  variant?: "full" | "compact";
}) {
  const [schedule, setSchedule] = useState<WorkEntry[]>(() =>
    marineDbEnabled() ? [] : INITIAL_SCHEDULE,
  );
  const [scheduleReady, setScheduleReady] = useState(!marineDbEnabled());
  const [selectedDay,   setSelectedDay]   = useState<number | null>(0);
  const [expandedWork,  setExpandedWork]  = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);

  useEffect(() => {
    if (!marineDbEnabled()) {
      setScheduleReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      let rows = await fetchWorkReservations();
      if (cancelled) return;
      if (rows === null) {
        if (!cancelled) setSchedule(INITIAL_SCHEDULE);
        setScheduleReady(true);
        return;
      }
      if (rows.length === 0) {
        await seedWorkReservations(INITIAL_SCHEDULE);
        rows = await fetchWorkReservations();
      }
      if (!cancelled) {
        if (rows && rows.length > 0) setSchedule(rows);
        else setSchedule(INITIAL_SCHEDULE);
      }
      setScheduleReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const forecast = useMemo(() => buildForecast(weather), [weather.windSpeed]);

  useEffect(() => {
    if (!marineDbEnabled() || !scheduleReady || forecast.length === 0) return;
    const anchor = `${forecast[0].date.getFullYear()}-${String(forecast[0].date.getMonth() + 1).padStart(2, "0")}-${String(forecast[0].date.getDate()).padStart(2, "0")}`;
    const t = window.setTimeout(() => {
      void replaceWeatherForecastDays(
        anchor,
        forecast.map((f) => ({
          date: f.date,
          windSpeed: f.windSpeed,
          windDir: f.windDir,
          windGust: f.windGust,
          waveHeight: f.waveHeight,
          visibility: f.visibility,
          precipitation: f.precipitation,
          temp: f.temp,
          status: f.status,
          reasons: f.reasons,
        })),
      );
    }, 1200);
    return () => window.clearTimeout(t);
  }, [forecast, scheduleReady]);

  const now     = new Date();
  const year    = now.getFullYear();
  const month   = now.getMonth();
  const today   = now.getDate();
  const todayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(today).padStart(2, "0")}`;

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  const workMap = useMemo(() => {
    const m = new Map<number, WorkEntry["status"]>();
    const pfx = `${year}-${String(month + 1).padStart(2, "0")}-`;
    schedule.forEach((w) => {
      if (w.date.startsWith(pfx)) m.set(parseInt(w.date.slice(8)), w.status);
    });
    return m;
  }, [year, month, schedule]);

  const impossibleDays = useMemo(() => {
    const s = new Set<number>();
    forecast.forEach((f, i) => { if (f.status === "impossible") s.add(today + i); });
    return s;
  }, [forecast, today]);

  // 기상 예보를 날짜 → 상태 Map으로 변환 (예약 추가 모달에서 사용)
  const forecastMap = useMemo(() => {
    const m = new Map<string, "ok" | "caution" | "impossible">();
    forecast.forEach((f) => {
      const key = `${f.date.getFullYear()}-${String(f.date.getMonth() + 1).padStart(2, "0")}-${String(f.date.getDate()).padStart(2, "0")}`;
      m.set(key, f.status);
    });
    return m;
  }, [forecast]);

  async function handleAddEntry(entry: WorkEntry) {
    if (marineDbEnabled()) await insertWorkReservation(entry);
    setSchedule((prev) => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));
  }

  async function handleCancelReservation(id: string) {
    if (marineDbEnabled()) await cancelWorkReservation(id);
    setSchedule((prev) =>
      prev.map((w) => (w.id === id ? { ...w, status: "cancelled" as const } : w)),
    );
    setPendingCancelId(null);
    setExpandedWork((cur) => (cur === id ? null : cur));
  }

  const upcoming    = schedule.filter((w) => w.date > todayStr && w.status !== "cancelled");
  const zone1Upcoming = useMemo(
    () => upcoming.filter((w) => w.zone.startsWith("제1")).sort((a, b) => a.date.localeCompare(b.date)),
    [upcoming],
  );
  const completed   = schedule.filter((w) => w.status === "completed");
  const weatherHold = schedule.filter((w) => w.status === "weather-hold");

  const okDays  = forecast.filter((f) => f.status === "ok").length;
  const impDays = forecast.filter((f) => f.status === "impossible").length;
  const sel     = selectedDay !== null ? forecast[selectedDay] : null;
  const selCfg  = sel ? STATUS_CFG[sel.status] : null;
  // JSX component names must be PascalCase variable (not bracket notation)
  const SelIcon = selCfg?.Icon ?? null;

  const monthProgress = (() => {
    const pfx = `${year}-${String(month + 1).padStart(2, "0")}-`;
    const entries = schedule.filter((w) => w.date.startsWith(pfx));
    const target  = entries.reduce((s, w) => s + w.targetSeeds, 0);
    const actual  = entries.filter((w) => w.status === "completed").reduce((s, w) => s + (w.actual ?? 0), 0);
    return { target, actual, pct: target > 0 ? Math.round((actual / target) * 100) : 0 };
  })();

  // ── Render ──

  const scrollThumb = { scrollbarWidth: "thin" as const, scrollbarColor: "#1e3a5f transparent" };

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4"
      style={{
        background: "linear-gradient(180deg, #0a1f38 0%, #071428 100%)",
      }}
    >
      {marineDbEnabled() && !scheduleReady && (
        <p className="shrink-0 text-center text-xs text-cyan-200/80 py-1">DB에서 작업 일정을 불러오는 중…</p>
      )}
      {/* 예약 추가 모달 */}
      {showAddModal && (
        <AddReservationModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddEntry}
          forecastMap={forecastMap}
        />
      )}

      {variant === "compact" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="shrink-0 border-b border-white/10 pb-2">
            <h2 className="text-sm font-bold text-white tracking-tight">작업 계획</h2>
            <p className="text-[10px] text-cyan-200/80 mt-1 leading-snug">
              제1구역 A·B·C 후보는 우측 지도에 표시됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="shrink-0 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: "linear-gradient(135deg, #1FB5A8 0%, #0e7490 100%)",
              color: "#fff",
              boxShadow: "0 2px 10px rgba(31,181,168,0.35)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            예약 추가
          </button>
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
            <p className="text-[10px] text-white/35 font-bold uppercase tracking-wide shrink-0 mb-1">제1구역 예정</p>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5" style={scrollThumb}>
              {zone1Upcoming.length === 0 ? (
                <p className="text-[11px] text-white/40 py-2">예정된 제1구역 일정이 없습니다.</p>
              ) : (
                zone1Upcoming.map((w) => {
                  const d = new Date(w.date);
                  const cfg = WORK_CFG[w.status];
                  return (
                    <div
                      key={w.id}
                      className="rounded-lg px-3 py-2"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: `1px solid ${cfg.color}33`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-white/55 shrink-0">
                          {d.getMonth() + 1}/{d.getDate()}({KO_DAYS[d.getDay()]})
                        </span>
                        <span className="text-xs font-bold text-teal-200 truncate">{w.zone}</span>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            background: `${cfg.color}18`,
                            color: cfg.color,
                            border: `1px solid ${cfg.color}40`,
                          }}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/35 mt-1">
                        목표 {w.targetSeeds.toLocaleString()}개체 · {w.vessel}
                      </p>
                      {w.note ? (
                        <p className="text-[10px] text-amber-200/90 mt-1 leading-snug">⚠ {w.note}</p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* ── 1. Summary strip ──────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: "7일내 작업가능",  val: `${okDays}일`,    sub: `불가 ${impDays}일`,      color: "#34d399" },
          { label: "이달 예약",       val: `${upcoming.length}건`, sub: "진행 예정",         color: "#60a5fa" },
          { label: "이달 목표 달성",  val: `${monthProgress.pct}%`, sub: `${monthProgress.actual.toLocaleString()}/${monthProgress.target.toLocaleString()}`, color: "#40E0D0" },
          { label: "기상 연기",       val: `${weatherHold.length}건`, sub: "이달 포함",       color: "#fbbf24" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl px-3 py-2 sm:px-4 sm:py-2.5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-[10px] text-white/35 tracking-wide mb-0.5">{s.label}</p>
            <p className="text-xl font-bold leading-none sm:text-2xl" style={{ color: s.color }}>{s.val}</p>
            <p className="text-[10px] text-white/30 mt-0.5 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── 2. 7일 기상 예보 (compact + click to expand) ─────────────── */}
      <div className="shrink-0">
        <p className="text-[10px] text-white/35 tracking-widest uppercase font-bold mb-1.5 sm:mb-2">7일 기상 예보</p>

        {/* Compact day pills */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {forecast.map((f, i) => {
            const cfg = STATUS_CFG[f.status];
            const isActive = selectedDay === i;
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isActive ? null : i)}
                className="rounded-lg py-2 flex flex-col items-center gap-1 transition-all duration-200 hover:scale-[1.02] sm:rounded-xl sm:py-2.5 sm:gap-1.5"
                style={{
                  background: isActive ? cfg.bg : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isActive ? cfg.border : "rgba(255,255,255,0.07)"}`,
                  boxShadow: isActive ? `0 0 12px ${cfg.color}22` : "none",
                }}
              >
                <span className="text-[10px] font-bold"
                  style={{ color: i === 0 ? "#40E0D0" : "rgba(255,255,255,0.5)" }}>
                  {i === 0 ? "오늘" : f.dayKo}
                </span>
                <span className="text-[10px] text-white/25 font-mono">{f.date.getDate()}일</span>
                {/* Status indicator */}
                <span className="w-4 h-4 rounded-full flex items-center justify-center sm:w-5 sm:h-5"
                  style={{ background: `${cfg.color}20` }}>
                  <cfg.Icon className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: cfg.color }} />
                </span>
                <span className="text-[11px] font-bold font-mono" style={{ color: cfg.color }}>
                  {f.temp.toFixed(0)}°
                </span>
              </button>
            );
          })}
        </div>

        {/* Expanded detail panel (slides in below) */}
        {sel && selCfg && SelIcon && (
          <div
            className="mt-1.5 rounded-xl p-3 sm:mt-2 sm:p-4"
            style={{
              background: selCfg.bg,
              border: `1px solid ${selCfg.border}`,
            }}
          >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="flex items-center gap-2">
                <SelIcon className="w-4 h-4" style={{ color: selCfg.color }} />
                <span className="text-sm font-bold" style={{ color: selCfg.color }}>
                  {sel.dayKo}요일 {sel.date.getMonth() + 1}/{sel.date.getDate()} — {selCfg.label}
                </span>
              </div>
              <button onClick={() => setSelectedDay(null)}
                className="text-white/30 hover:text-white/60 transition-colors text-xs">
                닫기 ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {[
                { Icon: Wind,        label: "풍속",  val: `${sel.windSpeed.toFixed(1)} kt`,  sub: windDirLabel(sel.windDir), over: sel.windSpeed > WIND_LIMIT },
                { Icon: () => <span className="text-sm">≈</span>, label: "파고",  val: `${sel.waveHeight.toFixed(1)} m`,  sub: `돌풍 ${sel.windGust.toFixed(0)} kt`, over: sel.waveHeight > WAVE_LIMIT },
                { Icon: Eye,         label: "시정",  val: `${sel.visibility.toFixed(0)} km`,  sub: sel.precipitation > 0 ? `강수 ${sel.precipitation.toFixed(0)} mm` : "강수 없음", over: sel.visibility < VIS_LIMIT },
                { Icon: Thermometer, label: "기온",  val: `${sel.temp.toFixed(1)} °C`,  sub: `수온 ${(sel.temp - 3).toFixed(1)} °C`, over: false },
              ].map((item, k) => (
                <div key={k} className="rounded-lg px-2 py-2 sm:px-3 sm:py-2.5"
                  style={{ background: "rgba(0,0,0,0.2)" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <item.Icon className="w-3.5 h-3.5" style={{ color: item.over ? "#fbbf24" : "rgba(64,224,208,0.7)" }} />
                    <span className="text-[10px] text-white/40">{item.label}</span>
                    {item.over && <AlertCircle className="w-3 h-3 text-amber-400 ml-auto" />}
                  </div>
                  <p className="text-sm font-bold font-mono"
                    style={{ color: item.over ? "#fbbf24" : "white" }}>{item.val}</p>
                  <p className="text-[10px] text-white/35 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>

            {sel.reasons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sel.reasons.map((r) => (
                  <span key={r} className="text-[11px] px-2 py-1 rounded-full font-semibold"
                    style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>
                    ⚠ {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3. Calendar + Work list (뷰포트 안에 맞춤; 스크롤은 이 블록 내부만) ── */}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain lg:grid lg:grid-cols-[1fr_1.4fr] lg:gap-3 lg:overflow-hidden"
        style={scrollThumb}
      >

        {/* Calendar */}
        <div className="min-h-0 shrink-0 lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:overscroll-y-contain" style={scrollThumb}>
          <p className="text-[10px] text-white/35 tracking-widest uppercase font-bold mb-1.5 sm:mb-2">
            {now.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })} 캘린더
          </p>
          <div className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* DOW header */}
            <div className="grid grid-cols-7"
              style={{ background: "rgba(64,224,208,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["일","월","화","수","목","금","토"].map((d, i) => (
                <div key={d} className="py-1.5 text-center text-[10px] font-bold sm:py-2 sm:text-[11px]"
                  style={{ color: i === 0 ? "#fca5a5" : i === 6 ? "#93c5fd" : "rgba(255,255,255,0.4)" }}>
                  {d}
                </div>
              ))}
            </div>
            {/* Day grid */}
            <div className="grid grid-cols-7">
              {grid.map((day, idx) => {
                if (!day) return (
                  <div key={`e-${idx}`} className="h-9 sm:h-10"
                    style={{ background: "rgba(0,0,0,0.15)", borderRight: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }} />
                );
                const isToday   = day === today;
                const isPast    = day < today;
                const ws        = workMap.get(day);
                const isImp     = impossibleDays.has(day) && !isPast;
                const dow       = new Date(year, month, day).getDay();
                const dotColor  = ws === "completed" ? "#34d399" : ws === "scheduled" ? "#60a5fa" : ws === "weather-hold" ? "#fbbf24" : ws === "cancelled" ? "#94a3b8" : isImp ? "#f87171" : null;
                return (
                  <div key={day} className="h-9 flex flex-col items-center justify-center gap-0.5 relative sm:h-10"
                    style={{
                      background: isToday ? "rgba(64,224,208,0.1)" : "rgba(255,255,255,0.015)",
                      border: isToday ? "1px solid rgba(64,224,208,0.4)" : "1px solid rgba(255,255,255,0.04)",
                    }}>
                    <span className="text-[11px] font-semibold"
                      style={{
                        color: isToday ? "#40E0D0" : isPast ? "rgba(255,255,255,0.25)" :
                               dow === 0 ? "#fca5a5" : dow === 6 ? "#93c5fd" : "rgba(255,255,255,0.65)",
                      }}>
                      {day}
                    </span>
                    {dotColor && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="px-2 py-1.5 flex flex-wrap gap-2 border-t sm:px-3 sm:py-2 sm:gap-3"
              style={{ background: "rgba(0,0,0,0.15)", borderColor: "rgba(255,255,255,0.06)" }}>
              {[["#34d399","완료"],["#60a5fa","예약"],["#fbbf24","기상연기"],["#94a3b8","취소"],["#f87171","불가예보"],["#40E0D0","오늘"]].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1 text-[10px] text-white/35">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{l}
                </span>
              ))}
            </div>
          </div>

          {/* Tide + conditions side panel */}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3">
            {/* Tide */}
            <div className="rounded-xl p-2 sm:p-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[10px] text-white/35 font-bold tracking-wide mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 오늘 조석
              </p>
              {TIDE.map((t) => (
                <div key={t.time} className="flex justify-between items-center py-1 text-xs border-b last:border-0"
                  style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <span className="font-mono text-white/40">{t.time}</span>
                  <span style={{ color: t.label === "만조" ? "#40E0D0" : "#60a5fa" }} className="font-bold">
                    {t.dir} {t.height} m
                  </span>
                </div>
              ))}
            </div>
            {/* Conditions */}
            <div className="rounded-xl p-2 sm:p-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[10px] text-white/35 font-bold tracking-wide mb-1.5 sm:mb-2">작업 기준</p>
              {[
                { label: "풍속",  limit: `≤ ${WIND_LIMIT} kt`,  cur: weather.windSpeed, unit: "kt", ok: weather.windSpeed <= WIND_LIMIT },
                { label: "파고",  limit: `≤ ${WAVE_LIMIT} m`,   cur: weather.waveHeight, unit: "m", ok: weather.waveHeight <= WAVE_LIMIT },
                { label: "시정",  limit: `≥ ${VIS_LIMIT} km`,   cur: weather.visibility, unit: "km", ok: weather.visibility >= VIS_LIMIT },
              ].map((t) => (
                <div key={t.label} className="flex justify-between items-center py-1 text-[10px] border-b last:border-0"
                  style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  <span className="text-white/40">{t.label} <span className="text-white/20">{t.limit}</span></span>
                  <span className="font-mono font-bold flex items-center gap-1"
                    style={{ color: t.ok ? "#34d399" : "#f87171" }}>
                    {t.cur.toFixed(1)}{t.unit}
                    {t.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Work schedule list */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <p className="text-[10px] text-white/35 tracking-widest uppercase font-bold">작업 일정</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.04] active:scale-95"
              style={{
                background: "linear-gradient(135deg, #1FB5A8 0%, #0e7490 100%)",
                color: "#fff",
                boxShadow: "0 2px 10px rgba(31,181,168,0.35)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              예약 추가
            </button>
          </div>

          {/* Upcoming work */}
          <div
            className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-y-contain pr-0.5 pb-1 lg:mb-0"
            style={scrollThumb}
          >
            {upcoming.map((w) => {
              const d = new Date(w.date);
              const isExpanded = expandedWork === w.id;
              const cfg = WORK_CFG[w.status];
              return (
                <div key={w.id} className="rounded-xl overflow-hidden transition-all duration-200"
                  style={{ border: `1px solid ${isExpanded ? cfg.color + "40" : "rgba(255,255,255,0.08)"}` }}>
                  {/* Row header — click to expand */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedWork(null);
                        setPendingCancelId(null);
                      } else {
                        setExpandedWork(w.id);
                        if (pendingCancelId !== null && pendingCancelId !== w.id) setPendingCancelId(null);
                      }
                    }}
                  >
                    {/* Status dot */}
                    <span className="w-2 h-2 rounded-full shrink-0 mt-0.5"
                      style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}80` }} />
                    {/* Date chip */}
                    <span className="text-xs font-mono font-semibold shrink-0"
                      style={{ color: "rgba(255,255,255,0.55)" }}>
                      {d.getMonth() + 1}/{d.getDate()}({KO_DAYS[d.getDay()]})
                    </span>
                    {/* Zone */}
                    <span className="text-sm font-semibold text-white/80 flex-1 truncate">{w.zone}</span>
                    {/* Status badge */}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}35` }}>
                      {cfg.label}
                    </span>
                    {/* Expand icon */}
                    {isExpanded
                      ? <ChevronUp  className="w-4 h-4 text-white/30 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-white/20 shrink-0" />
                    }
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-3 grid grid-cols-3 gap-3 border-t"
                      style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
                      <div className="pt-3">
                        <p className="text-[10px] text-white/35 mb-0.5">목표 개체</p>
                        <p className="text-base font-bold text-cyan-300 font-mono">{w.targetSeeds.toLocaleString()}</p>
                      </div>
                      <div className="pt-3">
                        <p className="text-[10px] text-white/35 mb-0.5 flex items-center gap-1"><Ship className="w-3 h-3" />선박</p>
                        <p className="text-xs font-semibold text-white/70">{w.vessel}</p>
                      </div>
                      <div className="pt-3">
                        <p className="text-[10px] text-white/35 mb-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />해역</p>
                        <p className="text-xs font-semibold text-white/70">남해 연안</p>
                      </div>
                      {w.note && (
                        <div className="col-span-3 rounded-lg px-3 py-2 text-[11px]"
                          style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24" }}>
                          ⚠ {w.note}
                        </div>
                      )}
                      {(w.status === "scheduled" || w.status === "weather-hold") && (
                        <div className="col-span-3 pt-1 border-t"
                          style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                          {pendingCancelId === w.id ? (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
                              <p className="text-[11px] text-white/50">이 일정을 취소할까요? 취소된 예약은 목록에서 숨겨집니다.</p>
                              <div className="flex gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setPendingCancelId(null)}
                                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/50 transition-colors hover:bg-white/10"
                                  style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
                                  돌아가기
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleCancelReservation(w.id)}
                                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90"
                                  style={{
                                    background: "rgba(248,113,113,0.2)",
                                    border: "1px solid rgba(248,113,113,0.35)",
                                    color: "#fca5a5",
                                  }}>
                                  예, 취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingCancelId(w.id)}
                              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/45 transition-all hover:bg-white/[0.06] hover:text-white/70"
                              style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                              <Ban className="w-3.5 h-3.5" />
                              예약 취소
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          {/* Completed — collapsible section */}
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl mb-1.5 transition-colors hover:bg-white/[0.03]"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
            onClick={() => setShowCompleted((v) => !v)}
          >
            <span className="text-xs font-semibold text-white/45 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              완료된 작업 ({completed.length}건)
            </span>
            {showCompleted
              ? <ChevronUp  className="w-4 h-4 text-white/25" />
              : <ChevronDown className="w-4 h-4 text-white/25" />
            }
          </button>

          {showCompleted && (
            <div className="space-y-1.5">
              {completed.slice().reverse().map((w) => {
                const d = new Date(w.date);
                const isExpanded = expandedWork === w.id;
                const achievePct = w.actual && w.targetSeeds ? Math.round((w.actual / w.targetSeeds) * 100) : 0;
                return (
                  <div key={w.id} className="rounded-xl overflow-hidden transition-all duration-200"
                    style={{ border: `1px solid ${isExpanded ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.06)"}`, opacity: 0.75 }}>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]"
                      onClick={() => setExpandedWork(isExpanded ? null : w.id)}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#34d399" }} />
                      <span className="text-[11px] font-mono text-white/40 shrink-0">
                        {d.getMonth() + 1}/{d.getDate()}
                      </span>
                      <span className="text-sm text-white/55 flex-1">{w.zone}</span>
                      <span className="text-[10px] font-mono text-emerald-400">{w.actual?.toLocaleString()} 개체</span>
                      {isExpanded
                        ? <ChevronUp  className="w-3.5 h-3.5 text-white/20 shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-white/20 shrink-0" />
                      }
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-2 border-t"
                        style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.12)" }}>
                        {/* Mini progress bar */}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                            <div className="h-full rounded-full"
                              style={{ width: `${achievePct}%`, background: "linear-gradient(90deg, #1FB5A8, #34d399)" }} />
                          </div>
                          <span className="text-[11px] font-bold text-emerald-400">{achievePct}%</span>
                        </div>
                        <p className="text-[10px] text-white/30">
                          목표 {w.targetSeeds.toLocaleString()} / 실적 {w.actual?.toLocaleString()} 개체
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>
      </div>
      )}
    </div>
  );
}
