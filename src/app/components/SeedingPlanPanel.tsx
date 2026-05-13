/**
 * SeedingPlanPanel.tsx
 *
 * AI 기반 종자 살포 계획 패널
 *  · 일일 살포 한도 (기상 조건 연동)
 *  · 최적 배포 위치 TOP5 추천 (수심·수온·해류 시뮬 포함)
 *  · A* 최적 항로 계산 (암초·보호구역 회피)
 *  · Arduino PID 속도 파라미터 제안
 */

import { useState, useEffect, useCallback } from "react";
import {
  calcDailyLimit,
  rankSeedingZones,
  findAStarRoute,
  suggestPidParams,
  generatePidSketch,
  KNOWN_OBSTACLES,
  type WeatherInput,
  type DailyLimitResult,
  type SeaZone,
  type RouteResult,
  type PidParams,
  type LatLng,
} from "@/lib/seeding-plan-ai";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  weather: WeatherInput;
  vesselPos: LatLng;
  /** 최적 존 선택 시 외부(지도)로 전달 */
  onZoneSelect?: (zone: SeaZone) => void;
  /** A* 경로 계산 완료 시 외부(지도)로 전달 */
  onRouteCalc?: (route: RouteResult) => void;
}

// ─── 색상 헬퍼 ───────────────────────────────────────────────────────────────

function gradeColor(grade: SeaZone["grade"]) {
  switch (grade) {
    case "최적": return { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.5)", text: "#34d399" };
    case "양호": return { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.5)", text: "#60a5fa" };
    case "보통": return { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.4)", text: "#fcd34d" };
    default:     return { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.4)",  text: "#fca5a5" };
  }
}

function limitColor(reductionPct: number) {
  if (reductionPct >= 0.7) return { bg: "rgba(120,0,0,0.6)",   border: "rgba(239,68,68,0.5)",   text: "#fca5a5" };
  if (reductionPct >= 0.3) return { bg: "rgba(90,55,0,0.6)",   border: "rgba(251,191,36,0.5)",  text: "#fcd34d" };
  return               { bg: "rgba(0,55,20,0.6)",   border: "rgba(16,185,129,0.5)",  text: "#34d399" };
}

