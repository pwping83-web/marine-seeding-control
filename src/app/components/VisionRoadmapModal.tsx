/**
 * VisionRoadmapModal.tsx — 관공서 심플 설명용 무인화 고도화 모달
 */

import { useState, useEffect, useRef } from "react";

// ─── CCTV 화면 미리보기 ───────────────────────────────────────────────────────

function CctvPreview({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    let raf: number;
    const draw = () => {
      const img = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() < 0.88 ? 0 : Math.floor(Math.random() * 25);
        img.data[i] = v; img.data[i+1] = v+3; img.data[i+2] = v+7; img.data[i+3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ background: "#000", aspectRatio: "4/3" }}>
      <canvas ref={canvasRef} width={160} height={120} className="w-full h-full opacity-20" />
      <div className="absolute inset-0 flex flex-col justify-between p-1.5">
        <div className="flex items-center gap-1 self-start rounded px-2 py-1"
          style={{ background: "rgba(239,68,68,0.3)", border: "1px solid rgba(239,68,68,0.5)" }}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400 animate-pulse" />
          <span className="text-xs font-black text-red-300">녹화</span>
        </div>
        <p className="text-center text-xs text-white/50">{label}</p>
      </div>
      {/* 개발예정 오버레이 */}
      <div className="absolute inset-0 flex items-center justify-center rounded-lg"
        style={{ background: "rgba(4,12,30,0.75)", backdropFilter: "blur(3px)" }}>
        <span className="rounded-full border border-indigo-500/50 px-3 py-1.5 text-sm font-black text-indigo-200 animate-pulse sm:text-base"
          style={{ background: "rgba(99,102,241,0.15)" }}>개발 예정</span>
      </div>
    </div>
  );
}

// ─── RC 조종패드 미리보기 ─────────────────────────────────────────────────────

