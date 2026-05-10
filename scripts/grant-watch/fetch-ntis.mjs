/**
 * NTIS 국가R&D통합공고 — 접수중 목록을 페이지 단위로 수집 (Playwright)
 */
import { chromium } from 'playwright';
import { matchKeywordsInTitle, parseYmdDots } from './grant-utils.mjs';

const DEFAULT_URL = 'https://www.ntis.go.kr/rndgate/eg/un/ra/mng.do';

export function ntisDetailUrl(roRndUid) {
  const q = new URLSearchParams({ roRndUid: String(roRndUid), flag: 'rndList' });
  return `https://www.ntis.go.kr/rndgate/eg/un/ra/view.do?${q.toString()}`;
}

/** 표 오타(2060 등)로 마감 필터가 깨지지 않게 구조화 날짜는 신뢰 구간만 사용 */
function attachPlausiblePeriod(applyStartDate, applyEndDate, recvStartRaw, recvEndRaw) {
  const rawPeriod = [recvStartRaw, recvEndRaw].filter(Boolean).join(' ~ ');
  if (!applyStartDate || !applyEndDate) {
    return {
      applyPeriod: rawPeriod || undefined,
      applyStartDate: applyStartDate || undefined,
      applyEndDate: applyEndDate || undefined,
      dateParseNote: '목록 날짜 비어 있음 또는 비표준',
    };
  }
  const sy = Number(applyStartDate.slice(0, 4));
  const ey = Number(applyEndDate.slice(0, 4));
  let ok =
    applyEndDate >= applyStartDate &&
    ey >= 2020 &&
    ey <= 2035 &&
    sy >= 2020 &&
    ey - sy <= 8;
  if (!ok) {
    return {
      applyPeriod: rawPeriod,
      applyStartDate: undefined,
      applyEndDate: undefined,
      dateParseNote: `목록 날짜 이상치 무시(원문: ${rawPeriod})`,
    };
  }
  return {
    applyPeriod: `${applyStartDate} ~ ${applyEndDate}`,
    applyStartDate,
    applyEndDate,
  };
}

function rowMatches(row, keywords, ministries, ministryOrKeyword) {
  const kw = matchKeywordsInTitle(row.title, keywords);
  const hasKw = keywords.length > 0;
  const hasMin = ministries.length > 0;
  const minOk =
    !hasMin ||
    ministries.some(
      (m) => String(row.ministry || '').trim() === String(m).trim(),
    );

  if (!hasKw && !hasMin) {
    return { ok: true, matchedKeywords: kw || [] };
  }

  if (ministryOrKeyword) {
    const byMin = hasMin && minOk;
    const byKw = hasKw && kw?.length;
    if (byMin || byKw) return { ok: true, matchedKeywords: kw || [] };
    return { ok: false, matchedKeywords: [] };
  }

  if (hasKw && !kw?.length) return { ok: false, matchedKeywords: [] };
  if (hasMin && !minOk) return { ok: false, matchedKeywords: kw || [] };
  return { ok: true, matchedKeywords: kw || [] };
}

async function scrapeCurrentPage(page) {
  return page.evaluate(() => {
    const out = [];
    const table = document.querySelector('table.basic_list');
    if (!table) return out;
    for (const a of table.querySelectorAll('a[onclick*="fn_view"]')) {
      const oc = a.getAttribute('onclick') || '';
      const m = oc.match(/fn_view\('(\d+)'\)/);
      if (!m) continue;
      const tr = a.closest('tr');
      const tds = tr
        ? [...tr.querySelectorAll('td')].map((td) =>
            (td.innerText || '').replace(/\s+/g, ' ').trim(),
          )
        : [];
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      out.push({
        roRndUid: m[1],
        title,
        status: tds[2] || '',
        ministry: tds[4] || '',
        recvStartRaw: tds[5] || '',
        recvEndRaw: tds[6] || '',
        ddayRaw: tds[7] || '',
      });
    }
    return out;
  });
}

async function goPage(page, pageNum) {
  if (pageNum <= 1) return true;
  const link = page.getByRole('link', { name: String(pageNum), exact: true });
  if ((await link.count()) === 0) return false;
  await link.first().click();
  await page.waitForTimeout(2200);
  return true;
}

/**
 * @param {object} opts
 * @param {string} [opts.listUrl]
 * @param {number} [opts.maxPages]
 * @param {string[]} [opts.keywords]
 * @param {string[]} [opts.ministries] SpotVibe 관심 부처(부분일치)
 * @param {boolean} [opts.ministryOrKeyword] true면 (부처 일치) OR (키워드 일치)
 * @param {boolean} [opts.headless]
 */
export async function fetchNtisAnnouncements(opts = {}) {
  const listUrl = opts.listUrl || DEFAULT_URL;
  const maxPages = Math.max(1, Number(opts.maxPages) || 6);
  const keywords = Array.isArray(opts.keywords) ? opts.keywords : [];
  const ministries = Array.isArray(opts.ministries) ? opts.ministries : [];
  const ministryOrKeyword = opts.ministryOrKeyword !== false;
  const headless = opts.headless !== false;

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(listUrl, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.getByRole('link', { name: '접수중', exact: true }).first().click();
    await page.waitForTimeout(3500);

    const byUid = new Map();
    for (let p = 1; p <= maxPages; p++) {
      const ok = await goPage(page, p);
      if (!ok) break;
      const chunk = await scrapeCurrentPage(page);
      if (chunk.length === 0) break;
      for (const row of chunk) {
        if (!byUid.has(row.roRndUid)) byUid.set(row.roRndUid, row);
      }
    }

    const allRows = [...byUid.values()];
    const filtered = [];

    for (const row of allRows) {
      const { ok, matchedKeywords } = rowMatches(
        row,
        keywords,
        ministries,
        ministryOrKeyword,
      );
      if (!ok) continue;
      const startDots = parseYmdDots(row.recvStartRaw);
      const endDots = parseYmdDots(row.recvEndRaw);
      const period = attachPlausiblePeriod(startDots, endDots, row.recvStartRaw, row.recvEndRaw);
      filtered.push({
        source: 'ntis',
        roRndUid: row.roRndUid,
        title: row.title,
        ministry: row.ministry,
        status: row.status,
        applyPeriod: period.applyPeriod,
        applyStartDate: period.applyStartDate,
        applyEndDate: period.applyEndDate,
        dateParseNote: period.dateParseNote,
        ddayLabel: row.ddayRaw || undefined,
        matchedKeywords,
        url: ntisDetailUrl(row.roRndUid),
      });
    }

    return {
      source: 'ntis',
      listUrl,
      fetchedAt: new Date().toISOString(),
      keywords: keywords.length ? keywords : null,
      ministries: ministries.length ? ministries : null,
      ministryOrKeyword,
      maxPages,
      totalCollected: allRows.length,
      matchedCount: filtered.length,
      items: filtered,
    };
  } finally {
    await browser.close();
  }
}
