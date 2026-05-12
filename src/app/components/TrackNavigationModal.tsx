import { useEffect, useState } from "react";
import { CheckCircle2, MapPin, MapPinned, Navigation2, RotateCcw, Ship, Sprout, X } from "lucide-react";
import { parseLatLngTrackInput } from "@/lib/track-navigation";

export type TrackNavStats = {
  distKm: number;
  bearing: number;
  wptLabel: string;
} | null;

export type TrackNavigationModalProps = {
  open: boolean;
  onClose: () => void;
  /** 열 때 텍스트 영역에 채울 기본 줄(금일 항적 등) */
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
  /** 지도 클릭 편집: 항로 꼭짓점 / 살포 예정점 */
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
  const [routeAppliedBanner, setRouteAppliedBanner] = useState(false);

  useEffect(() => {
    if (open) setText(defaultLines);
  }, [open, defaultLines]);

  useEffect(() => {
    if (!open) setRouteAppliedBanner(false);
  }, [open]);

  useEffect(() => {
    if (navActive) setRouteAppliedBanner(false);
  }, [navActive]);

  if (!open) return null;

  /** 지도에서 점을 찍는 동안은 큰 모달을 숨기고, 지도만 보이게 한 뒤 하단에서만 종료 */
  const mapEditActive = routeMapEditorMode === "waypoints" || routeMapEditorMode === "seedPlan";
  const draftPointCount = parseLatLngTrackInput(text).length;

  if (mapEditActive) {
    const isWaypoints = routeMapEditorMode === "waypoints";
    return (
      <div className="fixed inset-0 z-[997] pointer-events-none" aria-hidden={false}>
        <div
          role="region"
          aria-label={isWaypoints ? "항로 꼭짓점 찍기 중" : "살포 예정점 찍기 중"}
          className="pointer-events-auto fixed bottom-6 left-1/2 z-[998] flex w-[min(92vw,22rem)] -translate-x-1/2 flex-col gap-2.5 rounded-2xl border px-4 py-3 shadow-2xl"
          style={{
            background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
            borderColor: "rgba(64,224,208,0.35)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          }}
        >
          <p className="text-[12px] font-bold leading-snug text-white">
            {isWaypoints ? "지도를 클릭해 항로 꼭짓점을 추가하세요." : "지도를 클릭해 살포 예정점을 추가하세요."}
          </p>
          <p className="text-[10.5px] leading-snug text-cyan-100/75">
            끝나면 아래 버튼을 누르면 경로 설정 안내 창이 다시 열립니다.
          </p>
          <button
            type="button"
            onClick={() => onRouteMapEditorMode(null)}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-bold transition-colors ${
              isWaypoints
                ? "border-teal-300/55 bg-teal-600/40 text-teal-50 hover:bg-teal-600/55"
                : "border-lime-300/50 bg-lime-800/35 text-lime-50 hover:bg-lime-700/45"
            }`}
          >
            {isWaypoints ? "항로 설정 끄기" : "살포 예정 설정 끄기"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-center text-[11px] font-semibold text-white/50 underline-offset-2 transition-colors hover:text-white/75 hover:underline"
          >
            경로 설정 안내 닫기
          </button>
        </div>
      </div>
    );
  }

  const handleApply = () => {
    const pts = parseLatLngTrackInput(text);
    if (pts.length < 2) {
      window.alert("유효한 위도·경도가 2개 이상 필요합니다.\n예: 34.712000, 128.591000");
      return;
    }
    onApplyManualPath(pts);
    setRouteAppliedBanner(true);
  };

  return (
    <div className="fixed inset-0 z-[997] flex items-start justify-center overflow-y-auto p-4 py-6 sm:items-center sm:py-8">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-nav-title"
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
          border: "1px solid rgba(64,224,208,0.22)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "rgba(64,224,208,0.15)", background: "rgba(0,0,0,0.2)" }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Navigation2 className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
            <div className="min-w-0">
              <h2 id="track-nav-title" className="truncate text-sm font-bold text-white">
                항로 길안내
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 space-y-3 overflow-visible px-4 py-3">
          {routeAppliedBanner && !navActive ? (
            <div
              className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] leading-snug text-emerald-50"
              style={{ borderColor: "rgba(52,211,153,0.45)", background: "rgba(6,78,59,0.35)" }}
              role="status"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
              <div>
                <p className="font-bold text-emerald-100">경로가 설정되었습니다</p>
                <p className="mt-0.5 text-[11px] text-emerald-100/80">
                  아래 「안내 시작」을 누르면 자동차 내비처럼 안내를 시작합니다. 지도 왼쪽에 다음 경유지까지 거리가 크게 표시됩니다.
                </p>
              </div>
            </div>
          ) : null}
          <div className="rounded-lg border px-2.5 py-2 text-[11px] leading-snug text-cyan-100/80" style={{ borderColor: "rgba(64,224,208,0.2)", background: "rgba(0,0,0,0.12)" }}>
            <span className="font-semibold text-teal-200/90">입력 형식: </span>
            한 줄에 위도, 경도 (쉼표·공백·탭). 주석은 <code className="text-cyan-200/90">#</code> 로 시작.
            <br />
            지도에 반영된 경로 <span className="font-mono text-amber-200/90">{pathPointCount}</span>점
            {hasManualTrack ? " · 수동 입력 경로 사용 중" : " · 금일 자동 항적 기준"}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <label
              htmlFor="track-nav-latlng-textarea"
              className="text-[11px] font-semibold text-cyan-200/70"
            >
              위도·경도 (줄 단위){" "}
              <span className="font-normal text-cyan-200/55">(수기 수정 가능)</span>
            </label>
            <span
              className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-amber-200/90"
              aria-live="polite"
              title="입력란에서 형식에 맞게 읽힌 위도·경도 줄 수"
            >
              총 {draftPointCount}점
            </span>
          </div>
          <textarea
            id="track-nav-latlng-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={8}
            className="max-h-[13rem] min-h-[7rem] w-full resize-y overflow-y-auto rounded-lg border px-3 py-2 font-mono text-[12px] text-cyan-50 outline-none transition-[border,box-shadow] [color-scheme:dark] focus:ring-2 focus:ring-teal-400/25"
            style={{
              background: "rgba(8, 27, 52, 0.85)",
              borderColor: "rgba(64,224,208,0.22)",
            }}
            placeholder={"34.712000, 128.591000\n34.715000, 128.595000"}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/35 bg-teal-500/15 px-3 py-2 text-[12px] font-bold text-teal-50 transition-colors hover:bg-teal-500/25"
            >
              <MapPinned className="h-4 w-4" aria-hidden />
              경로 확정
            </button>
            <button
              type="button"
              onClick={() => setText(defaultLines)}
              className="rounded-lg border border-white/15 px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/10"
            >
              금일 좌표로 채우기
            </button>
            {hasManualTrack ? (
              <button
                type="button"
                onClick={onClearManualPath}
                className="rounded-lg border border-white/15 px-3 py-2 text-[11px] font-semibold text-rose-200/90 hover:bg-rose-500/15"
              >
                수동 경로 지우기
              </button>
            ) : null}
          </div>

          <div
            className="rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed text-cyan-100/85"
            style={{ borderColor: "rgba(64,224,208,0.22)", background: "rgba(0,0,0,0.1)" }}
          >
            <p className="mb-2 font-bold text-cyan-50">지도에서 경로·살포 예정</p>
            <div className="mb-2 space-y-2.5 text-[10.5px] leading-relaxed text-cyan-100/82 sm:text-[11px]">
              <div className="rounded-md border border-white/[0.06] bg-black/15 px-2.5 py-2">
                <p className="mb-1 font-bold text-teal-200/95">항로</p>
                <ul className="list-none space-y-1 pl-0">
                  <li className="flex gap-1.5">
                    <span className="shrink-0 text-teal-400/80">·</span>
                    <span>「항로 꼭짓점 찍기」 켠 뒤 지도 클릭 → 점 추가</span>
                  </li>
                  <li className="flex gap-1.5">
                    <span className="shrink-0 text-teal-400/80">·</span>
                    <span>위 칸에 위·경도 입력 → 「경로 확정」</span>
                  </li>
                  <li className="flex gap-1.5">
                    <span className="shrink-0 text-teal-400/80">·</span>
                    <span>「금일 좌표로 채우기」 후에도 동일하게 확정 가능</span>
                  </li>
                  <li className="flex gap-1.5">
                    <span className="shrink-0 text-teal-400/80">·</span>
                    <span>마커를 누르면 위·경도 수정·삭제</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-black/15 px-2.5 py-2">
                <p className="mb-1 font-bold text-lime-200/90">살포 예정</p>
                <ul className="list-none space-y-1 pl-0">
                  <li className="flex gap-1.5">
                    <span className="shrink-0 text-lime-400/75">·</span>
                    <span>항로 2점 이상일 때만 사용</span>
                  </li>
                  <li className="flex gap-1.5">
                    <span className="shrink-0 text-lime-400/75">·</span>
                    <span>「경로 따라 균등 배치」 또는 「살포 예정 찍기」</span>
                  </li>
                  <li className="flex gap-1.5">
                    <span className="shrink-0 text-lime-400/75">·</span>
                    <span className="text-cyan-100/70">예정 점은 참고용 · 실제 살포 기록은 선박 위치 기준</span>
                  </li>
                </ul>
              </div>
            </div>
            <p className="mb-2 rounded-lg border border-teal-400/25 bg-black/20 px-2.5 py-1.5 text-[10.5px] font-semibold leading-snug text-teal-100/90">
              「항로 꼭짓점 찍기」「살포 예정 찍기」를 누르면 창이 잠시 숨겨지고 지도만 보입니다. 끝나면 하단의 설정 끄기로 다시 이 창을 띄웁니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onRouteMapEditorMode(routeMapEditorMode === "waypoints" ? null : "waypoints")
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  routeMapEditorMode === "waypoints"
                    ? "border-teal-300/60 bg-teal-600/35 text-teal-50"
                    : "border-white/15 bg-white/[0.06] text-white/85 hover:bg-white/10"
                }`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {routeMapEditorMode === "waypoints" ? "항로 찍기 끄기" : "항로 꼭짓점 찍기"}
              </button>
              <button
                type="button"
                onClick={() => onRouteMapEditorMode(routeMapEditorMode === "seedPlan" ? null : "seedPlan")}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  routeMapEditorMode === "seedPlan"
                    ? "border-lime-300/55 bg-lime-700/30 text-lime-50"
                    : "border-white/15 bg-white/[0.06] text-white/85 hover:bg-white/10"
                }`}
              >
                <Sprout className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {routeMapEditorMode === "seedPlan" ? "살포 예정 찍기 끄기" : "살포 예정 찍기"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-white/[0.08] pt-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-cyan-200/60">균등 살포 예정 개수</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={plannedSeedEvenCountStr}
                  onChange={(e) => onPlannedSeedEvenCountStrChange(e.target.value)}
                  className="w-20 rounded-md border px-2 py-1 font-mono text-[12px] text-cyan-50 outline-none [color-scheme:dark]"
                  style={{ background: "rgba(8, 27, 52, 0.85)", borderColor: "rgba(64,224,208,0.22)" }}
                />
              </label>
              <button
                type="button"
                onClick={onPlannedSeedEvenDistribute}
                className="rounded-lg border border-lime-400/35 bg-lime-900/25 px-2.5 py-1.5 text-[11px] font-bold text-lime-100 hover:bg-lime-800/35"
              >
                경로 따라 균등 배치
              </button>
              <button
                type="button"
                onClick={onPlannedSeedsClear}
                className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/10"
              >
                예정점 전체 삭제 ({plannedSeedPointCount})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
            <button
              type="button"
              onClick={onToggleNav}
              disabled={pathPointCount < 2}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-[12px] font-bold text-amber-50 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Ship className="h-4 w-4" aria-hidden />
              {navActive ? "안내 종료" : "안내 시작"}
            </button>
            <button
              type="button"
              onClick={onResetOrigin}
              disabled={pathPointCount < 2}
              title="경로의 첫 구간부터 다시 안내(목표 지점 인덱스 초기화)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-950/40 px-3 py-2 text-[12px] font-bold text-cyan-50 transition-colors hover:bg-cyan-800/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              원위치(경로 처음)
            </button>
          </div>

          {navActive && navStats ? (
            <div
              className="rounded-xl border px-3 py-3 text-[12px]"
              style={{ borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.1)" }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/75">안내 중</p>
              <p className="mt-1 font-mono text-2xl font-black tabular-nums text-white">
                {navStats.distKm < 1
                  ? `${Math.max(0, Math.round(navStats.distKm * 1000))} m`
                  : `${navStats.distKm.toFixed(2)} km`}
              </p>
              <p className="mt-1 text-[11px] text-amber-50/95">
                <span className="font-bold text-amber-100">{navStats.wptLabel}</span> 방향 · 진북{" "}
                <span className="font-mono font-bold">{String(navStats.bearing).padStart(3, "0")}°</span>
              </p>
              {arrivedFinal ? (
                <p className="mt-2 border-t border-amber-400/25 pt-2 text-[11px] font-semibold text-emerald-300">
                  목적지 부근입니다. 안내를 종료해도 됩니다.
                </p>
              ) : (
                <p className="mt-2 text-[10px] text-cyan-100/55">지도 왼쪽 오버레이와 동일 정보가 표시됩니다.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t px-4 py-2.5 text-[10px] text-cyan-200/50" style={{ borderColor: "rgba(64,224,208,0.12)", background: "rgba(0,0,0,0.18)" }}>
          보라·내비 경로 / 연두·살포 예정(참고)
        </div>
      </div>
    </div>
  );
}
