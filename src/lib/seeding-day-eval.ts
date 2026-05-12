/** 금일·기간 항적·살포 평가(시연·사후검토용 휴리스틱). 실측 안착률이 아닌 기상 기반 추정치입니다. */

export type SeedDropLike = {
  id: string;
  label: string;
  time: string;
  lat: number;
  lng: number;
  status: string;
  recordedAt: number;
};

export type WeatherLike = {
  windSpeed: number;
  windGust: number;
  waveHeight: number;
  visibility: number;
  temp: number;
};

const MS_PER_DAY = 86_400_000;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfDayMs(ymd: string): number {
  const [y, m, day] = ymd.split("-").map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0).getTime();
}

export function endOfDayMs(ymd: string): number {
  const [y, m, day] = ymd.split("-").map(Number);
  return new Date(y, m - 1, day, 23, 59, 59, 999).getTime();
}

export function filterDropsByYmdRange(
  drops: SeedDropLike[],
  startYmd: string,
  endYmd: string,
): SeedDropLike[] {
  const t0 = startOfDayMs(startYmd);
  const t1 = endOfDayMs(endYmd);
  return drops.filter((d) => d.recordedAt >= t0 && d.recordedAt <= t1);
}

export function mpsToKt(mps: number): number {
  return mps * 1.94384;
}

/**
 * 기상 스트레스에 따른 추정 안착률(%). 50%를 사후 평가 기준선으로 사용.
 * 파고·풍속·돌풍·시정을 가중 감점.
 */
export function estimateAttachmentPercent(weather: WeatherLike): number {
  const wKt = mpsToKt(weather.windSpeed);
  const gKt = mpsToKt(weather.windGust);
  let pct = 88;
  pct -= Math.min(30, weather.waveHeight * 13);
  pct -= Math.min(24, Math.max(0, wKt - 8) * 2.1);
  pct -= Math.min(14, Math.max(0, gKt - 16) * 0.85);
  pct -= Math.min(20, Math.max(0, 9 - weather.visibility) * 2.2);
  return Math.round(Math.max(11, Math.min(97, pct)));
}

export function attachmentMeetsPublicThreshold(pct: number, threshold = 50): boolean {
  return pct >= threshold;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function routeSummaryFromDrops(sorted: SeedDropLike[]): string {
  if (sorted.length === 0) return "—";
  const zones = sorted.map((d) => d.label);
  const compact: string[] = [];
  for (const z of zones) {
    if (compact[compact.length - 1] !== z) compact.push(z);
  }
  return compact.join(" → ");
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const t = startOfDayMs(ymd) + deltaDays * MS_PER_DAY;
  return ymdLocal(new Date(t));
}

// ─── 살포 구역 면적 계산 ───────────────────────────────────────────────────
//
//  Shoelace(가우스 면적 공식) 알고리즘을 위경도 투영에 적용.
//  적도 환산 근사(1도 ≈ 111.32 km)로 ha 단위 환산.
//  실제 측량 정밀도는 아니며, 관제 화면·보고서 참고치용입니다.

/**
 * 위경도 좌표 배열로 둘러싸인 폴리곤의 추정 면적(ha).
 * 최소 3점 필요. 점이 부족하면 0 반환.
 */
export function calcPolygonAreaHa(coords: { lat: number; lng: number }[]): number {
  if (coords.length < 3) return 0;
  const DEG_TO_KM_LAT = 111.32;
  const midLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const DEG_TO_KM_LNG = DEG_TO_KM_LAT * Math.cos((midLat * Math.PI) / 180);

  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = coords[i].lng * DEG_TO_KM_LNG;
    const yi = coords[i].lat * DEG_TO_KM_LAT;
    const xj = coords[j].lng * DEG_TO_KM_LNG;
    const yj = coords[j].lat * DEG_TO_KM_LAT;
    area += xi * yj - xj * yi;
  }
  const km2 = Math.abs(area) / 2;
  return km2 * 100; // 1 km² = 100 ha
}

/**
 * 살포 점 집합에서 Convex Hull을 근사한 뒤 면적(ha) 계산.
 * 점들의 외곽을 감싸는 볼록 다각형을 기반으로 하기 때문에
 * 실제 격자 살포 구역과 차이가 있을 수 있습니다.
 */
export function estimateSeedingAreaHa(drops: { lat: number; lng: number }[]): number {
  if (drops.length < 3) return 0;
  const hull = convexHull(drops);
  return calcPolygonAreaHa(hull);
}

/** Graham Scan 기반 간단한 Convex Hull */
function convexHull(pts: { lat: number; lng: number }[]): { lat: number; lng: number }[] {
  const sorted = [...pts].sort((a, b) => a.lng !== b.lng ? a.lng - b.lng : a.lat - b.lat);
  const cross = (o: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  const lower: typeof sorted = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof sorted = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

/** ha 값을 사람이 읽기 좋은 문자열로 변환 (예: "2.34 ha", "0.12 ha") */
export function formatAreaHa(ha: number): string {
  if (ha <= 0) return "-";
  return ha >= 1 ? `${ha.toFixed(2)} ha` : `${(ha * 10000).toFixed(0)} m²`;
}
