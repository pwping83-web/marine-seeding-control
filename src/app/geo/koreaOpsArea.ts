import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";

/**
 * 전라남도 여수 동남쪽 개방 해역 — 돌산도·군도 동쪽 한국 남해 공해상 (WGS84).
 * 이 중심+SIM_SEA_OFFSET 기준으로 변환한 모든 WAYPOINTS가 육지를 피함.
 * BASE(lat 34.54, lng 127.97) 기준 WAYPOINT 분포: 34.44~34.48°N · 127.88~128.13°E
 */
export const OPS_AREA_CENTER = { lat: 34.57, lng: 127.97 } as const;

/**
 * 시뮬 픽셀→위경도 보정: 남쪽으로 0.03° 이동하여 군도를 완전히 벗어난 개방 해역에 배치.
 */
export const SIM_SEA_OFFSET = { lat: -0.03, lng: 0.0 } as const;

/** 지도 패닝: 전라남도 여수·고흥·개방 해역 포함 */
export const OPS_AREA_MAX_BOUNDS: LatLngBoundsExpression = [
  [33.8, 126.5],
  [35.2, 129.0],
];

export function opsCenterTuple(): [number, number] {
  return [OPS_AREA_CENTER.lat, OPS_AREA_CENTER.lng];
}

export function isNearKorea(lat: number, lng: number): boolean {
  return lat >= 32 && lat <= 39 && lng >= 124 && lng <= 133;
}

/** Leaflet LatLngBounds용 — 잘못된 점이 섞였을 때 한국 인근만 사용 */
export function filterPointsNearKorea(
  pts: LatLngExpression[]
): LatLngExpression[] {
  return pts.filter((p) => {
    const lat = Array.isArray(p) ? p[0] : p.lat;
    const lng = Array.isArray(p) ? p[1] : p.lng;
    return isNearKorea(lat, lng);
  });
}
