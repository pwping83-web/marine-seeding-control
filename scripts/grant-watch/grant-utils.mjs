/**
 * 공고 제목·키워드 매칭, KST 날짜, 마감 필터 공통 유틸
 */

/** 공백 제거 후 소문자(한글은 그대로)로 비교해 '디지털 안전' vs '디지털안전' 도 매칭 */
export function normalizeForMatch(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function kstTodayYmd() {
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const y = String(kst.getFullYear());
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ymdToDate(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return null;
  return new Date(`${ymd}T00:00:00+09:00`);
}

export function calcDday(endDateYmd) {
  const end = ymdToDate(endDateYmd);
  const today = ymdToDate(kstTodayYmd());
  if (!end || !today) return null;
  return Math.floor((end.getTime() - today.getTime()) / 86400000);
}

/**
 * applyEndDate가 있고 오늘(KST)보다 이전이면 제외. 없으면 기본 유지(접수중 탭 신뢰).
 * @param {{ applyEndDate?: string }[]} items
 * @param {{ dropUnparsedDeadline?: boolean }} [opts]
 */
/**
 * 여러 소스 배열을 순서대로 병합 — 동일 제목(공백 무시)은 **나중 배치가 앞 항목을 덮어씀**
 * batches: 예) [ ntisItems, smesItems, irisItems ] → 최종적으로 iris 우선
 */
export function mergeAnnouncementBatches(orderedBatches) {
  const map = new Map();
  for (const batch of orderedBatches) {
    if (!Array.isArray(batch)) continue;
    for (const it of batch) {
      if (!it?.title) continue;
      map.set(normalizeForMatch(it.title), it);
    }
  }
  return [...map.values()];
}

/** 제목에 키워드(공백 무시) 부분일치 — 매칭된 키워드 배열 또는 null */
export function matchKeywordsInTitle(title, keywords) {
  const t = normalizeForMatch(title);
  const trimmed = keywords.map((k) => String(k).trim()).filter(Boolean);
  const matched = trimmed.filter((kw) => t.includes(normalizeForMatch(kw)));
  return matched.length ? matched : null;
}

/** NTIS 표기 2026.05.08 → 2026-05-08 */
export function parseYmdDots(raw) {
  const m = String(raw).match(/(20\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export function partitionByDeadline(items, opts = {}) {
  const today = kstTodayYmd();
  const dropUnparsed = opts.dropUnparsedDeadline === true;
  const open = [];
  const excluded = [];

  for (const it of items) {
    const end = it.applyEndDate;
    if (!end) {
      if (dropUnparsed) excluded.push({ ...it, excludeReason: '마감일 미파싱' });
      else open.push(it);
      continue;
    }
    if (end < today) excluded.push({ ...it, excludeReason: `마감 지남 (${end})` });
    else open.push(it);
  }

  return { open, excluded, today };
}
