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
    role: "현장·장비 담당",
    name: "제출 전 기입",
    phone: "—",
    note: "기계·장비·현장 문의(제출·납품 전 실명·번호로 교체)",
    color: "#fb923c",
    emergency: false,
  },
  {
    role: "발주·기관 담당",
    name: "제출 전 기입",
    phone: "—",
    note: "행정·승인·보고(해당 시)",
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
        body:
          "브라우저 주소창에 아래 시연 주소 중 하나를 입력합니다.\n\n" +
          "• 내부망·LAN 시연: http://192.168.45.214:5111/\n" +
          "• 공개 배포 시연: https://marine-seeding-control-git-main-pwping83-webs-projects.vercel.app/\n\n" +
          "LAN 주소는 개발 PC와 같은 네트워크에서 접속할 때 사용합니다. Vercel 주소는 인터넷이 되는 환경에서 바로 열 수 있습니다.",
      },
      {
        heading: "로그인 절차",
        body: "① 「관제 시스템 접속」을 클릭합니다.\n② 대시보드로 이동합니다.",
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
        body: "나침반 화살표가 풍향을 가리킵니다.\n풍속·돌풍·파고·시정·기온을 실시간 표시합니다.\n풍속이 약 16 kt를 넘으면 '강풍 주의' 경고가 나타납니다.",
      },
      {
        heading: "AI 기상 안전과 지도 하단 타임라인",
        body: "사이드바의 안전·주의·긴급 등급과 작업 권장 문구는, 긴급 회항 임계와 단기예보 첫 시간대 판정을 **더 보수적으로 합친 값**으로 표시됩니다. 지도 하단 「지금 위험」·타임라인과 문구가 서로 어긋나지 않도록 맞춰 두었습니다.",
      },
      {
        heading: "금일 항적·보고·구역 면적",
        body: "사이드바 **보고** 버튼으로 금일 항적 요약·CSV 내려받기·**PDF 출력**(인쇄 창에서 PDF로 저장)을 할 수 있습니다.\n살포 점이 3개 이상이면 **구역 추정 면적(ha)** 이 표시됩니다(살포점 외곽 근사, 참고치).\n**현장 상황보고**를 입력·반영하면, 당분간 그 값이 예보 기반 판단에 섞일 수 있습니다.",
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
        body:
          "날짜 카드를 클릭하면 풍속·파고·시정·기온 상세 정보가 펼쳐집니다.\n✅ 작업 가능  ⚠ 주의  ❌ 작업 불가\n\n【 이 화면의 작업 가능 기준(달력·카드) 】\n• 풍속 15 kt 이하\n• 파고 1.5 m 이하\n• 시정 5 km 이상\n• 강수 5 mm 미만\n\n【 예보 출처 】\n• 앞쪽 날짜는 단기예보에 가깝게 합성된 값입니다.\n• 기상청 **중기예보**를 쓸 수 있으면(동일 `VITE_KMA_SERVICE_KEY` 등) 며칠 뒤부터 실제 중기 값으로 덮어씁니다. 키가 없으면 모의 중기로 보강되며, 화면에 **기상청 중기예보**·새로고침 표시가 있습니다.\n\n※ 실시간 관제의 시간대별 가능/주의/불가는 단기 슬롯 점수(m/s·파고 등)로 따로 계산됩니다. 본 탭의 15 kt 기준과 숫자가 다를 수 있습니다.",
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
        body: "Leaflet 타일 지도입니다. 설정·망에 따라 해양·항공 위성 타일이 보이거나, 오프라인 시 단색 배경만 표시될 수 있습니다. 기관 납품 시에는 사용 허가·보안 정책에 맞는 타일·좌표계를 선택합니다.",
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
              <p className="text-white/35 text-[10px]">해양 종자 살포 관제 시스템 v1.5</p>
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
              본 화면은 해양 종자 살포 관제를 위한 <strong className="text-white/35">시연·제안용 웹 구현</strong>입니다.
              특정 기관의 공식 시스템이나 납품 완료를 의미하지 않으며, 계약·승인 범위는 별도입니다.<br />
              웹 문의: {CONTACTS[0].name} ({CONTACTS[0].phone})
            </p>
            <p className="text-[10px] text-white/15 mt-2">
              사업자등록번호 {BIZ_NO} · v1.5 · 2026
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
