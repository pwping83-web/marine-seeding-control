import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUp,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Compass,
  Download,
  Droplets,
  Info,
  Map,
  MapPin,
  Navigation,
  Play,
  Radio,
  RefreshCw,
  Ship,
  Square,
  Trash2,
  Undo2,
  Wind,
  ZoomIn,
  ZoomOut,
  Upload,
  Crosshair,
  Sparkles,
  Waypoints,
  Route,
} from "lucide-react";
import WorkPlanView from "./WorkPlanView";
import ManualModal, { ManualButton } from "./ManualModal";
import { MarineLeafletMap } from "./components/MarineLeafletMap";
import type { MapMode } from "./components/seagrass-map";
import { OPS_AREA_CENTER, OPS_AREA_MAX_BOUNDS, SIM_SEA_OFFSET } from "./geo/koreaOpsArea";
import {
  deleteSeedDropRecord,
  fetchSeedDropRecords,
  fetchVesselTrackPoints,
  insertShipCommand,
  insertVesselTrackPoint,
  marineDbEnabled,
  seedSeedDropRecords,
  subscribeShipCommandInserts,
  upsertSeedDropRecord,
  type VesselTrackPoint,
} from "@/lib/marine-db";
import { OFFLINE_MAP_NO_TILES } from "@/lib/local-recording-mode";
import { WeatherAIPanel } from "./components/WeatherAIPanel";
import { FieldWeatherReportModal, type FieldWeatherReportPayload } from "./components/FieldWeatherReportModal";
import { EmergencyPanel } from "./components/EmergencyPanel";
import { VisionRoadmapModal } from "./components/VisionRoadmapModal";
import {
  scoreHourSlot,
  generateMockForecast,
  isKmaApiConfigured,
  kmaSlotFromFieldReport,
  kmaSlotToDashboardWeather,
  pickCurrentOrNextKmaSlot,
  type EmergencyAssessment,
  type SlotScore,
} from "@/lib/kma-weather";
import { ZONE1_PLAN_MARKERS } from "@/lib/seeding-plan-ai";
import {
  SosReceivedToast,
  WeatherAlertOverlay,
} from "./components/EmergencyDemoOverlay";
import { AiTicker } from "./components/AiTicker";
import { WeatherTimelineTracker } from "./components/WeatherTimelineTracker";
import { WorkPlanAiModal } from "./components/WorkPlanAiModal";
import { TodayTrackReportModal } from "./components/TodayTrackReportModal";
import { TrackRecordSidebarHint } from "./components/TrackRecordSidebarHint";
import { buildLocalWorkRecommendation } from "@/lib/work-recommendation";
import { analyzeWorkPlanBriefWithGroq, type WorkPlanGroqBrief } from "@/lib/groq-work-plan";
import { isGroqConfigured } from "@/lib/groq-weather";
import { loadWorkAiUserNote, saveWorkAiUserNote } from "@/lib/work-ai-user-note";
import { estimateSeedingAreaHa, formatAreaHa, ymdLocal } from "@/lib/seeding-day-eval";
import { buildSampleLteForYmdRange, trackReportUsesTestSample } from "@/lib/track-report-test-sample";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SeedDrop {
  id: string;
  label: string;        // 구역 라벨 (예: A01, B03, C12)
  time: string;
  lat: number;
  lng: number;
  status: "성공" | "실패" | "대기";
  recordedAt: number;
  verificationMismatch?: boolean;
}

interface Vessel {
  x: number;
  y: number;
  heading: number;
  lat: number;
  lng: number;
  speed: number;
}

interface WeatherState {
  windSpeed: number;
  windDir: number;
  windGust: number;
  waveHeight: number;
  visibility: number;
  temp: number;
}

interface SignalEntry {
  id: string;
  cmd: string;
  time: string;
  ack: boolean;
}

import { MARINE_OPS_SIGNAL_BC } from "@/lib/marine-ops-signals";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_LAT = OPS_AREA_CENTER.lat;
const BASE_LNG = OPS_AREA_CENTER.lng;
const MAP_W = 940;
const MAP_H = 520;
const VESSEL_NAME = "제3해양살포함";

function vesselLteIdFromEnv(): string {
  const v = import.meta.env.VITE_VESSEL_LTE_ID?.trim();
  return v && v.length > 0 ? v : VESSEL_NAME;
}

type SafetyTri = "안전" | "주의" | "긴급";

/**
 * `assessEmergency`(즉시 회항 임계)와 타임라인 첫 슬롯 `scoreHourSlot`(가능/주의/불가)를 합친 표시용 등급.
 * 첫 슬롯이 `불가`인데 긴급 임계만으로는 `안전`이면 하단「지금 위험」과 사이드바 문구가 어긋나므로 더 보수적으로 맞춘다.
 */
function mergeDisplaySafetyLevel(
  emergency: SafetyTri,
  firstVerdict: "가능" | "주의" | "불가" | undefined,
): SafetyTri {
  if (emergency === "긴급") return "긴급";
  if (firstVerdict === "불가") return "긴급";
  if (emergency === "주의" || firstVerdict === "주의") return "주의";
  return "안전";
}

/** 두 좌표 사이 진북 방위각(도) — 선수 방향 표시용 */
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/** GeolocationPositionError.code → 사용자용 문구 */
function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "위치 권한이 거부되었습니다. 주소창 왼쪽 자물쇠에서 위치를 허용해 주세요.";
    case err.POSITION_UNAVAILABLE:
      return "위치를 확인할 수 없습니다. GPS·네트워크를 확인해 주세요.";
    case err.TIMEOUT:
      return "위치 요청 시간이 초과되었습니다. 다시 눌러 시도해 주세요.";
    default:
      return err.message || "위치 정보를 가져오지 못했습니다.";
  }
}

/** 선박 위치·항적 갱신 주기(ms). 실제 GNSS는 보통 1Hz 이상; 2초는 저속 항행·시연에 무방 */
const VESSEL_POSITION_TICK_MS = 2000;

/** 로컬 전용: 브라우저 저장소 (인터넷·DB 없음) */
const DROP_STORAGE_KEY = "marine-seed-drops-v1";

/** 사이드바 로고 블록과 동일 톤 — 상단 기준색 #0c2748 계열 */
const SIDEBAR_BODY_GRAD = "linear-gradient(160deg, #0c2748 0%, #081b34 52%, #061018 100%)";
const SIDEBAR_SECTION_TINT = "rgba(12, 39, 72, 0.42)";
const SIDEBAR_CARD_BG = "rgba(8, 27, 52, 0.58)";
const SIDEBAR_HISTORY_ROW_BG = "rgba(8, 27, 52, 0.82)";
const SIDEBAR_HISTORY_FOOTER_BG = "rgba(8, 27, 52, 0.72)";

