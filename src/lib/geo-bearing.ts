/** 두 좌표 사이 진북 방위각(도, 0–360) */
export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** GPS heading 미제공(모바일 다수) 시 직전 좌표로 추정, 정지 시 마지막 방위 유지 */
const MIN_MOVE_M_FOR_BEARING = 2.5;

export function resolveGpsHeadingDeg(
  coords: GeolocationCoordinates,
  prev: { lat: number; lng: number } | null,
  lastHeadingDeg: number,
): number {
  const h = coords.heading;
  if (typeof h === "number" && !Number.isNaN(h)) {
    return ((h % 360) + 360) % 360;
  }
  if (prev) {
    const distM = haversineM(prev.lat, prev.lng, coords.latitude, coords.longitude);
    if (distM >= MIN_MOVE_M_FOR_BEARING) {
      return bearingDeg(prev.lat, prev.lng, coords.latitude, coords.longitude);
    }
  }
  return lastHeadingDeg;
}
