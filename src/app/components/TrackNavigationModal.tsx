import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Navigation2,
  RotateCcw,
  Ship,
  Sprout,
  X,
} from "lucide-react";
import { parseLatLngTrackInput } from "@/lib/track-navigation";

export type TrackNavStats = {
  distKm: number;
  bearing: number;
  wptLabel: string;
} | null;

export type TrackNavigationModalProps = {
  open: boolean;
  onClose: () => void;
  defaultLines: string;
  pathPointCount: number;
  hasManualTrack: boolean;
  onApplyManualPath: (points: [number, number][]) => void;
  onClearManualPath: () => void;
  navActive: boolean;
  onToggleNav: () => void;
  onResetOrigin: () => void;
  navStats: TrackNavStats;
  arrivedFinal: boolean;
  routeMapEditorMode?: null | "waypoints" | "seedPlan";
  onRouteMapEditorMode?: (mode: null | "waypoints" | "seedPlan") => void;
  plannedSeedEvenCountStr?: string;
  onPlannedSeedEvenCountStrChange?: (s: string) => void;
  onPlannedSeedEvenDistribute?: () => void;
  onPlannedSeedsClear?: () => void;
  plannedSeedPointCount?: number;
};

export function TrackNavigationModal({
  open,
  onClose,
  defaultLines,
  pathPointCount,
  hasManualTrack,
  onApplyManualPath,
  onClearManualPath,
  navActive,
  onToggleNav,
  onResetOrigin,
  navStats,
  arrivedFinal,
  routeMapEditorMode = null,
  onRouteMapEditorMode = () => {},
  plannedSeedEvenCountStr = "20",
  onPlannedSeedEvenCountStrChange = () => {},
  onPlannedSeedEvenDistribute = () => {},
  onPlannedSeedsClear = () => {},
  plannedSeedPointCount = 0,
}: TrackNavigationModalProps) {
  const [text, setText] = useState(defaultLines);
  const [coordsOpen, setCoordsOpen] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => { if (open) setText(defaultLines); }, [open, defaultLines]);
  useEffect(() => { if (!open) { setApplied(false); setCoordsOpen(false); } }, [open]);
  useEffect(() => { if (navActive) setApplied(false); }, [navActive]);

  if (!open) return null;

  /* ── 꼭짓점·살포 찍기 중: 지도 하단 미니 완료 바만 표시 ── */
  const mapEditActive = routeMapEditorMode === "waypoints" || routeMapEditorMode === "seedPlan";
  if (mapEditActive) {
    const isWp = routeMapEditorMode === "waypoints";
    return (
      <div className="pointer-events-none fixed inset-0 z-[997]">
        <div
          className="pointer-events-auto fixed bottom-6 left-1/2 z-[998] flex w-[min(92vw,22rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border px-5 py-3 shadow-2xl"
          style={{
            background: "linear-gradient(160deg,#0c2748,#081b34)",
            borderColor: isWp ? "rgba(45,212,191,0.5)" : "rgba(132,204,22,0.5)",
          }}
        >
          <div className="flex items-center gap-2">
            {isWp
              ? <MapPin className="h-4 w-4 text-teal-300" />
              : <Sprout className="h-4 w-4 text-lime-300" />}
            <span className="text-[12px] font-bold text-white">
              {isWp ? "항로 꼭짓점 찍는 중…" : "살포 예정점 찍는 중…"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRouteMapEditorMode(null)}
            className="shrink-0 rounded-xl border px-4 py-1.5 text-[12px] font-bold text-white transition-colors"
            style={{
              borderColor: isWp ? "rgba(45,212,191,0.55)" : "rgba(132,204,22,0.55)",
              background: isWp ? "rgba(13,148,136,0.4)" : "rgba(77,124,15,0.4)",
            }}
          >
            완료
          </button>
        </div>
      </div>
    );
  }

  const draftCount = parseLatLngTrackInput(text).length;

  const handleApply = () => {
    const pts = parseLatLngTrackInput(text);
    if (pts.length < 2) {
      window.alert("유효한 위도·경도가 2개 이상 필요합니다.");
      return;
    }
    onApplyManualPath(pts);
    setApplied(true);
    setCoordsOpen(false);
  };

  return (
    /*
     * 사이드바(w-80 = 20rem) 바로 오른쪽에 배치 → 지도 우측 줌·모드 버튼 전혀 가리지 않음
     * max-h + overflow-y-auto → 화면 높이 초과 시 내부 스크롤
     */
    <div
      className="fixed bottom-4 z-[997] flex flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{
        left: "calc(20rem + 1rem)",
        width: "18rem",
        maxHeight: "calc(100vh - 5rem)",
        background: "linear-gradient(160deg,#0c2748 0%,#081b34 100%)",
        border: "1px solid rgba(64,224,208,0.30)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
      }}
    >
      {/* ── 헤더 ── */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: "rgba(64,224,208,0.15)", background: "rgba(0,0,0,0.22)" }}
      >
        <div className="flex items-center gap-2">
          <Navigation2 className="h-4 w-4 text-amber-300" />
          <span className="text-[13px] font-bold text-white">항로 길안내</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── 스크롤 영역 ── */}
      <div className="flex flex-col gap-3 overflow-y-auto p-4">

        {/* ── 경로 현황 카드 ── */}
        <div
          className="rounded-xl border px-3 py-2.5"
          style={{ borderColor: "rgba(64,224,208,0.18)", background: "rgba(0,0,0,0.15)" }}
        >
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300/60">
            경로 현황
          </p>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-white">
              경유지{" "}
              <span className="text-teal-300">{pathPointCount}</span>
              <span className="text-[11px] font-normal text-white/40">점</span>
            </span>
            <span className="text-[11px] text-white/45">
              {hasManualTrack ? "수동 경로 사용 중" : "금일 자동 항적"}
            </span>
          </div>
          {applied && !navActive && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              경로 확정 완료 — 안내 시작을 눌러주세요
            </div>
          )}
        </div>

        {/* ── 안내 시작 / 원위치 (대형) ── */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleNav}
            disabled={pathPointCount < 2}
            className="flex items-center justify-center gap-2 rounded-xl border py-3 text-[13px] font-bold transition-all disabled:opacity-35"
            style={{
              borderColor: navActive ? "rgba(52,211,153,0.55)" : "rgba(251,191,36,0.5)",
              background: navActive ? "rgba(6,78,59,0.4)" : "rgba(217,119,6,0.22)",
              color: navActive ? "#6ee7b7" : "#fcd34d",
              boxShadow: navActive ? "none" : "0 2px 12px rgba(217,119,6,0.18)",
            }}
          >
            <Ship className="h-4 w-4" />
            {navActive ? "안내 종료" : "안내 시작"}
          </button>
          <button
            type="button"
            onClick={onResetOrigin}
            disabled={pathPointCount < 2}
            className="flex items-center justify-center gap-2 rounded-xl border py-3 text-[13px] font-bold text-cyan-200 transition-all disabled:opacity-35"
            style={{
              borderColor: "rgba(34,211,254,0.35)",
              background: "rgba(14,116,144,0.22)",
            }}
          >
            <RotateCcw className="h-4 w-4" />
            원위치
          </button>
        </div>

        {/* ── 안내 중 거리·침로 (navActive 시에만) ── */}
        {navActive && navStats && (
          <div
            className="rounded-xl border px-4 py-3"
            style={{ borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.1)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/60">
              안내 중
            </p>
            <p className="mt-1 font-mono text-[32px] font-black tabular-nums leading-none text-white">
              {navStats.distKm < 1
                ? `${Math.max(0, Math.round(navStats.distKm * 1000))} m`
                : `${navStats.distKm.toFixed(2)} km`}
            </p>
            <p className="mt-1.5 text-[12px] text-amber-100/90">
              목표:{" "}
              <span className="font-bold text-amber-100">{navStats.wptLabel}</span>
              {"  "}진북{" "}
              <span className="font-mono font-bold text-amber-200">
                {String(navStats.bearing).padStart(3, "0")}°
              </span>
            </p>
            {arrivedFinal && (
              <p className="mt-2 border-t border-amber-400/25 pt-2 text-[11px] font-semibold text-emerald-300">
                목적지 부근 도착 — 안내를 종료해도 됩니다.
              </p>
            )}
          </div>
        )}

        {/* ── 항로 / 살포 찍기 ── */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onRouteMapEditorMode("waypoints")}
            className="flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[12px] font-bold transition-colors"
            style={{
              borderColor: "rgba(45,212,191,0.4)",
              background: "rgba(13,148,136,0.2)",
              color: "#ccfbf1",
            }}
          >
            <MapPin className="h-3.5 w-3.5" />
            항로 찍기
          </button>
          <button
            type="button"
            onClick={() => onRouteMapEditorMode("seedPlan")}
            className="flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[12px] font-bold transition-colors"
            style={{
              borderColor: "rgba(132,204,22,0.4)",
              background: "rgba(77,124,15,0.2)",
              color: "#d9f99d",
            }}
          >
            <Sprout className="h-3.5 w-3.5" />
            살포 찍기
          </button>
        </div>

        {/* ── 균등 살포 배치 ── */}
        <div
          className="rounded-xl border px-3 py-2.5"
          style={{ borderColor: "rgba(132,204,22,0.2)", background: "rgba(0,0,0,0.12)" }}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-lime-300/60">
            살포 예정 배치
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              value={plannedSeedEvenCountStr}
              onChange={(e) => onPlannedSeedEvenCountStrChange(e.target.value)}
              className="w-16 shrink-0 rounded-lg border px-2 py-1.5 font-mono text-[12px] text-cyan-50 outline-none [color-scheme:dark]"
              style={{ background: "rgba(8,27,52,0.85)", borderColor: "rgba(64,224,208,0.22)" }}
            />
            <span className="text-[11px] text-white/40">개</span>
            <button
              type="button"
              onClick={onPlannedSeedEvenDistribute}
              className="flex-1 rounded-lg border border-lime-400/35 bg-lime-900/25 py-1.5 text-[11px] font-bold text-lime-100 hover:bg-lime-800/35"
            >
              경로 따라 균등 배치
            </button>
          </div>
          {plannedSeedPointCount > 0 && (
            <button
              type="button"
              onClick={onPlannedSeedsClear}
              className="mt-2 w-full text-left text-[10px] text-white/35 hover:text-rose-300 transition-colors"
            >
              예정점 전체 삭제 ({plannedSeedPointCount}개)
            </button>
          )}
        </div>

        {/* ── 좌표 직접 입력 (접기/펼치기) ── */}
        <button
          type="button"
          onClick={() => setCoordsOpen((v) => !v)}
          className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-[11px] font-semibold text-white/50 hover:bg-white/5 transition-colors"
        >
          <span>좌표 직접 입력</span>
          <div className="flex items-center gap-1 text-white/30">
            {draftCount > 0 && (
              <span className="rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[9px] text-teal-300">
                {draftCount}점
              </span>
            )}
            {coordsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </button>

        {coordsOpen && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-white/35">
              한 줄에 위도, 경도 (예: 34.743, 127.743) · 주석은 # 으로 시작
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={6}
              className="w-full resize-none rounded-xl border px-3 py-2 font-mono text-[11px] text-cyan-50 outline-none focus:ring-1 focus:ring-teal-400/25 [color-scheme:dark]"
              style={{
                background: "rgba(8,27,52,0.85)",
                borderColor: "rgba(64,224,208,0.22)",
              }}
              placeholder={"34.743, 127.743\n34.648, 127.858"}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 rounded-xl border border-teal-400/40 bg-teal-500/18 py-2 text-[12px] font-bold text-teal-50 hover:bg-teal-500/28 transition-colors"
              >
                경로 확정
              </button>
              <button
                type="button"
                onClick={() => setText(defaultLines)}
                className="rounded-xl border border-white/15 px-3 py-2 text-[11px] text-white/60 hover:bg-white/10 transition-colors"
              >
                금일 채우기
              </button>
              {hasManualTrack && (
                <button
                  type="button"
                  onClick={onClearManualPath}
                  className="rounded-xl border border-rose-400/30 px-3 py-2 text-[11px] text-rose-300 hover:bg-rose-500/15 transition-colors"
                >
                  삭제
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 하단 힌트 ── */}
      <div
        className="shrink-0 border-t px-4 py-2 text-[10px] text-cyan-200/35"
        style={{ borderColor: "rgba(64,224,208,0.10)", background: "rgba(0,0,0,0.18)" }}
      >
        보라선 = 네비 경로 · 연두점 = 살포 예정
      </div>
    </div>
  );
}
