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

/** 하루 시연 루트: 출항 → 구역 순회 → 복귀 */
const SLOTS: { h: number; m: number; label: string; dlat: number; dlng: number }[] = [
  { h: 8, m: 12, label: "A01", dlat: 0.004, dlng: -0.006 },
  { h: 9, m: 48, label: "A02", dlat: 0.012, dlng: -0.002 },
  { h: 11, m: 22, label: "B02", dlat: 0.018, dlng: 0.008 },
  { h: 14, m: 5, label: "B03", dlat: 0.01, dlng: 0.014 },
  { h: 16, m: 38, label: "C01", dlat: -0.002, dlng: 0.006 },
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

/** 살포 전후 궤적 시연 — LTE가 없을 때만 사용 */
export function buildSampleLteForYmdRange(startYmd: string, endYmd: string): {
  lat: number;
  lng: number;
  recorded_at: string;
}[] {
  const out: { lat: number; lng: number; recorded_at: string }[] = [];
  let cur = startYmd;
  const endMs = endOfDayMs(endYmd);
  while (startOfDayMs(cur) <= endMs) {
    const day0 = startOfDayMs(cur);
    const dep = { lat: BASE_LAT + 0.001, lng: BASE_LNG - 0.012 };
    const wps = SLOTS.map((s) => ({ lat: BASE_LAT + s.dlat, lng: BASE_LNG + s.dlng }));
    const ret = { lat: BASE_LAT + 0.002, lng: BASE_LNG - 0.011 };
    const path = [dep, ...wps, ret];
    const startMs = day0 + 7 * 60 * 60 * 1000;
    const endDay = day0 + 17.5 * 60 * 60 * 1000;
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const t = startMs + u * (endDay - startMs);
      const segF = u * (path.length - 1);
      const j = Math.min(path.length - 2, Math.floor(segF));
      const lf = segF - j;
      const a = path[j];
      const b = path[j + 1];
      const lat = a.lat + (b.lat - a.lat) * lf;
      const lng = a.lng + (b.lng - a.lng) * lf;
      out.push({ lat, lng, recorded_at: new Date(Math.round(t)).toISOString() });
    }
    cur = addDaysYmd(cur, 1);
  }
  return out;
}
