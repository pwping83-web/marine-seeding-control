/**
 * 살포점 지도·이력용 색상 — 구역 라벨(A01 등) 살포와
 * 수동 기록(`YYYY-MM-DD T01` 형태 등)을 날짜(기록 시각) 기준 연령 밴드로 구분한다.
 * (구 라벨 `투하-`·`GNSS-`·`센서-` 도 동일 처리)
 */

export type DropAgeBand = "recent" | "orange3m" | "pink1y" | "light2y" | "pale";

export type ParsedManualDropLabel = {
  ymd: string;
  zoneLike: string;
  /** 한 줄 표기 — 예: `2026-05-12 T01` */
  displayLine: string;
};

export function dropAgeBand(recordedAt: number, now: number = Date.now()): DropAgeBand {
  const days = (now - recordedAt) / 86_400_000;
  if (days <= 45) return "recent";
  if (days < 120) return "orange3m";
  if (days < 400) return "pink1y";
  if (days < 800) return "light2y";
  return "pale";
}

/** 시뮬·구역 일반 살포점 (기존 붉은 계열, 연령 단계) */
export function dropAgeColors(band: DropAgeBand): { fill: string; stroke: string; pulse: string } {
  switch (band) {
    case "recent":
      return { fill: "#7f1d1d", stroke: "#fecaca", pulse: "#f87171" };
    case "orange3m":
      return { fill: "#c2410c", stroke: "#fdba74", pulse: "#fb923c" };
    case "pink1y":
      return { fill: "#be185d", stroke: "#fbcfe8", pulse: "#f472b6" };
    case "light2y":
      return { fill: "#fda4af", stroke: "#fff1f2", pulse: "#fb7185" };
    case "pale":
    default:
      return { fill: "#cbd5e1", stroke: "#f8fafc", pulse: "#94a3b8" };
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

/** 수동 기록 — 라벨·id 규칙 (구 `투하-`·`GNSS-`·`센서-`·`mob-` id) */
export function isManualTestOriginDrop(label: string, id: string): boolean {
  if (/^mob-/u.test(id)) return true;
  const t = label.trim();
  if (/^\d{4}-\d{2}-\d{2} T\d+/u.test(t)) return true;
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
  if (isManualTestOriginDrop(opts.label, opts.id)) {
    return dropTestAgeColors(band);
  }
  return dropAgeColors(band);
}
