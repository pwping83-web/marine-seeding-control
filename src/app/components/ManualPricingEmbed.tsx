import { ExternalLink } from "lucide-react";

const PRICING_PATH = "/pricing.html";

/** 매뉴얼 「구독 요금제」절 — public/pricing.html 임베드 */
export function ManualPricingEmbed() {
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-white/55 leading-relaxed">
        월 구독·PLC 기본/특수 설치·출장·A/S는 <strong className="text-white/75">별도</strong>입니다.
        아래는 요금 안내 전체 페이지입니다.
      </p>
      <a
        href={PRICING_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-teal-300 hover:text-teal-200"
      >
        새 창에서 전체 보기
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </a>
      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: "rgba(64,224,208,0.22)", background: "#0d1117" }}
      >
        <iframe
          title="해양 종자 살포 관제 — 구독 요금제"
          src={PRICING_PATH}
          className="block w-full border-0"
          style={{ height: "min(68vh, 680px)" }}
        />
      </div>
    </div>
  );
}