// ─── 섹션 접이식 헤더 ────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, open, onToggle, badge,
}: {
  icon: string; title: string; open: boolean; onToggle: () => void; badge?: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/5 rounded-lg"
    >
      <span className="flex items-center gap-2 text-[11px] font-bold text-white/80">
        <span>{icon}</span>{title}
        {badge && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            {badge}
          </span>
        )}
      </span>
      <span className="text-white/30 text-[10px]">{open ? "▲" : "▼"}</span>
    </button>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function SeedingPlanPanel({ weather, vesselPos, onZoneSelect, onRouteCalc }: Props) {
  const [limitResult, setLimitResult] = useState<DailyLimitResult | null>(null);
  const [zones, setZones]             = useState<SeaZone[]>([]);
  const [route, setRoute]             = useState<RouteResult | null>(null);
  const [pid, setPid]                 = useState<PidParams | null>(null);
  const [pidCode, setPidCode]         = useState("");
  const [selectedZone, setSelectedZone] = useState<SeaZone | null>(null);

  const [openLimit,   setOpenLimit]   = useState(true);
  const [openZones,   setOpenZones]   = useState(true);
  const [openRoute,   setOpenRoute]   = useState(false);
  const [openPid,     setOpenPid]     = useState(false);
  const [showPidCode, setShowPidCode] = useState(false);
  const [copied,      setCopied]      = useState(false);

  // 기상 변화 시 재계산
  useEffect(() => {
    const limit = calcDailyLimit(weather);
    setLimitResult(limit);

    const ranked = rankSeedingZones(weather);
    setZones(ranked);

    const pidP = suggestPidParams(weather);
    setPid(pidP);
    setPidCode(generatePidSketch(pidP));
  }, [weather.windSpeed, weather.windGust, weather.waveHeight, weather.visibility, weather.temp]);

  // 존 선택 → A* 경로 계산
  const handleZoneSelect = useCallback((zone: SeaZone) => {
    setSelectedZone(zone);
    onZoneSelect?.(zone);
    const result = findAStarRoute(vesselPos, { lat: zone.lat, lng: zone.lng }, weather);
    setRoute(result);
    onRouteCalc?.(result);
    setOpenRoute(true);
  }, [vesselPos, weather, onZoneSelect, onRouteCalc]);

  const copyPid = () => {
    navigator.clipboard.writeText(pidCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!limitResult) return null;
  const lc = limitColor(limitResult.reductionPct);
  const top3 = zones.slice(0, 5);

  return (
    <div className="flex flex-col gap-1 text-white select-none">

      {/* ── 1. 일일 살포 한도 ─────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(4,14,36,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <SectionHeader
          icon="📊" title="오늘의 살포 한도"
          open={openLimit} onToggle={() => setOpenLimit((v) => !v)}
          badge={limitResult.limit === 0 ? "출항불가" : `${limitResult.limit.toLocaleString()}개`}
        />
        {openLimit && (
          <div className="px-3 pb-3 flex flex-col gap-2">
            {/* 한도 게이지 */}
            <div className="rounded-lg p-3 flex items-center gap-3"
              style={{ background: lc.bg, border: `1px solid ${lc.border}` }}>
              <div className="text-center">
                <p className="text-[28px] font-black leading-none" style={{ color: lc.text }}>
                  {limitResult.limit.toLocaleString()}
                </p>
                <p className="text-[9px] text-white/40 mt-0.5">개 / 기준 {limitResult.baseLimit.toLocaleString()}</p>
              </div>
              <div className="flex-1">
                {/* 진행바 */}
                <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-1.5">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${100 - limitResult.reductionPct * 100}%`,
                      background: `linear-gradient(90deg, ${lc.text}, ${lc.border})`,
                    }} />
                </div>
                <p className="text-[10px]" style={{ color: lc.text }}>
                  {limitResult.reductionPct === 0 ? "기상 최적 — 최대 가동"
                    : limitResult.limit === 0 ? "출항 불가 — 전면 중단"
                    : `${Math.round((1 - limitResult.reductionPct) * 100)}% 가동 · 안전조업 ${limitResult.safeHours}h`}
                </p>
              </div>
            </div>
            {/* 인수 요인 */}
            <div className="grid grid-cols-2 gap-1">
              {limitResult.factors.map((f) => (
                <div key={f.name} className="rounded-lg px-2 py-1.5 flex items-start gap-1.5"
                  title={f.desc}
                  style={{
                    background: f.penalty >= 0.6 ? "rgba(120,0,0,0.4)" : f.penalty >= 0.1 ? "rgba(80,45,0,0.4)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${f.penalty >= 0.6 ? "rgba(239,68,68,0.3)" : f.penalty >= 0.1 ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.07)"}`,
                  }}>
                  <span className="text-sm leading-none shrink-0">{f.icon}</span>
                  <div>
                    <p className="text-[9px] font-bold text-white/60">{f.name}</p>
                    <p className="text-[9px] leading-tight"
                      style={{ color: f.penalty >= 0.6 ? "#fca5a5" : f.penalty >= 0.1 ? "#fcd34d" : "#86efac" }}>
                      {f.penalty === 0 ? "양호" : `−${Math.round(f.penalty * 100)}%`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. 최적 위치 추천 ─────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(4,14,36,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <SectionHeader
          icon="📍" title="AI 최적 배포 위치"
          open={openZones} onToggle={() => setOpenZones((v) => !v)}
          badge="TOP 5"
        />
        {openZones && (
          <div className="px-3 pb-3 flex flex-col gap-1.5">
            <p className="text-[9px] text-white/30 mb-0.5">
              수심·수온·해류 시뮬 분석 · 클릭 시 A* 경로 계산
            </p>
            {top3.map((z, i) => {
              const gc = gradeColor(z.grade);
              const isSelected = selectedZone?.id === z.id;
              return (
                <button
                  key={z.id}
                  onClick={() => handleZoneSelect(z)}
                  className="w-full text-left rounded-lg px-2.5 py-2 transition-all hover:brightness-125 active:scale-[0.98]"
                  style={{
                    background: isSelected ? gc.bg + "cc" : gc.bg,
                    border: `1px solid ${isSelected ? gc.text : gc.border}`,
                    boxShadow: isSelected ? `0 0 10px ${gc.text}30` : "none",
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-black text-white/30">#{i + 1}</span>
                      <span className="text-[11px] font-bold" style={{ color: gc.text }}>{z.label}</span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black"
                        style={{ background: gc.bg, color: gc.text, border: `1px solid ${gc.border}` }}>
                        {z.grade}
                      </span>
                    </div>
                    <span className="text-[13px] font-black" style={{ color: gc.text }}>{z.score}점</span>
                  </div>
                  {/* 수심·수온·해류 */}
                  <div className="flex gap-2 text-[9px] text-white/50">
                    <span title={`수심 ${z.depthM.toFixed(1)}m`}>🌊 {z.depthM.toFixed(1)}m</span>
                    <span title={`수온 ${z.tempC}°C`}>🌡️ {z.tempC}°C</span>
                    <span title={`해류 ${z.currentSpeedMs}m/s`}>🌀 {z.currentSpeedMs}m/s</span>
                    <span className="ml-auto font-mono text-[8px] text-white/25">
                      {z.lat.toFixed(3)}°N {z.lng.toFixed(3)}°E
                    </span>
                  </div>
                  {/* 주요 이유 1개 */}
                  {z.reasons[0] && (
                    <p className="text-[9px] mt-1 truncate" style={{ color: gc.text + "99" }}>
                      {z.reasons[0]}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. A* 최적 항로 ───────────────────────────────────────────────── */}
      {route && (
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(4,14,36,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <SectionHeader
            icon="🗺️" title="AI 추천 항로 (A*)"
            open={openRoute} onToggle={() => setOpenRoute((v) => !v)}
            badge={`${route.totalDistKm}km`}
          />
          {openRoute && (
            <div className="px-3 pb-3 flex flex-col gap-2">
              {/* 요약 */}
              <div className="grid grid-cols-3 gap-1">
                {[
                  { icon: "📏", label: "총 거리", val: `${route.totalDistKm} km` },
                  { icon: "⏱️", label: "예상 시간", val: `${route.estTimeMin}분` },
                  { icon: "⚠️", label: "회피 장애물", val: `${route.obstaclesAvoided}곳` },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg p-2 text-center"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-sm">{s.icon}</p>
                    <p className="text-[11px] font-bold text-cyan-300">{s.val}</p>
                    <p className="text-[8px] text-white/30">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* 장애물 목록 */}
              <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p className="text-[9px] font-bold text-red-300 mb-1">⚠️ 장애물 (A* 회피 대상)</p>
                {KNOWN_OBSTACLES.map((obs) => (
                  <p key={obs.name} className="text-[9px] text-white/40">
                    · {obs.name} — 반경 {obs.radiusKm * 1000}m
                  </p>
                ))}
              </div>
              {/* 경유점 */}
              <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto pr-0.5"
                style={{ scrollbarWidth: "thin", scrollbarColor: "#1e3a5f transparent" }}>
                {route.waypoints.map((wp) => (
                  <div key={wp.seq} className="flex items-center gap-2 text-[9px] font-mono">
                    <span className="w-4 text-center text-white/25 shrink-0">#{wp.seq}</span>
                    <span className="text-white/50">{wp.lat.toFixed(4)}°N</span>
                    <span className="text-white/50">{wp.lng.toFixed(4)}°E</span>
                    {wp.distKm > 0 && (
                      <span className="ml-auto text-white/25">+{wp.distKm}km</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4. Arduino PID 파라미터 ───────────────────────────────────────── */}
      {pid && (
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(4,14,36,0.95)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <SectionHeader
            icon="⚙️" title="Arduino PID 속도 제어"
            open={openPid} onToggle={() => setOpenPid((v) => !v)}
            badge={`${pid.targetSpeedKt}kt`}
          />
          {openPid && (
            <div className="px-3 pb-3 flex flex-col gap-2">
              <p className="text-[9px] text-white/40">{pid.desc}</p>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: "Kp", val: pid.Kp, tip: "비례 — 오차에 즉각 반응" },
                  { label: "Ki", val: pid.Ki, tip: "적분 — 지속 편차 제거" },
                  { label: "Kd", val: pid.Kd, tip: "미분 — 변화율 감쇠" },
                  { label: "ms", val: pid.sampleMs, tip: `샘플 주기 ${pid.sampleMs}ms` },
                ].map((p) => (
                  <div key={p.label} title={p.tip}
                    className="rounded-lg p-2 text-center cursor-default"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] text-white/30 mb-0.5">{p.label}</p>
                    <p className="text-[13px] font-black text-cyan-300">{p.val}</p>
                  </div>
                ))}
              </div>
              {/* 코드 토글 */}
              <button
                onClick={() => setShowPidCode((v) => !v)}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-cyan-400 hover:bg-cyan-900/20 transition-colors"
                style={{ border: "1px solid rgba(64,224,208,0.25)" }}
              >
                <span>📋 Arduino 코드 {showPidCode ? "접기" : "펼치기"}</span>
                <span>{showPidCode ? "▲" : "▼"}</span>
              </button>
              {showPidCode && (
                <div className="relative">
                  <pre className="text-[9px] text-green-300 font-mono p-2.5 rounded-lg overflow-x-auto max-h-48 overflow-y-auto leading-relaxed"
                    style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.07)", scrollbarWidth: "thin", scrollbarColor: "#1e3a5f transparent" }}>
                    {pidCode}
                  </pre>
                  <button
                    onClick={copyPid}
                    className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded text-[8px] font-bold transition-colors"
                    style={{ background: copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.1)", color: copied ? "#34d399" : "#aaa" }}>
                    {copied ? "✓ 복사됨" : "복사"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
