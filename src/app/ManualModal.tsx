import { useState } from "react";
import {
  X, Phone, Building2, ChevronDown, ChevronRight,
  Map, Wind, Ship, Download, AlertCircle, BookOpen,
} from "lucide-react";

// ─── Contact info ─────────────────────────────────────────────────────────────
const CONTACTS = [
  {
    role: "웹 시스템 담당자",
    name: "박원평",
    phone: "010-4639-2673",
    note: "웹 오류·화면 문의",
    color: "#40E0D0",
    emergency: true,
  },
  {
    role: "현장·장비 담당자",
    name: "담당자명",          // ← 입력 필요
    phone: "010-0000-0000",   // ← 입력 필요
    note: "기계·장비·현장 문의",
    color: "#fb923c",
    emergency: false,
  },
  {
    role: "기관 담당 공무원",
    name: "담당자명",          // ← 입력 필요
    phone: "010-0000-0000",   // ← 입력 필요
    note: "행정·승인·보고",
    color: "#60a5fa",
    emergency: false,
  },
];
const BIZ_NO = "302-47-00920";

// ─── Color dot legend (actual drop colors from map) ───────────────────────────
const DROP_COLORS: { fill: string; stroke: string; label: string }[] = [
  { fill: "#FF8A1F", stroke: "#fff",    label: "작업 선박 현재 위치" },
  { fill: "#40E0D0", stroke: "#40E0D0", label: "항적 (지나온 경로)" },
  { fill: "#7f1d1d", stroke: "#fecaca", label: "최근 살포 — 45일 이내" },
  { fill: "#c2410c", stroke: "#fdba74", label: "약 3개월 전 살포" },
  { fill: "#be185d", stroke: "#fbcfe8", label: "약 1년 전 살포" },
  { fill: "#fda4af", stroke: "#fff1f2", label: "약 2년 전 살포" },
  { fill: "#cbd5e1", stroke: "#f8fafc", label: "2년 이상 된 살포" },
  { fill: "#171717", stroke: "#a3a3a3", label: "검수 불일치 · 위치 누락" },
];