function loadDropsFromLocalStorage(): SeedDrop[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(DROP_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    const out: SeedDrop[] = [];
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.lat !== "number" || typeof o.lng !== "number") continue;
      const st = o.status === "실패" || o.status === "대기" ? o.status : "성공";
      out.push({
        id: o.id,
        label: typeof o.label === "string" ? o.label : o.id,
        time: typeof o.time === "string" ? o.time : "",
        lat: o.lat,
        lng: o.lng,
        status: st,
        recordedAt: typeof o.recordedAt === "number" ? o.recordedAt : Date.now(),
        verificationMismatch: Boolean(o.verificationMismatch),
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**보낸 CSV 검증·복구용 (간단 파서) */
function parseCsvToDrops(csv: string): SeedDrop[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const out: SeedDrop[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const id = parts[0]?.trim();
    if (!id) continue;
    if (parts.length >= 8) {
      const label = (parts[1] ?? id).trim();
      const time = (parts[2] ?? "").trim();
      const lat = parseFloat(parts[3] ?? "");
      const lng = parseFloat(parts[4] ?? "");
      const status =
        parts[5]?.trim() === "실패" || parts[5]?.trim() === "대기" ? (parts[5].trim() as SeedDrop["status"]) : "성공";
      const recordedAt = parseInt(parts[7] ?? "", 10) || Date.now();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({
        id,
        label,
        time,
        lat,
        lng,
        status,
        recordedAt,
        verificationMismatch: false,
      });
    } else {
      const time = (parts[1] ?? "").trim();
      const lat = parseFloat(parts[2] ?? "");
      const lng = parseFloat(parts[3] ?? "");
      const status =
        parts[4]?.trim() === "실패" || parts[4]?.trim() === "대기" ? (parts[4].trim() as SeedDrop["status"]) : "성공";
      const recordedAt = Date.now();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out.push({
        id,
        label: id,
        time,
        lat,
        lng,
        status,
        recordedAt,
        verificationMismatch: false,
      });
    }
  }
  return out;
}

/** 화면 좌표 루프 — 지도 중심(470,260) 부근에 몰아 남해 시연 구역만 최대 확대되게 함 */
const WAYPOINTS = [
  { x: 400, y: 285 },
  { x: 435, y: 268 },
  { x: 475, y: 275 },
  { x: 515, y: 262 },
  { x: 545, y: 278 },
  { x: 530, y: 298 },
  { x: 505, y: 312 },
  { x: 455, y: 308 },
  { x: 420, y: 292 },
  { x: 448, y: 278 },
  { x: 488, y: 270 },
  { x: 462, y: 288 },
];

const WIND_ARROW_POS = [
  { x: 155, y: 210 },
  { x: 370, y: 185 },
  { x: 570, y: 195 },
  { x: 770, y: 180 },
  { x: 270, y: 360 },
  { x: 680, y: 362 },
  { x: 460, y: 428 },
  { x: 115, y: 430 },
];

const SHIP_COMMANDS = [
  { label: "귀항 명령", color: "#ef4444" },
  { label: "살포 시작", color: "#10b981" },
  { label: "살포 중지", color: "#f59e0b" },
  { label: "위치 보고", color: "#60a5fa" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: Date) {
  return d.toLocaleTimeString("ko-KR", { hour12: false });
}

function xyToLatLng(x: number, y: number): { lat: number; lng: number } {
  return {
    lat: parseFloat(
      (BASE_LAT + (MAP_H / 2 - y) * 0.00055 + SIM_SEA_OFFSET.lat).toFixed(6)
    ),
    lng: parseFloat(
      (BASE_LNG + (x - MAP_W / 2) * 0.00048 + SIM_SEA_OFFSET.lng).toFixed(6)
    ),
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** 지도 x좌표 → 구역 (A=서부, B=중부, C=동부) */
function getZone(x: number): "A" | "B" | "C" {
  if (x < 320) return "A";
  if (x < 640) return "B";
  return "C";
}

function makeLabel(zone: "A" | "B" | "C", n: number): string {
  return `${zone}${String(n).padStart(2, "0")}`;
}

function rebuildZoneCountsFromDrops(drops: SeedDrop[]): Record<"A" | "B" | "C", number> {
  const c: Record<"A" | "B" | "C", number> = { A: 0, B: 0, C: 0 };
  for (const d of drops) {
    const m = /^([ABC])(\d+)$/.exec(d.label);
    if (!m) continue;
    const z = m[1] as "A" | "B" | "C";
    const n = parseInt(m[2], 10);
    if (n > c[z]) c[z] = n;
  }
  return c;
}

function startOfDayMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endOfDayMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function windDirLabel(deg: number): string {
  const dirs = [
    "북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동",
    "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서",
  ];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** 풍향(바람이 오는 방향) 기준 — 바람이 향하는 쪽으로 청색 침 표시 */
function SidebarWindCompass({ windDirDeg }: { windDirDeg: number }) {
  const cx = 50;
  const cy = 50;
  const blow = ((windDirDeg + 180) % 360 + 360) % 360;
  const rad = (blow * Math.PI) / 180;
  const len = 32;
  const tipX = cx + len * Math.sin(rad);
  const tipY = cy - len * Math.cos(rad);
  const backLen = 8;
  const bx = cx - backLen * Math.sin(rad);
  const by = cy + backLen * Math.cos(rad);
  const perp = 4;
  const vx = Math.cos(rad) * perp;
  const vy = Math.sin(rad) * perp;
  const cardinals: { d: number; ch: string; x: number; y: number; anchor: "middle" | "start" | "end" }[] = [
    { d: 0, ch: "N", x: 50, y: 12, anchor: "middle" },
    { d: 90, ch: "E", x: 88, y: 54, anchor: "middle" },
    { d: 180, ch: "S", x: 50, y: 92, anchor: "middle" },
    { d: 270, ch: "W", x: 12, y: 54, anchor: "middle" },
  ];
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-[48px] w-[48px] shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
      role="img"
      aria-label={`풍향 나침반, 바람 향함 약 ${Math.round(blow)}°`}
    >
      <defs>
        <linearGradient id="sidebarCompassFace" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0c1526" />
        </linearGradient>
        <linearGradient id="sidebarCompassNeedle" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r="47" fill="url(#sidebarCompassFace)" stroke="#475569" strokeWidth="1.1" />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((d) => {
        const br = (d * Math.PI) / 180;
        const r1 = d % 90 === 0 ? 36 : 38;
        const r2 = 46;
        return (
          <line
            key={d}
            x1={cx + r1 * Math.sin(br)}
            y1={cy - r1 * Math.cos(br)}
            x2={cx + r2 * Math.sin(br)}
            y2={cy - r2 * Math.cos(br)}
            stroke={d % 90 === 0 ? "#94a3b8" : "#64748b"}
            strokeWidth={d % 90 === 0 ? 1.1 : 0.55}
            strokeLinecap="round"
          />
        );
      })}
      {cardinals.map(({ d, ch, x, y, anchor }) => (
        <text
          key={d}
          x={x}
          y={y}
          textAnchor={anchor}
          fill="#94a3b8"
          fontSize="10"
          fontWeight="700"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          {ch}
        </text>
      ))}
      <polygon
        points={`${tipX},${tipY} ${bx + vx},${by - vy} ${bx - vx},${by + vy}`}
        fill="url(#sidebarCompassNeedle)"
        stroke="#0ea5e9"
        strokeWidth="0.35"
        strokeLinejoin="round"
      />
      <circle cx={cx} cy={cy} r="4.5" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r="1.8" fill="#38bdf8" />
    </svg>
  );
}

function initWeather(): WeatherState {
  return {
    windSpeed: 8 + Math.random() * 5,
    windDir: 215 + Math.random() * 35,
    windGust: 14 + Math.random() * 7,
    waveHeight: 0.7 + Math.random() * 0.9,
    visibility: 9 + Math.random() * 5,
    temp: 17 + Math.random() * 6,
  };
}

type DropAgeBand = "recent" | "orange3m" | "pink1y" | "light2y" | "pale";

function dropAgeBand(recordedAt: number, now: number = Date.now()): DropAgeBand {
  const days = (now - recordedAt) / 86_400_000;
  if (days <= 45) return "recent";
  if (days < 120) return "orange3m";
  if (days < 400) return "pink1y";
  if (days < 800) return "light2y";
  return "pale";
}

function dropAgeColors(band: DropAgeBand): { fill: string; stroke: string; pulse: string } {
  switch (band) {
    case "recent":   return { fill: "#7f1d1d", stroke: "#fecaca", pulse: "#f87171" };
    case "orange3m": return { fill: "#c2410c", stroke: "#fdba74", pulse: "#fb923c" };
    case "pink1y":   return { fill: "#be185d", stroke: "#fbcfe8", pulse: "#f472b6" };
    case "light2y":  return { fill: "#fda4af", stroke: "#fff1f2", pulse: "#fb7185" };
    case "pale":
    default:         return { fill: "#cbd5e1", stroke: "#f8fafc", pulse: "#94a3b8" };
  }
}

function dropVisualColors(d: SeedDrop): { fill: string; stroke: string; pulse: string } {
  if (d.verificationMismatch) return { fill: "#171717", stroke: "#a3a3a3", pulse: "#737373" };
  return dropAgeColors(dropAgeBand(d.recordedAt));
}

/** 사이드바 이력 행 좌측 강조 — 상단 패널과 동일한 틸 톤(지도 연령 색과 분리) */
function sidebarHistoryRowAccent(d: SeedDrop, isLatest: boolean): string {
  if (d.verificationMismatch) return "rgba(148, 163, 184, 0.65)";
  if (isLatest) return "rgba(94, 234, 212, 0.9)";
  return "rgba(45, 212, 191, 0.55)";
}

const INITIAL_SEED_COUNT = 4;
/** 사이드바 금일·누적 표시용 기준값(과거 UI와 동일 톤) */
const DAILY_SEED_DISPLAY_BASE = 124;
const CUMULATIVE_SEED_BASE = 1840;
function mpsToKt(mps: number) {
  return mps * 1.94384;
}
const SEED_AGE_DAYS = [820, 420, 95, 3];

// 초기 구역별 카운터 — seedInitial 이후 Dashboard 에서 동기화
const INIT_ZONE_COUNTS: Record<"A" | "B" | "C", number> = { A: 0, B: 0, C: 0 };

function seedInitial(): SeedDrop[] {
  const counts: Record<"A" | "B" | "C", number> = { A: 0, B: 0, C: 0 };
  const pts = WAYPOINTS.slice(0, INITIAL_SEED_COUNT);
  const base = pts.map((p, i) => {
    const coords = xyToLatLng(p.x, p.y);
    const recordedAt = Date.now() - SEED_AGE_DAYS[i] * 86_400_000;
    const zone = getZone(p.x);
    counts[zone]++;
    return {
      id: String(1000 + i + 1).padStart(4, "0"),
      label: makeLabel(zone, counts[zone]),
      time: fmt(new Date(recordedAt)),
      lat: coords.lat + (Math.random() - 0.5) * 0.0003,
      lng: coords.lng + (Math.random() - 0.5) * 0.0003,
      status: "성공" as const,
      recordedAt,
    };
  });
  // 검수 불일치 시연용 살포점
  const pAudit = WAYPOINTS[5];
  const coordsAudit = xyToLatLng(pAudit.x, pAudit.y);
  const recordedAtAudit = Date.now() - 12 * 86_400_000;
  const zoneAudit = getZone(pAudit.x);
  counts[zoneAudit]++;
  const auditDrop: SeedDrop = {
    id: "1005",
    label: makeLabel(zoneAudit, counts[zoneAudit]),
    time: fmt(new Date(recordedAtAudit)),
    lat: coordsAudit.lat + (Math.random() - 0.5) * 0.0003,
    lng: coordsAudit.lng + (Math.random() - 0.5) * 0.0003,
    status: "성공",
    recordedAt: recordedAtAudit,
    verificationMismatch: true,
  };
  // 초기 카운터 동기화
  Object.assign(INIT_ZONE_COUNTS, counts);
  return [...base, auditDrop];
}

function exportCSV(drops: SeedDrop[]) {
  const header =
    "식별번호,구역,시각,위도,경도,상태,기록시각_ISO,recorded_at_ms\n";
  const rows = drops
    .map(
      (d) =>
        `${d.id},${d.label},${d.time},${d.lat},${d.lng},${d.status},${new Date(d.recordedAt).toISOString()},${d.recordedAt}`,
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dt = new Date();
  const ymd = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
  a.download = `종자살포이력_${ymd}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── WindCompass ──────────────────────────────────────────────────────────────

function WindCompass({
  direction,
  speed,
  gust,
}: {
  direction: number;
  speed: number;
  gust: number;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <defs>
            <radialGradient id="cmpBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(64,224,208,0.06)" />
              <stop offset="100%" stopColor="rgba(6,26,48,0.92)" />
            </radialGradient>
            <filter id="needleGlow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer glow ring */}
          <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(64,224,208,0.12)" strokeWidth="2" />
          {/* Background fill */}
          <circle cx="50" cy="50" r="46" fill="url(#cmpBg)" />
          {/* Mid ring */}
          <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.8" />

          {/* Tick marks */}
          {Array.from({ length: 16 }).map((_, i) => {
            const ang = ((i * 22.5 - 90) * Math.PI) / 180;
            const isCard = i % 4 === 0;
            const r1 = isCard ? 34 : 38;
            const r2 = 43;
            return (
              <line
                key={i}
                x1={50 + r1 * Math.cos(ang)}
                y1={50 + r1 * Math.sin(ang)}
                x2={50 + r2 * Math.cos(ang)}
                y2={50 + r2 * Math.sin(ang)}
                stroke={isCard ? "rgba(64,224,208,0.7)" : "rgba(255,255,255,0.18)"}
                strokeWidth={isCard ? 1.5 : 0.7}
              />
            );
          })}

          {/* Cardinal labels */}
          {(
            [
              ["N", 0, "#f87171"],
              ["E", 90, "rgba(255,255,255,0.6)"],
              ["S", 180, "rgba(255,255,255,0.6)"],
              ["W", 270, "rgba(255,255,255,0.6)"],
            ] as [string, number, string][]
          ).map(([d, a, col]) => {
            const r = ((a - 90) * Math.PI) / 180;
            return (
              <text
                key={d}
                x={50 + 27 * Math.cos(r)}
                y={50 + 27 * Math.sin(r) + 3.5}
                textAnchor="middle"
                fill={col}
                style={{
                  fontSize: "8.5px",
                  fontWeight: d === "N" ? "700" : "500",
                  fontFamily: "monospace",
                }}
              >
                {d}
              </text>
            );
          })}

          {/* Wind direction needle */}
          <g
            style={{
              transform: `rotate(${direction}deg)`,
              transformOrigin: "50px 50px",
              transition: "transform 2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            {/* North tip (wind is coming FROM this direction) */}
            <polygon
              points="50,9 53.5,31 50,26 46.5,31"
              fill="#40E0D0"
              filter="url(#needleGlow)"
            />
            {/* South tip */}
            <polygon points="50,91 53.5,69 50,74 46.5,69" fill="rgba(64,224,208,0.22)" />
            {/* Shaft */}
            <line x1="50" y1="26" x2="50" y2="74" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
          </g>

          {/* Center cap */}
          <circle
            cx="50"
            cy="50"
            r="4.5"
            fill="rgba(255,255,255,0.92)"
            style={{ filter: "drop-shadow(0 0 4px #40E0D0)" }}
          />
          <circle cx="50" cy="50" r="1.8" fill="#40E0D0" />
        </svg>
      </div>

      {/* Data row below compass */}
      <div className="grid grid-cols-3 gap-1.5 w-full text-center">
        <div className="rounded-lg py-1.5 px-1" style={{ background: "rgba(64,224,208,0.06)" }}>
          <p className="text-[9px] text-white/40 tracking-wider uppercase mb-0.5">풍속</p>
          <p className="text-sm font-bold font-mono text-cyan-300 leading-none">
            {speed.toFixed(1)}
            <span className="text-[9px] font-normal text-white/35 ml-0.5">kt</span>
          </p>
        </div>
        <div className="rounded-lg py-1.5 px-1" style={{ background: "rgba(251,146,60,0.08)" }}>
          <p className="text-[9px] text-white/40 tracking-wider uppercase mb-0.5">돌풍</p>
          <p className="text-sm font-bold font-mono text-amber-300 leading-none">
            {gust.toFixed(1)}
            <span className="text-[9px] font-normal text-white/35 ml-0.5">kt</span>
          </p>
        </div>
        <div className="rounded-lg py-1.5 px-1" style={{ background: "rgba(255,255,255,0.04)" }}>
          <p className="text-[9px] text-white/40 tracking-wider uppercase mb-0.5">풍향</p>
          <p className="text-[11px] font-bold text-white/80 leading-none">
            {windDirLabel(direction)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── SignalPanel ──────────────────────────────────────────────────────────────

function SignalPanel({
  signals,
  onSend,
  isSending,
}: {
  signals: SignalEntry[];
  onSend: (cmd: string) => void;
  isSending: boolean;
}) {
  return (
    <div className="px-5 py-3 border-b border-white/10 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-white">
          <Radio className="h-3.5 w-3.5 shrink-0 text-white" aria-hidden />
          선박 신호 송신
        </span>
        <span
          className="text-[10px] flex items-center gap-1 transition-all duration-300"
          style={{ opacity: isSending ? 1 : 0 }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-cyan-400 font-semibold">전송 중…</span>
        </span>
      </div>

      {/* Command buttons */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {SHIP_COMMANDS.map((c) => (
          <button
            key={c.label}
            onClick={() => onSend(c.label)}
            disabled={isSending}
            className="py-2 px-1.5 rounded-lg text-[11px] font-bold leading-tight text-center
              transition-all duration-150 hover:scale-[1.04] active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: `${c.color}15`,
              border: `1px solid ${c.color}45`,
              color: c.color,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Latest signal status (1줄만) */}
      {signals.length > 0 && (() => {
        const last = signals[signals.length - 1];
        return (
          <div className="flex items-center justify-between text-[10px] px-1">
            <span className="text-white/35 font-mono">{last.time} · {last.cmd}</span>
            {last.ack
              ? <span className="text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3"/>수신확인</span>
              : <span className="text-amber-400 flex items-center gap-0.5 animate-pulse"><AlertCircle className="w-3 h-3"/>대기중</span>
            }
          </div>
        );
      })()}
    </div>
  );
}


// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [drops, setDrops] = useState<SeedDrop[]>(() => {
    if (marineDbEnabled()) return [];
    const stored = loadDropsFromLocalStorage();
    if (stored && stored.length > 0) return stored;
    return seedInitial();
  });
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [vessel, setVessel] = useState<Vessel>(() => {
    const wp = WAYPOINTS[0];
    const coords = xyToLatLng(wp.x, wp.y);
    return { x: wp.x, y: wp.y, heading: 45, lat: coords.lat, lng: coords.lng, speed: 3.7 };
  });
  const [path, setPath] = useState<{ x: number; y: number }[]>([]);
  const [zoom, setZoom] = useState(0);
  const [mapFitNonce, setMapFitNonce] = useState(1);
  const [clock, setClock] = useState(() => new Date());
  const [colorHelpOpen, setColorHelpOpen] = useState(false);
  const fileImportRef = useRef<HTMLInputElement>(null);
  const [weather, setWeather] = useState<WeatherState>(initWeather);
  const [signals, setSignals] = useState<SignalEntry[]>([]);
  const [signalSending, setSignalSending] = useState(false);
  /** 살포 시작/중지 — DB·BroadcastChannel으로 모든 접속 화면 동기 */
  const [seedingActive, setSeedingActive] = useState(false);
  const [returnCommandModalOpen, setReturnCommandModalOpen] = useState(false);
  const [positionReportToast, setPositionReportToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "schedule">("map");
  const [manualOpen, setManualOpen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>("test");
  const [gpsVessel, setGpsVessel] = useState<{
    lat: number;
    lng: number;
    heading: number;
  } | null>(null);
  const [gpsSpeedKn, setGpsSpeedKn] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const geoWatchRef = useRef(0);
  const hadGpsFixForFitRef = useRef(false);
  const [lteFollowEnabled, setLteFollowEnabled] = useState(false);
  const [lteTrackPoints, setLteTrackPoints] = useState<VesselTrackPoint[]>([]);
  const [aiEmergencyMsg, setAiEmergencyMsg] = useState<string | undefined>(undefined);
  const [safetyLevel, setSafetyLevel] = useState<"안전" | "주의" | "긴급">("안전");
  const [forecastScores, setForecastScores] = useState<SlotScore[]>([]);
  const [groqSummary, setGroqSummary] = useState<string>("");
  const [workAiModalOpen, setWorkAiModalOpen] = useState(false);
  const [workAiGroq, setWorkAiGroq] = useState<WorkPlanGroqBrief | null>(null);
  const [workAiLoading, setWorkAiLoading] = useState(false);
  const [workAiUserNote, setWorkAiUserNote] = useState("");

  const [showVisionModal, setShowVisionModal] = useState(false);
  const [trackReportModalOpen, setTrackReportModalOpen] = useState(false);
  const [showTodayTrackReplayOnMap, setShowTodayTrackReplayOnMap] = useState(false);

  const [fieldReportModalOpen, setFieldReportModalOpen] = useState(false);
  const [fieldReportActive, setFieldReportActive] = useState(false);
  const [fieldReportExtras, setFieldReportExtras] = useState({ ptyCode: 0, pop: 0, sky: 1 });
  const [weatherPanelNonce, setWeatherPanelNonce] = useState(0);
  const weatherRef = useRef(weather);
  const fieldReportActiveRef = useRef(false);
  const fieldReportExtrasRef = useRef(fieldReportExtras);
  weatherRef.current = weather;
  fieldReportExtrasRef.current = fieldReportExtras;
  useEffect(() => {
    fieldReportActiveRef.current = fieldReportActive;
  }, [fieldReportActive]);

  // ── B2G 시연 전용 상태 ────────────────────────────────────────────────────
  const [demoWeatherMode, setDemoWeatherMode] = useState<"normal" | "danger">("normal");
  const [demoAlertVisible, setDemoAlertVisible] = useState(false);
  const [demoSafeVisible, setDemoSafeVisible] = useState(false);
  const [demoSosVisible, setDemoSosVisible] = useState(false);
  const [demoSosBlink, setDemoSosBlink] = useState(false); // 선박 마커 깜빡임

  const handleForecastScoresChange = useCallback((scores: SlotScore[]) => {
    setForecastScores((prev) => {
      if (!fieldReportActiveRef.current || scores.length === 0) return scores;
      const w = weatherRef.current;
      const ex = fieldReportExtrasRef.current;
      const slot = kmaSlotFromFieldReport(
        {
          windSpeed: w.windSpeed,
          windDir: w.windDir,
          waveHeight: w.waveHeight,
          temp: w.temp,
        },
        { ptyCode: ex.ptyCode, pop: ex.pop, sky: ex.sky },
      );
      return [scoreHourSlot(slot), ...scores.slice(1)];
    });
    if (!fieldReportActiveRef.current && scores.length > 0) {
      const slot = pickCurrentOrNextKmaSlot(scores.map((s) => s.slot));
      if (slot) setWeather(kmaSlotToDashboardWeather(slot));
    }
  }, []);

  const handleFieldReportSubmit = useCallback((p: FieldWeatherReportPayload) => {
    const slot = kmaSlotFromFieldReport(
      { windSpeed: p.windSpeed, windDir: p.windDir, waveHeight: p.waveHeight, temp: p.temp },
      { ptyCode: p.ptyCode, pop: p.pop, sky: p.sky },
    );
    const ex = { ptyCode: p.ptyCode, pop: p.pop, sky: p.sky };
    fieldReportExtrasRef.current = ex;
    setFieldReportExtras(ex);
    setWeather(kmaSlotToDashboardWeather(slot));
    fieldReportActiveRef.current = true;
    setFieldReportActive(true);
    setForecastScores((prev) => {
      if (prev.length === 0) return prev;
      return [scoreHourSlot(slot), ...prev.slice(1)];
    });
    setFieldReportModalOpen(false);
  }, []);

  const handleClearFieldReport = useCallback(() => {
    fieldReportActiveRef.current = false;
    setFieldReportActive(false);
    setFieldReportExtras({ ptyCode: 0, pop: 0, sky: 1 });
    fieldReportExtrasRef.current = { ptyCode: 0, pop: 0, sky: 1 };
    setWeatherPanelNonce((n) => n + 1);
  }, []);

  const wpIdx        = useRef(0);
  const counter      = useRef(1000 + INITIAL_SEED_COUNT + 1);
  const zoneCounts   = useRef<Record<"A"|"B"|"C", number>>({ ...INIT_ZONE_COUNTS });
  const dropsDbReady = useRef(!marineDbEnabled());
  const logRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wheelZoomAccum = useRef(0);

  const filteredDrops = useMemo(() => {
    return drops.filter((d) => {
      if (filterStart && d.recordedAt < startOfDayMs(filterStart)) return false;
      if (filterEnd && d.recordedAt > endOfDayMs(filterEnd)) return false;
      return true;
    });
  }, [drops, filterStart, filterEnd]);

  const latestId = drops[drops.length - 1]?.id;

  const highlightDropId = filteredDrops.some((x) => x.id === latestId)
    ? latestId
    : undefined;

  const pathLatLng = useMemo(
    () =>
      path.map((p) => {
        const ll = xyToLatLng(p.x, p.y);
        return [ll.lat, ll.lng] as [number, number];
      }),
    [path]
  );

  const isRealWithGps = mapMode === "real" && gpsVessel != null;
  const awaitingGps = mapMode === "real" && gpsVessel == null;

  const leafletPathLatLng = useMemo(
    () => (mapMode === "real" ? [] : pathLatLng),
    [mapMode, pathLatLng]
  );

  const ltePathLatLng = useMemo(
    () => lteTrackPoints.map((p) => [p.lat, p.lng] as [number, number]),
    [lteTrackPoints],
  );

  const lteRemoteFresh = useMemo(() => {
    if (lteTrackPoints.length === 0) return false;
    const last = lteTrackPoints[lteTrackPoints.length - 1];
    return Date.now() - new Date(last.recorded_at).getTime() < 25 * 60 * 1000;
  }, [lteTrackPoints]);

  const displaySafetyLevel = useMemo(
    () => mergeDisplaySafetyLevel(safetyLevel, forecastScores[0]?.verdict),
    [safetyLevel, forecastScores],
  );

  const workLocalRec = useMemo(() => {
    const slot = pickCurrentOrNextKmaSlot(forecastScores.map((s) => s.slot));
    return buildLocalWorkRecommendation(forecastScores, displaySafetyLevel, weather.windSpeed, weather.waveHeight, {
      windGustMps: weather.windGust,
      visibilityKm: weather.visibility,
      tempC: weather.temp,
      popPct: slot?.pop,
      ptyCode: slot?.ptyCode,
    });
  }, [
    forecastScores,
    displaySafetyLevel,
    weather.windSpeed,
    weather.waveHeight,
    weather.windGust,
    weather.visibility,
    weather.temp,
  ]);

  const nowForecastSlot = useMemo(
    () =>
      forecastScores.length > 0
        ? pickCurrentOrNextKmaSlot(forecastScores.map((s) => s.slot))
        : null,
    [forecastScores],
  );

  const liveWeatherForAi = useMemo(
    () => ({
      windSpeed: weather.windSpeed,
      windDir: weather.windDir,
      waveHeight: weather.waveHeight,
      temp: weather.temp,
      ptyCode: fieldReportActive ? fieldReportExtras.ptyCode : (nowForecastSlot?.ptyCode ?? 0),
      pop: fieldReportActive ? fieldReportExtras.pop : (nowForecastSlot?.pop ?? 0),
      sky: fieldReportActive ? fieldReportExtras.sky : (nowForecastSlot?.sky ?? 1),
    }),
    [weather, fieldReportActive, fieldReportExtras, nowForecastSlot],
  );

  const weatherNowcastNote = useMemo(() => {
    if (fieldReportActive) {
      return "지금: 현장 상황보고 · 이후: 기상청 단기예보";
    }
    if (isKmaApiConfigured()) {
      return "지금: 단기예보 동기화(주기 갱신, 관측 실시간 아님)";
    }
    return "지금: 목업 시연(API 미설정)";
  }, [fieldReportActive]);

  /** 살포 점 Convex Hull 기반 추정 구역 면적 */
  const seedingAreaHa = useMemo(() => {
    if (filteredDrops.length < 3) return 0;
    return estimateSeedingAreaHa(filteredDrops.map((d) => ({ lat: d.lat, lng: d.lng })));
  }, [filteredDrops]);

  const vesselLteId = useMemo(() => vesselLteIdFromEnv(), []);

  const leafletVessel = useMemo(() => {
    if (isRealWithGps && gpsVessel) {
      return {
        lat: gpsVessel.lat,
        lng: gpsVessel.lng,
        heading: gpsVessel.heading,
      };
    }
    return { lat: vessel.lat, lng: vessel.lng, heading: vessel.heading };
  }, [isRealWithGps, gpsVessel, vessel.lat, vessel.lng, vessel.heading]);

  const clockYmd = ymdLocal(clock);
  const todayReplayTrackPath = useMemo((): [number, number][] => {
    const t0 = startOfDayMs(clockYmd);
    const t1 = endOfDayMs(clockYmd);
    if (trackReportUsesTestSample()) {
      return buildSampleLteForYmdRange(clockYmd, clockYmd).map((p) => [p.lat, p.lng] as [number, number]);
    }
    const lteToday = lteTrackPoints
      .filter((p) => {
        const ts = new Date(p.recorded_at).getTime();
        return ts >= t0 && ts <= t1;
      })
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .map((p) => [p.lat, p.lng] as [number, number]);
    if (lteToday.length >= 2) return lteToday;
    const dropsToday = drops
      .filter((d) => d.recordedAt >= t0 && d.recordedAt <= t1)
      .sort((a, b) => a.recordedAt - b.recordedAt)
      .map((d) => [d.lat, d.lng] as [number, number]);
    if (dropsToday.length >= 2) return dropsToday;
    if (dropsToday.length === 1) {
      return [...dropsToday, [leafletVessel.lat, leafletVessel.lng] as [number, number]];
    }
    return [];
  }, [clockYmd, lteTrackPoints, drops, leafletVessel.lat, leafletVessel.lng]);

  useEffect(() => {
    setShowTodayTrackReplayOnMap(false);
  }, [clockYmd]);

  useEffect(() => {
    if (showTodayTrackReplayOnMap && todayReplayTrackPath.length < 2) {
      setShowTodayTrackReplayOnMap(false);
    }
  }, [showTodayTrackReplayOnMap, todayReplayTrackPath.length]);

  const leafletDrops = useMemo(
    () =>
      filteredDrops.map((d) => ({
        id: d.id,
        label: d.label,
        lat: d.lat,
        lng: d.lng,
        highlight: highlightDropId === d.id,
        ...dropVisualColors(d),
      })),
    [filteredDrops, highlightDropId]
  );

  /** watch / getCurrentPosition 공통 — 지도 앱의「내 위치」좌표 반영 */
  const applyGeolocationCoords = useCallback((coords: GeolocationCoordinates) => {
    const h = coords.heading;
    const sp = coords.speed;
    setGpsError(null);
    setGpsVessel({
      lat: coords.latitude,
      lng: coords.longitude,
      heading: typeof h === "number" && !Number.isNaN(h) ? h : 0,
    });
    setGpsSpeedKn(
      typeof sp === "number" && sp >= 0 && !Number.isNaN(sp) ? sp * 1.94384 : null
    );
  }, []);

  useEffect(() => {
    if (mapMode !== "real") {
      setGpsVessel(null);
      setGpsSpeedKn(null);
      setGpsError(null);
      if (geoWatchRef.current) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
        geoWatchRef.current = 0;
      }
      return;
    }
    if (!navigator.geolocation) {
      setGpsError("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        applyGeolocationCoords(pos.coords);
      },
      (err) => {
        if (cancelled) return;
        setGpsError(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );
    geoWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        applyGeolocationCoords(pos.coords);
      },
      (err) => {
        if (cancelled) return;
        setGpsError(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 25_000 }
    );
    return () => {
      cancelled = true;
      if (geoWatchRef.current) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
        geoWatchRef.current = 0;
      }
    };
  }, [mapMode, applyGeolocationCoords]);

  useEffect(() => {
    if (mapMode === "real" && gpsVessel) {
      if (!hadGpsFixForFitRef.current) {
        hadGpsFixForFitRef.current = true;
        setMapFitNonce((n) => n + 1);
      }
    } else if (mapMode === "test") {
      hadGpsFixForFitRef.current = false;
    }
  }, [mapMode, gpsVessel]);

  useEffect(() => {
    if (!lteFollowEnabled) setLteTrackPoints([]);
  }, [lteFollowEnabled]);

  useEffect(() => {
    if (!marineDbEnabled() || !lteFollowEnabled) return;
    let cancelled = false;
    const pollRaw = import.meta.env.VITE_VESSEL_LTE_POLL_MS;
    const pollParsed =
      pollRaw != null && String(pollRaw).trim() !== "" ? Number(pollRaw) : Number.NaN;
    const pollMs = Number.isFinite(pollParsed)
      ? Math.min(120_000, Math.max(5000, pollParsed))
      : 12_000;

    const tick = async () => {
      const pts = await fetchVesselTrackPoints(vesselLteId, 500);
      if (cancelled || pts === null) return;
      setLteTrackPoints(pts);
      if (mapMode !== "test" || pts.length === 0) return;
      const last = pts[pts.length - 1];
      const ageMs = Date.now() - new Date(last.recorded_at).getTime();
      if (ageMs >= 25 * 60 * 1000) return;
      const prev = pts.length >= 2 ? pts[pts.length - 2] : null;
      let heading =
        typeof last.heading_deg === "number" && !Number.isNaN(last.heading_deg)
          ? last.heading_deg
          : 0;
      if (prev && (typeof last.heading_deg !== "number" || Number.isNaN(last.heading_deg))) {
        heading = bearingDeg(prev.lat, prev.lng, last.lat, last.lng);
      }
      setVessel((v) => ({
        ...v,
        lat: last.lat,
        lng: last.lng,
        heading,
        speed:
          typeof last.speed_kn === "number" && !Number.isNaN(last.speed_kn) ? last.speed_kn : v.speed,
      }));
    };

    void tick();
    const id = window.setInterval(() => void tick(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [marineDbEnabled(), lteFollowEnabled, vesselLteId, mapMode]);

  /** 위치 보고·Realtime 수신 시 DB 궤적을 다시 읽어 지도·시뮬 선박에 반영 */
  const refreshTrackFromDb = useCallback(async () => {
    if (!marineDbEnabled()) return;
    const pts = await fetchVesselTrackPoints(vesselLteId, 500);
    if (pts === null) return;
    if (lteFollowEnabled) setLteTrackPoints(pts);
    if (mapMode === "test" && pts.length > 0) {
      const last = pts[pts.length - 1];
      const prev = pts.length >= 2 ? pts[pts.length - 2] : null;
      let heading =
        typeof last.heading_deg === "number" && !Number.isNaN(last.heading_deg)
          ? last.heading_deg
          : 0;
      if (prev && (typeof last.heading_deg !== "number" || Number.isNaN(last.heading_deg))) {
        heading = bearingDeg(prev.lat, prev.lng, last.lat, last.lng);
      }
      setVessel((v) => ({
        ...v,
        lat: last.lat,
        lng: last.lng,
        heading,
        speed:
          typeof last.speed_kn === "number" && !Number.isNaN(last.speed_kn)
            ? last.speed_kn
            : v.speed,
      }));
    }
  }, [vesselLteId, lteFollowEnabled, mapMode]);

  useEffect(() => {
    const applyRemoteCmd = (cmd: string) => {
      if (cmd === "seed_start") setSeedingActive(true);
      if (cmd === "seed_stop") setSeedingActive(false);
      if (cmd === "emergency_return") setReturnCommandModalOpen(true);
      if (cmd === "report_position" || cmd === "position_report") {
        if (marineDbEnabled()) void refreshTrackFromDb();
        else {
          setPositionReportToast("위치 보고 신호가 수신되었습니다(로컬 시연).");
          window.setTimeout(() => setPositionReportToast(null), 3200);
        }
      }
    };

    if (marineDbEnabled()) {
      return subscribeShipCommandInserts(applyRemoteCmd);
    }
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(MARINE_OPS_SIGNAL_BC);
    const onMsg = (ev: MessageEvent<{ cmd?: string }>) => {
      const c = ev.data?.cmd;
      if (typeof c === "string") applyRemoteCmd(c);
    };
    bc.addEventListener("message", onMsg);
    return () => {
      bc.removeEventListener("message", onMsg);
      bc.close();
    };
  }, [refreshTrackFromDb]);

  useEffect(() => {
    if (!marineDbEnabled()) {
      dropsDbReady.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      const fromDb = await fetchSeedDropRecords(80);
      if (cancelled) return;
      if (fromDb === null) {
        const seed = seedInitial();
        if (!cancelled) {
          setDrops(seed);
          zoneCounts.current = rebuildZoneCountsFromDrops(seed);
          const maxNum = seed.reduce((m, d) => Math.max(m, parseInt(d.id, 10) || 0), 0);
          counter.current = Math.max(maxNum + 1, 1006);
        }
        dropsDbReady.current = true;
        return;
      }
      if (fromDb.length > 0) {
        const mapped: SeedDrop[] = fromDb.map((r) => ({
          id: r.id,
          label: r.label,
          time: r.time,
          lat: r.lat,
          lng: r.lng,
          status: r.status,
          recordedAt: r.recordedAt,
          verificationMismatch: r.verificationMismatch,
        }));
        if (!cancelled) {
          setDrops(mapped);
          const maxNum = mapped.reduce((m, d) => Math.max(m, parseInt(d.id, 10) || 0), 0);
          counter.current = Math.max(maxNum + 1, 1006);
          zoneCounts.current = rebuildZoneCountsFromDrops(mapped);
        }
      } else {
        const seed = seedInitial();
        if (!cancelled) setDrops(seed);
        await seedSeedDropRecords(
          seed.map((s) => ({
            id: s.id,
            label: s.label,
            time: s.time,
            lat: s.lat,
            lng: s.lng,
            status: s.status,
            recordedAt: s.recordedAt,
            verificationMismatch: s.verificationMismatch,
          })),
        );
        if (!cancelled) zoneCounts.current = rebuildZoneCountsFromDrops(seed);
      }
      dropsDbReady.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Supabase 연동 시: DB 살포 이력 주기 갱신(아두이노·telemetry-ingest 반영, 새로고침 불필요) */
  useEffect(() => {
    if (!marineDbEnabled()) return;
    let cancelled = false;
    const pollRaw = import.meta.env.VITE_SEED_DROP_POLL_MS;
    const pollParsed =
      pollRaw != null && String(pollRaw).trim() !== "" ? Number(pollRaw) : Number.NaN;
    const pollMs = Number.isFinite(pollParsed)
      ? Math.min(120_000, Math.max(4000, pollParsed))
      : 12_000;

    const mergeDropsFromDb = async () => {
      if (cancelled || !dropsDbReady.current) return;
      const fromDb = await fetchSeedDropRecords(80);
      if (cancelled || fromDb === null) return;
      if (fromDb.length === 0) return;
      const mapped: SeedDrop[] = fromDb.map((r) => ({
        id: r.id,
        label: r.label,
        time: r.time,
        lat: r.lat,
        lng: r.lng,
        status: r.status,
        recordedAt: r.recordedAt,
        verificationMismatch: r.verificationMismatch,
      }));
      setDrops(mapped);
      const maxNum = mapped.reduce((m, d) => Math.max(m, parseInt(d.id, 10) || 0), 0);
      counter.current = Math.max(maxNum + 1, 1006);
      zoneCounts.current = rebuildZoneCountsFromDrops(mapped);
    };

    const t0 = window.setTimeout(() => void mergeDropsFromDb(), 2500);
    const id = window.setInterval(() => void mergeDropsFromDb(), pollMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.clearInterval(id);
    };
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [filteredDrops]);

  useLayoutEffect(() => {
    if (marineDbEnabled()) return;
    zoneCounts.current = rebuildZoneCountsFromDrops(drops);
    const maxNum = drops.reduce((m, d) => Math.max(m, parseInt(d.id, 10) || 0), 0);
    counter.current = Math.max(maxNum + 1, 1006);
  }, [drops]);

  useEffect(() => {
    if (marineDbEnabled()) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DROP_STORAGE_KEY, JSON.stringify(drops.slice(-500)));
      } catch (e) {
        console.warn("[marine-drops] localStorage 저장 실패", e);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [drops]);

  // Vessel movement (테스트 모드만 — LTE 실선 위치 수신 시 시뮬 이동은 멈춤)
  useEffect(() => {
    if (mapMode !== "test") return;
    if (lteFollowEnabled && lteRemoteFresh) return;
    const iv = setInterval(() => {
      const target = WAYPOINTS[wpIdx.current % WAYPOINTS.length];
      setVessel((v) => {
        const dx = target.x - v.x;
        const dy = target.y - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const t = Math.min(1, 8 / Math.max(dist, 1));
        const nx = lerp(v.x, target.x, t);
        const ny = lerp(v.y, target.y, t);
        const heading = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        const coords = xyToLatLng(nx, ny);
        if (dist < 15) wpIdx.current++;
        setPath((p) => {
          const next = [...p, { x: nx, y: ny }];
          return next.length > 55 ? next.slice(-55) : next;
        });
        return { x: nx, y: ny, heading, lat: coords.lat, lng: coords.lng, speed: 3.2 + Math.random() * 1.2 };
      });
    }, VESSEL_POSITION_TICK_MS);
    return () => clearInterval(iv);
  }, [mapMode, lteFollowEnabled, lteRemoteFresh]);

  // Auto seed drop (테스트 모드만 — LTE 선박 위치 우선 시에는 자동 살포 시연 생략)
  useEffect(() => {
    if (mapMode !== "test") return;
    if (lteFollowEnabled && lteRemoteFresh) return;
    const iv = setInterval(() => {
      setVessel((v) => {
        counter.current += 1;
        const jitter = () => (Math.random() - 0.5) * 0.0004;
        const recordedAt = Date.now();
        const zone = getZone(v.x);
        zoneCounts.current[zone]++;
        const newDrop: SeedDrop = {
          id: String(counter.current).padStart(4, "0"),
          label: makeLabel(zone, zoneCounts.current[zone]),
          time: fmt(new Date(recordedAt)),
          lat: parseFloat((v.lat + jitter()).toFixed(6)),
          lng: parseFloat((v.lng + jitter()).toFixed(6)),
          status: "성공",
          recordedAt,
        };
        setDrops((d) => {
          const next = [...d, newDrop].slice(-80);
          if (marineDbEnabled() && dropsDbReady.current) {
            void upsertSeedDropRecord({
              id: newDrop.id,
              label: newDrop.label,
              time: newDrop.time,
              lat: newDrop.lat,
              lng: newDrop.lng,
              status: newDrop.status,
              recordedAt: newDrop.recordedAt,
              verificationMismatch: newDrop.verificationMismatch,
            });
          }
          return next;
        });
        return v;
      });
    }, 16_000);
    return () => clearInterval(iv);
  }, [mapMode, lteFollowEnabled, lteRemoteFresh]);

  // Weather: 예보 슬롯이 없을 때만 시연용 랜덤 변동 — 기상청 API·목업 예보 수신 후에는 `handleForecastScoresChange`가 동기화
  useEffect(() => {
    if (forecastScores.length > 0) return;
    const iv = setInterval(() => {
      setWeather((w) => ({
        windSpeed: Math.max(2, Math.min(28, w.windSpeed + (Math.random() - 0.5) * 1.8)),
        windDir: (w.windDir + (Math.random() - 0.5) * 10 + 360) % 360,
        windGust: Math.max(w.windSpeed + 1, Math.min(38, w.windGust + (Math.random() - 0.5) * 2.5)),
        waveHeight: Math.max(0.2, Math.min(4, w.waveHeight + (Math.random() - 0.5) * 0.12)),
        visibility: Math.max(1, Math.min(15, w.visibility + (Math.random() - 0.5) * 0.6)),
        temp: Math.max(10, Math.min(30, w.temp + (Math.random() - 0.5) * 0.2)),
      }));
    }, 5000);
    return () => clearInterval(iv);
  }, [forecastScores.length]);

  // ── B2G 시연 핸들러 ──────────────────────────────────────────────────────
  // 데모용 슬롯 생성 헬퍼
  const makeDemoScores = useCallback((mode: "normal" | "danger"): SlotScore[] => {
    const base = generateMockForecast().slice(0, 8);
    return base.map((slot, i) => {
      // normal: 전 구간 안전 / danger: 3h 후부터 위험
      const overrides =
        mode === "normal"
          ? { windSpeed: 4 + Math.random(), waveHeight: 0.4 + Math.random() * 0.1 }
          : i < 3
          ? { windSpeed: 6 + i * 2, waveHeight: 0.6 + i * 0.2 }
          : { windSpeed: 16 + Math.random() * 4, waveHeight: 2.0 + Math.random() * 0.5 };
      return scoreHourSlot({ ...slot, ...overrides });
    });
  }, []);

  const handleDemoNormal = useCallback(() => {
    fieldReportActiveRef.current = false;
    setFieldReportActive(false);
    setDemoWeatherMode("normal");
    setDemoAlertVisible(false);
    setDemoSosBlink(false);
    setWeather({
      windSpeed: 4.2,
      windDir: 225,
      windGust: 6.5,
      waveHeight: 0.5,
      visibility: 12,
      temp: 18,
    });
    setForecastScores(makeDemoScores("normal"));
    setDemoSafeVisible(true);
    setTimeout(() => setDemoSafeVisible(false), 6000);
  }, [makeDemoScores]);

  const handleDemoDanger = useCallback(() => {
    fieldReportActiveRef.current = false;
    setFieldReportActive(false);
    setDemoWeatherMode("danger");
    setDemoSafeVisible(false);
    setWeather({
      windSpeed: 18.7,
      windDir: 310,
      windGust: 26.3,
      waveHeight: 2.4,
      visibility: 2.1,
      temp: 14,
    });
    setForecastScores(makeDemoScores("danger"));
    setDemoAlertVisible(true);
  }, [makeDemoScores]);

  const handleDemoSos = useCallback(() => {
    setDemoSosVisible(true);
    setDemoSosBlink(true);
    // 10초 후 깜빡임 해제
    setTimeout(() => setDemoSosBlink(false), 10000);
  }, []);

  // Signal send handler (살포·귀항·위치 — Supabase INSERT + Realtime 또는 BroadcastChannel)
  const handleSignal = useCallback(
    (cmd: string) => {
      if (signalSending && cmd !== "seed_start" && cmd !== "seed_stop") return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newSig: SignalEntry = { id, cmd, time: fmt(new Date()), ack: false };

      const run = async () => {
        if (cmd === "report_position") {
          const lat = isRealWithGps && gpsVessel ? gpsVessel.lat : vessel.lat;
          const lng = isRealWithGps && gpsVessel ? gpsVessel.lng : vessel.lng;
          const heading = leafletVessel.heading;
          const speedKn = isRealWithGps ? (gpsSpeedKn ?? vessel.speed) : vessel.speed;
          if (marineDbEnabled()) {
            await insertVesselTrackPoint({
              vesselId: vesselLteIdFromEnv(),
              lat,
              lng,
              speedKn,
              headingDeg: Number.isFinite(heading) ? heading : null,
              source: "position_report",
            });
            await insertShipCommand({ id, vesselId: vesselLteIdFromEnv(), cmd });
            void refreshTrackFromDb();
          } else if (typeof BroadcastChannel !== "undefined") {
            new BroadcastChannel(MARINE_OPS_SIGNAL_BC).postMessage({ cmd });
          }
          setPositionReportToast(
            marineDbEnabled()
              ? "관제탑에 현재 위치가 전달되었습니다."
              : "현재 위치를 알렸습니다(로컬 시연).",
          );
          window.setTimeout(() => setPositionReportToast(null), 3600);
        } else {
          if (marineDbEnabled()) {
            await insertShipCommand({ id, vesselId: vesselLteIdFromEnv(), cmd });
          } else if (typeof BroadcastChannel !== "undefined") {
            new BroadcastChannel(MARINE_OPS_SIGNAL_BC).postMessage({ cmd });
          }
        }

        if (cmd === "seed_start") setSeedingActive(true);
        if (cmd === "seed_stop") setSeedingActive(false);
        if (cmd === "emergency_return") setReturnCommandModalOpen(true);
      };

      void run();

      setSignals((s) => [...s.slice(-9), newSig]);
      setSignalSending(true);
      const delay =
        cmd === "seed_start" || cmd === "seed_stop"
          ? 520
          : cmd === "report_position"
            ? 900
            : 2200 + Math.random() * 1400;
      window.setTimeout(() => {
        setSignals((s) => s.map((sig) => (sig.id === id ? { ...sig, ack: true } : sig)));
        setSignalSending(false);
      }, delay);
    },
    [
      signalSending,
      isRealWithGps,
      gpsVessel,
      vessel,
      leafletVessel,
      gpsSpeedKn,
      refreshTrackFromDb,
    ],
  );

  const handleImportCsv = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsvToDrops(text);
      if (parsed.length === 0) {
        window.alert("인식된 행이 없습니다. CSV 형식(헤더 포함)을 확인하세요.");
        return;
      }
      if (
        !window.confirm(
          `CSV ${parsed.length}건으로 이력을 덮어씁니다. 계속할까요?`,
        )
      ) {
        return;
      }
      setDrops(parsed);
    };
    reader.readAsText(f, "UTF-8");
  }, []);

  const handleDeleteDrop = useCallback(async (d: SeedDrop) => {
    if (!window.confirm(`"${d.label}" (${d.time}) 살포 이력을 삭제할까요?`)) return;
    if (marineDbEnabled() && dropsDbReady.current) {
      const ok = await deleteSeedDropRecord(d.id);
      if (!ok) {
        window.alert("서버에서 삭제하지 못했습니다. 권한·네트워크를 확인한 뒤 다시 시도하세요.");
        return;
      }
    }
    setDrops((prev) => prev.filter((x) => x.id !== d.id));
  }, []);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 1, 4)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 1, 0)), []);
  /** 내 위치 모드: GPS로 다시 잡고 지도 맞춤 / 테스트: 살포·항적 기준 맞춤 */
  const handleRecenter = useCallback(() => {
    setZoom(0);
    if (mapMode === "real" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyGeolocationCoords(pos.coords);
          setMapFitNonce((n) => n + 1);
        },
        (err) => {
          setGpsError(geolocationErrorMessage(err));
          setMapFitNonce((n) => n + 1);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
      );
      return;
    }
    setMapFitNonce((n) => n + 1);
  }, [mapMode, applyGeolocationCoords]);

  // Mouse wheel zoom
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const threshold = 72;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      wheelZoomAccum.current += e.deltaY;
      if (wheelZoomAccum.current >= threshold) {
        setZoom((z) => Math.max(0, z - 1));
        wheelZoomAccum.current = 0;
      } else if (wheelZoomAccum.current <= -threshold) {
        setZoom((z) => Math.min(4, z + 1));
        wheelZoomAccum.current = 0;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const latestDrop = drops[drops.length - 1];
  const latestFiltered = filteredDrops[filteredDrops.length - 1];
  const headerLatest = latestFiltered ?? latestDrop;
  const headerAgeColor = headerLatest ? dropVisualColors(headerLatest) : null;

  useEffect(() => {
    document.title = "해양 종자 살포 관제 시스템";
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (viewMode === "schedule") setMapFitNonce((n) => n + 1);
  }, [viewMode]);

  useEffect(() => {
    setWorkAiUserNote(loadWorkAiUserNote());
  }, []);

  useEffect(() => {
    if (workAiModalOpen) setWorkAiUserNote(loadWorkAiUserNote());
  }, [workAiModalOpen]);

  const saveWorkAiNote = useCallback((text: string) => {
    saveWorkAiUserNote(text);
    setWorkAiUserNote(text);
  }, []);

  useEffect(() => {
    if (!workAiModalOpen) {
      setWorkAiGroq(null);
      setWorkAiLoading(false);
      return;
    }
    setWorkAiGroq(null);
    if (!isGroqConfigured()) {
      setWorkAiLoading(false);
      return;
    }
    let cancelled = false;
    setWorkAiLoading(true);
    void analyzeWorkPlanBriefWithGroq({
      safetyLevel: displaySafetyLevel,
      windMps: weather.windSpeed,
      waveM: weather.waveHeight,
      temp: weather.temp,
      local: workLocalRec,
      userNote: workAiUserNote,
      nowcastContext: weatherNowcastNote,
    }).then((r) => {
      if (!cancelled && r) setWorkAiGroq(r);
    }).finally(() => {
      if (!cancelled) setWorkAiLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workAiModalOpen, displaySafetyLevel, weather.windSpeed, weather.waveHeight, weather.temp, workLocalRec, workAiUserNote, weatherNowcastNote]);

  // 현재 선박 위치 (SOS 토스트 좌표)
  const sosVesselLat = vessel.lat !== 0 ? vessel.lat : 34.8756;
  const sosVesselLng = vessel.lng !== 0 ? vessel.lng : 128.6812;

  return (
    <div className="flex h-svh min-h-0 w-full items-stretch overflow-hidden font-sans text-[15px] leading-snug sm:text-[16px] antialiased">
      {/* 시연 전용 전체화면 경고 (Phase 2 — 기상 악화) */}
      <WeatherAlertOverlay
        visible={demoAlertVisible}
        windSpeed={weather.windSpeed}
        waveHeight={weather.waveHeight}
        onClose={() => setDemoAlertVisible(false)}
      />
      {/* 시연 전용 SOS 수신 토스트 (Phase 4) */}
      <SosReceivedToast
        visible={demoSosVisible}
        vesselId={vesselLteId || "VESSEL-001"}
        lat={sosVesselLat}
        lng={sosVesselLng}
        onDismiss={() => setDemoSosVisible(false)}
      />

      <ManualModal isOpen={manualOpen} onClose={() => setManualOpen(false)} />
      <VisionRoadmapModal isOpen={showVisionModal} onClose={() => setShowVisionModal(false)} />
      <WorkPlanAiModal
        open={workAiModalOpen}
        onClose={() => setWorkAiModalOpen(false)}
        local={workLocalRec}
        ai={workAiGroq}
        aiLoading={workAiLoading}
        groqConfigured={isGroqConfigured()}
        userNote={workAiUserNote}
        onUserNoteSave={saveWorkAiNote}
      />
      <TodayTrackReportModal
        open={trackReportModalOpen}
        onClose={() => setTrackReportModalOpen(false)}
        referenceDate={clock}
        drops={drops}
        weather={weather}
        vesselLat={leafletVessel.lat}
        vesselLng={leafletVessel.lng}
        pathLatLng={leafletPathLatLng}
        lteTrackPoints={lteTrackPoints}
        vesselName={VESSEL_NAME}
      />
      <FieldWeatherReportModal
        open={fieldReportModalOpen}
        onClose={() => setFieldReportModalOpen(false)}
        initial={{
          windSpeed: weather.windSpeed,
          windDir: weather.windDir,
          waveHeight: weather.waveHeight,
          temp: weather.temp,
        }}
        initialExtras={fieldReportActive ? fieldReportExtras : undefined}
        onSubmit={handleFieldReportSubmit}
      />

      {returnCommandModalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-cmd-title"
          onClick={() => setReturnCommandModalOpen(false)}
        >
          <div
            className="max-w-md w-full rounded-xl border border-red-400/50 p-5 shadow-2xl"
            style={{
              background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="return-cmd-title" className="text-lg font-bold text-red-300 tracking-tight">
              귀항 명령
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              관제탑에서 긴급 귀항 지령이 전달되었습니다. 즉시 회항·안전 확보 절차를 실행하세요.
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-lg bg-red-600/90 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
              onClick={() => setReturnCommandModalOpen(false)}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {positionReportToast && (
        <div className="fixed bottom-6 left-1/2 z-[999] -translate-x-1/2 max-w-[min(90vw,24rem)] rounded-lg border border-sky-400/40 bg-[#0a1f38]/95 px-4 py-2.5 text-center text-sm text-sky-100 shadow-lg backdrop-blur-sm">
          {positionReportToast}
        </div>
      )}

      {/* ══ WeatherAIPanel — 숨김(로직 전용, 렌더 없음) ═════════════════════ */}
      <div
        key={weatherPanelNonce}
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}
      >
        <WeatherAIPanel
          compact
          liveWeather={liveWeatherForAi}
          groqNowcastContext={weatherNowcastNote}
          onSafetyLevelChange={setSafetyLevel}
          onScoresChange={handleForecastScoresChange}
          onGroqSummaryChange={setGroqSummary}
          onEmergencyReturn={(msg, _assessment: EmergencyAssessment) => setAiEmergencyMsg(msg)}
        />
      </div>

      {/* ══ SIDEBAR: h-svh 고정, 상단 고정 스택 + 이력 flex-1로 남은 세로 전부 사용 ══ */}
      <aside
        className="flex h-svh min-h-0 w-80 shrink-0 flex-col overflow-hidden border-r border-teal-500/20"
        style={{ background: "linear-gradient(180deg, #0c2748 0%, #081b34 40%, #050f18 100%)" }}
      >
        <div
          className="shrink-0 py-3.5 pl-4 pr-3 sm:pl-5"
          style={{
            background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
            borderBottom: "1px solid rgba(64,224,208,0.18)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" width={40} height={40} className="h-10 w-10 shrink-0 rounded-md" alt="" />
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-sm font-semibold leading-snug tracking-tight text-slate-100 sm:text-base">
                해양 종자 살포 관제
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs">제3해양살포함 · GNSS 살포 기록</p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-0.5 rounded-lg bg-black/20 p-0.5">
            {(["map", "schedule"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                className={`flex min-h-0 flex-1 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-colors sm:text-[13px] ${
                  viewMode === v
                    ? "bg-teal-500/15 text-teal-50 shadow-sm ring-1 ring-teal-400/25"
                    : "text-slate-400 hover:bg-teal-950/30 hover:text-teal-100/90"
                }`}
              >
                {v === "map" ? <Map className="w-3.5 h-3.5 shrink-0 opacity-90" /> : <Calendar className="w-3.5 h-3.5 shrink-0 opacity-90" />}
                <span className="truncate">{v === "map" ? "실시간 관제" : "작업 계획"}</span>
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden"
          style={{ background: SIDEBAR_BODY_GRAD }}
        >
        <div
          className="shrink-0 border-b border-teal-500/15 px-3 py-2"
          style={{ background: SIDEBAR_SECTION_TINT }}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {[
              {
                icon: <Droplets className="w-3.5 h-3.5 text-teal-400/70" />,
                label: "금일 살포",
                val: String(DAILY_SEED_DISPLAY_BASE + drops.length - INITIAL_SEED_COUNT),
                unit: "건",
                color: "text-teal-200/85",
              },
              {
                icon: <MapPin className="w-3.5 h-3.5 text-sky-400/65" />,
                label: "누적 건수",
                val: (CUMULATIVE_SEED_BASE + drops.length).toLocaleString(),
                unit: "건",
                color: "text-sky-200/80",
              },
              {
                icon: <Ship className="w-3.5 h-3.5 text-amber-300/70" />,
                label: "속도(노트)",
                val: mapMode === "real" && gpsVessel && gpsSpeedKn != null ? gpsSpeedKn.toFixed(1) : vessel.speed.toFixed(1),
                unit: "kt",
                color: "text-amber-100/85",
              },
            ].map((c) => (
              <div
                key={c.label}
                className="flex min-h-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-2"
                style={{
                  background: SIDEBAR_CARD_BG,
                  borderColor: "rgba(64,224,208,0.14)",
                }}
              >
                <span className="shrink-0 scale-95">{c.icon}</span>
                <span className="text-[10px] font-medium leading-tight text-slate-500 text-center">{c.label}</span>
                <span className={`text-base font-bold font-mono leading-none tabular-nums sm:text-lg ${c.color}`}>
                  {c.val}
                  <span className="ml-0.5 text-[10px] font-normal text-slate-500">{c.unit}</span>
                </span>
              </div>
            ))}
            {/* 살포 구역 추정 면적 (3점 이상일 때만 표시) */}
            {filteredDrops.length >= 3 && (
              <div
                className="col-span-3 flex items-center justify-between rounded-lg border px-2.5 py-1.5"
                style={{ background: SIDEBAR_CARD_BG, borderColor: "rgba(64,224,208,0.14)" }}
                title="살포 점 외곽(Convex Hull) 기반 추정 면적. 격자 정밀 측량 아님."
              >
                <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <Map className="h-3 w-3 text-teal-400/55" aria-hidden />
                  구역 추정 면적
                </span>
                <span className="font-mono text-sm font-bold text-teal-200/80">{formatAreaHa(seedingAreaHa)}</span>
              </div>
            )}
          </div>
        </div>

        {(() => {
          const sc = displaySafetyLevel;
          const verdictText = sc === "긴급" ? "즉시 회항 권고" : sc === "주의" ? "기상 주의" : "안전 — 작업 가능";
          const verdictColor = sc === "긴급" ? "#e8c4c4" : sc === "주의" ? "#e8ddaa" : "#9dd4be";
          const barColor = sc === "긴급" ? "#e07070" : sc === "주의" ? "#d4923a" : "#34b8a8";
          const wKt = mpsToKt(weather.windSpeed);
          const gKt = mpsToKt(weather.windGust);
          const gustStrong = weather.windGust >= 15;
          const visOk = weather.visibility >= 8;
          return (
            <div className="shrink-0 border-b border-white/[0.06]" style={{ background: "rgba(12, 39, 72, 0.22)" }}>
              <div className="flex w-full items-stretch gap-0 text-left">
                <span className="w-1 shrink-0 rounded-none" style={{ background: barColor }} />
                <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 pr-1">
                  <span className="shrink-0 text-sm text-slate-400">{sc === "긴급" ? "!" : sc === "주의" ? "△" : "✓"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="inline-flex flex-wrap items-center gap-1 text-[11px] font-medium text-slate-500">
                      <Wind className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                      AI 기상 안전
                      {fieldReportActive ? (
                        <span className="rounded bg-amber-500/25 px-1 py-0 text-[9px] font-semibold text-amber-100/95 ring-1 ring-amber-400/30">
                          현장보고 반영
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm font-medium leading-snug" style={{ color: verdictColor }}>{verdictText}</p>
                  </div>
                </div>
                <div className="mr-1.5 mt-0.5 flex shrink-0 -translate-x-1 translate-y-0.5 flex-col items-end gap-0.5">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setFieldReportModalOpen(true)}
                      title="함정·관제에서 확인한 풍속·파고 등을 넣으면 지금 구간 판정에 반영됩니다"
                      className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg border border-teal-500/40 bg-teal-950/50 text-[8px] font-bold leading-none text-teal-100/95 shadow-sm transition-colors hover:border-teal-300/55 hover:bg-teal-900/55 active:scale-95"
                      aria-label="현장 상황보고 입력"
                    >
                      <ClipboardList className="mb-0.5 h-2.5 w-2.5 text-teal-200/90" aria-hidden />
                      보고
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkAiModalOpen(true)}
                      title="누르면 금일 작업·안착(해저)·과제형 50% 참고·현장 행동 권고를 봅니다"
                      className="work-ai-hint-btn group flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg border border-cyan-400/55 bg-gradient-to-br from-cyan-950/95 via-teal-950/90 to-slate-900/95 text-[9px] font-black leading-none tracking-tight text-cyan-50 shadow-sm transition-all hover:border-cyan-300/70 hover:from-cyan-900/95 hover:via-teal-900/92 active:scale-95"
                      aria-label="AI 금일 작업 보조 요약 열기"
                    >
                      <Sparkles className="mb-0.5 h-2.5 w-2.5 text-cyan-200/95 group-hover:text-cyan-100" aria-hidden />
                      AI
                    </button>
                  </div>
                  {fieldReportActive ? (
                    <button
                      type="button"
                      onClick={handleClearFieldReport}
                      className="rounded px-1.5 py-0.5 text-[8px] font-semibold text-slate-400 underline decoration-slate-500/50 underline-offset-2 hover:text-teal-200/90"
                    >
                      예보 자동 복귀
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="border-t border-white/[0.05] px-3 py-2" style={{ background: SIDEBAR_SECTION_TINT }}>
                <div className="flex items-start gap-2">
                  <SidebarWindCompass windDirDeg={weather.windDir} />
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-2 gap-y-1 text-[11px] leading-snug">
                    <div className="space-y-0">
                      <p className="text-slate-500">
                        풍속 <span className="font-mono font-semibold text-slate-100">{wKt.toFixed(1)} kt</span>
                      </p>
                      <p className="text-slate-500">
                        돌풍{" "}
                        <span className={`font-mono font-semibold ${gustStrong ? "text-amber-200/85" : "text-slate-200"}`}>
                          {gKt.toFixed(1)} kt
                        </span>
                      </p>
                      <p className="text-slate-500">
                        시정{" "}
                        <span className={`font-mono font-semibold ${visOk ? "text-emerald-200/80" : "text-amber-100/80"}`}>
                          {weather.visibility.toFixed(0)} km
                        </span>
                      </p>
                    </div>
                    <div className="space-y-0">
                      <p className="text-slate-500">
                        풍향 <span className="font-semibold text-slate-100">{windDirLabel(weather.windDir)}</span>
                      </p>
                      <p className="text-slate-500">
                        파고 <span className="font-mono font-semibold text-slate-100">{weather.waveHeight.toFixed(1)} m</span>
                      </p>
                      <p className="text-slate-500">
                        기온 <span className="font-mono font-semibold text-orange-100/75">{weather.temp.toFixed(0)} °C</span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 border-t border-white/[0.06] pt-1.5 space-y-1">
                  <p className="text-[9px] leading-snug text-slate-500/95">{weatherNowcastNote}</p>
                  <p className="text-[10px] leading-snug text-violet-100/88">
                  <span className="font-semibold text-violet-300/95">AI · 해저 안착(추정)</span>{" "}
                  {workLocalRec.attachmentTickerCue} — 살포 성공(통신)과는 별개 지표입니다.
                </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 선박 위치 */}
        <div className="shrink-0 border-b border-white/[0.06] px-3 py-2" style={{ background: SIDEBAR_SECTION_TINT }}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-300 inline-flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-teal-400/55 shrink-0" aria-hidden />
              선박 위치
            </span>
            <span className={`text-[9px] font-medium shrink-0 ${isRealWithGps ? "text-emerald-400/80" : "text-slate-500"}`}>
              {isRealWithGps ? "GNSS 연동" : "내 위치 찾기 꺼짐 · 시뮬"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                {
                  lab: "북위",
                  val: `${(isRealWithGps && gpsVessel ? gpsVessel.lat : vessel.lat).toFixed(4)}°`,
                  icon: <ArrowUp className="w-3 h-3 text-slate-500 shrink-0" aria-hidden />,
                },
                {
                  lab: "동경",
                  val: `${(isRealWithGps && gpsVessel ? gpsVessel.lng : vessel.lng).toFixed(4)}°`,
                  icon: <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" aria-hidden />,
                },
                {
                  lab: "방위",
                  val: `${Math.round(leafletVessel.heading)}°`,
                  icon: <Compass className="w-3 h-3 text-slate-500 shrink-0" aria-hidden />,
                },
              ] as const
            ).map((c) => (
              <div
                key={c.lab}
                className="flex flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center"
                style={{
                  background: SIDEBAR_CARD_BG,
                  borderColor: "rgba(64,224,208,0.12)",
                }}
              >
                <p className="mb-0 inline-flex w-full items-center justify-center gap-0.5 text-[10px] text-slate-500">
                  {c.icon}
                  <span>{c.lab}</span>
                </p>
                <p className="text-xs font-mono font-medium leading-tight text-slate-200 tabular-nums">{c.val}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="shrink-0 border-b border-white/[0.06] px-3 py-2"
          style={{ background: SIDEBAR_SECTION_TINT }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex min-w-0 max-w-[38%] shrink-0 items-center gap-1.5 text-[11px] font-medium text-slate-300 sm:max-w-[44%]">
              <Waypoints className="h-3.5 w-3.5 shrink-0 text-teal-400/60" aria-hidden />
              <span className="truncate">항적 기록</span>
            </span>
            <TrackRecordSidebarHint />
            <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="항적 기록 — 출발·경로·복귀·살포·기상·평가·CSV (테스트 시 샘플)"
              aria-label="항적 기록 열기"
              onClick={() => setTrackReportModalOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-teal-100/90 transition-colors hover:border-teal-400/45 hover:bg-teal-500/12 hover:text-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/25"
              style={{
                background: SIDEBAR_CARD_BG,
                borderColor: "rgba(64,224,208,0.22)",
              }}
            >
              <Waypoints className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              title={
                todayReplayTrackPath.length < 2
                  ? "오늘 표시할 항적 좌표가 부족합니다(2점 이상 필요)"
                  : showTodayTrackReplayOnMap
                    ? "금일 항적 시뮬레이션 끄기"
                    : "금일 항적 기록을 지도에 표시(시뮬)"
              }
              aria-label="금일 항적 지도 표시 토글"
              disabled={!showTodayTrackReplayOnMap && todayReplayTrackPath.length < 2}
              onClick={() => {
                if (!showTodayTrackReplayOnMap && todayReplayTrackPath.length < 2) return;
                setShowTodayTrackReplayOnMap((v) => !v);
                setMapFitNonce((n) => n + 1);
              }}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-fuchsia-100/90 transition-colors hover:border-fuchsia-400/50 hover:bg-fuchsia-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/30 disabled:cursor-not-allowed disabled:opacity-40 ${
                showTodayTrackReplayOnMap ? "ring-2 ring-fuchsia-400/50 border-fuchsia-400/45 bg-fuchsia-950/35" : ""
              }`}
              style={{
                background: SIDEBAR_CARD_BG,
                borderColor: "rgba(217,70,239,0.28)",
              }}
            >
              <Route className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
          </div>
        </div>

        <div className="shrink-0 border-b border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-1 px-3 py-1">
            <Radio className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="text-[11px] font-medium tracking-tight text-slate-300">선박 신호 송신</span>
            {seedingActive && (
              <span className="seeding-badge-breathe text-[9px] font-semibold uppercase tracking-wide rounded border border-teal-400/25 bg-teal-500/12 px-1.5 py-0.5 text-teal-100/90">
                살포 중
              </span>
            )}
          </div>
          <div
            className="grid grid-cols-2 gap-1.5 border-t border-white/[0.05] px-3 py-2"
            style={{ background: "rgba(8, 27, 52, 0.48)" }}
          >
            {(
              [
                {
                  label: "귀항 명령",
                  cmd: "emergency_return",
                  tip: "긴급 회항 명령 전송 + 선박 사이렌",
                  icon: <Undo2 className="w-3 h-3 shrink-0" aria-hidden />,
                },
                {
                  label: "살포 시작",
                  cmd: "seed_start",
                  tip: "살포 시작 지령(시연)",
                  icon: <Play className="w-3 h-3 shrink-0" aria-hidden />,
                },
                {
                  label: "살포 중지",
                  cmd: "seed_stop",
                  tip: "살포 중지 지령(시연)",
                  icon: <Square className="w-2.5 h-2.5 shrink-0" aria-hidden />,
                },
                {
                  label: "위치 보고",
                  cmd: "report_position",
                  tip: "선박 현재 위치 보고 요청",
                  icon: <MapPin className="w-3 h-3 shrink-0" aria-hidden />,
                },
              ] as const
            ).map((b) => {
              const signalMuted: Record<
                (typeof b)["cmd"],
                { fill: string; border: string; ink: string }
              > = {
                emergency_return: {
                  fill: "rgba(72, 28, 28, 0.28)",
                  border: "rgba(220, 120, 120, 0.22)",
                  ink: "rgba(252, 220, 220, 0.82)",
                },
                seed_start: {
                  fill: "rgba(18, 72, 68, 0.26)",
                  border: "rgba(56, 178, 165, 0.2)",
                  ink: "rgba(180, 240, 228, 0.82)",
                },
                seed_stop: {
                  fill: "rgba(72, 48, 22, 0.26)",
                  border: "rgba(214, 160, 90, 0.2)",
                  ink: "rgba(254, 228, 200, 0.82)",
                },
                report_position: {
                  fill: "rgba(28, 52, 78, 0.28)",
                  border: "rgba(120, 170, 210, 0.22)",
                  ink: "rgba(200, 230, 252, 0.82)",
                },
              };
              const m =
                b.cmd === "seed_start" && seedingActive
                  ? {
                      fill: "rgba(3, 42, 38, 0.94)",
                      border: "rgba(16, 185, 129, 0.55)",
                      ink: "rgba(204, 251, 229, 0.96)",
                    }
                  : signalMuted[b.cmd];
              return (
              <button
                key={b.cmd}
                type="button"
                title={b.tip}
                onClick={() => handleSignal(b.cmd)}
                disabled={signalSending && b.cmd !== "seed_start" && b.cmd !== "seed_stop"}
                className={`flex min-h-[2.5rem] items-center justify-center gap-1 rounded-md border border-solid px-1.5 py-1.5 transition-[filter,transform] hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15 active:scale-[0.98] disabled:opacity-40 ${
                  b.cmd === "seed_start" && seedingActive ? "seeding-start-btn-active ring-2 ring-emerald-500/35" : ""
                }`}
                style={{
                  borderColor: m.border,
                  background: m.fill,
                }}
              >
                <span className="opacity-85" style={{ color: m.ink }}>
                  {b.icon}
                </span>
                <span className="text-xs font-medium leading-tight" style={{ color: m.ink }}>
                  {b.label}
                </span>
              </button>
              );
            })}
          </div>
          <div
            className="flex items-center gap-2 border-t border-white/[0.05] px-3 py-2"
            style={{ background: "rgba(12, 39, 72, 0.35)" }}
            role="status"
            aria-live="polite"
          >
            <span
              role="checkbox"
              aria-checked={seedingActive}
              aria-label="투하(종자 방류)"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] font-black leading-none transition-colors ${
                seedingActive
                  ? "border-emerald-500/70 bg-emerald-600/80 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.2)]"
                  : "border-white/20 bg-black/30 text-transparent"
              }`}
            >
              ✓
            </span>
            <span className={`text-[11px] font-medium ${seedingActive ? "text-emerald-200/90" : "text-slate-500"}`}>
              투하 (종자 방류)
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-teal-500/15">
          <div className="shrink-0 border-b border-white/[0.06] px-3 py-2" style={{ background: "rgba(12, 39, 72, 0.38)" }}>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-teal-200/80">
              <Activity className="h-3 w-3 shrink-0 text-teal-400/75" aria-hidden /> 종자 살포 이력
            </p>
            <p className="truncate text-[11px] leading-tight text-cyan-100/88">
              총 {drops.length}건
              {filteredDrops.length > 0 && (
                <> · 최근 {filteredDrops[filteredDrops.length - 1]?.label} {filteredDrops[filteredDrops.length - 1]?.time}</>
              )}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-t border-white/[0.05] px-3 pb-2 pt-2" style={{ background: "rgba(8, 27, 52, 0.35)" }}>
            <div className="grid shrink-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_auto] items-center gap-1 pb-1 pl-[11px] pr-1 text-[10px] font-medium text-teal-200/55">
              <span>번호</span>
              <span>시각</span>
              <span className="text-right">위도</span>
              <span className="text-right">경도</span>
              <span className="w-7 shrink-0" aria-hidden />
            </div>
            <div
              ref={logRef}
              className="marine-sidebar-history-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-0.5"
            >
              {filteredDrops.length === 0 ? (
                <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-teal-200/45">
                  조회된 이력이 없습니다
                </p>
              ) : (
                [...filteredDrops].reverse().map((d) => {
                  const isNew = d.id === latestId;
                  const accent = sidebarHistoryRowAccent(d, isNew);
                  return (
                    <div
                      key={d.id}
                      className={`grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_auto] items-center gap-1 rounded-md px-1.5 py-1.5 font-mono text-[11px] leading-snug ${
                        isNew ? "ring-1 ring-teal-400/30" : ""
                      }`}
                      style={{
                        background: SIDEBAR_HISTORY_ROW_BG,
                        border: "1px solid rgba(64,224,208,0.14)",
                        borderLeftWidth: 3,
                        borderLeftColor: accent,
                      }}
                    >
                      <span className="flex min-w-0 items-center">
                        <span
                          className="max-w-full truncate rounded-md border px-1 py-0.5 text-[11px] font-medium text-slate-200"
                          style={{
                            background: "rgba(12, 39, 72, 0.65)",
                            borderColor: "rgba(64,224,208,0.2)",
                          }}
                        >
                          {d.label}
                        </span>
                      </span>
                      <span className="truncate font-medium text-slate-200">{d.time}</span>
                      <span className="text-right text-slate-300/90">{d.lat.toFixed(3)}</span>
                      <span className="text-right text-slate-300/90">{d.lng.toFixed(3)}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteDrop(d)}
                        title="이 건 삭제"
                        aria-label={`${d.label} 살포 이력 삭제`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-teal-200/70 transition-colors hover:border-teal-400/45 hover:bg-teal-500/10 hover:text-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/25"
                        style={{ borderColor: "rgba(64,224,208,0.2)" }}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div
              className="mt-2 shrink-0 space-y-1.5 rounded-lg border px-2 py-2 pt-2.5"
              style={{
                background: SIDEBAR_HISTORY_FOOTER_BG,
                borderColor: "rgba(64,224,208,0.2)",
              }}
            >
              <input ref={fileImportRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCsv} aria-hidden />
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filterStart}
                  onChange={(e) => setFilterStart(e.target.value)}
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-[11px] text-cyan-100/95 outline-none transition-[border,box-shadow] [color-scheme:dark] focus:ring-2 focus:ring-teal-400/25"
                  style={{
                    background: "rgba(12, 39, 72, 0.75)",
                    border: "1px solid rgba(64,224,208,0.22)",
                  }}
                  aria-label="시작일"
                />
                <span className="shrink-0 text-xs font-medium text-teal-200/55">~</span>
                <input
                  type="date"
                  value={filterEnd}
                  onChange={(e) => setFilterEnd(e.target.value)}
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-[11px] text-cyan-100/95 outline-none transition-[border,box-shadow] [color-scheme:dark] focus:ring-2 focus:ring-teal-400/25"
                  style={{
                    background: "rgba(12, 39, 72, 0.75)",
                    border: "1px solid rgba(64,224,208,0.22)",
                  }}
                  aria-label="종료일"
                />
                <button
                  type="button"
                  onClick={() => fileImportRef.current?.click()}
                  title="CSV 불러오기"
                  className="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-teal-100/90 transition-[background,color] hover:bg-teal-400/15 hover:text-cyan-50"
                  style={{
                    background: "rgba(64,224,208,0.08)",
                    border: "1px solid rgba(64,224,208,0.22)",
                  }}
                >
                  <Upload className="h-3.5 w-3.5 text-teal-200/90" aria-hidden />
                  <span className="text-[9px] font-medium leading-none">불러오기</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportCSV(filteredDrops)}
                  title={`CSV 저장 (${filteredDrops.length}건)`}
                  className="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md py-1.5 font-bold text-cyan-50 transition-[background,filter] hover:brightness-110"
                  style={{
                    background: "rgba(45,212,191,0.18)",
                    border: "1px solid rgba(94,234,212,0.45)",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.12) inset",
                  }}
                >
                  <Download className="h-3.5 w-3.5 text-teal-100" aria-hidden />
                  <span className="text-[9px] font-bold leading-none">CSV</span>
                </button>
              </div>
              {(filterStart || filterEnd) && (
                <p className="text-center text-[10px] text-teal-200/50">조회 {filteredDrops.length}건 · 전체 {drops.length}건</p>
              )}
            </div>
          </div>
        </div>

        </div>
      </aside>

      {/* ══ MAP AREA / WORK PLAN ════════════════════════════════════════════ */}
      <main
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{ background: "linear-gradient(180deg, #041b2e 0%, #030f18 100%)" }}
      >
        {/* Topbar */}
        <header
          className="min-h-[3.25rem] shrink-0 flex items-center gap-3 px-4 sm:px-5 py-2"
          style={{
            background: "linear-gradient(180deg, #0a1f38 0%, #071428 100%)",
            borderBottom: "1px solid rgba(64,224,208,0.12)",
          }}
        >
          <div className="min-w-0 flex-1" aria-hidden />

          {/* Wind badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 shrink-0"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <Wind className="w-3.5 h-3.5 text-cyan-300" />
            <span className="text-white/50">{windDirLabel(weather.windDir)}</span>
            <span className="font-mono text-cyan-300 font-semibold">{mpsToKt(weather.windSpeed).toFixed(1)} kt</span>
            {mpsToKt(weather.windSpeed) > 16 && (
              <span className="text-amber-400 text-[10px] font-bold animate-pulse ml-0.5">⚠</span>
            )}
          </div>

          {/* Manual button */}
          <ManualButton onClick={() => setManualOpen(true)} />

          {/* Latest seed info */}
          {headerLatest ? (
            <div className="flex items-center justify-end gap-2 text-sm font-mono min-w-0">
              <MapPin
                className="w-4 h-4 shrink-0"
                style={{ color: headerAgeColor?.pulse ?? "#f87171" }}
              />
              <span className="text-white/45 shrink-0 hidden md:inline">최근 살포</span>
              <span
                className="font-semibold shrink-0"
                style={{ color: headerAgeColor?.stroke ?? "#fecaca" }}
              >
                {headerLatest.time}
              </span>
              <span className="text-white/25 shrink-0">·</span>
              <span className="text-white/70 truncate max-w-[12rem]">
                {headerLatest.lat.toFixed(5)}, {headerLatest.lng.toFixed(5)}
              </span>
            </div>
          ) : (
            <div />
          )}
        </header>

        <AiTicker
          vesselName={VESSEL_NAME}
          safetyLevel={displaySafetyLevel}
          groqSummary={groqSummary}
          aiMsg={aiEmergencyMsg ?? ""}
          windSpeed={weather.windSpeed}
          waveHeight={weather.waveHeight}
          temp={weather.temp}
          attachmentCue={workLocalRec.attachmentTickerCue}
        />

        {/* Map container / Work plan view */}
        {viewMode === "schedule" ? (
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <div
              className="w-[min(100%,20rem)] sm:w-[22rem] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-teal-500/20"
              style={{ background: "linear-gradient(180deg, #0a1f38 0%, #071428 100%)" }}
            >
              <WorkPlanView weather={weather} variant="compact" />
            </div>
            <div className="relative flex-1 min-h-0 min-w-0">
              <div className="absolute inset-0 z-0 min-h-0 min-w-0">
                <MarineLeafletMap
                  basemap="voyager"
                  center={[BASE_LAT, BASE_LNG]}
                  zoomRail={1}
                  fitNonce={mapFitNonce}
                  drops={[]}
                  vessel={leafletVessel}
                  pathLatLng={[]}
                  ltePathLatLng={[]}
                  vesselMarkerVariant={isRealWithGps ? "gpsDot" : "ship"}
                  vesselSeedingActive={seedingActive}
                  panMapToVesselOnMove={false}
                  fitToVesselOnly={false}
                  hideVesselMarker={awaitingGps}
                  maxBounds={mapMode === "real" ? null : OPS_AREA_MAX_BOUNDS}
                  disableScrollWheelZoom
                  offlineNoTiles={OFFLINE_MAP_NO_TILES}
                  planMarkers={ZONE1_PLAN_MARKERS}
                  scheduleFocusFit
                />
              </div>
            </div>
          </div>
        ) : null}

        <div
          ref={mapContainerRef}
          className={`flex-1 min-h-0 min-w-0 relative overflow-hidden ${viewMode === "schedule" ? "hidden" : ""}`}
        >
          {/* SOS 수신 시 지도 테두리 붉은 깜빡임 (Phase 4) */}
          {demoSosBlink && (
            <div
              className="pointer-events-none absolute inset-0 z-30 rounded-sm"
              style={{
                border: "5px solid rgba(239,68,68,0.9)",
                boxShadow: "inset 0 0 60px rgba(239,68,68,0.5)",
                animation: "sosBlink 0.7s ease-in-out infinite alternate",
              }}
            >
              <style>{`@keyframes sosBlink { from { opacity:1; } to { opacity:0.25; } }`}</style>
              <div
                className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black text-white"
                style={{ background: "rgba(200,0,0,0.85)", letterSpacing: "0.05em" }}
              >
                🔴 SOS 신호 수신 중 — 선박 위치 특정 완료
              </div>
            </div>
          )}

          <div className="absolute inset-0 z-0 min-h-0 min-w-0">
            <MarineLeafletMap
              basemap="voyager"
              center={[BASE_LAT, BASE_LNG]}
              zoomRail={zoom}
              fitNonce={mapFitNonce}
              drops={leafletDrops}
              vessel={leafletVessel}
              pathLatLng={leafletPathLatLng}
              ltePathLatLng={lteFollowEnabled ? ltePathLatLng : []}
              replayTrackPathLatLng={showTodayTrackReplayOnMap ? todayReplayTrackPath : []}
              vesselMarkerVariant={isRealWithGps ? "gpsDot" : "ship"}
              vesselSeedingActive={seedingActive}
              panMapToVesselOnMove={isRealWithGps || (lteFollowEnabled && lteRemoteFresh && mapMode === "test")}
              fitToVesselOnly={isRealWithGps}
              hideVesselMarker={awaitingGps}
              maxBounds={mapMode === "real" ? null : OPS_AREA_MAX_BOUNDS}
              disableScrollWheelZoom
              offlineNoTiles={OFFLINE_MAP_NO_TILES}
            />
          </div>

          {/* ── AI 기상 예측 타임라인 트래커 (지도 하단 오버레이) ── */}
          {forecastScores.length > 0 && (
            <WeatherTimelineTracker
              scores={forecastScores}
              safetyLevel={displaySafetyLevel}
              subtitle={weatherNowcastNote}
            />
          )}

          {/* Clock overlay — 헤더/사이드바와 동일 톤, 시·분·초 구분 */}
          <div
            className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2"
            role="status"
            aria-live="polite"
            aria-label="현재 시각"
          >
            <time
              dateTime={clock.toISOString()}
              className="inline-flex items-center gap-0.5 rounded-lg border border-teal-500/25 px-4 py-2 sm:px-5 sm:py-2.5 font-mono tabular-nums shadow-lg shadow-black/30 ring-1 ring-inset ring-teal-400/10 backdrop-blur-md"
              style={{ background: "linear-gradient(160deg, #0c2748 0%, #081b34 95%)" }}
              suppressHydrationWarning
            >
              {(() => {
                const p = (n: number) => String(n).padStart(2, "0");
                const hh = p(clock.getHours());
                const mm = p(clock.getMinutes());
                const ss = p(clock.getSeconds());
                return (
                  <>
                    <span className="text-[1.375rem] font-semibold leading-none tracking-wide text-slate-100 sm:text-2xl drop-shadow-sm">
                      {hh}
                    </span>
                    <span className="pb-px text-lg font-light text-slate-500 sm:text-xl" aria-hidden>
                      :
                    </span>
                    <span className="text-[1.375rem] font-semibold leading-none tracking-wide text-slate-100 sm:text-2xl drop-shadow-sm">
                      {mm}
                    </span>
                    <span className="pb-px text-lg font-light text-slate-500 sm:text-xl" aria-hidden>
                      :
                    </span>
                    <span className="text-lg font-medium leading-none text-slate-400 sm:text-[1.35rem]">{ss}</span>
                  </>
                );
              })()}
            </time>
          </div>

          {/* 우상단 버튼 그룹: 시연 3개 + 고도화 — 한 줄로 통합 */}
          <div className="absolute right-3 top-3 z-20 flex gap-0.5 items-center"
            style={{ background: "rgba(0,0,0,0.5)", borderRadius: 10, padding: "3px 5px", backdropFilter: "blur(8px)" }}>
            {[
              { icon: "✅", fn: handleDemoNormal, tip: "Phase 1: 기상 정상" },
              { icon: "⚡", fn: handleDemoDanger, tip: "Phase 2: 기상 악화" },
              { icon: "🔴", fn: handleDemoSos,    tip: "Phase 4: SOS 수신" },
            ].map((b) => (
              <button key={b.tip} onClick={b.fn} title={b.tip}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                style={{ lineHeight: 1, fontSize: 14 }}>
                {b.icon}
              </button>
            ))}
            <div className="w-px h-4 mx-0.5" style={{ background: "rgba(255,255,255,0.15)" }} />
            {/* 고도화 모달 버튼 */}
            <button
              onClick={() => setShowVisionModal(true)}
              title="해양 무인화 고도화 계획 (관공서 제안서용)"
              className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-black transition-all hover:brightness-125"
              style={{ background: "rgba(99,102,241,0.35)", border: "1px solid rgba(99,102,241,0.6)", color: "#c7d2fe" }}>
              🏛️ <span style={{ letterSpacing: "0.02em" }}>고도화</span>
            </button>
          </div>

          {/* Floating controls */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
            <FloatBtn onClick={handleZoomIn} title="확대">
              <ZoomIn className="w-5 h-5" />
            </FloatBtn>
            <FloatBtn onClick={handleZoomOut} title="축소">
              <ZoomOut className="w-5 h-5" />
            </FloatBtn>
            <div className="h-px w-full bg-white/20 my-0.5" />
            <FloatBtn
              onClick={handleRecenter}
              title={
                mapMode === "real"
                  ? "내 위치로 지도 맞추기 (GPS)"
                  : "살포·항적이 보이도록 화면 맞춤"
              }
            >
              <Navigation className="w-5 h-5" />
            </FloatBtn>
            <FloatBtn
              onClick={() => {
                setZoom(0);
                setMapFitNonce((n) => n + 1);
              }}
              title="뷰 초기화"
            >
              <RefreshCw className="w-5 h-5" />
            </FloatBtn>
          </div>

          {/* Zoom badge */}
          {zoom !== 0 && (
            <div className="absolute right-16 top-1/2 -translate-y-1/2 z-10">
              <div className="bg-black/55 text-cyan-300 text-xs font-mono px-2.5 py-1 rounded-full border border-white/10">
                +{zoom}단
              </div>
            </div>
          )}

          {/* 지도: 내 위치 찾기 토글 — 꺼짐: 선박·살포 / 켜짐: GPS */}
          <div className="absolute bottom-6 right-4 z-30 flex flex-col items-end gap-1">
            <button
              type="button"
              role="switch"
              aria-checked={mapMode === "real"}
              title={
                mapMode === "real"
                  ? "끄면 선박 위치·항적으로 돌아갑니다"
                  : "켜면 브라우저로 현재 위치를 찾아 표시합니다"
              }
              onClick={() => {
                if (mapMode === "real") {
                  setMapMode("test");
                  setZoom(0);
                  setMapFitNonce((n) => n + 1);
                  return;
                }
                setMapMode("real");
              }}
              className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[11px] font-semibold tracking-tight shadow-lg backdrop-blur-sm transition-colors ${
                mapMode === "real"
                  ? "border-orange-400/80 bg-orange-500 text-[#041c2e]"
                  : "border-white/25 bg-[#041c2e]/90 text-white/90 hover:bg-white/10"
              }`}
            >
              <Crosshair
                className={`h-[18px] w-[18px] shrink-0 stroke-[2.25] ${
                  mapMode === "real" ? "text-[#041c2e]" : "text-white/85"
                }`}
                aria-hidden
              />
              <span className="leading-none">내 위치 찾기</span>
            </button>
            {mapMode === "real" && !gpsError && !gpsVessel ? (
              <p className="max-w-[14rem] rounded-md border border-cyan-500/30 bg-[#041c2e]/90 px-2 py-1 text-[10px] text-cyan-100/90 shadow-md">
                위치 권한을 허용하면 지도가 내 위치로 이동합니다.
              </p>
            ) : null}
            {gpsError ? (
              <p className="max-w-[14rem] rounded-md border border-amber-400/40 bg-amber-950/90 px-2 py-1 text-[10px] text-amber-100 shadow-md">
                {gpsError}
              </p>
            ) : null}
            {marineDbEnabled() ? (
              <button
                type="button"
                role="switch"
                aria-checked={lteFollowEnabled}
                title="Supabase에 쌓인 선박 궤적을 주기적으로 불러와 주황선·선박 아이콘에 반영합니다"
                onClick={() => {
                  setLteFollowEnabled((v) => !v);
                  setMapFitNonce((n) => n + 1);
                }}
                className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[11px] font-semibold tracking-tight shadow-lg backdrop-blur-sm transition-colors ${
                  lteFollowEnabled
                    ? "border-orange-300/90 bg-orange-400/25 text-orange-50"
                    : "border-white/25 bg-[#041c2e]/90 text-white/90 hover:bg-white/10"
                }`}
              >
                <Ship className="h-[18px] w-[18px] shrink-0 stroke-[2]" aria-hidden />
                <span className="leading-none">해상 기기(LTE) 궤적</span>
              </button>
            ) : null}
            {lteFollowEnabled && marineDbEnabled() && lteTrackPoints.length === 0 ? (
              <p className="max-w-[14rem] rounded-md border border-white/15 bg-[#041c2e]/90 px-2 py-1 text-[10px] text-white/70 shadow-md">
                아직 궤적이 없습니다. Edge `vessel-track-ingest`로 전송하거나 SQL로 005를 적용했는지 확인하세요.
              </p>
            ) : null}
            {lteFollowEnabled && lteTrackPoints.length > 0 && !lteRemoteFresh ? (
              <p className="max-w-[14rem] rounded-md border border-amber-400/35 bg-[#041c2e]/90 px-2 py-1 text-[10px] text-amber-100/90 shadow-md">
                최근 LTE 위치가 25분 넘게 없습니다. 단말·망 상태를 확인하세요.
              </p>
            ) : null}
          </div>

          {/* Status cards (bottom-left) */}
          <div className="absolute left-4 bottom-14 z-10 flex flex-col gap-2">
            <InfoCard label="활동 해역" value="남해 연안 제3구역 B · 2.4 km²" />
            <InfoCard label="살포 밀도" value="847점/km²" />
            <InfoCard label="살포 커버리지" value="68.3%" />
            <InfoCard
              label={`풍향 ${windDirLabel(weather.windDir)} · 파고`}
              value={`${weather.windSpeed.toFixed(1)} kt · ${weather.waveHeight.toFixed(1)} m`}
            />
          </div>

          {/* Color legend toggle */}
          <div className="absolute right-4 top-14 z-20 flex flex-col items-end gap-2 sm:top-16">
            <button
              type="button"
              onClick={() => setColorHelpOpen((o) => !o)}
              aria-expanded={colorHelpOpen}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-md backdrop-blur-sm transition-colors ${
                colorHelpOpen ? "text-white" : "text-white/90 hover:brightness-110"
              }`}
              style={{
                background: colorHelpOpen
                  ? "linear-gradient(160deg, #0c2748 0%, #081b34 100%)"
                  : "linear-gradient(160deg, rgba(12,39,72,0.92) 0%, rgba(8,27,52,0.96) 100%)",
                border: colorHelpOpen ? "1px solid rgba(64,224,208,0.35)" : "1px solid rgba(64,224,208,0.22)",
              }}
              title="살포 색상 안내"
            >
              <Info className="h-4 w-4 shrink-0 opacity-90" />
              살포 색상 안내
            </button>
            {colorHelpOpen && (
              <div
                className="w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-xl p-3 text-left text-white shadow-xl backdrop-blur-sm"
                style={{
                  background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
                  border: "1px solid rgba(64,224,208,0.22)",
                  boxShadow: "0 24px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset",
                }}
              >
                <div className="mb-2 space-y-1.5 text-[11px] leading-relaxed text-white/55">
                  <p>살포 점 색은 기록 시각 경과에 따라 구분됩니다.</p>
                  <p>검정은 살포했으나 검수 시 위치가 맞지 않거나 누락된 부분입니다.</p>
                </div>
                <div className="space-y-1.5">
                  <LegendRow compact color="#FF8A1F" label="작업 선박" shape="triangle" />
                  <LegendRow compact color="#40E0D0" label="항적" shape="dash" />
                  <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                    <LegendRow compact color={dropAgeColors("recent").fill}   label="최근 살포(≈45일 이내)" shape="circle-sm" />
                    <LegendRow compact color={dropAgeColors("orange3m").fill} label="약 3개월 전후"           shape="circle-sm" />
                    <LegendRow compact color={dropAgeColors("pink1y").fill}   label="약 1년 전후"             shape="circle-sm" />
                    <LegendRow compact color={dropAgeColors("light2y").fill}  label="약 2년 전후"             shape="circle-sm" />
                    <LegendRow compact color={dropAgeColors("pale").fill}     label="2년 이상"                shape="circle-sm" />
                    <LegendRow compact color="#171717"                        label="검수 불일치·누락(검정)"    shape="circle-sm" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setColorHelpOpen(false)}
                  className="mt-3 w-full rounded-lg border border-white/[0.08] bg-white/[0.08] py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.12]"
                >
                  닫기
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Tiny reusable pieces ─────────────────────────────────────────────────────

function StatTile({
  label, value, icon, color,
}: {
  label: string; value: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="rounded-lg p-2.5 flex flex-col gap-1" style={{ background: "rgba(255,255,255,0.05)" }}>
      <span className={`flex items-center gap-1 ${color} opacity-80`}>{icon}</span>
      <span className={`font-bold text-lg sm:text-xl ${color} leading-none`}>{value}</span>
      <span className="text-white/45 text-xs tracking-wide">{label}</span>
    </div>
  );
}

function FloatBtn({
  children, onClick, title,
}: {
  children: React.ReactNode; onClick: () => void; title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-11 w-11 rounded-xl flex items-center justify-center text-white/75 hover:text-white transition-all duration-150 hover:scale-110 active:scale-95"
      style={{
        background: "linear-gradient(160deg, rgba(12,39,72,0.92) 0%, rgba(8,27,52,0.96) 100%)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(64,224,208,0.25)",
        boxShadow: "0 2px 14px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs"
      style={{
        background: "linear-gradient(160deg, rgba(12,39,72,0.92) 0%, rgba(8,27,52,0.96) 100%)",
        border: "1px solid rgba(64,224,208,0.22)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 4px 18px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset",
      }}
    >
      <p className="mb-1 text-[11px] font-medium tracking-wide text-cyan-200/55">{label}</p>
      <p className="text-[12px] font-semibold leading-snug text-white/90">{value}</p>
    </div>
  );
}

function LegendRow({
  color, label, shape, compact,
}: {
  color: string; label: string; shape: "triangle" | "circle-lg" | "circle-sm" | "dash"; compact?: boolean;
}) {
  const icon =
    shape === "triangle" ? (
      <svg width="12" height="12" viewBox="0 0 10 10" className="shrink-0">
        <polygon points="5,1 9,9 1,9" fill={color} />
      </svg>
    ) : shape === "circle-lg" ? (
      <svg width="12" height="12" viewBox="0 0 10 10" className="shrink-0">
        <circle cx="5" cy="5" r="4" fill={color} />
      </svg>
    ) : shape === "circle-sm" ? (
      <svg width="12" height="12" viewBox="0 0 10 10" className="shrink-0">
        <circle cx="5" cy="5" r="2.5" fill={color} />
      </svg>
    ) : (
      <svg width="18" height="5" viewBox="0 0 14 4" className="shrink-0">
        <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
      </svg>
    );

  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-2.5"}`}>
      <span className={`flex shrink-0 items-center justify-center ${compact ? "w-4" : "w-5"}`}>{icon}</span>
      <span className={`text-white/65 ${compact ? "text-[11px] leading-snug" : "text-sm"}`}>{label}</span>
    </div>
  );
}
