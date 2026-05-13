/**
 * seeding-plan-ai.ts
 *
 * AI 기반 종자 살포 계획 엔진
 *  · 기상 조건 → 일일 살포 한도 산출
 *  · 해역 격자 점수화 (수심·수온·해류 시뮬레이션 포함)
 *  · A* 알고리즘으로 회피 경로 계산 (암초·보호구역 장애물 처리 + 선택적 기상 가중 스텝 비용)
 *  · Arduino PID 속도 제어 파라미터 제안
 *
 * 외부 API가 없는 항목(수심·수온·해류)은
 * 거제·통영 인근 해역의 해양 특성을 기반으로 물리 시뮬레이션합니다.
 */

// ─── 공통 타입 ────────────────────────────────────────────────────────────────

export interface WeatherInput {
  windSpeed: number;   // m/s
  windDir: number;     // 도
  windGust: number;    // m/s
  waveHeight: number;  // m
  visibility: number;  // km
  temp: number;        // °C
}

export interface DailyLimitResult {
  limit: number;          // 오늘 가능한 최대 살포 개수
  baseLimit: number;      // 기준 최대치
  reductionPct: number;   // 감소율 (0~1)
  safeHours: number;      // 오늘 안전 조업 예상 시간
  factors: LimitFactor[];
}

export interface LimitFactor {
  name: string;
  penalty: number;   // 0~1 감소 계수 (0 = 영향 없음, 1 = 불가)
  desc: string;
  icon: string;
}

// ─── 최적 존 타입 ─────────────────────────────────────────────────────────────

export interface SeaZone {
  id: string;
  lat: number;
  lng: number;
  label: string;
  score: number;          // 0~100
  depthM: number;         // 시뮬 수심 (m)
  tempC: number;          // 시뮬 수온 (°C)
  currentSpeedMs: number; // 시뮬 해류 (m/s)
  currentDirDeg: number;  // 해류 방향
  reasons: string[];      // 점수 근거
  grade: "최적" | "양호" | "보통" | "불량";
}

// ─── A* 경로 타입 ─────────────────────────────────────────────────────────────

export interface LatLng { lat: number; lng: number; }

export interface RouteWaypoint extends LatLng {
  seq: number;
  distKm: number;       // 이전 지점까지 거리
  note?: string;
}

export interface RouteResult {
  waypoints: RouteWaypoint[];
  totalDistKm: number;
  estTimeMin: number;   // 선박 4.5kt 기준
  obstaclesAvoided: number;
}

// ─── PID 파라미터 ─────────────────────────────────────────────────────────────

