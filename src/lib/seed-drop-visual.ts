/**
 * 살포점 지도·이력용 색상 — 기록 시각(`recordedAt`) 기준 연령 밴드.
 * 구역 라벨(A01)·금일 GNSS·`mob-` id 살포는 붉은 연령 계열(`dropAgeColors`).
 * 구 `투하-`/`GNSS-`/`센서-` 접두 라벨만 청록(`dropTestAgeColors`)으로 구분.
 */

export type DropAgeBand = "recent" | "orange3m" | "pink1y" | "light2y" | "pale";

export type ParsedManualDropLabel = {
  ymd: string;
  zoneLike: string;
  /** 한 줄 표기 — 예: `2026-05-12 T01` */
  displayLine: string;
};

export function dropAgeBand(recordedAt: number, now: number = Date.now()): DropAgeBand {
  if (!Number.isFinite(recordedAt) || !Number.isFinite(now)) return "recent";
  const days = (now - recordedAt) / 86_400_000;
  if (days <= 45) return "recent";
  if (days < 120) return "orange3m";
  if (days < 400) return "pink1y";
  if (days < 800) return "light2y";
  return "pale";
}

/** 시뮬·구역 일반 살포점 — 연령 밴드별 색상 (특허 도면 fig04 팔레트: 초록→노랑→주황→회색) */
export function dropAgeColors(band: DropAgeBand): { fill: string; stroke: string; pulse: string } {
  switch (band) {
    case "recent":
      return { fill: "#16a34a", stroke: "#bbf7d0", pulse: "#4ade80" };   // 초록 — 0~45일
    case "orange3m":
      return { fill: "#ca8a04", stroke: "#fef9c3", pulse: "#facc15" };   // 노랑 — 46~120일
    case "pink1y":
      return { fill: "#ea580c", stroke: "#ffedd5", pulse: "#fb923c" };   // 주황 — 121~400일
    case "light2y":
      return { fill: "#64748b", stroke: "#e2e8f0", pulse: "#94a3b8" };   // 연회색 — 401~800일
    case "pale":
    default:
      return { fill: "#334155", stroke: "#cbd5e1", pulse: "#64748b" };   // 진회색 — 800일+
  }
}

/** 수동 기록 — 같은 날짜(기록 경과) 밴드이지만 청록 계열로 구역 살포와 구분 */
export function dropTestAgeColors(band: DropAgeBand): { fill: string; stroke: string; pulse: string } {
  switch (band) {
    case "recent":
      return { fill: "#164e63", stroke: "#a5f3fc", pulse: "#22d3ee" };
    case "orange3m":
      return { fill: "#155e75", stroke: "#99f6e4", pulse: "#2dd4bf" };
    case "pink1y":
      return { fill: "#0e7490", stroke: "#cffafe", pulse: "#38bdf8" };
    case "light2y":
      return { fill: "#0369a1", stroke: "#e0f2fe", pulse: "#7dd3fc" };
    case "pale":
    default:
      return { fill: "#475569", stroke: "#e2e8f0", pulse: "#94a3b8" };
  }
}

/**
 * 수동·테스트 출처(이력 표시·파싱용).
 * `YYYY-MM-DD T01` 형 GNSS 시험 살포도 포함 — 라벨 정리에 쓴다.
 */
export function isManualTestOriginDrop(label: string, id: string): boolean {
  if (/^mob-/u.test(id)) return true;
  const t = label.trim();
  if (/^\d{4}-\d{2}-\d{2} T\d+/u.test(t)) return true;
  if (/^투하-|^GNSS-|^센서-/u.test(t)) return true;
  return false;
}

/**
 * 지도 마커만 청록 팔레트(`dropTestAgeColors`) — 구역 살포(A01)와 눈에 띄게 구분할 때.
 * `mob-`·금일 GNSS 시험(`YYYY-MM-DD T##`)은 붉은 연령색과 맞추기 위해 **제외**(레거시 접두만 청록).
 */
export function usesTestTealMarkerPalette(label: string, id: string): boolean {
  const t = label.trim();
  if (/^투하-|^GNSS-|^센서-/u.test(t)) return true;
  return false;
}

/** `YYYY-MM-DD T01` · 구 `투하-`·`GNSS-`·`센서-YYYY-MM-DD-seq` */
export function parseTestStyleDropLabel(label: string): ParsedManualDropLabel | null {
  const t = label.trim();
  let m = /^(\d{4}-\d{2}-\d{2}) T(\d+)$/u.exec(t);
  if (m) {
    const n = parseInt(m[2], 10);
    const zoneLike = `T${Number.isFinite(n) ? String(n).padStart(2, "0") : m[2]}`;
    return { ymd: m[1], zoneLike, displayLine: `${m[1]} ${zoneLike}` };
  }
  m = /^(?:투하|GNSS|센서)-(\d{4}-\d{2}-\d{2})-(\d+)/u.exec(t);
  if (m) {
    const n = parseInt(m[2], 10);
    const zoneLike = `T${Number.isFinite(n) ? String(n).padStart(2, "0") : m[2].slice(-2).padStart(2, "0")}`;
    return { ymd: m[1], zoneLike, displayLine: `${m[1]} ${zoneLike}` };
  }
  return null;
}

export function seedDropMarkerColors(opts: {
  recordedAt: number;
  label: string;
  id: string;
  verificationMismatch?: boolean;
  now?: number;
}): { fill: string; stroke: string; pulse: string } {
  if (opts.verificationMismatch) {
    return { fill: "#171717", stroke: "#a3a3a3", pulse: "#737373" };
  }
  const band = dropAgeBand(opts.recordedAt, opts.now);
  if (usesTestTealMarkerPalette(opts.label, opts.id)) {
    return dropTestAgeColors(band);
  }
  return dropAgeColors(band);
}
