/**
 * VisionRoadmapModal.tsx — 관공서 심플 설명용 무인화 고도화 모달
 */

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Gamepad2,
  Keyboard,
  Landmark,
  Mountain,
  MousePointer2,
  RadioTower,
  Shield,
  Ship,
  SlidersHorizontal,
  Square,
  Target,
  Video,
  Wrench,
  X,
  Zap,
} from "lucide-react";

/** 작업 계획·예약 모달과 동일한 패널 톤(진청록 + 틸 테두리) */
const WP_PANEL: CSSProperties = {
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(64,224,208,0.18)",
};
const WP_INSET: CSSProperties = {
  background: "rgba(0,0,0,0.22)",
  border: "1px solid rgba(64,224,208,0.14)",
};
const WP_CHIP: CSSProperties = {
  background: "rgba(64,224,208,0.1)",
  border: "1px solid rgba(64,224,208,0.22)",
  color: "#a5f3fc",
};

function phaseIcon(status: "done" | "next" | "future"): ReactNode {
  if (status === "done") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-300/95" strokeWidth={2} aria-hidden />;
  }
  if (status === "next") {
    return <Wrench className="h-5 w-5 text-cyan-200/95" strokeWidth={2} aria-hidden />;
  }
  return <Target className="h-5 w-5 text-slate-300/90" strokeWidth={2} aria-hidden />;
}

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
          style={{ background: "rgba(45,212,191,0.2)", border: "1px solid rgba(64,224,208,0.45)" }}>
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-teal-300" />
          <span className="text-xs font-black text-cyan-100">녹화</span>
        </div>
        <p className="text-center text-xs text-white/50">{label}</p>
      </div>
      {/* 개발예정 오버레이 */}
      <div className="absolute inset-0 flex items-center justify-center rounded-lg"
        style={{ background: "rgba(4,18,32,0.78)", backdropFilter: "blur(3px)" }}>
        <span
          className="rounded-full px-3 py-1.5 text-sm font-black text-cyan-100 animate-pulse sm:text-base"
          style={{ ...WP_CHIP, border: "1px solid rgba(64,224,208,0.45)" }}
        >
          개발 예정
        </span>
      </div>
    </div>
  );
}

// ─── RC 조종패드 미리보기 ─────────────────────────────────────────────────────

function RcPreview() {
  const [held, setHeld] = useState("");
  const btns: {
    key: string;
    row: number;
    col: number;
    node: ReactNode;
  }[] = [
    { key: "up", row: 0, col: 1, node: <ChevronUp className="h-5 w-5" strokeWidth={2.25} aria-hidden /> },
    { key: "left", row: 1, col: 0, node: <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden /> },
    { key: "stop", row: 1, col: 1, node: <Square className="h-4 w-4 fill-current" strokeWidth={2} aria-hidden /> },
    { key: "right", row: 1, col: 2, node: <ChevronRight className="h-5 w-5" strokeWidth={2.25} aria-hidden /> },
    { key: "down", row: 2, col: 1, node: <ChevronDown className="h-5 w-5" strokeWidth={2.25} aria-hidden /> },
  ];
  return (
    <div className="relative flex flex-col items-center gap-2 rounded-xl p-4" style={WP_INSET}>
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
                {b.node}
              </button>
            );
          })}
        </div>
      ))}
      {/* 개발예정 오버레이 */}
      <div className="absolute inset-0 flex items-center justify-center rounded-xl"
        style={{ background: "rgba(4,18,32,0.75)", backdropFilter: "blur(3px)" }}>
        <span
          className="rounded-full px-3 py-1.5 text-sm font-black text-cyan-100 animate-pulse sm:text-base"
          style={{ ...WP_CHIP, border: "1px solid rgba(64,224,208,0.45)" }}
        >
          개발 예정
        </span>
      </div>
    </div>
  );
}

// ─── 고도화 단계(비전) 데이터 ─────────────────────────────────────────────────

