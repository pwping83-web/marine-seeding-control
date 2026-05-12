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
