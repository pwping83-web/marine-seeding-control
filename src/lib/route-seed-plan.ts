import { haversineKm } from "@/lib/seeding-day-eval";

/** 선분 위 비율 t∈[0,1] 보간 (짧은 구간에서 충분) */
function interpSegment(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 꼭짓점 누적 거리(km), cum[0]=0, 마지막=전장 */
function cumulativeKm(vertices: [number, number][]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < vertices.length; i++) {
    const d = haversineKm(vertices[i - 1][0], vertices[i - 1][1], vertices[i][0], vertices[i][1]);
    cum.push(cum[i - 1] + d);
  }
  return cum;
}

/** 폴리라인을 따라 거리 d(km) 지점 좌표 */
export function pointAtDistanceAlongPolyline(
  vertices: [number, number][],
  cum: number[],
  dKm: number,
): [number, number] {
  const total = cum[cum.length - 1];
  if (vertices.length < 2) return vertices[0] ? [...vertices[0]] : [0, 0];
  if (total <= 1e-9) return [...vertices[0]];
  const clamped = Math.max(0, Math.min(dKm, total));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (cum[mid] <= clamped) lo = mid;
    else hi = mid;
  }
  const i = lo;
  const segLen = cum[i + 1] - cum[i];
  const t = segLen > 1e-12 ? (clamped - cum[i]) / segLen : 0;
  return interpSegment(vertices[i], vertices[i + 1], t);
}

/**
 * 닫힌 폴리라인을 따라 균등 간격으로 살포 예정점 N개 (내부 분할: 전장의 1/(N+1) … N/(N+1) 지점).
 * @param maxCount 상한 (성능·UI)
 */
export function evenlySpacedSeedPointsAlongRoute(
  vertices: [number, number][],
  count: number,
  maxCount = 500,
): [number, number][] {
  const n = Math.max(0, Math.min(Math.floor(count), maxCount));
  if (vertices.length < 2 || n === 0) return [];
  const cum = cumulativeKm(vertices);
  const total = cum[cum.length - 1];
  if (total <= 1e-9) return Array.from({ length: n }, () => [...vertices[0]] as [number, number]);
  const out: [number, number][] = [];
  for (let k = 1; k <= n; k++) {
    const d = (k / (n + 1)) * total;
    out.push(pointAtDistanceAlongPolyline(vertices, cum, d));
  }
  return out;
}
