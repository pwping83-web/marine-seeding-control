/**
 * 항적·항해 안내용 — 줄 단위 위도·경도 파서 (쉼표/공백/탭 구분).
 * 한 줄에 북위·동경 숫자 두 개(예: `34.712, 128.591` 또는 `34.712 128.591`).
 */
export function parseLatLngTrackInput(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line
      .split(/[\s,;|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const la = Number(parts[0]);
    const ln = Number(parts[1]);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    if (la < -90 || la > 90 || ln < -180 || ln > 180) continue;
    out.push([la, ln]);
  }
  return out;
}

export function formatLatLngTrackLines(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([la, ln]) => `${la.toFixed(6)}, ${ln.toFixed(6)}`).join("\n");
}