const PHASES = [
  {
    num: 1, title: "1단계 · 현재 운영 중", status: "done" as const,
    summary: "기상·예보 데이터와 규칙 기반 판정으로 위험도를 산출하고, 관제탑과 선박 간 실시간 양방향 통신을 전제로 합니다.",
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
    num: 2, title: "2단계 · 개발 예정", status: "next" as const,
    summary: "관제탑에서 CCTV를 보며 RC카처럼 선박을 직접 원격 조종합니다.",
    items: [
      "선박 단말·선속 실연동 및 완전 자동 항로(관제웹의 지도·항로·살포 위치 설정은 위 「개발 현재 진행 중」)",
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
    num: 3, title: "3단계 · 최종 목표", status: "future" as const,
    summary: "출입항·작업 준비부터 해상 운항 지원까지 자동화 비중을 높이는 단계를 목표로 합니다(인력 배치는 항상 안전·규정에 따름).",
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
  const lineGrad = "linear-gradient(180deg, rgba(45,212,191,0.55), rgba(8,27,52,0.25))";
  const badgeStyle = (status: (typeof PHASES)[0]["status"]) => {
    if (status === "done") {
      return {
        background: "rgba(45,212,191,0.18)",
        color: "#99f6e4",
        border: "1px solid rgba(45,212,191,0.4)",
      } as CSSProperties;
    }
    if (status === "next") {
      return {
        background: "rgba(64,224,208,0.12)",
        color: "#a5f3fc",
        border: "1px solid rgba(64,224,208,0.35)",
      } as CSSProperties;
    }
    return {
      background: "rgba(45,212,191,0.08)",
      color: "#cbd5e1",
      border: "1px solid rgba(64,224,208,0.22)",
    } as CSSProperties;
  };
  return (
    <div className="flex flex-col gap-5">
      {/* 핵심 한 줄 */}
      <div className="rounded-xl px-4 py-4 text-center sm:px-5 sm:py-4" style={WP_PANEL}>
        <p className="text-white font-black text-base leading-snug sm:text-lg">
          부두·항만 준비와 해상 작업 지원을 단계적으로 자동화하고,<br />
          관제·선박·기상 정보를 한 화면에서 신속히 파악하는 것을 지향합니다.
        </p>
        <p className="mt-2 text-xs text-cyan-200/65 sm:text-sm">정책 참고: 해수부 자율운항·스마트항만 관련 R&D·실증 동향</p>
      </div>

      {/* 고도화 세부 — 음성(완료) / 항로·살포 위치(진행 중) */}
      <div
        className="rounded-xl px-3.5 py-3.5 sm:px-5 sm:py-4"
        style={{ ...WP_PANEL, border: "1px solid rgba(251,191,36,0.28)" }}
      >
        <p className="mb-2.5 text-center text-[11px] font-black uppercase tracking-wider text-amber-100/95 sm:text-xs">
          고도화 영역 · 구현 상태
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg p-3 sm:p-3.5" style={WP_INSET}>
            <p className="mb-2 text-xs font-black text-emerald-200/95 sm:text-sm">개발 완료</p>
            <ul className="space-y-1.5 text-[11px] leading-snug text-white/72 sm:text-sm">
              <li className="flex gap-2">
                <span className="shrink-0 text-emerald-300/90" aria-hidden>
                  ✓
                </span>
                <span>
                  <strong className="text-white/85">음성 안내</strong> — 항로 길안내(내비) 브라우저 음성 합성, AI 자막 읽어주기, 날씨 급변 안내 멘트 음성, 음소거·전체 항해 인원용 동기화
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-lg p-3 sm:p-3.5" style={WP_INSET}>
            <p className="mb-2 text-xs font-black text-amber-200/95 sm:text-sm">개발 현재 진행 중</p>
            <ul className="space-y-1.5 text-[11px] leading-snug text-white/72 sm:text-sm">
              <li className="flex gap-2">
                <span className="shrink-0 text-amber-300/90" aria-hidden>
                  ◆
                </span>
                <span>
                  <strong className="text-white/85">항로 네비게이션</strong> 고도화 — 지도 꼭짓점·좌표 입력·금일 항적 연동·안내 카드·모달 UX 등
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-amber-300/90" aria-hidden>
                  ◆
                </span>
                <span>
                  <strong className="text-white/85">종자 살포 위치 설정</strong> — 살포 예정점·경로 따라 균등 배치·지도에서 직접 편집 등
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 단계별 계획 */}
      {PHASES.map((ph, i) => (
        <div key={ph.num} className="flex gap-3 sm:gap-4">
          {/* 타임라인 */}
          <div className="flex flex-col items-center shrink-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl sm:h-11 sm:w-11"
              style={{
                background: "rgba(64,224,208,0.12)",
                border: "2px solid rgba(45,212,191,0.55)",
              }}
            >
              {phaseIcon(ph.status)}
            </div>
            {i < PHASES.length - 1 && (
              <div className="mt-1 min-h-[28px] w-0.5 flex-1" style={{ background: lineGrad }} />
            )}
          </div>

          {/* 카드 */}
          <div className="mb-2 flex-1 rounded-xl p-3.5 sm:p-4" style={WP_PANEL}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-cyan-100 sm:text-base">{ph.title}</p>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={badgeStyle(ph.status)}>
                {ph.status === "done" ? "구현 완료" : ph.status === "next" ? "개발 예정" : "장기 목표"}
              </span>
            </div>
            <p className="mb-3 text-sm leading-relaxed text-white/65 whitespace-pre-line sm:text-[15px]">{ph.summary}</p>
            <ul className="space-y-2">
              {ph.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-snug text-white/70 sm:text-[15px]">
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400/80" strokeWidth={2.5} aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      {/* 정부 키워드 */}
      <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
        {["자율운항", "스마트항만", "무인화", "디지털전환", "중대재해 제로", "원격관제", "암초회피", "IoT", "AI"].map((kw) => (
          <span key={kw} className="rounded-full px-2 py-1 text-xs font-bold sm:text-sm" style={WP_CHIP}>
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
      <div className="rounded-xl p-3.5 sm:p-4" style={WP_PANEL}>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black text-cyan-100 sm:text-base">
          <Video className="h-4 w-4 shrink-0 text-teal-300/90 sm:h-[18px] sm:w-[18px]" strokeWidth={2} aria-hidden />
          <span>CCTV 실시간 관제</span>
          <span className="text-xs font-normal text-cyan-200/75 sm:text-sm">개발 예정</span>
        </p>
        <p className="text-sm leading-relaxed text-white/65 sm:text-[15px]">
          관제탑에서 선박 카메라 4채널을 실시간으로 봅니다. 영상 분석으로 위험 징후를 보조 감지하는 방안을 검토합니다.
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
          <span key={t} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-cyan-100/85 sm:text-sm" style={WP_INSET}>
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
      <div className="rounded-xl p-3.5 sm:p-4" style={WP_PANEL}>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black text-cyan-100 sm:text-base">
          <Gamepad2 className="h-4 w-4 shrink-0 text-teal-300/90 sm:h-[18px] sm:w-[18px]" strokeWidth={2} aria-hidden />
          <span>관제탑 원격 조종</span>
          <span className="text-xs font-normal text-cyan-200/75 sm:text-sm">개발 예정</span>
        </p>
        <p className="text-sm leading-relaxed text-white/65 sm:text-[15px]">
          CCTV 보면서 키보드·조이스틱으로 선박을 RC카처럼 직접 조종합니다.
        </p>
      </div>
      <RcPreview />
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        {[
          { Icon: Keyboard, label: "키보드·방향키 조종" },
          { Icon: SlidersHorizontal, label: "무인 원격 조종기 연동" },
          { Icon: Square, label: "비상 즉시 정지" },
          { Icon: RadioTower, label: "반응 지연 200ms 이하" },
        ].map((i) => (
          <div key={i.label} className="flex items-center gap-2 rounded-lg px-3 py-2.5 sm:py-3" style={WP_INSET}>
            <i.Icon className="h-5 w-5 shrink-0 text-teal-300/85 sm:h-5 sm:w-5" strokeWidth={2} aria-hidden />
            <p className="text-sm font-bold leading-snug text-white/75 sm:text-[15px]">{i.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabReef() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="rounded-xl p-3.5 sm:p-4" style={WP_PANEL}>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black text-cyan-100 sm:text-base">
          <Mountain className="h-4 w-4 shrink-0 text-teal-300/90 sm:h-[18px] sm:w-[18px]" strokeWidth={2} aria-hidden />
          <span>암초 센서 · 지도 기록 · 자동 회피</span>
          <span className="text-xs font-normal text-cyan-200/80 sm:text-sm">개발 예정</span>
        </p>
        <p className="text-sm leading-relaxed text-white/65 sm:text-[15px]">
          선박에 장착한 <strong className="text-white/80">암초·저수심 탐지 센서</strong>(소나·해저 스캔 등)로 위험물을 발견하면
          <strong className="text-white/80"> WGS84 좌표가 자동으로 기록</strong>되고, 관제 웹 지도에 <strong className="text-white/80">암초 위치 마커·경고 구역</strong>으로
          표시됩니다. 누적 데이터는 서버·DB와 동기화해 다른 작업선·관제 사용자와 공유할 수 있도록 설계합니다.
        </p>
      </div>
      <div className="rounded-xl p-3.5 sm:p-4" style={WP_PANEL}>
        <p className="mb-2 text-sm font-black text-cyan-100 sm:text-base">다른 사용자·선박 화면에서의 회피</p>
        <p className="text-sm leading-relaxed text-white/65 sm:text-[15px]">
          공유된 암초 레이어를 켠 상태에서 지도·항로를 보면, <strong className="text-white/80">A*·자율운항 경로 생성 시 기록된 암초 좌표를 자동으로 우회</strong>하고
          접근 시 <strong className="text-white/80">경고·감속 권고</strong>를 띄우는 흐름을 목표로 합니다. 실제 해역에서는 공공 해도·공식 수심 정보와의 정합·검증이 선행되어야 합니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["센서 이벤트 → 좌표 로그", "지도 마커·다각형 구역", "DB·권한별 공유", "항로 자동 회피(목표)"].map((t) => (
          <span key={t} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-cyan-100/85 sm:text-sm" style={WP_INSET}>
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
      <div className="rounded-xl p-3.5 sm:p-4" style={WP_PANEL}>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black text-cyan-100 sm:text-base">
          <Shield className="h-4 w-4 shrink-0 text-teal-300/90 sm:h-[18px] sm:w-[18px]" strokeWidth={2} aria-hidden />
          <span>이중 안전 장치</span>
          <span className="text-xs font-normal text-cyan-200/75 sm:text-sm">개발 예정</span>
        </p>
        <p className="text-sm leading-relaxed text-white/65 sm:text-[15px]">
          위험 감지 시 AI 자율 운항 → 수동 조종 모드로 즉시 전환됩니다.
        </p>
      </div>

      {/* 모드 전환 시뮬 */}
      <div className="rounded-xl p-3.5 sm:p-4" style={WP_INSET}>
        <p className="mb-3 text-center text-sm font-semibold text-cyan-200/70 sm:text-base">운항 모드 전환</p>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 cursor-pointer rounded-xl p-3 text-center transition-all sm:p-4" onClick={() => setMode("auto")}
            style={{
              background: mode === "auto" ? "rgba(45,212,191,0.18)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${mode === "auto" ? "rgba(45,212,191,0.5)" : "rgba(64,224,208,0.15)"}`,
            }}>
            <div className="mb-1 flex justify-center">
              <Bot className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={1.75} style={{ color: mode === "auto" ? "#99f6e4" : "rgba(255,255,255,0.28)" }} aria-hidden />
            </div>
            <p className="text-sm font-black sm:text-base" style={{ color: mode === "auto" ? "#99f6e4" : "rgba(255,255,255,0.35)" }}>AI 자율 운항</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-0.5 text-cyan-200/40">
            <Zap className="h-4 w-4" strokeWidth={2} aria-hidden />
            <p className="text-xs font-semibold">즉시</p>
          </div>
          <div className="flex-1 cursor-pointer rounded-xl p-3 text-center transition-all sm:p-4" onClick={() => setMode("manual")}
            style={{
              background: mode === "manual" ? "rgba(64,224,208,0.14)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${mode === "manual" ? "rgba(64,224,208,0.45)" : "rgba(64,224,208,0.15)"}`,
            }}>
            <div className="mb-1 flex justify-center">
              <Gamepad2 className="h-8 w-8 sm:h-9 sm:w-9" strokeWidth={1.75} style={{ color: mode === "manual" ? "#a5f3fc" : "rgba(255,255,255,0.28)" }} aria-hidden />
            </div>
            <p className="text-sm font-black sm:text-base" style={{ color: mode === "manual" ? "#a5f3fc" : "rgba(255,255,255,0.35)" }}>수동 조종</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-cyan-200/45 sm:text-sm">클릭해서 전환 시뮬레이션</p>
      </div>

      {/* 자동 전환 조건 */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-cyan-200/70 sm:text-base">자동 전환 조건</p>
        {[
          { Icon: RadioTower, trigger: "GPS 신호가 끊겼을 때",     action: "운항 멈춤 → 수동 대기" },
          { Icon: Ship, trigger: "충돌 위험이 감지됐을 때",   action: "즉시 정지 + 경보" },
          { Icon: MousePointer2, trigger: "관리자가 직접 개입할 때",  action: "즉시 수동 모드 전환" },
          { Icon: AlertTriangle, trigger: "센서 오류가 반복될 때",    action: "속도 줄임 → 안전 정박" },
        ].map((s) => (
          <div key={s.trigger} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 sm:py-2.5" style={WP_INSET}>
            <s.Icon className="h-5 w-5 shrink-0 text-teal-300/80 sm:h-5 sm:w-5" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 text-sm leading-snug text-white/65 sm:text-[15px]">{s.trigger}</span>
            <span className="shrink-0 text-sm font-bold leading-snug text-teal-200 sm:text-[15px]">{s.action}</span>
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-6 pb-8 sm:pt-8 sm:pb-10"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >

      <div
        className="w-full max-w-3xl self-start rounded-2xl flex min-h-0 flex-col overflow-hidden shadow-2xl max-h-[min(88vh,calc(100dvh-3rem))]"
        style={{
          background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
          border: "1px solid rgba(64,224,208,0.22)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
      >

        {/* 헤더 — 탭 전환 시에도 세로 위치 고정, 아래쪽만 길이 변화 */}
        <div
          className="px-5 py-3.5 flex items-center justify-between shrink-0 border-b"
          style={{ borderColor: "rgba(64,224,208,0.15)", background: "rgba(0,0,0,0.2)" }}
        >
          <div className="flex min-w-0 items-start gap-2.5 pr-2">
            <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-teal-300/90 sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
            <div className="min-w-0">
              <p className="text-white font-black text-base leading-snug sm:text-lg">해양 무인 살포 시스템 고도화 계획</p>
              <p className="mt-1 text-xs text-white/35">1단계 운영 중 · 2~3단계 단계적 개발 예정</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="모달 닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex shrink-0 border-b" style={{ borderColor: "rgba(64,224,208,0.12)" }}>
          {[
            { id: "vision" as const, Icon: ClipboardList, label: "단계별 계획" },
            { id: "cctv" as const, Icon: Video, label: "CCTV 관제" },
            { id: "rc" as const, Icon: Gamepad2, label: "원격 조종" },
            { id: "reef" as const, Icon: Mountain, label: "암초·회피" },
            { id: "safety" as const, Icon: Shield, label: "안전 전환" },
          ].map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 sm:flex-row sm:gap-1.5 sm:py-2.5"
              style={tab === t.id
                ? { color: "#5eead4", borderBottom: "2px solid #2dd4bf" }
                : { color: "rgba(255,255,255,0.35)", borderBottom: "2px solid transparent" }}>
              <t.Icon className="h-3.5 w-3.5 opacity-90 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
              <span className="text-[10px] font-bold leading-tight sm:text-xs sm:leading-snug">{t.label}</span>
            </button>
          ))}
        </div>

        {/* 본문 — 높이 변화는 이 영역(및 푸터 아래 테두리)에서만 */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 text-[15px] leading-snug sm:text-base sm:leading-relaxed"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#1e3a5f transparent" }}
        >
          {tab === "vision" && <TabVision />}
          {tab === "cctv"   && <TabCctv />}
          {tab === "rc"     && <TabRc />}
          {tab === "reef"   && <TabReef />}
          {tab === "safety" && <TabSafety />}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-2.5 border-t flex items-center justify-between shrink-0" style={{ borderColor: "rgba(64,224,208,0.12)" }}>
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