function RcPreview() {
  const [held, setHeld] = useState("");
  const btns = [
    { key: "up",    label: "▲", row: 0, col: 1 },
    { key: "left",  label: "◄", row: 1, col: 0 },
    { key: "stop",  label: "■", row: 1, col: 1 },
    { key: "right", label: "►", row: 1, col: 2 },
    { key: "down",  label: "▼", row: 2, col: 1 },
  ];
  return (
    <div className="relative flex flex-col items-center gap-2 rounded-xl p-4"
      style={{ background: "rgba(8,20,44,0.9)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-sm text-white/40">방향 조종 패드</p>
      {[0,1,2].map((row) => (
        <div key={row} className="flex gap-1.5">
          {[0,1,2].map((col) => {
            const b = btns.find(b => b.row === row && b.col === col);
            if (!b) return <div key={col} className="w-10 h-10" />;
            const on = held === b.key;
            return (
              <button key={b.key}
                onMouseDown={() => setHeld(b.key)} onMouseUp={() => setHeld("")} onMouseLeave={() => setHeld("")}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black select-none transition-all"
                style={{
                  background: on ? "rgba(6,182,212,0.35)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${on ? "rgba(6,182,212,0.7)" : "rgba(255,255,255,0.12)"}`,
                  color: on ? "#22d3ee" : "#ffffff50",
                  transform: on ? "scale(0.9)" : "scale(1)",
                }}>
                {b.label}
              </button>
            );
          })}
        </div>
      ))}
      {/* 개발예정 오버레이 */}
      <div className="absolute inset-0 flex items-center justify-center rounded-xl"
        style={{ background: "rgba(4,12,30,0.72)", backdropFilter: "blur(3px)" }}>
        <span className="rounded-full border border-amber-500/50 px-3 py-1.5 text-sm font-black text-amber-200 animate-pulse sm:text-base"
          style={{ background: "rgba(245,158,11,0.15)" }}>개발 예정</span>
      </div>
    </div>
  );
}

// ─── 고도화 단계(비전) 데이터 ─────────────────────────────────────────────────

const PHASES = [
  {
    num: 1, title: "1단계 · 현재 운영 중", color: "#34d399", status: "done" as const,
    icon: "✅",
    summary: "AI가 기상을 판단하고, 관제탑↔선박이 실시간 양방향 통신합니다.",
    items: [
      "기상청 API → AI 8시간 예측 · 출항 가부 자동 판정",
      "AI기상 위험 상황 자동 요약 리포트",
      "관제탑 긴급명령 4종 전송 (회항·사이렌·위치보고·확인)",
      "선박 SOS 물리 버튼 → 관제탑 즉시 수신 (아두이노 연동)",
      "AI 최적 살포 위치 TOP5 추천 · A* 장애물 회피 경로",
      "PID 속도 자동 제어 · 살포 이력 CSV 실시간 기록",
    ],
  },
  {
    num: 2, title: "2단계 · 개발 예정", color: "#a78bfa", status: "next" as const,
    icon: "🔧",
    summary: "관제탑에서 CCTV를 보며 RC카처럼 선박을 직접 원격 조종합니다.",
    items: [
      "항로 네비·속도 제어: 자동 항로·지도 목적지 지정·선속 연동 (관제웹·선박 단말)",
      "선박 CCTV 4채널 실시간 영상 관제탑 수신",
      "키보드·조이스틱으로 방향·속도 직접 제어",
      "AI 자율 운항 ↔ 수동 조종 즉시 전환",
      "GPS 이상·충돌 감지 시 자동 긴급 정지",
      "LTE + 위성 이중 통신망",
      "암초·저수심 센서(소나 등) 탐지 → 좌표 자동 기록·관제 지도 마커·경고 구역 표시 (개발 예정)",
      "공유 암초 레이어: 타 관제·선박 단말이 지도를 볼 때 항로·자율운항이 기록 좌표를 자동 회피 (개발 예정)",
    ],
  },
  {
    num: 3, title: "3단계 · 최종 목표", color: "#f59e0b", status: "future" as const,
    icon: "🎯",
    summary: "사람은 부두에서 배만 묶으면 됩니다. 나머지는 AI가 전부 합니다.",
    items: [
      "완전 무인 자율 살포 운항",
      "다중 선박 동시 군집 관제",
      "연안·공공 해양정보와 암초·저수심 데이터 연계·검증 (개발 예정)",
      "위험 작업 공정 제로화 · 중대재해처벌법 대응",
      "해수부 자율운항·스마트항만 R&D 계획",
    ],
  },
];

// ─── 탭 콘텐츠 ────────────────────────────────────────────────────────────────

function TabVision() {
  return (
    <div className="flex flex-col gap-5">
      {/* 핵심 한 줄 */}
      <div className="rounded-xl px-4 py-4 text-center sm:px-5 sm:py-4"
        style={{ background: "rgba(30,58,138,0.2)", border: "1px solid rgba(99,102,241,0.3)" }}>
        <p className="text-white font-black text-base leading-snug sm:text-lg">
          "사람은 배만 묶으면 됩니다.<br />나머지는 AI가 다 합니다."
        </p>
        <p className="text-white/40 text-xs mt-2 sm:text-sm">해수부 자율운항·스마트항만 R&D 계획과 일치</p>
      </div>

      {/* 단계별 계획 */}
      {PHASES.map((ph, i) => (
        <div key={ph.num} className="flex gap-3 sm:gap-4">
          {/* 타임라인 */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{ background: `${ph.color}20`, border: `2px solid ${ph.color}` }}>
              {ph.icon}
            </div>
            {i < PHASES.length - 1 && (
              <div className="flex-1 w-0.5 mt-1 min-h-[28px]"
                style={{ background: `linear-gradient(180deg, ${ph.color}60, ${PHASES[i+1].color}30)` }} />
            )}
          </div>

          {/* 카드 */}
          <div className="flex-1 rounded-xl p-3.5 mb-2 sm:p-4"
            style={{ background: `${ph.color}08`, border: `1px solid ${ph.color}25` }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-sm font-black sm:text-base" style={{ color: ph.color }}>{ph.title}</p>
              <span className="px-2.5 py-1 rounded-full text-xs font-black shrink-0"
                style={{
                  background: ph.status === "done" ? "rgba(16,185,129,0.2)" : ph.status === "next" ? "rgba(167,139,250,0.2)" : "rgba(245,158,11,0.15)",
                  color: ph.color,
                  border: `1px solid ${ph.color}40`,
                }}>
                {ph.status === "done" ? "구현 완료" : ph.status === "next" ? "개발 예정" : "장기 목표"}
              </span>
            </div>
            <p className="text-sm text-white/60 mb-3 leading-relaxed whitespace-pre-line sm:text-[15px]">{ph.summary}</p>
            <ul className="space-y-2">
              {ph.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-snug sm:text-[15px]"
                  style={{ color: ph.status === "done" ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.42)" }}>
                  <span className="mt-1 shrink-0 text-[10px] sm:text-xs" style={{ color: ph.color }}>◆</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      {/* 정부 키워드 */}
      <div className="flex flex-wrap gap-1.5 justify-center sm:gap-2">
        {["자율운항", "스마트항만", "무인화", "디지털전환", "중대재해 제로", "원격관제", "암초회피", "IoT", "AI"].map((kw) => (
          <span key={kw} className="px-2 py-1 rounded-full text-xs font-bold sm:text-sm"
            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
            #{kw}
          </span>
        ))}
      </div>
    </div>
  );
}

function TabCctv() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="rounded-xl p-3.5 sm:p-4" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
        <p className="mb-2 text-sm font-black text-indigo-200 sm:text-base">
          📹 CCTV 실시간 관제{" "}
          <span className="text-xs font-normal text-indigo-300/75 sm:text-sm">개발 예정</span>
        </p>
        <p className="text-sm leading-relaxed text-white/60 sm:text-[15px]">
          관제탑에서 선박 카메라 4채널을 실시간으로 봅니다. AI가 위험 상황을 자동 감지합니다.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {["선수 (앞)", "선미 (뒤)", "갑판 좌측", "엔진실"].map((cam) => (
          <div key={cam}>
            <CctvPreview label={cam} />
            <p className="mt-1 text-center text-xs text-white/45 sm:text-sm">{cam}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {["4채널 동시 송출", "야간 적외선 지원", "AI 충돌 감지 (예정)"].map((t) => (
          <span key={t} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/55 sm:text-sm"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            · {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function TabRc() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="rounded-xl p-3.5 sm:p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
        <p className="mb-2 text-sm font-black text-amber-200 sm:text-base">
          🕹️ 관제탑 원격 조종{" "}
          <span className="text-xs font-normal text-amber-300/75 sm:text-sm">개발 예정</span>
        </p>
        <p className="text-sm leading-relaxed text-white/60 sm:text-[15px]">
          CCTV 보면서 키보드·조이스틱으로 선박을 RC카처럼 직접 조종합니다.
        </p>
      </div>
      <RcPreview />
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        {[
          { icon: "⌨️", label: "키보드·방향키 조종" },
          { icon: "🎛️", label: "무인 원격 조종기 연동" },
          { icon: "🛑", label: "비상 즉시 정지" },
          { icon: "📡", label: "반응 지연 200ms 이하" },
        ].map((i) => (
          <div key={i.label} className="flex items-center gap-2 rounded-lg px-3 py-2.5 sm:py-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="text-lg shrink-0 sm:text-xl">{i.icon}</span>
            <p className="text-sm font-bold leading-snug text-white/65 sm:text-[15px]">{i.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabReef() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="rounded-xl p-3.5 sm:p-4" style={{ background: "rgba(6, 182, 212, 0.08)", border: "1px solid rgba(34, 211, 238, 0.28)" }}>
        <p className="mb-2 text-sm font-black text-cyan-200 sm:text-base">
          🪨 암초 센서 · 지도 기록 · 자동 회피{" "}
          <span className="text-xs font-normal text-cyan-300/80 sm:text-sm">개발 예정</span>
        </p>
        <p className="text-sm leading-relaxed text-white/60 sm:text-[15px]">
          선박에 장착한 <strong className="text-white/75">암초·저수심 탐지 센서</strong>(소나·해저 스캔 등)로 위험물을 발견하면
          <strong className="text-white/75"> WGS84 좌표가 자동으로 기록</strong>되고, 관제 웹 지도에 <strong className="text-white/75">암초 위치 마커·경고 구역</strong>으로
          표시됩니다. 누적 데이터는 서버·DB와 동기화해 다른 작업선·관제 사용자와 공유할 수 있도록 설계합니다.
        </p>
      </div>
      <div className="rounded-xl p-3.5 sm:p-4" style={{ background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(129, 140, 248, 0.28)" }}>
        <p className="mb-2 text-sm font-black text-indigo-200 sm:text-base">다른 사용자·선박 화면에서의 회피</p>
        <p className="text-sm leading-relaxed text-white/60 sm:text-[15px]">
          공유된 암초 레이어를 켠 상태에서 지도·항로를 보면, <strong className="text-white/75">A*·자율운항 경로 생성 시 기록된 암초 좌표를 자동으로 우회</strong>하고
          접근 시 <strong className="text-white/75">경고·감속 권고</strong>를 띄우는 흐름을 목표로 합니다. 실제 해역에서는 공공 해도·공식 수심 정보와의 정합·검증이 선행되어야 합니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["센서 이벤트 → 좌표 로그", "지도 마커·다각형 구역", "DB·권한별 공유", "항로 자동 회피(목표)"].map((t) => (
          <span
            key={t}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/55 sm:text-sm"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            · {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function TabSafety() {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="rounded-xl p-3.5 sm:p-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
        <p className="mb-2 text-sm font-black text-red-200 sm:text-base">
          🛡️ 이중 안전 장치{" "}
          <span className="text-xs font-normal text-red-300/75 sm:text-sm">개발 예정</span>
        </p>
        <p className="text-sm leading-relaxed text-white/60 sm:text-[15px]">
          위험 감지 시 AI 자율 운항 → 수동 조종 모드로 즉시 전환됩니다.
        </p>
      </div>

      {/* 모드 전환 시뮬 */}
      <div className="rounded-xl p-3.5 sm:p-4" style={{ background: "rgba(8,20,44,0.9)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="mb-3 text-center text-sm font-semibold text-white/45 sm:text-base">운항 모드 전환</p>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 cursor-pointer rounded-xl p-3 text-center transition-all sm:p-4" onClick={() => setMode("auto")}
            style={{ background: mode === "auto" ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${mode === "auto" ? "rgba(16,185,129,0.6)" : "rgba(255,255,255,0.1)"}` }}>
            <p className="mb-1 text-2xl sm:text-3xl">🤖</p>
            <p className="text-sm font-black sm:text-base" style={{ color: mode === "auto" ? "#34d399" : "#ffffff40" }}>AI 자율 운항</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-0.5 text-white/30">
            <p className="text-base">⚡</p>
            <p className="text-xs font-semibold">즉시</p>
          </div>
          <div className="flex-1 cursor-pointer rounded-xl p-3 text-center transition-all sm:p-4" onClick={() => setMode("manual")}
            style={{ background: mode === "manual" ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${mode === "manual" ? "rgba(245,158,11,0.6)" : "rgba(255,255,255,0.1)"}` }}>
            <p className="mb-1 text-2xl sm:text-3xl">🕹️</p>
            <p className="text-sm font-black sm:text-base" style={{ color: mode === "manual" ? "#fcd34d" : "#ffffff40" }}>수동 조종</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/35 sm:text-sm">클릭해서 전환 시뮬레이션</p>
      </div>

      {/* 자동 전환 조건 */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-white/45 sm:text-base">자동 전환 조건</p>
        {[
          { icon: "📡", trigger: "GPS 신호가 끊겼을 때",     action: "운항 멈춤 → 수동 대기" },
          { icon: "🚢", trigger: "충돌 위험이 감지됐을 때",   action: "즉시 정지 + 경보" },
          { icon: "🖱️", trigger: "관리자가 직접 개입할 때",  action: "즉시 수동 모드 전환" },
          { icon: "⚠️", trigger: "센서 오류가 반복될 때",    action: "속도 줄임 → 안전 정박" },
        ].map((s) => (
          <div key={s.trigger} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 sm:py-2.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="shrink-0 text-lg sm:text-xl">{s.icon}</span>
            <span className="min-w-0 flex-1 text-sm leading-snug text-white/60 sm:text-[15px]">{s.trigger}</span>
            <span className="shrink-0 text-sm font-bold leading-snug text-amber-300 sm:text-[15px]">{s.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 메인 모달 ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function VisionRoadmapModal({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<"vision" | "cctv" | "rc" | "reef" | "safety">("vision");
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="w-full max-w-3xl max-h-[88vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{ background: "linear-gradient(160deg, #07132a 0%, #040d1e 100%)", border: "1px solid rgba(255,255,255,0.09)" }}>

        {/* 헤더 */}
        <div className="px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-white/8">
          <div>
          <p className="text-white font-black text-base sm:text-lg">🏛️ 해양 무인 살포 시스템 고도화 계획</p>
          <p className="text-xs text-white/35 mt-1">1단계 운영 중 · 2~3단계 단계적 개발 예정</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/35 hover:text-white hover:bg-white/10 transition-colors text-sm">
            ✕
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-white/8 shrink-0">
          {[
            { id: "vision", label: "📋 단계별 계획" },
            { id: "cctv",   label: "📹 CCTV 관제" },
            { id: "rc",     label: "🕹️ 원격 조종" },
            { id: "reef",   label: "🪨 암초·회피" },
            { id: "safety", label: "🛡️ 안전 전환" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
              className="flex-1 py-2.5 text-xs sm:text-sm font-bold transition-colors"
              style={tab === t.id
                ? { color: "#60a5fa", borderBottom: "2px solid #60a5fa" }
                : { color: "rgba(255,255,255,0.3)", borderBottom: "2px solid transparent" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 text-[15px] leading-snug sm:text-base sm:leading-relaxed"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#1e3a5f transparent" }}>
          {tab === "vision" && <TabVision />}
          {tab === "cctv"   && <TabCctv />}
          {tab === "rc"     && <TabRc />}
          {tab === "reef"   && <TabReef />}
          {tab === "safety" && <TabSafety />}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-2.5 border-t border-white/8 flex items-center justify-between shrink-0">
          <p className="text-xs text-white/30">
            현재 1단계 구현 완료 · 2~3단계 단계적 고도화 예정
          </p>
          <button onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-bold text-white/50 hover:text-white hover:bg-white/8 transition-colors">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
