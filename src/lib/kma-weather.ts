/**
 * 기상청 Open API 클라이언트 + AI 출항 스케줄링 로직
 *
 * 사용:
 *   import { fetchKmaForecast, scoreHourSlot, buildDeparturePlan, assessEmergency } from "@/lib/kma-weather";
 *
 * 환경변수 (.env):
 *   VITE_KMA_SERVICE_KEY  — 공공데이터포털 기상청 일반 인증키(단기 VilageFcstInfoService_2.0·중기 MidFcstInfoService 등 동일 키, 포털 안내에 맞는 Encoding/Decoding 값)
 *   VITE_KMA_NX / VITE_KMA_NY  — 기상청 격자 좌표(기본: 남해안 권역 58, 74)
 *   VITE_KMA_FORECAST_POLL_MS   — 단기예보 재조회 주기(ms). 기본 480000(8분), 3~30분으로 클램프
 *   VITE_KMA_REALTIME_CHECK_MS  — 긴급·주의 재평가(ms). 기본 45000(45초), 15~120초로 클램프
 *   VITE_KMA_MID_POLL_MS        — 중기예보 재조회(ms). 기본 21600000(6시간), 2~12시간으로 클램프
 *
 * 참고: 중기예보 End Point는 https://apis.data.go.kr/1360000/MidFcstInfoService (가이드 251212 등)
 * 단기: https://www.data.go.kr/data/15084084/openapi.do
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

/** 공공데이터포털 기상청 API 키가 설정되어 있는지(브라우저 번들 기준). */
export function isKmaApiConfigured(): boolean {
  const k = import.meta.env.VITE_KMA_SERVICE_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

function parseEnvMsClamped(
  key: "VITE_KMA_FORECAST_POLL_MS" | "VITE_KMA_REALTIME_CHECK_MS" | "VITE_KMA_MID_POLL_MS",
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = import.meta.env[key];
  const n =
    raw != null && typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 단기예보 API 재조회 주기. 관제 운용 기본 8분(예보 발표 주기 대비 과도 호출 방지). */
export function kmaForecastPollMs(): number {
  return parseEnvMsClamped(
    "VITE_KMA_FORECAST_POLL_MS",
    8 * 60 * 1000,
    3 * 60 * 1000,
    30 * 60 * 1000,
  );
}

/** 긴급·주의 판정 재계산 주기. 기본 45초. */
export function kmaRealtimeCheckMs(): number {
  return parseEnvMsClamped(
    "VITE_KMA_REALTIME_CHECK_MS",
    45 * 1000,
    15 * 1000,
    120 * 1000,
  );
}

/** 중기예보 재조회 주기. 기본 6시간. */
export function kmaMidTermPollMs(): number {
  return parseEnvMsClamped(
    "VITE_KMA_MID_POLL_MS",
    6 * 60 * 60 * 1000,
    2 * 60 * 60 * 1000,
    12 * 60 * 60 * 1000,
  );
}

/** 예보 슬롯을 시각 순으로 정렬(단기예보 API 응답 순서가 뒤섞일 수 있음). */
export function sortKmaSlotsByTime(slots: KmaHourSlot[]): KmaHourSlot[] {
  return [...slots].sort((a, b) => {
    const ta = `${a.date.replace(/-/g, "")}${String(a.hour).padStart(2, "0")}`;
    const tb = `${b.date.replace(/-/g, "")}${String(b.hour).padStart(2, "0")}`;
    return ta.localeCompare(tb);
  });
}

function slotForecastUtcMs(slot: KmaHourSlot): number {
  const hh = String(slot.hour).padStart(2, "0");
  return new Date(`${slot.date}T${hh}:00:00+09:00`).getTime();
}

/**
 * 현재 시각(KST 기준 시계열)에 가장 가까운 예보 슬롯.
 * 과거·현재 시각에 해당하는 슬롯 중 가장 최근 것을 우선하고, 없으면 가장 가까운 미래 슬롯.
 */
export function pickCurrentOrNextKmaSlot(slots: KmaHourSlot[]): KmaHourSlot | null {
  if (!slots.length) return null;
  const sorted = sortKmaSlotsByTime(slots);
  const now = Date.now();
  let bestPast: KmaHourSlot | null = null;
  let bestPastT = -Infinity;
  let bestFuture: KmaHourSlot | null = null;
  let bestFutureT = Infinity;
  for (const s of sorted) {
    const t = slotForecastUtcMs(s);
    if (t <= now && t >= bestPastT) {
      bestPast = s;
      bestPastT = t;
    }
    if (t >= now && t <= bestFutureT) {
      bestFuture = s;
      bestFutureT = t;
    }
  }
  return bestPast ?? bestFuture ?? sorted[0];
}

/** SKY·PTY·POP 기반 시정(km) 추정 — 단기예보에 시정 항목이 없을 때 관제 UI용. */
export function estimatedVisibilityKmFromSlot(slot: Pick<KmaHourSlot, "sky" | "ptyCode" | "pop">): number {
  let vis = 12;
  if (slot.sky === 3) vis = 8;
  if (slot.sky === 4) vis = slot.pop > 40 ? 4 : 6;
  if (slot.ptyCode === 1 || slot.ptyCode === 4) vis = Math.min(vis, 5);
  return vis;
}

/** 관제 사이드바 `WeatherState`와 동일 단위(m/s, m, km, °C)로 매핑. */
export function kmaSlotToDashboardWeather(slot: KmaHourSlot): {
  windSpeed: number;
  windDir: number;
  windGust: number;
  waveHeight: number;
  visibility: number;
  temp: number;
} {
  const gust = Math.min(38, slot.windSpeed * 1.35 + (slot.pop > 50 ? 3 : 0));
  return {
    windSpeed: slot.windSpeed,
    windDir: slot.windDir,
    windGust: Math.max(slot.windSpeed + 0.5, gust),
    waveHeight: slot.waveHeight,
    visibility: estimatedVisibilityKmFromSlot(slot),
    temp: slot.temp,
  };
}

/** 현장 상황보고 수치 → `KmaHourSlot` (출항 점수·긴급 판정 파이프라인과 동일 형식). */
export function kmaSlotFromFieldReport(
  w: Pick<KmaHourSlot, "windSpeed" | "windDir" | "waveHeight" | "temp">,
  extras?: Partial<Pick<KmaHourSlot, "ptyCode" | "pop" | "sky">>,
): KmaHourSlot {
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  const date = `${kst.getFullYear()}-${mm}-${dd}`;
  const hour = `${String(kst.getHours()).padStart(2, "0")}00`;
  const skyRaw = extras?.sky;
  const sky =
    skyRaw === 1 || skyRaw === 3 || skyRaw === 4 ? skyRaw : 1;
  const ptyRaw = extras?.ptyCode;
  const ptyCode =
    ptyRaw === 0 || ptyRaw === 1 || ptyRaw === 3 || ptyRaw === 4 ? ptyRaw : 0;
  const pop = Math.max(0, Math.min(100, extras?.pop ?? 0));
  return {
    date,
    hour,
    windSpeed: w.windSpeed,
    windDir: w.windDir,
    waveHeight: w.waveHeight,
    temp: w.temp,
    ptyCode,
    pcp: 0,
    pop,
    sky,
  };
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
    const parsed = parseKmaItems(items);
    return sortKmaSlotsByTime(parsed);
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

// ─── 기상청 중기예보 (3~10일) ────────────────────────────────────────────────
//
//  MiddleTermFcstDay: WorkPlanView 달력에서 사용하는 일별 예보 단위.
//  단기예보(KmaHourSlot)와 달리 일 평균값으로 집계해서 제공.
//
//  API: 중기육상예보 — getMidLandFcst (landRegId, tmFc)
//       중기해상예보 — getMidSeaFcst  (regId, tmFc)
//       중기기온예보 — getMidTa       (regId, tmFc)
//
//  포털: https://www.data.go.kr/data/15059468/openapi.do (중기예보)
//
//  키: VITE_KMA_SERVICE_KEY (단기예보와 동일 키 사용 가능)
//  추가 변수:
//    VITE_KMA_MIDLAND_REGION  — 중기육상예보 지점코드 (기본: 11H20000 남해안)
//    VITE_KMA_MIDTA_REGION    — 중기기온예보 지점코드 (기본: 11H20000)
//    VITE_KMA_MIDSEA_REGION   — 중기해상예보 지점코드 (기본: 12B20000 남해중부)

export interface MiddleTermFcstDay {
  /** "YYYY-MM-DD" */
  date: string;
  /** 풍속 추정값(m/s) — 중기육상 rnSt·sky에서 간접 추정 */
  windSpeedEstimated: number;
  /** 파고 — 중기해상예보 파고 범위 중간값(m). 없으면 0 */
  waveHeight: number;
  /** 최저기온(°C) */
  tempMin: number;
  /** 최고기온(°C) */
  tempMax: number;
  /** 강수확률(%) — 오전·오후 중 최대 */
  pop: number;
  /** 강수 형태 대리(0: 없음, 1: 비, 3: 눈) */
  ptyCode: number;
  /** 하늘상태 1~4 (예보문에서 추출) */
  sky: number;
  /** 원본 예보 문자열(참고) */
  wfKo: string;
}

function midTmFc(): string {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const h = kst.getHours();
  const base = h < 18 ? "0600" : "1800";
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  return `${kst.getFullYear()}${mm}${dd}${base}`;
}

/** 중기 예보 문자열에서 하늘·pty 코드 간단 추출 */
function parseMidWf(wf: string): { sky: number; ptyCode: number } {
  if (!wf) return { sky: 1, ptyCode: 0 };
  if (wf.includes("눈")) return { sky: 4, ptyCode: 3 };
  if (wf.includes("비") || wf.includes("소나기")) return { sky: 4, ptyCode: 1 };
  if (wf.includes("흐")) return { sky: 4, ptyCode: 0 };
  if (wf.includes("구름많")) return { sky: 3, ptyCode: 0 };
  return { sky: 1, ptyCode: 0 };
}

/** 중기해상 파고 문자열 "0.5~1.0m" → 중간값(m) */
function parseWaveRange(str: string): number {
  const m = str?.match(/([\d.]+)~([\d.]+)/);
  if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
  const single = str?.match(/([\d.]+)/);
  if (single) return parseFloat(single[1]);
  return 0;
}

/**
 * 기상청 중기예보 API(육상·해상·기온) 통합 호출 → 3~10일 일별 슬롯 반환.
 * API 키 없으면 null 반환 → 호출 측에서 목업으로 대체.
 */
export async function fetchKmaMiddleTermForecast(): Promise<MiddleTermFcstDay[] | null> {
  const serviceKey = import.meta.env.VITE_KMA_SERVICE_KEY;
  if (!serviceKey) return null;

  const tmFc = midTmFc();
  const landRegId = import.meta.env.VITE_KMA_MIDLAND_REGION?.trim() || "11H20000";
  const taRegId   = import.meta.env.VITE_KMA_MIDTA_REGION?.trim()   || "11H20000";
  const seaRegId  = import.meta.env.VITE_KMA_MIDSEA_REGION?.trim()  || "12B20000";

  const BASE = "https://apis.data.go.kr/1360000/MidFcstInfoService";

  async function call(op: string, regId: string) {
    const u = new URL(`${BASE}/${op}`);
    u.searchParams.set("serviceKey", serviceKey);
    u.searchParams.set("pageNo", "1");
    u.searchParams.set("numOfRows", "10");
    u.searchParams.set("dataType", "JSON");
    u.searchParams.set("regId", regId);
    u.searchParams.set("tmFc", tmFc);
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.response?.body?.items?.item?.[0] ?? null;
  }

  try {
    const [land, sea, ta] = await Promise.all([
      call("getMidLandFcst", landRegId),
      call("getMidSeaFcst",  seaRegId),
      call("getMidTa",       taRegId),
    ]);

    if (!land && !ta) return null;

    const days: MiddleTermFcstDay[] = [];
    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));

    // 중기예보는 D+3 ~ D+10
    for (let n = 3; n <= 10; n++) {
      const d = new Date(kst);
      d.setDate(d.getDate() + n);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const amPop  = Number(land?.[`rnSt${n}Am`]  ?? land?.[`rnSt${n}`]  ?? 20);
      const pmPop  = Number(land?.[`rnSt${n}Pm`]  ?? land?.[`rnSt${n}`]  ?? 20);
      const pop    = Math.max(amPop, pmPop);
      const wfAm   = String(land?.[`wf${n}Am`]    ?? land?.[`wf${n}`]    ?? "");
      const wfPm   = String(land?.[`wf${n}Pm`]    ?? land?.[`wf${n}`]    ?? "");
      const wfText = wfPm || wfAm;
      const { sky, ptyCode } = parseMidWf(wfText);

      const taMin  = Number(ta?.[`taMin${n}`] ?? 15);
      const taMax  = Number(ta?.[`taMax${n}`] ?? 22);

      // 해상 파고: D+3~D+7 범위
      const waveStr   = String(sea?.[`wh${n}B`] ?? sea?.[`wh${n}A`] ?? "");
      const waveHeight = parseWaveRange(waveStr);

      // 풍속: 파고·강수확률·하늘에서 간접 추정 (중기육상에 풍속 없음)
      const windSpeedEstimated =
        waveHeight > 0 ? Math.max(2, waveHeight * 4.5) :
        sky === 4 ? (pop > 60 ? 9 : 6) :
        sky === 3 ? 5 : 3;

      days.push({ date: dateStr, windSpeedEstimated, waveHeight, tempMin: taMin, tempMax: taMax, pop, ptyCode, sky, wfKo: wfText });
    }
    return days;
  } catch {
    return null;
  }
}

/** WorkPlanView 달력에서 쓸 수 있도록 MiddleTermFcstDay → ForecastDay-유사 형식 변환 */
export function middleTermToForecastWeather(d: MiddleTermFcstDay): {
  windSpeed: number;
  windDir: number;
  windGust: number;
  waveHeight: number;
  visibility: number;
  temp: number;
  precipitation: number;
  pop: number;
  sky: number;
  ptyCode: number;
} {
  const gust = Math.min(25, d.windSpeedEstimated * 1.4);
  const vis  = estimatedVisibilityKmFromSlot({ sky: d.sky, ptyCode: d.ptyCode, pop: d.pop });
  const precip = d.ptyCode > 0 ? (d.pop > 70 ? 10 : d.pop > 50 ? 5 : 2) : 0;
  return {
    windSpeed: d.windSpeedEstimated,
    windDir: 180,
    windGust: Math.max(d.windSpeedEstimated + 0.5, gust),
    waveHeight: d.waveHeight,
    visibility: vis,
    temp: (d.tempMin + d.tempMax) / 2,
    precipitation: precip,
    pop: d.pop,
    sky: d.sky,
    ptyCode: d.ptyCode,
  };
}

/** 중기예보 목업 (7일치, API 키 없을 때) */
export function generateMockMiddleTerm(): MiddleTermFcstDay[] {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(kst);
    d.setDate(d.getDate() + 3 + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const pop = Math.floor(Math.random() * 70);
    const sky = pop > 55 ? 4 : pop > 35 ? 3 : 1;
    const ptyCode = pop > 60 ? 1 : 0;
    const waveHeight = 0.3 + Math.random() * 1.4;
    return {
      date: dateStr,
      windSpeedEstimated: 2 + waveHeight * 3.5 + Math.random() * 2,
      waveHeight,
      tempMin: 13 + Math.floor(Math.random() * 5),
      tempMax: 20 + Math.floor(Math.random() * 6),
      pop,
      ptyCode,
      sky,
      wfKo: sky === 4 ? (ptyCode ? "흐리고 비" : "흐림") : sky === 3 ? "구름많음" : "맑음",
    };
  });
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
