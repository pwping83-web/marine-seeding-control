import { BUSINESS_INFO } from "../businessInfo";

function formatKrMobile(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("010")) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  return digits;
}

type BusinessInfoFooterProps = {
  className?: string;
  /** 로그인 등 다크 배경 화면용 */
  variant?: "light" | "dark";
  /** 상호·등록번호·대표·이메일·문의만 소형 표기 */
  compact?: boolean;
};

/** 카카오 등 외부 심사 시 (사이트) 내 사업자 정보 노출용 */
export function BusinessInfoFooter({
  className = "",
  variant = "light",
  compact = false,
}: BusinessInfoFooterProps) {
  const phoneDisplay = formatKrMobile(BUSINESS_INFO.phone);
  const isDark = variant === "dark";
  const foot = isDark
    ? "text-slate-400/90 border-t border-teal-500/20 pt-3 mt-0 bg-[#040d18]/92 backdrop-blur-sm"
    : "text-slate-500 border-t border-slate-200/80 pt-4 mt-4";
  const titleCls = isDark ? "font-medium text-cyan-200/75 mb-1.5" : "font-medium text-slate-600 mb-1";
  const dtCls = isDark ? "text-cyan-200/45 shrink-0" : "text-slate-500 shrink-0";
  const ddCls = isDark ? "text-white/88" : "";
  const linkCls = isDark
    ? "text-cyan-300/90 hover:underline break-all"
    : "text-[#0B2545] hover:underline break-all";
  const telCls = isDark ? "text-cyan-300/90 hover:underline" : "text-[#0B2545] hover:underline";

  if (compact) {
    const compactFoot = isDark
      ? "text-slate-400/85 border-t border-teal-500/20 pt-3 mt-0 bg-[#040d18]/92 backdrop-blur-sm"
      : "text-slate-500 border-t border-slate-200/80 pt-3 mt-4";
    const lineMuted = isDark ? "text-slate-500/90" : "text-slate-500";
    const lineMain = isDark ? "text-slate-300/95" : "text-slate-700";
    const labelCls = isDark ? "text-cyan-200/50" : "text-slate-500";
    const sepCls = isDark ? "text-teal-400/35 select-none shrink-0" : "text-slate-400/70 select-none shrink-0";
    return (
      <footer className={`${compactFoot} flex justify-center ${className}`}>
        <div
          className="inline-flex max-w-full min-w-0 flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5 text-center"
          style={{ fontSize: 10, lineHeight: 1.45, letterSpacing: "0.01em" }}
        >
          <span className={`shrink-0 font-medium ${lineMain}`}>{BUSINESS_INFO.companyName}</span>
          <span className={sepCls} aria-hidden>
            ·
          </span>
          <span className={`shrink-0 ${lineMuted}`}>{BUSINESS_INFO.brn}</span>
          <span className={sepCls} aria-hidden>
            ·
          </span>
          <span className={`shrink-0 ${lineMuted}`}>
            <span className={labelCls}>대표자</span> {BUSINESS_INFO.representative}
          </span>
          <span className={sepCls} aria-hidden>
            ·
          </span>
          <span className={`min-w-0 max-w-full ${lineMuted}`}>
            <span className={labelCls}>이메일</span>{" "}
            <a href={`mailto:${BUSINESS_INFO.email}`} className={`${linkCls} break-all`}>
              {BUSINESS_INFO.email}
            </a>
          </span>
          <span className={sepCls} aria-hidden>
            ·
          </span>
          <span className={`shrink-0 ${lineMuted}`}>
            <span className={labelCls}>문의</span>{" "}
            <a href={`tel:${BUSINESS_INFO.phone.replace(/\D/g, "")}`} className={telCls}>
              {phoneDisplay}
            </a>
          </span>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`${foot} ${className}`} style={{ fontSize: 11, lineHeight: 1.65 }}>
      <div className={titleCls}>사업자 정보</div>
      <dl className={`grid gap-0.5 sm:grid-cols-[auto_1fr] sm:gap-x-3 sm:gap-y-0.5 ${isDark ? "text-left" : ""}`}>
        <dt className={dtCls}>상호</dt>
        <dd className={ddCls}>{BUSINESS_INFO.companyName}</dd>
        <dt className={dtCls}>사업자등록번호</dt>
        <dd className={ddCls}>{BUSINESS_INFO.brn}</dd>
        <dt className={dtCls}>대표자</dt>
        <dd className={ddCls}>{BUSINESS_INFO.representative}</dd>
        <dt className={`${dtCls} align-top pt-0.5`}>사업장 소재지</dt>
        <dd className={`break-words ${ddCls}`}>{BUSINESS_INFO.address}</dd>
        <dt className={dtCls}>업태</dt>
        <dd className={ddCls}>{BUSINESS_INFO.businessType}</dd>
        <dt className={dtCls}>종목</dt>
        <dd className={ddCls}>{BUSINESS_INFO.businessItem}</dd>
        <dt className={dtCls}>이메일</dt>
        <dd>
          <a href={`mailto:${BUSINESS_INFO.email}`} className={linkCls}>
            {BUSINESS_INFO.email}
          </a>
        </dd>
        <dt className={dtCls}>고객문의</dt>
        <dd>
          <a href={`tel:${BUSINESS_INFO.phone.replace(/\D/g, "")}`} className={telCls}>
            {phoneDisplay}
          </a>
        </dd>
      </dl>
    </footer>
  );
}
