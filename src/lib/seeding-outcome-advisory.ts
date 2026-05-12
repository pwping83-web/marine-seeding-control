/**
 * 종자 해저 안착(정착) 추정·과제형 평가선(50%)·현장 행동 권고.
 * 살포 "성공"(통신·센서)과 안착(해저)은 별개임을 문구에 녹임.
 */

import {
  attachmentMeetsPublicThreshold,
  estimateAttachmentPercent,
  mpsToKt,
  type WeatherLike,
} from "@/lib/seeding-day-eval";

export type AttachmentSafetyTri = "안전" | "주의" | "긴급";

export interface AttachmentAdvisory {
  pct: number;
  meets50: boolean;
  /** 모달·근거용 2~4문장 */
  outlook: string;
  /** 항속·휴항 등 행동 권고 */
  operationCue: string;
  /** 상단 자막에 붙일 짧은 조각 */
  tickerCue: string;
}

function rainLikely(popPct?: number, ptyCode?: number): boolean {
  if (ptyCode != null && ptyCode >= 1) return true;
  if (popPct != null && popPct >= 55) return true;
  return false;
}

/** 선체 흔들림·난조로 살포 품질이 떨어질 법한 구간 */
function roughForSeeding(weather: WeatherLike): boolean {
  const gKt = mpsToKt(weather.windGust);
  return weather.waveHeight >= 0.95 || gKt >= 17.5;
}

export function buildAttachmentAdvisory(
  weather: WeatherLike,
  safetyLevel: AttachmentSafetyTri,
  ctx?: { popPct?: number; ptyCode?: number },
): AttachmentAdvisory {
  const pct = estimateAttachmentPercent(weather);
  const meets50 = attachmentMeetsPublicThreshold(pct);
  const rain = rainLikely(ctx?.popPct, ctx?.ptyCode);
  const rough = roughForSeeding(weather);

  const basis =
    "「살포 완료」는 단말·통신 기준 기록이고, 「안착」은 해저 정착·생존으로 따로 평가하는 것이 국가 연구·실증 과제에서 흔한 구분입니다.";

  const target =
    meets50
      ? `현재 기상 기준 추정 안착률은 ${pct}%로, 과제·사후평가에서 자주 쓰는 참고선(50%)을 넘긴 구간으로 볼 수 있습니다. ${basis}`
      : `현재 기상 기준 추정 안착률은 ${pct}%로, 과제·사후평가에서 자주 쓰는 참고선(50%)에 미치지 못합니다. ${basis}`;

  const cues: string[] = [];
  if (safetyLevel === "긴급" || pct < 42) {
    cues.push(
      "기상·안전이 불리합니다. 오늘부터 3일간 출항·살포를 쉬고(휴항), 과제 책임자·관제와 일정을 다시 맞추는 편이 안전합니다.",
    );
  } else if (rain) {
    cues.push(
      "비 또는 강수 가능성이 큽니다. 오늘부터 3일간 휴항·일정 조정을 검토하고, 종자 유실·혼탁에 따른 안착 저하를 피하세요.",
    );
  }
  if (rough && safetyLevel !== "긴급") {
    cues.push(
      "배속을 낮추고 천천히 항행하세요. 흔들림이 심한 날씨에서는 살포 간격을 넓히거나 구간을 나누는 것이 안착률을 높이는 데 도움이 됩니다.",
    );
  }
  if (cues.length === 0) {
    cues.push(
      "풍속·파고가 비교적 안정일 때 짧은 구간으로 살포하고, 이후 해저 모니터링(조사)으로 안착을 확인하면 과제 보고 품질이 좋아집니다.",
    );
  }

  const tickerCue = `추정안착 ${pct}%·참고선50% ${meets50 ? "이상" : "미만"}${rain ? "·강수주의" : ""}${rough ? "·저속항행" : ""}`;

  return {
    pct,
    meets50,
    outlook: target,
    operationCue: cues.join(" "),
    tickerCue,
  };
}
