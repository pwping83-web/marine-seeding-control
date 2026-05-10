/**
 * RouteNavPanel.tsx — 항로 네비 + 속도 제어 (심플 재설계)
 */

import { useState, useCallback, useEffect } from "react";
import {
  findAStarRoute,
  suggestPidParams,
  KNOWN_OBSTACLES,
  type LatLng,
  type RouteResult,
  type WeatherInput,
} from "@/lib/seeding-plan-ai";
import { insertShipCommand, marineDbEnabled } from "@/lib/marine-db";

interface Props {
  vesselPos: LatLng;
  weather: WeatherInput;
  onClickModeChange: (active: boolean) => void;
  onRouteChange: (route: [number, number][] | null, dest: [number, number] | null) => void;
  clickedDest: LatLng | null;
  onCommandSent?: (cmd: string) => void;
}

export function RouteNavPanel({
  vesselPos, weather, onClickModeChange, onRouteChange, clickedDest, onCommandSent,
}: Props) {
  const [destLat, setDestLat]     = useState("");
  const [destLng, setDestLng]     = useState("");
  const [clickMode, setClickMode] = useState(false);
  const [route, setRoute]         = useState<RouteResult | null>(null);
  const [calculating, setCalc]    = useState(false);
  const [targetKt, setTargetKt]   = useState(4.5);
  const [routeSent, setRouteSent] = useState(false);
  const [speedSent, setSpeedSent] = useState(false);

  const pid = suggestPidParams(weather);

  // 지도 클릭 → 목적지 자동 채움
  useEffect(() => {
    if (!clickedDest) return;
    setDestLat(clickedDest.lat.toFixed(5));
    setDestLng(clickedDest.lng.toFixed(5));
    setClickMode(false);
    onClickModeChange(false);
  }, [clickedDest, onClickModeChange]);

  const toggleClick = useCallback(() => {
    const next = !clickMode;
    setClickMode(next);
    onClickModeChange(next);
  }, [clickMode, onClickModeChange]);

  const calcRoute = useCallback(() => {
    const lat = parseFloat(destLat);
    const lng = parseFloat(destLng);
    if (!isFinite(lat) || !isFinite(lng)) return;
    setCalc(true);
    setTimeout(() => {
      try {
        const r = findAStarRoute(vesselPos, { lat, lng });
        setRoute(r);
        onRouteChange(r.waypoints.map((w) => [w.lat, w.lng]), [lat, lng]);
      } finally { setCalc(false); }
    }, 80);
  }, [destLat, destLng, vesselPos, onRouteChange]);

  const clearRoute = useCallback(() => {
    setRoute(null);
    setDestLat(""); setDestLng("");
    onRouteChange(null, null);
  }, [onRouteChange]);

  const sendRoute = useCallback(() => {
    if (!route) return;
    const pts = route.waypoints.slice(0, 5).map((w) => `${w.lat.toFixed(4)},${w.lng.toFixed(4)}`).join(";");
    const cmd = `nav_route:${pts}`;
    if (marineDbEnabled()) void insertShipCommand(cmd, new Date().toISOString());
    onCommandSent?.(cmd);
    setRouteSent(true);
    setTimeout(() => setRouteSent(false), 2500);
  }, [route, onCommandSent]);

  const sendSpeed = useCallback(() => {
    const cmd = `set_speed_${targetKt.toFixed(1)}`;
    if (marineDbEnabled()) void insertShipCommand(cmd, new Date().toISOString());
    onCommandSent?.(cmd);
    setSpeedSent(true);
    setTimeout(() => setSpeedSent(false), 2500);
  }, [targetKt, onCommandSent]);

  const hasDestCoords = destLat !== "" && destLng !== "";
  const pct = ((targetKt - 1) / 6) * 100;

  return (
    <div className="flex flex-col gap-2 text-white py-1">

      {/* ━━ A. 항로 설정 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: "rgba(6,16,36,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>

        {/* 섹션 헤더 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/7">
          <span className="text-[10px] font-black text-white/60">🗺️ 항로 설정</span>
          {route && (
            <button onClick={clearRoute}
              className="text-[9px] text-white/30 hover:text-white/60 transition-colors px-1.5 py-0.5 rounded">
              경로 초기화
            </button>
          )}
        </div>

        <div className="px-3 py-2.5 flex flex-col gap-2">

          {/* 출발 → 목적지 한 줄 */}
          <div className="flex items-center gap-2">
            {/* 출발점 pill */}
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg shrink-0"
              style={{ background: "rgba(34,211,153,0.1)", border: "1px solid rgba(34,211,153,0.25)" }}>
              <span className="text-[10px]">🚢</span>
              <span className="text-[9px] font-mono text-emerald-300">{vesselPos.lat.toFixed(3)}°N</span>
            </div>

            {/* 화살표 */}
            <span className="text-white/20 text-sm shrink-0">→</span>

            {/* 목적지 입력 (클릭 모드면 강조) */}
            <div className="flex-1 flex gap-1">
              <input type="number" step="0.00001" placeholder="위도"
                value={destLat} onChange={(e) => setDestLat(e.target.value)}
                className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[9px] font-mono text-white bg-white/5 border outline-none focus:border-amber-400/60 [color-scheme:dark]"
                style={{ borderColor: clickMode ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.1)" }} />
              <input type="number" step="0.00001" placeholder="경도"
                value={destLng} onChange={(e) => setDestLng(e.target.value)}
                className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[9px] font-mono text-white bg-white/5 border outline-none focus:border-amber-400/60 [color-scheme:dark]"
                style={{ borderColor: clickMode ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.1)" }} />
            </div>
          </div>

          {/* 지도 클릭 + 장애물 안내 한 줄 */}
          <div className="flex items-center gap-2">
            <button onClick={toggleClick}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
              style={clickMode
                ? { background: "rgba(251,191,36,0.2)", color: "#fcd34d", border: "1px solid rgba(251,191,36,0.5)" }
                : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {clickMode ? "🖱️ 지도 클릭 중…" : "🖱️ 지도 클릭"}
            </button>
            <span className="text-[8px] text-red-300/50 truncate">
              ⚠️ 암초·보호구역 {KNOWN_OBSTACLES.length}곳 자동 회피
            </span>
          </div>

          {/* 경로 계산 버튼 */}
          <button onClick={calcRoute} disabled={!hasDestCoords || calculating}
            className="w-full py-2.5 rounded-xl text-[12px] font-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-35"
            style={{
              background: hasDestCoords ? "linear-gradient(135deg,#d97706,#b45309)" : "rgba(255,255,255,0.06)",
              boxShadow: hasDestCoords ? "0 3px 12px rgba(217,119,6,0.3)" : "none",
              color: hasDestCoords ? "#fff" : "rgba(255,255,255,0.3)",
            }}>
            {calculating ? "⏳ 계산 중…" : "⚡ 최적 경로 계산"}
          </button>
        </div>
      </div>

      {/* ━━ B. 경로 결과 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {route && (
        <div className="rounded-xl overflow-hidden"
          style={{ background: "rgba(6,16,36,0.95)", border: "1px solid rgba(245,158,11,0.35)" }}>

          {/* 3개 수치 스트립 */}
          <div className="grid grid-cols-3 divide-x divide-white/8">
            {[
              { icon: "📏", val: `${route.totalDistKm}`, unit: "km", label: "거리" },
              { icon: "⏱️", val: `${route.estTimeMin}`, unit: "분", label: "예상 시간" },
              { icon: "🛡️", val: `${route.obstaclesAvoided}`, unit: "곳", label: "회피" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center py-2.5">
                <span className="text-base leading-none mb-1">{s.icon}</span>
                <span className="text-[16px] font-black text-amber-300 leading-none">
                  {s.val}<span className="text-[9px] font-normal text-white/30 ml-0.5">{s.unit}</span>
                </span>
                <span className="text-[8px] text-white/25 mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>

          {/* 전송 버튼 */}
          <div className="px-3 pb-3">
            <button onClick={sendRoute}
              className="w-full py-2 rounded-xl text-[11px] font-black transition-all hover:brightness-110 active:scale-[0.98]"
              style={{
                background: routeSent ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.15)",
                border: `1px solid ${routeSent ? "rgba(16,185,129,0.5)" : "rgba(245,158,11,0.4)"}`,
                color: routeSent ? "#34d399" : "#fcd34d",
              }}>
              {routeSent ? "✓ 선박 전송 완료" : "📡 선박에 경로 전송"}
            </button>
          </div>
        </div>
      )}

      {/* ━━ C. 속도 제어 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: "rgba(6,16,36,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>

        <div className="px-3 pt-3 pb-2 flex flex-col gap-3">
          {/* 속도 대형 표시 */}
          <div className="flex items-end justify-between">
            <span className="text-[10px] font-black text-white/45">⚙️ 목표 속도</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] font-black text-cyan-300 leading-none tabular-nums">
                {targetKt.toFixed(1)}
              </span>
              <span className="text-[12px] text-cyan-400 font-bold">kt</span>
              <span className="text-[9px] text-white/25 mb-0.5">
                ({(targetKt * 1.852).toFixed(1)} km/h)
              </span>
            </div>
          </div>

          {/* 슬라이더 */}
          <div>
            <input type="range" min={1} max={7} step={0.5} value={targetKt}
              onChange={(e) => setTargetKt(Number(e.target.value))}
              className="w-full h-2.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(90deg, #06b6d4 ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
                accentColor: "#06b6d4",
              }} />
            <div className="flex justify-between text-[8px] text-white/20 mt-1 px-0.5">
              <span>저속 1kt</span><span>표준 4kt</span><span>고속 7kt</span>
            </div>
          </div>

          {/* PID 한 줄 (툴팁으로 상세) */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            title={`Kp ${pid.Kp} · Ki ${pid.Ki} · Kd ${pid.Kd} · 샘플 ${pid.sampleMs}ms`}>
            <span className="text-[10px]">⚙️</span>
            <span className="text-[9px] text-white/35 flex-1">PID 자동 계산됨</span>
            <span className="text-[9px] font-mono text-cyan-400/60">
              Kp{pid.Kp} Ki{pid.Ki} Kd{pid.Kd}
            </span>
          </div>

          {/* 전송 버튼 */}
          <button onClick={sendSpeed}
            className="w-full py-2.5 rounded-xl text-[12px] font-black transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background: speedSent ? "rgba(16,185,129,0.25)" : "linear-gradient(135deg,#0891b2,#0e7490)",
              border: `1px solid ${speedSent ? "rgba(16,185,129,0.5)" : "rgba(8,145,178,0.4)"}`,
              color: speedSent ? "#34d399" : "#fff",
              boxShadow: speedSent ? "none" : "0 2px 10px rgba(8,145,178,0.25)",
            }}>
            {speedSent
              ? `✓ ${targetKt.toFixed(1)}kt 명령 전송됨`
              : `📡 ${targetKt.toFixed(1)} kt 속도 명령 전송`}
          </button>
        </div>
      </div>

    </div>
  );
}
