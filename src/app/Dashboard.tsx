import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Download,
  Droplets,
  Eye,
  Info,
  Map,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Ship,
  Thermometer,
  Wind,
  Wifi,
  WifiOff,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import WorkPlanView from "./WorkPlanView";
import ManualModal, { ManualButton } from "./ManualModal";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_LAT = 34.582;
const BASE_LNG = 128.719;
const MAP_W = 940;
const MAP_H = 520;
const VESSEL_NAME = "제3해양살포함";

const WAYPOINTS = [
  { x: 100, y: 300 },
  { x: 220, y: 275 },
  { x: 360, y: 288 },
  { x: 500, y: 268 },
  { x: 640, y: 278 },
  { x: 780, y: 262 },
  { x: 860, y: 310 },
  { x: 820, y: 380 },
  { x: 640, y: 400 },
  { x: 460, y: 415 },
  { x: 280, y: 395 },
  { x: 120, y: 355 },
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
    lat: parseFloat((BASE_LAT + (MAP_H / 2 - y) * 0.00055).toFixed(6)),
    lng: parseFloat((BASE_LNG + (x - MAP_W / 2) * 0.00048).toFixed(6)),
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

const INITIAL_SEED_COUNT = 4;
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
  const header = "식별번호,시각,위도,경도,상태\n";
  const rows = drops.map((d) => `${d.id},${d.time},${d.lat},${d.lng},${d.status}`).join("\n");
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
        <span className="text-white/55 text-xs font-semibold tracking-wide flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
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

// ─── MapPlaceholder ───────────────────────────────────────────────────────────

function MapPlaceholder({
  drops,
  vessel,
  path,
  zoom,
  highlightDropId,
  weather,
}: {
  drops: SeedDrop[];
  vessel: Vessel;
  path: { x: number; y: number }[];
  zoom: number;
  highlightDropId?: string;
  weather: WeatherState;
}) {
  const scale = 1 + zoom * 0.12;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#031928]">
      {/* Animation keyframes injected once */}
      <style>{`
        @keyframes waveSlide {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes windPulse {
          0%,100% { opacity: 0.30; transform: scale(0.95); }
          50%      { opacity: 0.75; transform: scale(1.05); }
        }
        @keyframes sonarPing {
          0%   { r: 8; opacity: 0.7; }
          100% { r: 50; opacity: 0; }
        }
        @keyframes scanLine {
          0%   { top: -4px; opacity: 0; }
          5%   { opacity: 0.55; }
          95%  { opacity: 0.55; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>

      {/* Zoomable map layer */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "50% 50%",
          transition: "transform 0.4s ease",
        }}
      >
        {/* Ocean gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg,
              rgba(18,95,115,0.55) 0%,
              rgba(10,70,100,0.85) 18%,
              #073654 32%,
              #062a4e 55%,
              #031928 100%)`,
          }}
        />

        {/* Land + coastline */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none" }}
        >
          <defs>
            <linearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a6b4f" />
              <stop offset="55%" stopColor="#2d4532" />
              <stop offset="100%" stopColor="#1e3024" />
            </linearGradient>
            <linearGradient id="beachGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b9a7a" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#5a7a6a" stopOpacity="0.15" />
            </linearGradient>
            <filter id="landShadow" x="-5%" y="-5%" width="110%" height="120%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.4" />
            </filter>
          </defs>
          <path
            fill="url(#landGrad)"
            stroke="#3d5540"
            strokeWidth="1.2"
            filter="url(#landShadow)"
            d={`M 0 0 L ${MAP_W} 0 L ${MAP_W} 118
                C 860 108 740 98 600 102
                C 480 106 380 88 260 96
                C 140 104 0 118 0 132 Z`}
          />
          <path
            fill="none"
            stroke="#6a9088"
            strokeWidth="2"
            strokeOpacity="0.45"
            d={`M 0 132 C 140 104 260 96 380 88 C 480 84 600 102 740 98 C 820 100 ${MAP_W} 118`}
          />
          <path
            fill="url(#beachGrad)"
            d={`M 0 132 C 140 108 260 100 380 92 C 500 88 620 104 740 100 C 820 102 ${MAP_W} 120
                L ${MAP_W} 138 C 860 128 700 118 520 122 C 340 128 160 138 0 152 Z`}
          />
          {/* Islands */}
          <ellipse cx="720" cy="108" rx="14" ry="8" fill="#2a3d30" stroke="#3d5540" strokeWidth="0.8" opacity="0.95" />
          <ellipse cx="340" cy="100" rx="10" ry="6" fill="#2a3d30" stroke="#3d5540" strokeWidth="0.8" opacity="0.9" />
          <path fill="#243528" stroke="#3a5040" strokeWidth="0.6" d="M 180 94 L 198 90 L 205 98 L 192 102 Z" />
          <text
            x="24"
            y="78"
            fill="rgba(255,255,255,0.38)"
            style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "0.06em" }}
          >
            대한민국 연안(시연)
          </text>
        </svg>

        {/* Grid overlay */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.08]" style={{ pointerEvents: "none" }}>
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#40E0D0" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Depth contours */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none", opacity: 0.18 }}
        >
          <ellipse cx="48%" cy="68%" rx="42%" ry="22%" fill="none" stroke="#40E0D0" strokeWidth="1" strokeDasharray="8 5" />
          <ellipse cx="48%" cy="72%" rx="30%" ry="14%" fill="none" stroke="#40E0D0" strokeWidth="0.8" strokeDasharray="6 6" />
          <ellipse cx="48%" cy="77%" rx="17%" ry="7%"  fill="none" stroke="#40E0D0" strokeWidth="0.5" strokeDasharray="4 8" />
        </svg>

        {/* Wind direction arrows */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          style={{ pointerEvents: "none" }}
        >
          {WIND_ARROW_POS.map((pos, i) => (
            <g
              key={i}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{
                animation: `windPulse 3.2s ease-in-out ${i * 0.38}s infinite`,
                transformOrigin: `${pos.x}px ${pos.y}px`,
              }}
            >
              <g transform={`rotate(${weather.windDir})`}>
                <polygon points="0,-11 2.8,3 0,-2 -2.8,3" fill="#40E0D0" opacity="0.6" />
                <line x1="0" y1="3" x2="0" y2="10" stroke="#40E0D0" strokeWidth="1.2" opacity="0.35" />
              </g>
            </g>
          ))}
        </svg>

        {/* SVG Layer 1: sonar + vessel trail (behind drops) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          style={{ pointerEvents: "none" }}
        >
          {/* ── SONAR SWEEP (opacity reduced so drops show through) ── */}
          <g opacity="0.7">
            {[42, 72, 102].map((r, i) => (
              <circle
                key={r}
                cx={vessel.x}
                cy={vessel.y}
                r={r}
                fill="none"
                stroke="#40E0D0"
                strokeWidth="0.5"
                strokeDasharray="4 8"
                opacity={0.08 - i * 0.02}
              />
            ))}
            <circle cx={vessel.x} cy={vessel.y} r="8" fill="none" stroke="#40E0D0" strokeWidth="0.8" opacity="0">
              <animate attributeName="r" from="8" to="48" dur="3.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0" dur="3.5s" repeatCount="indefinite" />
            </circle>
            <line
              x1={vessel.x} y1={vessel.y}
              x2={vessel.x} y2={vessel.y - 102}
              stroke="#40E0D0" strokeWidth="1.5" opacity="0.55"
            >
              <animateTransform attributeName="transform" type="rotate"
                from={`0 ${vessel.x} ${vessel.y}`} to={`360 ${vessel.x} ${vessel.y}`}
                dur="5s" repeatCount="indefinite" />
            </line>
            {[20, 40].map((offset, i) => (
              <line key={offset}
                x1={vessel.x} y1={vessel.y}
                x2={vessel.x} y2={vessel.y - 102}
                stroke="#40E0D0" strokeWidth="1" opacity={0.18 - i * 0.07}
              >
                <animateTransform attributeName="transform" type="rotate"
                  from={`${-offset} ${vessel.x} ${vessel.y}`}
                  to={`${360 - offset} ${vessel.x} ${vessel.y}`}
                  dur="5s" repeatCount="indefinite" />
              </line>
            ))}
          </g>

          {/* Vessel trail */}
          {path.length > 1 && (
            <polyline
              points={path.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#40E0D0"
              strokeWidth="1.6"
              strokeOpacity="0.4"
              strokeDasharray="6 4"
            />
          )}
        </svg>

        {/* SVG Layer 2: seed drops + vessel (always on top) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          style={{ pointerEvents: "none" }}
        >
          <defs>
            {/* Glow filter for seed drops */}
            <filter id="dropGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Seed drops — each with dark backdrop + halo + main dot */}
          {drops.map((d) => {
            const px = MAP_W / 2 + (d.lng - BASE_LNG) / 0.00048;
            const py = MAP_H / 2 - (d.lat - BASE_LAT) / 0.00055;
            const isNew = highlightDropId !== undefined && d.id === highlightDropId;
            const col = dropVisualColors(d);
            return (
              <g key={d.id} filter="url(#dropGlow)">
                {/* Outer pulse ring for newest drop */}
                {isNew && (
                  <circle cx={px} cy={py} r="14" fill="none" stroke={col.pulse} strokeWidth="2.5" opacity="0">
                    <animate attributeName="r" from="7" to="24" dur="1.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.9" to="0" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* Dark backdrop — punches through sonar lines */}
                <circle cx={px} cy={py} r={isNew ? 11 : 9} fill="rgba(3,20,38,0.72)" />
                {/* Soft color halo */}
                <circle cx={px} cy={py} r={isNew ? 9.5 : 7.5} fill={col.fill} opacity="0.22" />
                {/* Main colored dot */}
                <circle
                  cx={px} cy={py}
                  r={isNew ? 7 : 5.5}
                  fill={col.fill}
                  opacity="0.97"
                  stroke={col.stroke}
                  strokeWidth={isNew ? 2 : 1.6}
                />
                {/* Inner bright center for clarity */}
                <circle cx={px} cy={py} r={isNew ? 2.5 : 1.6} fill={col.stroke} opacity="0.85" />
              </g>
            );
          })}

          {/* Vessel icon — top-down ship silhouette */}
          <g transform={`translate(${vessel.x}, ${vessel.y}) rotate(${vessel.heading})`}>
            {/* Ambient engine glow */}
            <ellipse cx="0" cy="0" rx="14" ry="20" fill="rgba(255,138,31,0.09)" />
            {/* Wake at stern */}
            <line x1="-5" y1="17" x2="-9" y2="26" stroke="rgba(64,224,208,0.35)" strokeWidth="1.2" strokeDasharray="2 3" />
            <line x1="0"  y1="18" x2="0"  y2="27" stroke="rgba(64,224,208,0.2)"  strokeWidth="1"   strokeDasharray="2 3" />
            <line x1="5"  y1="17" x2="9"  y2="26" stroke="rgba(64,224,208,0.35)" strokeWidth="1.2" strokeDasharray="2 3" />
            {/* Hull — pointed bow (y-axis negative = forward) */}
            <path
              d="M 0,-18
                 C 3,-15 6,-9 6,-1
                 L 6,10
                 C 5,13 3,16 0,17
                 C -3,16 -5,13 -6,10
                 L -6,-1
                 C -6,-9 -3,-15 0,-18 Z"
              fill="#FF8A1F"
              stroke="#fff"
              strokeWidth="1.4"
              style={{ filter: "drop-shadow(0 0 6px rgba(255,138,31,0.65))" }}
            />
            {/* Deck centerline */}
            <line x1="0" y1="-14" x2="0" y2="14" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
            {/* Bow waterline mark */}
            <line x1="-3.5" y1="-12" x2="3.5" y2="-12" stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" />
            {/* Bridge / superstructure */}
            <rect x="-3.5" y="-4" width="7" height="10" rx="1.5"
              fill="rgba(255,255,255,0.80)" />
            {/* Mast center dot */}
            <circle cx="0" cy="2" r="2.2" fill="#fff" opacity="0.96"
              style={{ filter: "drop-shadow(0 0 4px #FF8A1F)" }} />
            {/* Navigation lights — red port (left), green starboard (right) */}
            <circle cx="-6" cy="-1" r="1.2" fill="#f87171" opacity="0.9" />
            <circle cx=" 6" cy="-1" r="1.2" fill="#4ade80" opacity="0.9" />
          </g>
        </svg>

        {/* SVG Layer 3: 살포 라벨 (필터 없음, 항상 최상위) */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          style={{ pointerEvents: "none" }}
        >
          <defs>
            <filter id="labelShadow" x="-10%" y="-20%" width="120%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.7"/>
            </filter>
          </defs>
          {drops.map((d) => {
            const px = MAP_W / 2 + (d.lng - BASE_LNG) / 0.00048;
            const py = MAP_H / 2 - (d.lat - BASE_LAT) / 0.00055;
            const isNew = highlightDropId !== undefined && d.id === highlightDropId;
            const col  = dropVisualColors(d);
            const lw   = d.label.length * 5.5 + 8; // 라벨 너비 계산
            return (
              <g key={`lbl-${d.id}`}>
                {/* 라벨 배경 박스 */}
                <rect
                  x={px + 8} y={py - 8}
                  width={lw} height={13}
                  rx={3}
                  fill="rgba(3,18,36,0.82)"
                  stroke={col.fill}
                  strokeWidth="0.8"
                  filter="url(#labelShadow)"
                />
                {/* 라벨 텍스트 */}
                <text
                  x={px + 8 + lw / 2} y={py + 1.5}
                  textAnchor="middle"
                  fontSize={isNew ? "8.5" : "7.5"}
                  fontFamily="monospace"
                  fontWeight="700"
                  fill={isNew ? col.stroke : "rgba(255,255,255,0.88)"}
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ── Wave animation overlay at bottom ── */}
        <div className="absolute bottom-0 left-0 right-0 h-16 overflow-hidden pointer-events-none">
          <svg
            viewBox="0 0 1920 64"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "200%",
              height: "100%",
              animation: "waveSlide 11s linear infinite",
            }}
          >
            <path
              d="M 0 42 C 160 22 320 62 480 42 C 640 22 800 62 960 42 C 1120 22 1280 62 1440 42 C 1600 22 1760 62 1920 42 L 1920 64 L 0 64 Z"
              fill="rgba(64,224,208,0.09)"
            />
          </svg>
          <svg
            viewBox="0 0 1920 64"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "200%",
              height: "100%",
              animation: "waveSlide 17s linear infinite reverse",
              opacity: 0.55,
            }}
          >
            <path
              d="M 0 50 C 120 36 240 60 360 50 C 480 36 600 60 720 50 C 840 36 960 60 1080 50 C 1200 36 1320 60 1440 50 C 1560 36 1680 60 1800 50 C 1860 44 1920 56 1920 50 L 1920 64 L 0 64 Z"
              fill="rgba(64,224,208,0.06)"
            />
          </svg>
        </div>

        {/* Corner coordinates */}
        <div className="absolute top-3 left-3 text-xs text-cyan-400/60 font-mono pointer-events-none leading-snug">
          북위 {(BASE_LAT + 0.14).toFixed(3)}° · 동경 {(BASE_LNG - 0.22).toFixed(3)}°
        </div>
        <div className="absolute top-3 right-3 text-xs text-cyan-400/60 font-mono text-right pointer-events-none leading-snug">
          북위 {(BASE_LAT + 0.14).toFixed(3)}° · 동경 {(BASE_LNG + 0.22).toFixed(3)}°
        </div>
        <div className="absolute bottom-3 left-3 text-xs text-cyan-400/60 font-mono pointer-events-none leading-snug">
          북위 {(BASE_LAT - 0.14).toFixed(3)}° · 동경 {(BASE_LNG - 0.22).toFixed(3)}°
        </div>
        <div className="absolute bottom-3 right-3 text-xs text-cyan-400/60 font-mono text-right pointer-events-none leading-snug">
          북위 {(BASE_LAT - 0.14).toFixed(3)}° · 동경 {(BASE_LNG + 0.22).toFixed(3)}°
        </div>

        {/* Scale bar */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
          <div className="flex items-center gap-0">
            <div className="h-[3px] w-14 bg-white/50 border-l border-r border-white/80" />
            <div className="h-[3px] w-14 bg-black/40 border-r border-white/80" />
          </div>
          <span className="text-xs text-white/55 font-mono">500 m</span>
        </div>

        {/* Banner */}
        <div className="absolute inset-x-0 bottom-[72px] flex justify-center pointer-events-none">
          <div className="bg-black/45 backdrop-blur-sm text-white/45 text-xs px-3 py-1.5 rounded-full border border-white/10">
            연안 항해 시연 · 지도 API 연동 예정
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [drops, setDrops] = useState<SeedDrop[]>(seedInitial);
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [vessel, setVessel] = useState<Vessel>(() => {
    const wp = WAYPOINTS[0];
    const coords = xyToLatLng(wp.x, wp.y);
    return { x: wp.x, y: wp.y, heading: 45, lat: coords.lat, lng: coords.lng, speed: 4.2 };
  });
  const [path, setPath] = useState<{ x: number; y: number }[]>([]);
  const [zoom, setZoom] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const [colorHelpOpen, setColorHelpOpen] = useState(false);
  const [connected, setConnected] = useState(true);
  const [totalToday] = useState(124);
  const [weather, setWeather] = useState<WeatherState>(initWeather);
  const [signals, setSignals] = useState<SignalEntry[]>([]);
  const [signalSending, setSignalSending] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "schedule">("map");
  const [manualOpen, setManualOpen] = useState(false);

  const wpIdx        = useRef(0);
  const counter      = useRef(1000 + INITIAL_SEED_COUNT + 1);
  const zoneCounts   = useRef<Record<"A"|"B"|"C", number>>({ ...INIT_ZONE_COUNTS });
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

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [filteredDrops]);

  // Vessel movement
  useEffect(() => {
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
    }, 2400);
    return () => clearInterval(iv);
  }, []);

  // Auto seed drop
  useEffect(() => {
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
        setDrops((d) => [...d, newDrop].slice(-80));
        return v;
      });
    }, 16_000);
    return () => clearInterval(iv);
  }, []);

  // Connection blink
  useEffect(() => {
    const iv = setInterval(() => {
      setConnected(false);
      setTimeout(() => setConnected(true), 300);
    }, 8000);
    return () => clearInterval(iv);
  }, []);

  // Weather simulation
  useEffect(() => {
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
  }, []);

  // Signal send handler
  const handleSignal = useCallback(
    (cmd: string) => {
      if (signalSending) return;
      const id = Date.now().toString();
      const newSig: SignalEntry = { id, cmd, time: fmt(new Date()), ack: false };
      setSignals((s) => [...s.slice(-9), newSig]);
      setSignalSending(true);
      const delay = 2200 + Math.random() * 1400;
      setTimeout(() => {
        setSignals((s) => s.map((sig) => (sig.id === id ? { ...sig, ack: true } : sig)));
        setSignalSending(false);
      }, delay);
    },
    [signalSending]
  );

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 1, 4)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z - 1, 0)), []);
  const handleRecenter = useCallback(() => setZoom(0), []);

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

  return (
    <div className="flex h-screen w-full min-h-0 overflow-hidden font-sans text-[15px] leading-snug sm:text-[16px] antialiased">
      <ManualModal isOpen={manualOpen} onClose={() => setManualOpen(false)} />

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside
        className="w-80 shrink-0 flex flex-col overflow-hidden"
        style={{ background: "linear-gradient(180deg, #0c2748 0%, #081b34 100%)" }}
      >
        {/* Brand */}
        <div className="px-5 pt-5 pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 mb-0.5">
            <img
              src="/logo.svg"
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-xl shadow-md shadow-black/30"
              alt=""
            />
            <div>
              <p className="text-white font-bold text-base leading-tight tracking-tight">
                해양 종자 살포 관제
              </p>
              <p className="text-cyan-400/75 text-xs tracking-wide mt-0.5">
                {VESSEL_NAME} · 해조류 복원 v2.1
              </p>
            </div>
          </div>
        </div>

        {/* View navigation tabs */}
        <div className="px-4 py-2.5 grid grid-cols-2 gap-1.5 border-b border-white/10 shrink-0">
          <button
            onClick={() => setViewMode("map")}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
            style={viewMode === "map" ? {
              background: "rgba(64,224,208,0.15)",
              color: "#40E0D0",
              border: "1px solid rgba(64,224,208,0.3)",
            } : {
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              border: "1px solid transparent",
            }}
          >
            <Map className="w-3.5 h-3.5" />
            실시간 관제
          </button>
          <button
            onClick={() => setViewMode("schedule")}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
            style={viewMode === "schedule" ? {
              background: "rgba(64,224,208,0.15)",
              color: "#40E0D0",
              border: "1px solid rgba(64,224,208,0.3)",
            } : {
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              border: "1px solid transparent",
            }}
          >
            <Calendar className="w-3.5 h-3.5" />
            작업 계획
          </button>
        </div>

        {/* Live stats strip */}
        <div className="px-5 py-3 grid grid-cols-3 gap-2 border-b border-white/10 shrink-0">
          <StatTile
            label="금일 살포"
            value={String(totalToday + drops.length - INITIAL_SEED_COUNT)}
            icon={<Droplets className="w-4 h-4" />}
            color="text-cyan-400"
          />
          <StatTile
            label="누적 건수"
            value={(1_840 + drops.length).toLocaleString("ko-KR")}
            icon={<MapPin className="w-4 h-4" />}
            color="text-blue-400"
          />
          <StatTile
            label="속도(노트)"
            value={vessel.speed.toFixed(1)}
            icon={<Ship className="w-4 h-4" />}
            color="text-amber-400"
          />
        </div>

        {/* ── Weather panel (compact horizontal) ── */}
        <div className="px-4 py-2.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mini wind compass */}
            <div className="relative w-[52px] h-[52px] shrink-0">
              <svg viewBox="0 0 60 60" className="w-full h-full">
                <circle cx="30" cy="30" r="28" fill="rgba(0,0,0,0.35)" stroke="rgba(64,224,208,0.22)" strokeWidth="1.5"/>
                {["N","E","S","W"].map((d, i) => {
                  const r = ((i * 90 - 90) * Math.PI) / 180;
                  return (
                    <text key={d} x={30 + 19 * Math.cos(r)} y={30 + 19 * Math.sin(r) + 3}
                      textAnchor="middle" fill={d === "N" ? "#f87171" : "rgba(255,255,255,0.35)"}
                      style={{ fontSize: "7px", fontWeight: "700", fontFamily: "monospace" }}>
                      {d}
                    </text>
                  );
                })}
                <g style={{ transform: `rotate(${weather.windDir}deg)`, transformOrigin: "30px 30px", transition: "transform 2s" }}>
                  <polygon points="30,6 32.5,22 30,18 27.5,22" fill="#40E0D0" opacity="0.95"/>
                  <polygon points="30,54 32.5,38 30,42 27.5,38" fill="rgba(64,224,208,0.2)"/>
                </g>
                <circle cx="30" cy="30" r="2.5" fill="#fff" opacity="0.92"/>
              </svg>
            </div>
            {/* Weather data grid */}
            <div className="flex-1 grid grid-cols-2 gap-x-2 gap-y-1">
              {[
                { label: "풍속", val: `${weather.windSpeed.toFixed(1)} kt`, color: weather.windSpeed > 16 ? "#fbbf24" : "#40E0D0" },
                { label: "풍향", val: windDirLabel(weather.windDir),        color: "rgba(255,255,255,0.65)" },
                { label: "돌풍", val: `${weather.windGust.toFixed(1)} kt`,  color: "#fbbf24" },
                { label: "파고", val: `${weather.waveHeight.toFixed(1)} m`, color: "#93c5fd" },
                { label: "시정", val: `${weather.visibility.toFixed(0)} km`,color: "#6ee7b7" },
                { label: "기온", val: `${weather.temp.toFixed(0)} °C`,      color: "#fdba74" },
              ].map((item) => (
                <div key={item.label} className="flex items-baseline gap-1 text-[11px]">
                  <span className="text-white/35 shrink-0">{item.label}</span>
                  <span className="font-mono font-bold leading-none truncate" style={{ color: item.color }}>{item.val}</span>
                </div>
              ))}
            </div>
            {weather.windSpeed > 16 && (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            )}
          </div>
        </div>

        {/* ── Vessel status (compact) ── */}
        <div className="px-4 py-2.5 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs font-semibold tracking-wide">선박 위치</span>
            <span className="flex items-center gap-1 text-xs">
              {connected ? (
                <><Wifi className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400 text-[11px]">실시간</span></>
              ) : (
                <><WifiOff className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400 text-[11px]">연결 확인</span></>
              )}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "북위", val: `${vessel.lat.toFixed(4)}°` },
              { label: "동경", val: `${vessel.lng.toFixed(4)}°` },
              { label: "방위", val: `${((vessel.heading % 360) + 360) % 360 | 0}°` },
            ].map((r) => (
              <div key={r.label} className="rounded-md px-2 py-1.5 text-center"
                style={{ background: "rgba(255,255,255,0.04)" }}>
                <p className="text-[9px] text-white/35 mb-0.5">{r.label}</p>
                <p className="text-[11px] font-mono font-bold text-cyan-300 leading-none">{r.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Signal panel ── */}
        <SignalPanel signals={signals} onSend={handleSignal} isSending={signalSending} />

        {/* Log header */}
        <div className="px-5 pt-3 pb-1.5 flex items-center justify-between shrink-0">
          <span className="text-white/55 text-xs font-semibold tracking-wide flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0" />
            종자 살포 이력
          </span>
          <span className="text-white/40 text-xs text-right">
            {filterStart || filterEnd ? (
              <>
                조회 {filteredDrops.length.toLocaleString("ko-KR")}건
                <span className="text-white/20"> · 전체 {drops.length.toLocaleString("ko-KR")}건</span>
              </>
            ) : (
              <>총 {drops.length.toLocaleString("ko-KR")}건</>
            )}
          </span>
        </div>

        {/* Log column headers */}
        <div className="px-3 pb-1.5 shrink-0 grid grid-cols-4 gap-1 text-[10px] text-white/35 font-semibold tracking-wide">
          <span>번호</span>
          <span>시각</span>
          <span className="text-right">위도</span>
          <span className="text-right">경도</span>
        </div>

        {/* Log list */}
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5 scroll-smooth min-h-0"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#1e3a5f transparent" }}
        >
          {filteredDrops.length === 0 ? (
            <p className="text-center text-white/40 text-sm px-2 py-6">
              선택한 기간에 조회된 이력이 없습니다.
            </p>
          ) : (
            filteredDrops.map((d) => {
              const isNew = d.id === latestId;
              const col = dropVisualColors(d);
              return (
                <div
                  key={d.id}
                  className={`grid grid-cols-4 gap-1 px-2 py-1.5 rounded-md text-[11px] font-mono transition-all duration-300 border border-transparent hover:bg-white/5 ${
                    isNew ? "shadow-[0_0_14px_rgba(255,255,255,0.10)] ring-1 ring-white/20" : ""
                  }`}
                  style={{
                    background: "rgba(255,255,255,0.035)",
                    borderLeft: `4px solid ${col.fill}`,
                  }}
                >
                  {/* 구역 라벨 배지 */}
                  <span className="font-black leading-none flex items-center">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-black"
                      style={{
                        background: `${col.fill}30`,
                        color: col.stroke,
                        border: `1px solid ${col.fill}60`,
                      }}
                    >
                      {d.label}
                    </span>
                  </span>
                  <span className="font-semibold truncate" style={{ color: col.stroke }}>
                    {d.time}
                  </span>
                  <span className="text-right text-white/60">{d.lat.toFixed(4)}</span>
                  <span className="text-right text-white/60">{d.lng.toFixed(4)}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Date filter + export — compact single row */}
        <div className="px-3 py-2.5 border-t border-white/10 shrink-0">
          <div className="flex gap-1.5 items-center">
            <input
              type="date"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
              className="flex-1 min-w-0 rounded-md border border-white/12 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-500/50 [color-scheme:dark]"
              aria-label="시작일"
            />
            <span className="text-white/25 text-xs shrink-0">~</span>
            <input
              type="date"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
              className="flex-1 min-w-0 rounded-md border border-white/12 bg-white/5 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-500/50 [color-scheme:dark]"
              aria-label="종료일"
            />
            <button
              onClick={() => exportCSV(filteredDrops)}
              title={`CSV 저장 (${filteredDrops.length}건)`}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-white transition-all hover:scale-[1.04] active:scale-95"
              style={{
                background: "linear-gradient(135deg, #1FB5A8 0%, #0e7490 100%)",
                boxShadow: "0 2px 8px rgba(31,181,168,0.3)",
              }}
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
          {(filterStart || filterEnd) && (
            <p className="text-[10px] text-white/30 mt-1 text-center">
              조회 {filteredDrops.length}건 · 전체 {drops.length}건
            </p>
          )}
        </div>
      </aside>

      {/* ══ MAP AREA / WORK PLAN ════════════════════════════════════════════ */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#031928]">
        {/* Topbar */}
        <header
          className="min-h-[3.25rem] shrink-0 flex items-center gap-3 px-4 sm:px-5 py-2 border-b border-white/10"
          style={{
            background: "linear-gradient(90deg, rgba(7,28,52,0.95) 0%, rgba(4,18,36,0.98) 100%)",
          }}
        >
          {/* Live indicator */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-full animate-pulse"
              style={{ background: "#40E0D0", boxShadow: "0 0 8px #40E0D0" }}
            />
            <span className="text-white/65 text-sm tracking-wide font-medium truncate">
              실시간 관제 · 남해 제3구역
            </span>
          </div>

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
            <span className="font-mono text-cyan-300 font-semibold">{weather.windSpeed.toFixed(1)} kt</span>
            {weather.windSpeed > 16 && (
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

        {/* Map container / Work plan view */}
        {viewMode === "schedule" ? (
          <WorkPlanView weather={weather} />
        ) : null}

        <div ref={mapContainerRef} className={`flex-1 relative overflow-hidden ${viewMode === "schedule" ? "hidden" : ""}`}>
          <MapPlaceholder
            drops={filteredDrops}
            vessel={vessel}
            path={path}
            zoom={zoom}
            highlightDropId={filteredDrops.some((x) => x.id === latestId) ? latestId : undefined}
            weather={weather}
          />

          {/* Clock overlay */}
          <div
            className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2"
            role="status"
            aria-live="polite"
            aria-label="현재 시각"
          >
            <time
              dateTime={clock.toISOString()}
              className="block rounded-xl border border-white/15 bg-[#041c2e]/75 px-4 py-2 backdrop-blur-md tabular-nums text-xl sm:text-2xl font-medium text-white/90 font-mono tracking-[0.02em] shadow-lg shadow-black/25"
              suppressHydrationWarning
            >
              {clock.toLocaleTimeString("ko-KR", { hour12: false })}
            </time>
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
            <FloatBtn onClick={handleRecenter} title="화면 중심 이동">
              <Navigation className="w-5 h-5" />
            </FloatBtn>
            <FloatBtn onClick={() => setZoom(0)} title="뷰 초기화">
              <RefreshCw className="w-5 h-5" />
            </FloatBtn>
          </div>

          {/* Zoom badge */}
          {zoom !== 0 && (
            <div className="absolute right-16 top-1/2 -translate-y-1/2 z-10">
              <div className="bg-black/55 text-cyan-300 text-xs font-mono px-2.5 py-1 rounded-full border border-white/10">
                ×{(1 + zoom * 0.12).toFixed(2)}
              </div>
            </div>
          )}

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
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-md backdrop-blur-sm transition-colors ${
                colorHelpOpen
                  ? "border-cyan-500/40 bg-[#041c2e]/95 text-white"
                  : "border-white/20 bg-[#041c2e]/80 text-white/90 hover:bg-[#041c2e]/95"
              }`}
              title="살포 색상 안내"
            >
              <Info className="h-4 w-4 shrink-0 opacity-90" />
              살포 색상 안내
            </button>
            {colorHelpOpen && (
              <div
                className="w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-white/15 p-3 text-left text-white shadow-xl"
                style={{ background: "linear-gradient(180deg, #0e2d4f 0%, #0B2545 100%)" }}
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
                  className="mt-3 w-full rounded-lg py-2 text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #1FB5A8 0%, #0e7490 100%)" }}
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
        background: "rgba(9,30,56,0.88)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-2.5 py-2 text-xs"
      style={{
        background: "rgba(9,30,56,0.88)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <p className="mb-0.5 text-[10px] font-medium tracking-wide text-white/45">{label}</p>
      <p className="text-[11px] font-semibold leading-snug text-cyan-300/95">{value}</p>
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
