/**
 * 금일 살포·작업 권장 — 예보 슬롯 점수(SlotScore)와 안전 레벨 기반 로컬 산출.
 * Groq 등 외부 API 없이도 동작(시연·내부망).
 */

import type { SlotScore } from "./kma-weather";

export type SafetyTri = "안전" | "주의" | "긴급";

export interface WorkRecommendationLocal {
  /** 추천 작업 시간대 (한국어 한두 문장) */
  recommendedTime: string;
  /** 살포·작업 강도 권고 */
  workload: string;
  /** 해역·조건 범위 */
  scope: string;
  /** 산출 근거 안내 */
  basisNote: string;
}

/** 서울 기준 달력 날짜 YYYY-MM-DD */
export function seoulDateString(d = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function hourLabel(hourToken: string): string {
  const h = parseInt(hourToken.slice(0, 2), 10);
  if (Number.isNaN(h)) return hourToken;
  return `${h}시`;
}

function slotOk(s: SlotScore): boolean {
  return s.verdict === "가능" || s.verdict === "주의";
}

/** 오늘(서울) 슬롯만; 없으면 앞쪽 슬롯 전체 사용 */
function pickScoresForToday(scores: SlotScore[]): SlotScore[] {
  if (scores.length === 0) return [];
  const today = seoulDateString();
  const todays = scores.filter((s) => s.slot.date === today);
  return todays.length > 0 ? todays : scores.slice(0, 24);
}

/**
 * 첫 번째 연속 구간(가능·주의)에서 최대 maxLen시간 구간 라벨
 */
function firstGoodWindowLabel(scores: SlotScore[], maxLen: number): string | null {
  const picked = pickScoresForToday(scores);
  if (picked.length === 0) return null;
  let start = -1;
  for (let i = 0; i < picked.length; i++) {
    if (slotOk(picked[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = start;
  while (end + 1 < picked.length && end - start + 1 < maxLen && slotOk(picked[end + 1])) {
    end++;
  }
  const a = picked[start].slot;
  const b = picked[end].slot;
  const sameDay = a.date === b.date;
  if (start === end) {
    return `${a.date.slice(5)} ${hourLabel(a.hour)} 전후(예보)`;
  }
  return sameDay
    ? `${a.date.slice(5)} ${hourLabel(a.hour)}~${hourLabel(b.hour)}(예보)`
    : `${a.date} ${hourLabel(a.hour)}~${b.date} ${hourLabel(b.hour)}(예보)`;
}

function countVerdict(scores: SlotScore[], v: SlotScore["verdict"], limit: number): number {
  let n = 0;
  for (let i = 0; i < scores.length && i < limit; i++) {
    if (scores[i].verdict === v) n++;
  }
  return n;
}

export function buildLocalWorkRecommendation(
  scores: SlotScore[],
  safetyLevel: SafetyTri,
  windMps: number,
  waveM: number,
): WorkRecommendationLocal {
  const picked = pickScoresForToday(scores);
  const okHours = countVerdict(picked, "가능", 24) + countVerdict(picked, "주의", 24) * 0.5;
  const window = firstGoodWindowLabel(scores, 6);

  if (safetyLevel === "긴급") {
    return {
      recommendedTime: "금일 살포·출항은 중단하고, 기상·관제 재평가 후 다음 일정을 검토하세요.",
      workload: "살포 작업 0건 권고. 선박·인력 안전 확보·대기만 수행하세요.",
      scope: "본함 인근·피항 가능 수역만 이동. 외해 확장·종자 살포는 하지 마세요.",
      basisNote: `현재 풍속 ${windMps.toFixed(1)} m/s, 파고 ${waveM.toFixed(1)} m 등으로 긴급 단계입니다. 단기예보 슬롯과 결합한 관제 화면 권고이며, 현장 지휘·기관 지침이 우선입니다.`,
    };
  }

  if (safetyLevel === "주의") {
    const t = window
      ? `상대적으로 여유가 있는 구간: ${window} — 짧은 호선(2시간 이내)만 검토하세요.`
      : "오늘 예보상 안전 창이 좁습니다. 시간대를 쪼개 짧게만 작업하세요.";
    return {
      recommendedTime: t,
      workload: `살포·작업은 소규모로 제한(예: 반나절 ${Math.max(2, Math.min(6, Math.floor(okHours / 2)))}건 이하 권고).`,
      scope: "연안 시험·관제 화면에 표시된 구역 내, 풍속·파고 상한을 넘기지 않는 범위로만 확장하세요.",
      basisNote: "기상청 단기예보 기반 슬롯 점수(가능·주의·불가)입니다. 실제 출항은 승선원·항만당국 지침을 따르세요.",
    };
  }

  // 안전
  const timeLine = window
    ? `우선 검토 시간대: ${window}.`
    : okHours >= 4
      ? "오늘 다수 시간대가 비교적 양호합니다. 일과 시작 전·돌풍 구간만 다시 확인하세요."
      : "예보 슬롯이 아직 부족합니다. 상단 자막·기상 패널을 주기적으로 확인하세요.";

  const suggested = Math.min(18, Math.max(6, Math.round(okHours * 1.2)));
  return {
    recommendedTime: timeLine,
    workload: `예보상 여유 시간이 있을 때 집중 작업 권장 — 하루 살포·이동 루트는 약 ${suggested}건(회선) 이하로 계획하고, 중간 휴식·기상 재확인을 넣으세요.`,
    scope: "남해안 권역 시험해역·관제 화면 운항구역 내에서만 살포. 시정 악화·풍향 급변 시 즉시 축소하세요.",
    basisNote: "기상청 단기예보 슬롯의 안전 점수(가능·주의·불가)로 산출한 참고값입니다. 법정 기준이 아닙니다.",
  };
}
