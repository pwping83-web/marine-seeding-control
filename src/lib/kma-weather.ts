/**
 * 기상청 Open API 클라이언트 + AI 출항 스케줄링 로직
 *
 * 사용:
 *   import { fetchKmaForecast, scoreHourSlot, buildDeparturePlan, assessEmergency } from "@/lib/kma-weather";
 *
 * 환경변수 (.env):
 *   VITE_KMA_SERVICE_KEY  — 공공데이터포털 기상청 초단기예보/단기예보 API 인증키(URL인코딩 값)
 *   VITE_KMA_NX / VITE_KMA_NY  — 기상청 격자 좌표(기본: 남해안 권역 58, 74)
 *
 * API 문서: https://www.data.go.kr/data/15084084/openapi.do (기상청 단기예보)
 */

// ─── 기상 한 시간 슬롯 ────────────────────────────────────────────────────────

export interface KmaHourSlot {
  /** ISO 날짜 "YYYY-MM-DD" */
  date: string;
  /** 24시 표기 "HH00" */
  hour: string;
  /** 풍속(m/s) */
  windSpeed: number;
  /** 풍향(°) */
  windDir: number;
  /** 파고(m) — 단기예보 WAV 항목 */
  waveHeight: number;
  /** 강수 형태 (0: 없음, 1: 비, 3: 눈, 4: 소나기 …) */
  ptyCode: number;
  /** 강수량 범주 (0: 없음, 1: 1mm 미만 … 4: 50mm 이상) */
  pcp: number;
  /** 기온(°C) */
  temp: number;
  /** 강수확률(%) */
  pop: number;
  /** 하늘상태 (1:맑음 3:구름많음 4:흐림) */
  sky: number;
}

// ─── AI 출항 판정 ─────────────────────────────────────────────────────────────

export interface SlotScore {
  slot: KmaHourSlot;
  /** 0~100. 높을수록 안전 */
  score: number;
  /** "가능" | "주의" | "불가" */
  verdict: "가능" | "주의" | "불가";
  /** 경고 메시지 배열 */
  warnings: string[];
}

export interface DeparturePlan {
  /** 오늘+내일 전체 슬롯 점수 목록 */
  allScores: SlotScore[];
  /** "가능" 슬롯 중 최적 시간대 (최대 3구간) */
  bestWindows: SlotScore[];
  /** 당일 최고 위험 경보 */
  maxAlert: "안전" | "주의" | "위험";
  /** 전반적 한 줄 요약 */
  summary: string;
}

// ─── 긴급 회항 판단 ───────────────────────────────────────────────────────────

export interface EmergencyAssessment {
  /** 즉시 회항 필요 여부 */
  returnNow: boolean;
  /** 경보 레벨 */
  level: "안전" | "주의" | "긴급";
  /** 트리거된 조건 목록 */
  triggers: string[];
  /** 사용자에게 표시할 요약 */
  message: string;
}

// ─── 해양 안전 임계값 (보수적 기준 — 해양수산부 소형선박 운항기준 준용) ─────────
//
//  풍속  : 7 m/s 이상 출항 제한 권고 / 10 m/s 이상 운항 중단 / 13 m/s 이상 즉시 회항
//  파고  : 0.5 m 이상 주의 / 1.0 m 이상 출항 제한 / 1.5 m 이상 즉시 회항
//  강수  : 강수확률 50% 이상 출항 재검토 / 70% 이상 출항 금지
//  시정  : sky=4(흐림) + 강수 동반 시 추가 감점
//
const THRESHOLDS = {
  wind: { ok: 7, caution: 10, danger: 13 },     // m/s (기존 12/15 → 10/13으로 강화)
  wave: { ok: 0.5, caution: 1.0, danger: 1.5 }, // m
  pop:  { caution: 50, danger: 70 },             // %
  gust: { caution: 14, danger: 18 },             // m/s 돌풍 별도 감점
} as const;