function ColorLegend() {
  return (
    <div className="mt-1 space-y-2">
      {DROP_COLORS.map((c, i) => (
        <div key={i} className="flex items-center gap-3">
          {i <= 1 ? (
            /* 선박·항적은 도형으로 구분 */
            i === 0 ? (
              <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                <polygon points="9,1 14,14 9,10 4,14" fill={c.fill} stroke={c.stroke} strokeWidth="1.2" />
              </svg>
            ) : (
              <svg width="18" height="6" viewBox="0 0 18 6" className="shrink-0">
                <line x1="0" y1="3" x2="18" y2="3" stroke={c.fill} strokeWidth="2.5" strokeDasharray="5 3" />
              </svg>
            )
          ) : (
            /* 살포 점은 실제 색상 원 */
            <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
              {/* 배경 후광 */}
              <circle cx="9" cy="9" r="8" fill={c.fill} opacity="0.2" />
              {/* 메인 원 */}
              <circle cx="9" cy="9" r="5.5" fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />
              {/* 중앙 밝은 점 */}
              <circle cx="9" cy="9" r="1.8" fill={c.stroke} opacity="0.85" />
            </svg>
          )}
          <span className="text-[13px] text-white/65">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Manual sections ──────────────────────────────────────────────────────────
type ContentItem = {
  heading: string;
  body?: string;
  custom?: React.ReactNode;
};

const SECTIONS: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  content: ContentItem[];
}[] = [
  {
    id: "overview",
    icon: BookOpen,
    title: "시스템 개요",
    content: [
      {
        heading: "무엇을 하는 시스템인가요?",
        body: "해양 종자 살포 관제 시스템은 남해 연안 해역에서 수행하는 해조류 종자 살포 작업을 실시간으로 모니터링하고, 기상 조건·작업 일정을 통합 관리하는 웹 관제 플랫폼입니다.",
      },
      {
        heading: "화면 구성",
        body: "①  왼쪽 사이드바 — 기상 현황, 선박 위치, 신호 송신, 살포 이력\n②  오른쪽 지도 영역 — 선박·항적·살포 점 표시\n③  상단 탭 전환 — 실시간 관제 ↔ 작업 계획",
      },
    ],
  },
  {
    id: "login",
    icon: Ship,
    title: "로그인 방법",
    content: [
      {
        heading: "접속 주소",
        body: "브라우저 주소창에 내부망 주소를 입력합니다.\n시연 주소: http://127.0.0.1:5199",
      },
      {
        heading: "로그인 절차",
        body: "① 이메일 입력란에 기관 계정 이메일을 입력합니다.\n② 비밀번호를 입력합니다.\n③ 「관제 시스템 접속」 버튼을 클릭합니다.\n④ 대시보드로 자동 이동됩니다.\n\n※ 시연 모드: 이메일·비밀번호 없이 버튼만 눌러도 진입 가능합니다.",
      },
    ],
  },
  {
    id: "realtime",
    icon: Map,
    title: "실시간 관제 화면",
    content: [
      {
        heading: "기상 현황 (사이드바)",
        body: "나침반 화살표가 풍향을 가리킵니다.\n풍속·돌풍·파고·시정·기온을 실시간 표시합니다.\n풍속 16 kt 초과 시 '강풍 주의' 경고가 나타납니다.",
      },
      {
        heading: "선박 위치 (사이드바)",
        body: "현재 선박의 북위·동경·진행 방위를 표시합니다.\n위성 신호 수신 상태(실시간/연결 확인)를 표시합니다.",
      },
      {
        heading: "선박 신호 송신 (사이드바)",
        body: "귀항 명령 / 살포 시작 / 살포 중지 / 위치 보고 버튼으로 선박에 지령을 보냅니다.\n버튼 클릭 → '전송 중…' → 2~3초 후 '수신확인'으로 바뀌면 완료입니다.",
      },
      {
        heading: "살포 이력 (사이드바)",
        body: "살포 시각·위도·경도가 목록으로 표시됩니다.\n최신 건은 흰 테두리로 강조됩니다.\n날짜 필터로 특정 기간만 조회할 수 있습니다.",
      },
    ],
  },
  {
    id: "map",
    icon: Map,
    title: "지도 조작 방법",
    content: [
      {
        heading: "확대 / 축소",
        body: "우측 + / − 버튼 클릭, 또는 마우스 휠로 조작합니다.",
      },
      {
        heading: "초기화",
        body: "우측 ↺ 버튼을 클릭하면 지도가 기본 배율로 돌아갑니다.",
      },
      {
        heading: "살포 점 색상 안내",
        body: "지도 우상단 '살포 색상 안내' 버튼을 눌러 확인하거나 아래 범례를 참고하세요.",
        custom: <ColorLegend />,
      },
    ],
  },
  {
    id: "weather",
    icon: Wind,
    title: "작업 계획 화면",
    content: [
      {
        heading: "화면 전환",
        body: "사이드바 상단의 '작업 계획' 탭을 클릭하면 이동합니다.\n'실시간 관제' 탭을 클릭하면 지도 화면으로 돌아옵니다.",
      },
      {
        heading: "7일 기상 예보",
        body: "날짜 카드를 클릭하면 풍속·파고·시정·기온 상세 정보가 펼쳐집니다.\n✅ 작업 가능  ⚠ 주의  ❌ 작업 불가\n\n【 작업 가능 기준 】\n• 풍속 15 kt 이하\n• 파고 1.5 m 이하\n• 시정 5 km 이상\n• 강수 5 mm 미만",
      },
      {
        heading: "작업 캘린더",
        body: "달력에서 색상 점으로 작업 현황을 확인합니다.\n🟢 완료  🔵 예약  🟡 기상연기  🔴 불가예보",
      },
      {
        heading: "작업 일정 목록",
        body: "예정된 작업 행을 클릭하면 상세(목표·선박·비고)가 펼쳐집니다.\n하단 '완료된 작업' 버튼으로 완료 이력을 확인할 수 있습니다.",
      },
    ],
  },
  {
    id: "csv",
    icon: Download,
    title: "CSV 저장 방법",
    content: [
      {
        heading: "이력 내보내기",
        body: "① 사이드바 하단 날짜 필터로 기간을 설정합니다 (선택).\n② 'CSV' 버튼을 클릭합니다.\n③ '종자살포이력_YYYYMMDD.csv' 파일이 자동 다운로드됩니다.\n④ 엑셀에서 바로 열 수 있습니다 (UTF-8 BOM 인코딩).",
      },
    ],
  },
  {
    id: "faq",
    icon: AlertCircle,
    title: "자주 묻는 질문",
    content: [
      {
        heading: "화면이 멈추거나 갱신이 안 됩니다",
        body: "브라우저에서 F5 키를 눌러 새로고침하세요.\n그래도 안 되면 아래 긴급 연락처로 문의하세요.",
      },
      {
        heading: "살포 이력이 보이지 않습니다",
        body: "날짜 필터를 확인하세요. 날짜가 설정된 경우 해당 기간 외 이력은 숨겨집니다.\n필터를 비우면 전체 이력이 표시됩니다.",
      },
      {
        heading: "CSV 파일에서 한글이 깨집니다",
        body: "엑셀 열기 시 '파일 → 가져오기'로 열고 인코딩을 UTF-8로 선택하세요.",
      },
      {
        heading: "지도는 실제 위성 지도인가요?",
        body: "현재 버전은 시연용 SVG 지도입니다. 향후 국가공간정보 지도 API 연동이 예정되어 있습니다.",
      },
    ],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  sec,
  isOpen,
  onToggle,
}: {
  sec: (typeof SECTIONS)[0];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = sec.icon;
  return (
    <div className="border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
        onClick={onToggle}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color: "#40E0D0" }} />
        <span className="flex-1 text-sm font-semibold text-white/80">{sec.title}</span>
        {isOpen
          ? <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
        }
      </button>

      {isOpen && (
        <div className="px-5 pb-4 space-y-4" style={{ background: "rgba(0,0,0,0.15)" }}>
          {sec.content.map((item, i) => (
            <div key={i}>
              <p className="text-xs font-bold text-cyan-400/80 mb-1.5">{item.heading}</p>
              {item.body && (
                <p className="text-[13px] text-white/60 leading-relaxed whitespace-pre-line">
                  {item.body}
                </p>
              )}
              {item.custom && (
                <div className="mt-2">{item.custom}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function ManualModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>("overview");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex" style={{ fontFamily: "sans-serif" }}>
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="w-full max-w-[480px] h-full flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: "linear-gradient(180deg, #0c2748 0%, #081b34 100%)",
          borderLeft: "1px solid rgba(64,224,208,0.15)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{
            background: "rgba(0,0,0,0.25)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black"
              style={{
                background: "linear-gradient(135deg, #1FB5A8, #0e7490)",
                color: "#fff",
                boxShadow: "0 2px 8px rgba(31,181,168,0.4)",
              }}
            >
              M
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">사용자 매뉴얼</p>
              <p className="text-white/35 text-[10px]">해양 종자 살포 관제 시스템 v1.3</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contact cards — always visible */}
        <div
          className="px-4 py-3 shrink-0 space-y-2"
          style={{
            background: "rgba(0,0,0,0.2)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-white/35 font-bold tracking-widest uppercase flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-cyan-400" />
              긴급 연락처
            </p>
            <span className="text-[10px] text-white/20 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {BIZ_NO}
            </span>
          </div>

          {CONTACTS.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5"
              style={{
                background: `${c.color}10`,
                border: `1px solid ${c.color}${c.emergency ? "35" : "20"}`,
              }}
            >
              {/* Role badge */}
              <div
                className="w-1 self-stretch rounded-full shrink-0"
                style={{ background: c.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold tracking-wide mb-0.5"
                  style={{ color: `${c.color}cc` }}>
                  {c.role}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-white leading-none">{c.name}</span>
                  {c.emergency && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}>
                      긴급
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-white/35 mt-0.5">{c.note}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono font-bold text-sm" style={{ color: c.color }}>
                  {c.phone}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable content */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#1e3a5f transparent" }}
        >
          {SECTIONS.map((sec) => (
            <Section
              key={sec.id}
              sec={sec}
              isOpen={expanded === sec.id}
              onToggle={() => setExpanded(expanded === sec.id ? null : sec.id)}
            />
          ))}

          {/* Footer */}
          <div className="px-5 py-6 text-center">
            <p className="text-[11px] text-white/25 leading-relaxed">
              본 시스템은 해양수산부 납품용 관제 플랫폼입니다.<br />
              웹 시스템 문의: {CONTACTS[0].name} ({CONTACTS[0].phone})
            </p>
            <p className="text-[10px] text-white/15 mt-2">
              사업자등록번호 {BIZ_NO} · v1.3 · 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trigger button (reusable) ────────────────────────────────────────────────

export function ManualButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="사용자 매뉴얼"
      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black transition-all hover:scale-110 active:scale-95"
      style={{
        background: "linear-gradient(135deg, #1FB5A8, #0e7490)",
        color: "#fff",
        boxShadow: "0 2px 8px rgba(31,181,168,0.35)",
        letterSpacing: "0",
      }}
    >
      M
    </button>
  );
}
