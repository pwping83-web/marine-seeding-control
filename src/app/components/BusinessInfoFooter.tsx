import { BUSINESS_INFO } from "../businessInfo";

function formatKrMobile(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("010")) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  return digits;
}

/** 카카오 등 외부 심사 시 (사이트) 내 사업자 정보 노출용 */
export function BusinessInfoFooter({ className = "" }: { className?: string }) {
  const phoneDisplay = formatKrMobile(BUSINESS_INFO.phone);
  return (
    <footer
      className={`text-slate-500 border-t border-slate-200/80 pt-4 mt-4 ${className}`}
      style={{ fontSize: 11, lineHeight: 1.65 }}
    >
      <div className="font-medium text-slate-600 mb-1">사업자 정보</div>
      <dl className="grid gap-0.5 sm:grid-cols-[auto_1fr] sm:gap-x-3 sm:gap-y-0.5">
        <dt className="text-slate-500 shrink-0">상호</dt>
        <dd>{BUSINESS_INFO.companyName}</dd>
        <dt className="text-slate-500 shrink-0">사업자등록번호</dt>
        <dd>{BUSINESS_INFO.brn}</dd>
        <dt className="text-slate-500 shrink-0">대표자</dt>
        <dd>{BUSINESS_INFO.representative}</dd>
        <dt className="text-slate-500 shrink-0 align-top pt-0.5">사업장 소재지</dt>
        <dd className="break-words">{BUSINESS_INFO.address}</dd>
        <dt className="text-slate-500 shrink-0">업태</dt>
        <dd>{BUSINESS_INFO.businessType}</dd>
        <dt className="text-slate-500 shrink-0">종목</dt>
        <dd>{BUSINESS_INFO.businessItem}</dd>
        <dt className="text-slate-500 shrink-0">이메일</dt>
        <dd>
          <a
            href={`mailto:${BUSINESS_INFO.email}`}
            className="text-[#0B2545] hover:underline break-all"
          >
            {BUSINESS_INFO.email}
          </a>
        </dd>
        <dt className="text-slate-500 shrink-0">고객문의</dt>
        <dd>
          <a
            href={`tel:${BUSINESS_INFO.phone.replace(/\D/g, "")}`}
            className="text-[#0B2545] hover:underline"
          >
            {phoneDisplay}
          </a>
        </dd>
      </dl>
    </footer>
  );
}
