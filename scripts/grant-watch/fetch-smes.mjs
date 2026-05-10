/**
 * 중소벤처24 사업공고 정보 연계 API (extPblancInfo)
 * @see 「공고정보 연계 API 가이드」V2 — token(URL 인코딩), strDt/endDt(yyyyMMdd), 응답 { resultCd, data[], resultMsg }
 *
 * 인증값: 환경변수 SMES_EXT_PBLANC_KEY (가이드의 token 값; Git·채팅에 절대 넣지 말 것)
 */
import { matchKeywordsInTitle } from './grant-utils.mjs';

const DEFAULT_BASE = 'https://www.smes.go.kr/fnct/apiReqst/extPblancInfo';

/** 한국시간 기준 yyyyMMdd (일 단위 시프트) */
function kstCompactYmd(dayShift = 0) {
  const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
  const d = new Date(s);
  d.setDate(d.getDate() + dayShift);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function findBestItemArray(data) {
  let best = null;
  let bestScore = -1;
  function scoreArray(arr) {
    if (!Array.isArray(arr) || !arr.length || typeof arr[0] !== 'object' || arr[0] == null)
      return -1;
    const keys = Object.keys(arr[0]).join(' ');
    let s = arr.length;
    if (/pblanc|bsns|공고|rcept|instt|reqst|sj|title/i.test(keys)) s += 200;
    return s;
  }
  function walk(node, depth) {
    if (depth > 14 || node == null) return;
    if (Array.isArray(node)) {
      const sc = scoreArray(node);
      if (sc > bestScore) {
        bestScore = sc;
        best = node;
      }
      return;
    }
    if (typeof node === 'object') {
      for (const v of Object.values(node)) walk(v, depth + 1);
    }
  }
  walk(data, 0);
  return best;
}

function pickFirst(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/** 연계 데이터에 가끔 붙는 `https://도메인https://도메인/...` 형태 정리 */
function normalizePblancUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  const m = s.match(/^(https:\/\/[^/]+)(https:\/\/.*)$/i);
  if (m) return m[2];
  return s;
}

function normalizeItem(row, matchedKeywords) {
  const title = pickFirst(row, [
    'pblancNm',
    'pblancTitle',
    'bsnsNm',
    'title',
    'sj',
    'subject',
    '공고명',
  ]);
  const url = normalizePblancUrl(
    pickFirst(row, [
      'pblancDtlUrl',
      'reqstLinkInfo',
      'pblancUrl',
      'detlUrl',
      'detailUrl',
      'linkUrl',
      'url',
      'reqstUrl',
    ]),
  );
  const org = pickFirst(row, ['sportInsttNm', 'insttNm', 'sprvInstt', 'organNm', '지원기관']);
  const start = pickFirst(row, [
    'pblancBgnDt',
    'rceptPdBegin',
    'rceptBeginDe',
    'reqstBeginDt',
    'aplyBgnde',
  ]);
  const end = pickFirst(row, [
    'pblancEndDt',
    'rceptPdEnd',
    'rceptEndDe',
    'reqstEndDt',
    'aplyEndde',
  ]);
  const id = pickFirst(row, ['pblancId', 'pblancSeq', 'bsnsPblancId', 'reqstNo', 'seq']);

  let applyPeriod;
  let applyStartDate;
  let applyEndDate;
  if (start && end) {
    applyPeriod = `${start} ~ ${end}`;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
    const m1 = start.match(iso);
    const m2 = end.match(iso);
    if (m1 && m2) {
      applyStartDate = `${m1[1]}-${m1[2]}-${m1[3]}`;
      applyEndDate = `${m2[1]}-${m2[2]}-${m2[3]}`;
    } else {
      const d1 = start.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      const d2 = end.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (d1 && d2) {
        applyStartDate = `${d1[1]}-${d1[2].padStart(2, '0')}-${d1[3].padStart(2, '0')}`;
        applyEndDate = `${d2[1]}-${d2[2].padStart(2, '0')}-${d2[3].padStart(2, '0')}`;
      }
    }
  }

  return {
    source: 'smes',
    smesRowId: id || undefined,
    title,
    url: url || 'https://www.smes.go.kr/main/sportsBsnsPolicy',
    ministry: org || undefined,
    applyPeriod,
    applyStartDate,
    applyEndDate,
    matchedKeywords,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey — 가이드의 token 값
 * @param {string} [opts.baseUrl]
 * @param {string} [opts.authQueryKey] 기본 "token"
 * @param {number} [opts.dateRangeDays] strDt = 오늘(KST) - N일, endDt = 오늘(KST)
 * @param {string} [opts.strDt] yyyyMMdd (지정 시 dateRangeDays 무시)
 * @param {string} [opts.endDt] yyyyMMdd
 * @param {string} [opts.html] "yes" | "no" — 가이드 html 파라미터
 * @param {string[]} [opts.keywords] 비어 있으면 키워드 필터 안 함
 * @param {Record<string,string>} [opts.extraQuery] 추가 쿼리(가이드 확장 시)
 */
export async function fetchSmesExtPblanc(opts = {}) {
  const apiKey = opts.apiKey || process.env.SMES_EXT_PBLANC_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('SMES_EXT_PBLANC_KEY 환경변수가 없습니다. (.env 에만 설정)');
  }

  const baseUrl = opts.baseUrl || DEFAULT_BASE;
  const authQueryKey = opts.authQueryKey || 'token';
  const dateRangeDays = Math.max(1, Math.min(366, Number(opts.dateRangeDays) || 90));
  const keywords = Array.isArray(opts.keywords) ? opts.keywords : [];
  const extraQuery = opts.extraQuery && typeof opts.extraQuery === 'object' ? opts.extraQuery : {};

  let strDt = opts.strDt != null && String(opts.strDt).trim() ? String(opts.strDt).trim() : null;
  let endDt = opts.endDt != null && String(opts.endDt).trim() ? String(opts.endDt).trim() : null;
  if (!strDt || !endDt) {
    endDt = endDt || kstCompactYmd(0);
    strDt = strDt || kstCompactYmd(-dateRangeDays);
  }

  const u = new URL(baseUrl);
  u.searchParams.set(authQueryKey, String(apiKey).trim());
  u.searchParams.set('strDt', strDt);
  u.searchParams.set('endDt', endDt);
  if (opts.html === 'yes' || opts.html === 'no') {
    u.searchParams.set('html', opts.html);
  }
  for (const [k, v] of Object.entries(extraQuery)) {
    if (v != null && k !== authQueryKey) u.searchParams.set(k, String(v));
  }

  const res = await fetch(u.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Marine-grant-watch/1',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `SMES extPblancInfo HTTP ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 400)}`,
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `SMES 응답이 JSON이 아닙니다. 앞부분: ${text.slice(0, 280)}`,
    );
  }

  const cd = String(data.resultCd ?? '');
  if (cd !== '0') {
    const msg = (data.resultMsg && String(data.resultMsg).trim()) || `resultCd=${cd}`;
    throw new Error(`SMES API 오류 ${cd}: ${msg}`);
  }

  const rows = Array.isArray(data.data) ? data.data : findBestItemArray(data);
  if (!rows || !rows.length) {
    return {
      source: 'smes',
      baseUrl,
      fetchedAt: new Date().toISOString(),
      authQueryKey,
      strDt,
      endDt,
      keywords: keywords.length ? keywords : null,
      totalCollected: 0,
      matchedCount: 0,
      items: [],
    };
  }

  const collected = [];
  for (const row of rows) {
    const title = pickFirst(row, [
      'pblancNm',
      'pblancTitle',
      'bsnsNm',
      'title',
      'sj',
      'subject',
      '공고명',
    ]);
    if (!title) continue;
    const mk = keywords.length > 0 ? matchKeywordsInTitle(title, keywords) : [];
    if (keywords.length > 0 && !mk) continue;
    collected.push(normalizeItem(row, mk));
  }

  return {
    source: 'smes',
    baseUrl,
    fetchedAt: new Date().toISOString(),
    authQueryKey,
    strDt,
    endDt,
    keywords: keywords.length ? keywords : null,
    totalCollected: rows.length,
    matchedCount: collected.length,
    items: collected,
  };
}
