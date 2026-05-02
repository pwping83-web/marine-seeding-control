import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";

/**
 * 남해 거제·통영 인근 시연 구역 (WGS84).
 * 지도 초기 중심·픽셀→위경도 기준점.
 */
export const OPS_AREA_CENTER = { lat: 34.76, lng: 128.6 } as const;

/**
 * 시뮬 픽셀→위경도만으로는 OSM/CARTO 육지와 어긋나 육지에 찍히는 경우가 있어,
 * 살포·항적을 **거제 앞 남해 해상**으로 통일 보정(°).
 */
export const SIM_SEA_OFFSET = { lat: -0.055, lng: 0.01 } as const;

/** 지도 패닝: 남해 거제·통영·진해 일대만 (시연 구역 최대 확대에 맞춘 좁은 박스) */
export const OPS_AREA_MAX_BOUNDS: LatLngBoundsExpression = [
  [34.12, 127.72],
  [35.38, 129.48],
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