// ─── 슬롯 점수 계산 (AI 가중치 규칙) ────────────────────────────────────────

export function scoreHourSlot(slot: KmaHourSlot): SlotScore {
  let score = 100;
  const warnings: string[] = [];

  // 풍속 페널티
  if (slot.windSpeed >= THRESHOLDS.wind.danger) {
    score -= 60;
    warnings.push(`풍속 ${slot.windSpeed}m/s (위험 ≥${THRESHOLDS.wind.danger})`);
  } else if (slot.windSpeed >= THRESHOLDS.wind.caution) {
    score -= 35;
    warnings.push(`풍속 ${slot.windSpeed}m/s (주의 ≥${THRESHOLDS.wind.caution})`);
  } else if (slot.windSpeed >= THRESHOLDS.wind.ok) {
    score -= 15;
    warnings.push(`풍속 ${slot.windSpeed}m/s (약간 강함)`);
  }

  // 파고 페널티
  if (slot.waveHeight >= THRESHOLDS.wave.danger) {
    score -= 50;
    warnings.push(`파고 ${slot.waveHeight}m (위험 ≥${THRESHOLDS.wave.danger})`);
  } else if (slot.waveHeight >= THRESHOLDS.wave.caution) {
    score -= 25;
    warnings.push(`파고 ${slot.waveHeight}m (주의 ≥${THRESHOLDS.wave.caution})`);
  } else if (slot.waveHeight >= THRESHOLDS.wave.ok) {
    score -= 10;
    warnings.push(`파고 ${slot.waveHeight}m (소파)`);
  }

  // 강수 페널티
  if (slot.ptyCode === 1 || slot.ptyCode === 4) {
    score -= 20;
    warnings.push("강수: 비/소나기");
  } else if (slot.ptyCode === 3) {
    score -= 30;
    warnings.push("강수: 눈");
  }

  if (slot.pop >= THRESHOLDS.pop.danger) {
    score -= 15;
    warnings.push(`강수확률 ${slot.pop}% (매우 높음)`);
  } else if (slot.pop >= THRESHOLDS.pop.caution) {
    score -= 5;
    warnings.push(`강수확률 ${slot.pop}%`);
  }

  // 가시거리 대리 지표 (흐림 → 감점)
  if (slot.sky === 4) {
    score -= 8;
    // 흐림 + 비 복합 추가 감점
    if (slot.ptyCode === 1 || slot.ptyCode === 4) score -= 7;
  }

  score = Math.max(0, Math.min(100, score));

  // 해양 작업 특성상 "주의" 기준을 70점으로 높임 (기존 65/40 → 72/50)
  const verdict: SlotScore["verdict"] =
    score >= 72 ? "가능" : score >= 50 ? "주의" : "불가";

  return { slot, score, verdict, warnings };
}

// ─── 출항 계획 생성 ───────────────────────────────────────────────────────────

export function buildDeparturePlan(slots: KmaHourSlot[]): DeparturePlan {
  const allScores = slots.map(scoreHourSlot);

  // "가능" 슬롯에서 점수 높은 순 최대 3개
  const bestWindows = allScores
    .filter((s) => s.verdict === "가능")
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // 최고 위험도 평가
  const minScore = Math.min(...allScores.map((s) => s.score));
  const maxAlert: DeparturePlan["maxAlert"] =
    minScore < 40 ? "위험" : minScore < 65 ? "주의" : "안전";

  // 요약 생성
  let summary = "";
  if (bestWindows.length === 0) {
    summary = "예보 기간 내 안전 출항 가능 시간대 없음 — 대기 권고";
  } else {
    const top = bestWindows[0];
    summary = `최적 출항: ${top.slot.date} ${top.slot.hour}시 (안전점수 ${top.score}/100)`;
  }

  return { allScores, bestWindows, maxAlert, summary };
}

// ─── 긴급 회항 판단 ───────────────────────────────────────────────────────────

