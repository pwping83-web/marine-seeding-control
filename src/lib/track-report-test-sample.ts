import { OPS_AREA_CENTER, SIM_SEA_OFFSET } from "@/app/geo/koreaOpsArea";
import {
  addDaysYmd,
  endOfDayMs,
  startOfDayMs,
  type SeedDropLike,
} from "@/lib/seeding-day-eval";

/**
 * 관공서 시연·UI 테스트용. 운영 전환 시 `.env`에 `VITE_TRACK_REPORT_TEST=0` 설정.
 */
export function trackReportUsesTestSample(): boolean {
  const v = import.meta.env.VITE_TRACK_REPORT_TEST;
  if (v === "0" || v === "false") return false;
  return true;
}

const BASE_LAT = OPS_AREA_CENTER.lat + SIM_SEA_OFFSET.lat;
const BASE_LNG = OPS_AREA_CENTER.lng + SIM_SEA_OFFSET.lng;

/**
 * 살포 시연 좌표 (BASE = OPS_AREA_CENTER + SIM_SEA_OFFSET = 34.54, 127.97 기준 오프셋)
 * 모든 드롭 포인트가 34.44~34.49°N · 127.93~128.08°E — 개방 해역 보장
 */
const SLOTS: { h: number; m: number; label: string; dlat: number; dlng: number }[] = [
  { h: 8,  m: 12, label: "A01", dlat: -0.060, dlng: -0.030 }, // ≈ 34.480, 127.940
  { h: 9,  m: 48, label: "A02", dlat: -0.080, dlng: -0.010 }, // ≈ 34.460, 127.960
  { h: 11, m: 22, label: "B02", dlat: -0.100, dlng:  0.030 }, // ≈ 34.440, 128.000
  { h: 14, m: 5,  label: "B03", dlat: -0.090, dlng:  0.080 }, // ≈ 34.450, 128.050
  { h: 16, m: 38, label: "C01", dlat: -0.070, dlng:  0.110 }, // ≈ 34.470, 128.080
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function buildSampleDropsForYmdRange(startYmd: string, endYmd: string): SeedDropLike[] {
  const out: SeedDropLike[] = [];
  let cur = startYmd;
  const endMs = endOfDayMs(endYmd);
  let seq = 0;
  while (startOfDayMs(cur) <= endMs) {
    const day0 = startOfDayMs(cur);
    for (let i = 0; i < SLOTS.length; i++) {
      const s = SLOTS[i];
      seq++;
      const recordedAt = day0 + (s.h * 60 + s.m) * 60 * 1000;
      out.push({
        id: `TST-${cur.replace(/-/g, "")}-${pad2(i + 1)}`,
        label: s.label,
        time: timeLabel(recordedAt),
        lat: BASE_LAT + s.dlat,
        lng: BASE_LNG + s.dlng,
        status: "성공",
        recordedAt,
      });
    }
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

/**
 * 시연용 4-꼭지점 항로: 여수항 출항 → 외해 → 살포 구역 → 여수항 귀항
 * 전 구간 해수면 (127.79°E 이상, 돌산도·군도 완전 회피)
 */
const SEA_ROUTE_PATH: { lat: number; lng: number }[] = [
  { lat: 34.743, lng: 127.743 }, // ① 여수항 출항 (육지·항구)
  { lat: 34.648, lng: 127.858 }, // ② 돌산도 동안 → 외해 진입
  { lat: 34.490, lng: 128.005 }, // ③ 남해 개방 해역 살포 구역
  { lat: 34.743, lng: 127.743 }, // ④ 여수항 귀항 (원점 복귀)
];

/** 살포 전후 궤적 시연 — LTE가 없을 때만 사용 */
export function buildSampleLteForYmdRange(startYmd: string, endYmd: string): {
  lat: number;
  lng: number;
  recorded_at: string;
}[] {
  const out: { lat: number; lng: number; recorded_at: string }[] = [];
  let cur = startYmd;
  const endMs = endOfDayMs(endYmd);
  const steps = SEA_ROUTE_PATH.length - 1; // 7 구간 = 8 꼭지점
  while (startOfDayMs(cur) <= endMs) {
    const day0 = startOfDayMs(cur);
    const startMs = day0 + 7 * 60 * 60 * 1000;   // 07:00 출항
    const endDay  = day0 + 17.5 * 60 * 60 * 1000; // 17:30 귀항
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const t = Math.round(startMs + u * (endDay - startMs));
      out.push({
        lat: SEA_ROUTE_PATH[i].lat,
        lng: SEA_ROUTE_PATH[i].lng,
        recorded_at: new Date(t).toISOString(),
      });
    }
    cur = addDaysYmd(cur, 1);
  }
  return out;
}