export interface PidParams {
  targetSpeedKt: number;
  Kp: number; Ki: number; Kd: number;
  sampleMs: number;
  maxOutput: number;   // PWM 최대값 (0~255)
  desc: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 일일 살포 한도 계산
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_DAILY_LIMIT = 1200; // 기상 최적일 기준 최대 살포 수

export function calcDailyLimit(wx: WeatherInput): DailyLimitResult {
  const factors: LimitFactor[] = [];

  // 풍속 패널티
  let windPenalty = 0;
  if (wx.windSpeed >= 15) windPenalty = 1.0;
  else if (wx.windSpeed >= 12) windPenalty = 0.7;
  else if (wx.windSpeed >= 10) windPenalty = 0.4;
  else if (wx.windSpeed >= 7)  windPenalty = 0.15;
  factors.push({
    name: "풍속", icon: "🌬️", penalty: windPenalty,
    desc: windPenalty === 0 ? `${wx.windSpeed.toFixed(1)} m/s — 양호`
      : `${wx.windSpeed.toFixed(1)} m/s — ${Math.round(windPenalty * 100)}% 감소`,
  });

  // 파고 패널티
  let wavePenalty = 0;
  if (wx.waveHeight >= 2.0) wavePenalty = 1.0;
  else if (wx.waveHeight >= 1.5) wavePenalty = 0.6;
  else if (wx.waveHeight >= 1.0) wavePenalty = 0.3;
  else if (wx.waveHeight >= 0.7) wavePenalty = 0.1;
  factors.push({
    name: "파고", icon: "🌊", penalty: wavePenalty,
    desc: wavePenalty === 0 ? `${wx.waveHeight.toFixed(1)} m — 양호`
      : `${wx.waveHeight.toFixed(1)} m — ${Math.round(wavePenalty * 100)}% 감소`,
  });

  // 시정 패널티
  let visPenalty = 0;
  if (wx.visibility < 2) visPenalty = 0.8;
  else if (wx.visibility < 5) visPenalty = 0.35;
  else if (wx.visibility < 8) visPenalty = 0.1;
  factors.push({
    name: "시정", icon: "👁️", penalty: visPenalty,
    desc: visPenalty === 0 ? `${wx.visibility.toFixed(0)} km — 양호`
      : `${wx.visibility.toFixed(0)} km — ${Math.round(visPenalty * 100)}% 감소`,
  });

  // 기온 패널티 (수온 연동 — 저수온 시 잘피 생착률 저하)
  const seedlingOptLow = 14; const seedlingOptHigh = 26;
  let tempPenalty = 0;
  if (wx.temp < 8 || wx.temp > 30) tempPenalty = 0.5;
  else if (wx.temp < seedlingOptLow) tempPenalty = 0.15;
  else if (wx.temp > seedlingOptHigh) tempPenalty = 0.2;
  factors.push({
    name: "기온/수온", icon: "🌡️", penalty: tempPenalty,
    desc: tempPenalty === 0 ? `${wx.temp.toFixed(1)}°C — 생착 최적`
      : `${wx.temp.toFixed(1)}°C — 생착률 저하 ${Math.round(tempPenalty * 100)}%`,
  });

  // 최종 감소율 (worst factor 우선 — 복합 패널티)
  const maxPenalty = Math.max(...factors.map((f) => f.penalty));
  const combinedPenalty = Math.min(1, maxPenalty + factors.filter((f) => f.penalty > 0.05).length * 0.05);
  const reductionPct = Math.round(combinedPenalty * 100) / 100;
  const limit = Math.max(0, Math.round(BASE_DAILY_LIMIT * (1 - reductionPct)));

  // 안전 조업 예상 시간 (간이)
  const safeHours = combinedPenalty >= 1 ? 0
    : combinedPenalty >= 0.6 ? 2
    : combinedPenalty >= 0.3 ? 4
    : combinedPenalty >= 0.1 ? 7 : 9;

  return { limit, baseLimit: BASE_DAILY_LIMIT, reductionPct, safeHours, factors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 해역 격자 점수화 — 수심·수온·해류 시뮬레이션
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 거제·통영 인근 잠재 살포 구역 후보
 * 실제 사업구역 좌표를 대변하는 격자점 (0.025° 간격)
 */
/** 작업 계획 뷰 지도 — 제1구역 후보 격자(지도 마커·맞춤용) */
export const ZONE1_PLAN_MARKERS: ReadonlyArray<{ lat: number; lng: number; label: string }> = [
  { lat: 34.710, lng: 128.580, label: "제1구역 A" },
  { lat: 34.710, lng: 128.610, label: "제1구역 B" },
  { lat: 34.710, lng: 128.640, label: "제1구역 C" },
];

const CANDIDATE_GRID: Array<{ lat: number; lng: number; label: string }> = [
  // 거제 남부 해역
  ...ZONE1_PLAN_MARKERS,
  // 통영 동부 해역
  { lat: 34.735, lng: 128.555, label: "제2구역 A" },
  { lat: 34.735, lng: 128.580, label: "제2구역 B" },
  { lat: 34.735, lng: 128.610, label: "제2구역 C" },
  // 거제 동부 내만
  { lat: 34.760, lng: 128.580, label: "제3구역 A" },
  { lat: 34.760, lng: 128.610, label: "제3구역 B" },
  { lat: 34.760, lng: 128.640, label: "제3구역 C" },
  // 한산도 근해
  { lat: 34.785, lng: 128.555, label: "제4구역 A" },
  { lat: 34.785, lng: 128.580, label: "제4구역 B" },
];

/** 잘피(Zostera marina) 생육 최적 수심: 0.5 ~ 5 m */
const ZOSTERA_DEPTH_OPT = { min: 0.5, max: 5.0 };
const ZOSTERA_TEMP_OPT  = { min: 12, max: 22 };
const ZOSTERA_CURRENT_MAX = 0.8; // m/s 초과 시 생착 불량

/** 거제 해역 수심 시뮬 (지형 특성 반영) */
function simDepth(lat: number, lng: number): number {
  // 남쪽·외해 방향일수록 깊어지는 경향
  const southBias = (34.76 - lat) * 40;       // 남쪽 +2m per 0.05°
  const eastBias  = (lng - 128.55) * 15;       // 외해 방향
  const baseDepth = 3.2 + southBias + eastBias;
  // 소규모 지형 노이즈 (결정적 — 위경도 기반 해시)
  const noise = ((Math.sin(lat * 317) + Math.cos(lng * 421)) * 0.8);
  return Math.max(0.3, Math.min(18, baseDepth + noise));
}

/** 수온 시뮬 (계절·수심 반영) */
function simTemp(depth: number): number {
  const month = new Date().getMonth() + 1;
  // 남해 거제 수온 월별 평균 근사
  const surfaceTemp = [9, 9, 10, 13, 17, 21, 24, 26, 23, 19, 15, 11][month - 1];
  // 수심별 하강 (thermocline 약 0.3°C/m)
  const depthCooling = Math.min(depth * 0.3, 4.0);
  return Math.round((surfaceTemp - depthCooling) * 10) / 10;
}

/** 해류 시뮬 (조류 + 풍속 영향) */
function simCurrent(lat: number, lng: number, wx: WeatherInput): { speed: number; dir: number } {
  // 대마 난류 기본 방향 (NE 방향, 약 50°)
  const baseDirDeg = 50;
  // 조류 속도 (거제 내만 0.2~0.6 m/s, 외해 0.1~0.3)
  const isInnerBay = lat > 34.74 && lng < 128.62;
  const baseSpeed = isInnerBay ? 0.35 : 0.18;
  // 풍속 추가 (풍향이 해류 방향과 유사할 때 증가)
  const windContrib = wx.windSpeed * 0.012;
  const speed = Math.min(1.2, baseSpeed + windContrib
    + Math.abs(Math.sin(lat * 200 + lng * 150)) * 0.12);
  const dir = (baseDirDeg + (lat * 50 % 30) - 15) % 360;
  return { speed: Math.round(speed * 100) / 100, dir: Math.round(dir) };
}

/** 구역 종합 점수 (0~100) */
function scoreZone(cand: typeof CANDIDATE_GRID[0], wx: WeatherInput): SeaZone {
  const depth   = simDepth(cand.lat, cand.lng);
  const temp    = simTemp(depth);
  const current = simCurrent(cand.lat, cand.lng, wx);
  const reasons: string[] = [];
  let score = 100;

  // 수심 점수 (잘피 적정 0.5~5m)
  if (depth < ZOSTERA_DEPTH_OPT.min) {
    score -= 35; reasons.push(`수심 ${depth.toFixed(1)}m — 너무 얕음`);
  } else if (depth > ZOSTERA_DEPTH_OPT.max) {
    const excess = depth - ZOSTERA_DEPTH_OPT.max;
    const pen = Math.min(30, excess * 6);
    score -= pen; reasons.push(`수심 ${depth.toFixed(1)}m — 적정 초과 (−${pen.toFixed(0)}점)`);
  } else {
    reasons.push(`수심 ${depth.toFixed(1)}m ✓`);
  }

  // 수온 점수 (12~22°C 최적)
  if (temp < ZOSTERA_TEMP_OPT.min) {
    score -= 20; reasons.push(`수온 ${temp}°C — 저온 생착 불량`);
  } else if (temp > ZOSTERA_TEMP_OPT.max) {
    score -= 15; reasons.push(`수온 ${temp}°C — 고온 스트레스`);
  } else {
    reasons.push(`수온 ${temp}°C ✓`);
  }

  // 해류 점수 (0.8 m/s 이하가 양호)
  if (current.speed > ZOSTERA_CURRENT_MAX) {
    score -= 25; reasons.push(`해류 ${current.speed} m/s — 종자 유실 위험`);
  } else if (current.speed > 0.5) {
    score -= 10; reasons.push(`해류 ${current.speed} m/s — 보통`);
  } else {
    reasons.push(`해류 ${current.speed} m/s ✓`);
  }

  // 기상 패널티 (파고·풍속)
  if (wx.waveHeight >= 1.0) {
    score -= Math.round(wx.waveHeight * 8); reasons.push(`파고 ${wx.waveHeight.toFixed(1)}m — 살포 정밀도 저하`);
  }

  score = Math.max(0, Math.min(100, score));

  const grade: SeaZone["grade"] =
    score >= 80 ? "최적" : score >= 60 ? "양호" : score >= 40 ? "보통" : "불량";

  return {
    id: cand.label.replace(/\s/g, "-"),
    lat: cand.lat, lng: cand.lng,
    label: cand.label, score,
    depthM: depth, tempC: temp,
    currentSpeedMs: current.speed, currentDirDeg: current.dir,
    reasons, grade,
  };
}

/** 전체 후보 구역 점수화 후 내림차순 정렬 */
export function rankSeedingZones(wx: WeatherInput): SeaZone[] {
  return CANDIDATE_GRID
    .map((c) => scoreZone(c, wx))
    .sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. A* 경로 계산 — 장애물(암초·보호구역) 회피
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 거제·통영 해역 장애물 목록 (실제 해도 기반 개략 좌표)
 * 실제 운영 시 KHOA 해도 API로 대체 가능
 */
export const KNOWN_OBSTACLES: Array<LatLng & { name: string; radiusKm: number }> = [
  { lat: 34.722, lng: 128.592, name: "우제암 암초",      radiusKm: 0.3 },
  { lat: 34.748, lng: 128.568, name: "한산도 보호구역",  radiusKm: 1.2 },
  { lat: 34.775, lng: 128.625, name: "거제도 동안 암반", radiusKm: 0.5 },
  { lat: 34.699, lng: 128.618, name: "칠천도 천수구역",  radiusKm: 0.8 },
];

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isObstructed(p: LatLng): boolean {
  return KNOWN_OBSTACLES.some((obs) => haversineKm(p, obs) < obs.radiusKm);
}

/** 북=0°, 시계방향(0~360) — cur→nb 최초 방위각 */
function initialBearingDeg(cur: LatLng, nb: LatLng): number {
  const φ1 = (cur.lat * Math.PI) / 180;
  const φ2 = (nb.lat * Math.PI) / 180;
  const Δλ = ((nb.lng - cur.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/** 두 방위각(도) 사이의 최소 각도차 (0~180) */
function angularDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * 격자 한 스텝(cur→nb)의 기상 비용 배수(≥1).
 * `WeatherInput.windDir`는 기상청 단기와 동일하게 **풍향(바람이 오는 방향, °)** 으로 해석하고,
 * 이동 방향이 바람이 **밀어 주는 방향**과 반대(역풍)일수록 비용을 키운다.
 * 파고·시정은 경로 선택에 거의 영향을 주지 않도록 두고(전역 상수 배수는 최단 경로 순서를 바꾸지 못함), 풍속·돌풍만 사용한다.
 */
export function weatherStepCostMultiplier(cur: LatLng, nb: LatLng, wx: WeatherInput): number {
  const stepKm = haversineKm(cur, nb);
  if (stepKm < 1e-9) return 1;

  const br = initialBearingDeg(cur, nb);
  const windTowardDeg = (wx.windDir + 180) % 360;
  const alignDeg = angularDiffDeg(br, windTowardDeg);
  const withWind = Math.cos((alignDeg * Math.PI) / 180);
  const into = Math.max(0, -withWind);

  const w = Math.max(0, wx.windSpeed);
  const gustExtra = Math.max(0, wx.windGust - w);
  const penalty = (0.1 * w + 0.05 * gustExtra) * into;

  return Math.min(2.8, 1 + penalty);
}

interface AStarNode {
  lat: number; lng: number;
  g: number; h: number; f: number;
  parent: AStarNode | null;
}

/**
 * A* 경로 탐색
 * - 격자 해상도: 약 0.01° (≈1.1km)
 * - 장애물 반경 이내 셀은 탐색 불가
 * - `wx`가 있으면 각 스텝 비용에 `weatherStepCostMultiplier`(역풍·강풍 반영)를 곱한다. 생략 시 거리만 사용(기존 동작).
 */
export function findAStarRoute(start: LatLng, goal: LatLng, wx?: WeatherInput | null): RouteResult {
  const STEP = 0.012; // 격자 간격(°)
  const snap = (v: number) => Math.round(v / STEP) * STEP;

  const s: AStarNode = { lat: snap(start.lat), lng: snap(start.lng), g: 0, h: 0, f: 0, parent: null };
  const g: AStarNode = { lat: snap(goal.lat),  lng: snap(goal.lng),  g: 0, h: 0, f: 0, parent: null };
  s.h = haversineKm(s, g); s.f = s.h;

  const key = (n: LatLng) => `${n.lat.toFixed(4)},${n.lng.toFixed(4)}`;
  const open: Map<string, AStarNode> = new Map([[key(s), s]]);
  const closed = new Set<string>();

  const dirs = [
    [1,0],[0,1],[-1,0],[0,-1],
    [1,1],[1,-1],[-1,1],[-1,-1],
  ].map(([dy, dx]) => ({ dlat: dy * STEP, dlng: dx * STEP }));

  let found: AStarNode | null = null;
  let iter = 0;
  const MAX_ITER = 2000;

  while (open.size > 0 && iter++ < MAX_ITER) {
    // 최소 f 노드 선택
    let cur: AStarNode | null = null;
    for (const n of open.values()) {
      if (!cur || n.f < cur.f) cur = n;
    }
    if (!cur) break;
    open.delete(key(cur));
    closed.add(key(cur));

    if (haversineKm(cur, g) < STEP * 1.5) { found = cur; break; }

    for (const d of dirs) {
      const nb: LatLng = { lat: cur.lat + d.dlat, lng: cur.lng + d.dlng };
      const nbKey = key(nb);
      if (closed.has(nbKey)) continue;
      if (isObstructed(nb)) { closed.add(nbKey); continue; }
      const geoKm = haversineKm(cur, nb);
      const mult = wx ? weatherStepCostMultiplier(cur, nb, wx) : 1;
      const stepCost = geoKm * mult;
      const gNew = cur.g + stepCost;
      const existing = open.get(nbKey);
      if (existing && existing.g <= gNew) continue;
      const node: AStarNode = { ...nb, g: gNew, h: haversineKm(nb, g), parent: cur, f: 0 };
      node.f = node.g + node.h;
      open.set(nbKey, node);
    }
  }

  // 경로 역추적
  const path: LatLng[] = [];
  let cur = found;
  while (cur) { path.unshift({ lat: cur.lat, lng: cur.lng }); cur = cur.parent; }
  if (path.length === 0) path.push(start, goal); // fallback 직선

  // 중간점 간소화 (Douglas-Peucker 간이 — 5점당 1점 샘플)
  const simplified: LatLng[] = path.filter((_, i) => i === 0 || i === path.length - 1 || i % 5 === 0);

  let totalDist = 0;
  const waypoints: RouteWaypoint[] = simplified.map((p, i) => {
    const dist = i === 0 ? 0 : haversineKm(simplified[i - 1], p);
    totalDist += dist;
    return { ...p, seq: i + 1, distKm: Math.round(dist * 100) / 100 };
  });

  const obstaclesAvoided = KNOWN_OBSTACLES.filter((obs) =>
    path.some((p) => haversineKm(p, obs) < obs.radiusKm + 0.5)
  ).length;

  return {
    waypoints,
    totalDistKm: Math.round(totalDist * 10) / 10,
    estTimeMin: Math.round((totalDist / 8.334) * 60), // 4.5 kt = 8.334 km/h
    obstaclesAvoided,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Arduino PID 속도 제어 파라미터
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 해상 조건(풍속·파고)에 따른 PID 파라미터 제안.
 * 실제 값은 선박 특성에 맞게 현장 튜닝 필요.
 */
export function suggestPidParams(wx: WeatherInput): PidParams {
  const targetKt = wx.waveHeight >= 1.0 || wx.windSpeed >= 10 ? 3.0 : 4.5;

  // 거친 바다일수록 P↑, I↓(적분 와인드업 방지), D↑(진동 감쇠)
  const rough = wx.waveHeight >= 1.0 || wx.windSpeed >= 10;
  const Kp = rough ? 2.8 : 1.8;
  const Ki = rough ? 0.06 : 0.12;
  const Kd = rough ? 0.45 : 0.25;

  return {
    targetSpeedKt: targetKt,
    Kp, Ki, Kd,
    sampleMs: 100,
    maxOutput: 200,
    desc: rough
      ? `파고 ${wx.waveHeight.toFixed(1)}m · 풍속 ${wx.windSpeed.toFixed(1)}m/s — 거친 해상 세팅 (목표 ${targetKt}kt)`
      : `기상 양호 — 정속 살포 세팅 (목표 ${targetKt}kt)`,
  };
}

/** Arduino PID 스케치 코드 스니펫 생성 */
export function generatePidSketch(p: PidParams): string {
  return `// === 해양 살포 속도 PID 제어 (샘플 코드 생성) ===
// 목표 속도: ${p.targetSpeedKt} kt
// 조건: ${p.desc}

const float TARGET_SPEED_KT = ${p.targetSpeedKt};
const float Kp = ${p.Kp};
const float Ki = ${p.Ki};
const float Kd = ${p.Kd};
const int   SAMPLE_MS = ${p.sampleMs};
const int   MAX_OUTPUT = ${p.maxOutput};

float integral = 0, prevError = 0;

int pidCompute(float measured) {
  float error    = TARGET_SPEED_KT - measured;
  integral      += error * (SAMPLE_MS / 1000.0);
  integral       = constrain(integral, -50, 50); // anti-windup
  float deriv    = (error - prevError) / (SAMPLE_MS / 1000.0);
  prevError      = error;
  int output     = (int)(Kp*error + Ki*integral + Kd*deriv);
  return constrain(output, 0, MAX_OUTPUT);
}

void loop() {
  float speedKt = readGPSSpeed(); // GPS NMEA $GPVTG 파싱
  int pwm = pidCompute(speedKt);
  analogWrite(MOTOR_PWM_PIN, pwm);
  delay(SAMPLE_MS);
}`;
}