export function assessEmergency(current: Omit<KmaHourSlot, "date" | "hour">): EmergencyAssessment {
  const triggers: string[] = [];
  const cautionTriggers: string[] = [];

  // ── 즉시 회항 조건 (단 하나만 충족해도 returnNow) ────────────────────────
  if (current.windSpeed >= THRESHOLDS.wind.danger) {
    triggers.push(`풍속 ${current.windSpeed.toFixed(1)}m/s (위험기준 ≥${THRESHOLDS.wind.danger})`);
  }
  if (current.waveHeight >= THRESHOLDS.wave.danger) {
    triggers.push(`파고 ${current.waveHeight.toFixed(1)}m (위험기준 ≥${THRESHOLDS.wave.danger})`);
  }
  if ((current.ptyCode === 1 || current.ptyCode === 4) && current.windSpeed >= THRESHOLDS.wind.caution) {
    triggers.push(`비·소나기 + 강풍(${current.windSpeed.toFixed(1)}m/s) 복합`);
  }
  if (current.ptyCode === 3) {
    triggers.push("강설 — 갑판 결빙 위험");
  }

  // ── 주의 조건 ────────────────────────────────────────────────────────────
  if (current.windSpeed >= THRESHOLDS.wind.caution && current.windSpeed < THRESHOLDS.wind.danger) {
    cautionTriggers.push(`풍속 ${current.windSpeed.toFixed(1)}m/s (주의기준 ≥${THRESHOLDS.wind.caution})`);
  }
  if (current.waveHeight >= THRESHOLDS.wave.caution && current.waveHeight < THRESHOLDS.wave.danger) {
    cautionTriggers.push(`파고 ${current.waveHeight.toFixed(1)}m (주의기준 ≥${THRESHOLDS.wave.caution})`);
  }
  if (current.pop >= THRESHOLDS.pop.caution) {
    cautionTriggers.push(`강수확률 ${current.pop}%`);
  }

  const returnNow = triggers.length > 0;
  const level: EmergencyAssessment["level"] =
    triggers.length > 0 ? "긴급"
    : cautionTriggers.length > 0 ? "주의"
    : "안전";

  const message =
    level === "긴급"
      ? `🚨 즉시 회항 권고: ${triggers.join(" / ")}`
      : level === "주의"
      ? `⚠️ 기상 주의: ${cautionTriggers.join(" / ")}`
      : "현재 기상: 안전 범위 내 — 정상 작업 가능";

  return { returnNow, level, triggers: [...triggers, ...cautionTriggers], message };
}

// ─── 기상청 단기예보 API 호출 ─────────────────────────────────────────────────

function kmaBaseDateTime(): { baseDate: string; baseTime: string } {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const h = kst.getHours();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  const baseDate = `${kst.getFullYear()}${mm}${dd}`;

  // 단기예보 발표: 02, 05, 08, 11, 14, 17, 20, 23시
  const publishHours = [2, 5, 8, 11, 14, 17, 20, 23];
  const validHour = publishHours.filter((ph) => ph <= h).pop() ?? 23;
  const isYesterday = validHour === 23 && h < 2;

  let date = baseDate;
  if (isYesterday) {
    const yest = new Date(kst);
    yest.setDate(yest.getDate() - 1);
    const m2 = String(yest.getMonth() + 1).padStart(2, "0");
    const d2 = String(yest.getDate()).padStart(2, "0");
    date = `${yest.getFullYear()}${m2}${d2}`;
  }

  return { baseDate: date, baseTime: String(validHour).padStart(2, "0") + "00" };
}

interface KmaApiItem {
  fcstDate: string;
  fcstTime: string;
  category: string;
  fcstValue: string;
}

/** 기상청 단기예보 API 실제 호출. 실패 시 null 반환(호출자에서 목업으로 대체). */
export async function fetchKmaForecast(
  options: {
    nx?: number;
    ny?: number;
    numOfRows?: number;
  } = {}
): Promise<KmaHourSlot[] | null> {
  const serviceKey = import.meta.env.VITE_KMA_SERVICE_KEY;
  if (!serviceKey) return null;

  const nx = options.nx ?? Number(import.meta.env.VITE_KMA_NX ?? "58");
  const ny = options.ny ?? Number(import.meta.env.VITE_KMA_NY ?? "74");
  const numOfRows = options.numOfRows ?? 1000;
  const { baseDate, baseTime } = kmaBaseDateTime();

  const url = new URL(
    "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
  );
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const items: KmaApiItem[] =
      json?.response?.body?.items?.item ?? [];
    return parseKmaItems(items);
  } catch {
    return null;
  }
}

function parseKmaItems(items: KmaApiItem[]): KmaHourSlot[] {
  const slotMap = new Map<string, Partial<KmaHourSlot>>();

  for (const it of items) {
    const key = `${it.fcstDate}_${it.fcstTime}`;
    if (!slotMap.has(key)) {
      slotMap.set(key, {
        date: `${it.fcstDate.slice(0, 4)}-${it.fcstDate.slice(4, 6)}-${it.fcstDate.slice(6, 8)}`,
        hour: it.fcstTime.slice(0, 2),
        windSpeed: 0, windDir: 0, waveHeight: 0,
        ptyCode: 0, pcp: 0, temp: 15, pop: 0, sky: 1,
      });
    }
    const slot = slotMap.get(key)!;
    const v = parseFloat(it.fcstValue);
    switch (it.category) {
      case "WSD": slot.windSpeed = isNaN(v) ? 0 : v; break;
      case "VEC": slot.windDir = isNaN(v) ? 0 : v; break;
      case "WAV": slot.waveHeight = isNaN(v) ? 0 : v; break;
      case "PTY": slot.ptyCode = isNaN(v) ? 0 : v; break;
      case "PCP": slot.pcp = isNaN(v) ? 0 : Math.min(v, 4); break;
      case "TMP": slot.temp = isNaN(v) ? 15 : v; break;
      case "POP": slot.pop = isNaN(v) ? 0 : v; break;
      case "SKY": slot.sky = isNaN(v) ? 1 : v; break;
    }
  }

  return Array.from(slotMap.values()) as KmaHourSlot[];
}

// ─── 테스트/데모용 목업 데이터 생성 ──────────────────────────────────────────

export function generateMockForecast(): KmaHourSlot[] {
  const slots: KmaHourSlot[] = [];
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));

  for (let day = 0; day < 2; day++) {
    const d = new Date(kst);
    d.setDate(d.getDate() + day);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    for (let h = 0; h < 24; h++) {
      // 새벽·야간은 파고↑ 풍속↑, 낮(10~16시)은 안정
      const isDaytime = h >= 9 && h <= 17;
      const isRiskyMorning = h >= 0 && h < 6;

      slots.push({
        date: dateStr,
        hour: String(h).padStart(2, "00"),
        windSpeed: isRiskyMorning ? 13 + Math.random() * 4 : isDaytime ? 3 + Math.random() * 5 : 7 + Math.random() * 5,
        windDir: 180 + Math.random() * 90,
        waveHeight: isRiskyMorning ? 1.2 + Math.random() * 0.8 : isDaytime ? 0.2 + Math.random() * 0.4 : 0.6 + Math.random() * 0.5,
        ptyCode: isRiskyMorning ? 1 : 0,
        pcp: isRiskyMorning ? 2 : 0,
        temp: 16 + h * 0.3 + (Math.random() - 0.5) * 3,
        pop: isRiskyMorning ? 65 : isDaytime ? 10 + Math.random() * 20 : 30 + Math.random() * 20,
        sky: isRiskyMorning ? 4 : isDaytime ? 1 : 3,
      });
    }
  }
  return slots;
}
