/**
 * IRIS 사업공고(접수중 등) 목록을 페이지 단위로 수집하고, 제목 기준 키워드 필터를 적용합니다.
 * 공식 검색 UI는 일부 환경에서 스크립트가 비정상 동작하여, 목록 순회 + 로컬 필터로 안정화합니다.
 */
import { chromium } from 'playwright';
import { matchKeywordsInTitle } from './grant-utils.mjs';

const DEFAULT_LIST_URL =
  'https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituListView.do';

/** @param {string} ancmId @param {string} ancmPrg */
export function irisDetailUrl(ancmId, ancmPrg) {
  const q = new URLSearchParams({ ancmId, ancmPrg });
  return `https://www.iris.go.kr/contents/retrieveBsnsAncmView.do?${q.toString()}`;
}

function parseYmd(raw) {
  const m = String(raw).match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  const y = m[1];
  const mm = m[2].padStart(2, '0');
  const dd = m[3].padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function parseApplyPeriod(html) {
  const flat = String(html || '').replace(/\s+/g, ' ');
  const m = flat.match(
    /(20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2})\s*[~\-]\s*(20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2})/,
  );
  if (!m) return null;
  const startDate = parseYmd(m[1]);
  const endDate = parseYmd(m[2]);
  if (!startDate || !endDate) return null;
  return { startDate, endDate };
}

async function enrichWithDetailDates(context, rows, limit) {
  const capped = rows.slice(0, Math.max(0, Number(limit) || 0));
  for (const item of capped) {
    try {
      const res = await context.request.get(item.url, { timeout: 30000 });
      if (!res.ok()) continue;
      const html = await res.text();
      const period = parseApplyPeriod(html);
      if (period) {
        item.applyPeriod = `${period.startDate} ~ ${period.endDate}`;
        item.applyStartDate = period.startDate;
        item.applyEndDate = period.endDate;
      }
    } catch {
      // 상세 페이지 파싱 실패는 수집 전체 실패로 처리하지 않음
    }
  }
}

async function dismissPopups(page) {
  const candidates = [
    '#layerPopup0 button',
    '#layerPopup0 .btn_close',
    '.popup_layer button',
  ];
  for (const sel of candidates) {
    await page
      .locator(sel)
      .first()
      .click({ timeout: 1200 })
      .catch(() => {});
  }
}

async function parseListPage(page) {
  return page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[onclick*="f_bsnsAncmBtinSituListForm_view"]')) {
      const oc = a.getAttribute('onclick') || '';
      const m = oc.match(
        /f_bsnsAncmBtinSituListForm_view\('([^']+)','([^']+)'\)/,
      );
      if (!m) continue;
      const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (title.length < 12) continue;
      out.push({ ancmId: m[1], ancmPrg: m[2], title });
    }
    return out;
  });
}

async function goToListPage(page, pageNum) {
  if (pageNum <= 1) return;
  const link = page.locator(`a.page_none[title="${pageNum}페이지"]`);
  const count = await link.count();
  if (count === 0) throw new Error(`NO_PAGE_LINK:${pageNum}`);
  await link.click();
  await page.waitForTimeout(1800);
}

/**
 * @param {object} opts
 * @param {string} [opts.listUrl]
 * @param {string} [opts.tab] 접수예정 | 접수중 | 마감
 * @param {number} [opts.maxPages]
 * @param {string[]} [opts.keywords] 제목 부분일치(대소문자 무시). 비어 있으면 전체 반환
 * @param {boolean} [opts.enrichDetailDates] 매칭 공고 상세에서 접수기간 파싱
 * @param {number} [opts.detailLimit] 상세 파싱 최대 건수
 * @param {boolean} [opts.enrichAllMatched] true면 키워드 매칭 건 전부 상세 파싱(마감 필터 정확도↑)
 * @param {boolean} [opts.headless]
 */
export async function fetchIrisAnnouncements(opts = {}) {
  const listUrl = opts.listUrl || DEFAULT_LIST_URL;
  const tab = opts.tab || '접수중';
  const maxPages = Math.max(1, Number(opts.maxPages) || 8);
  const keywords = Array.isArray(opts.keywords) ? opts.keywords : [];
  const enrichDetailDates = opts.enrichDetailDates !== false;
  const detailLimit = Math.max(0, Number(opts.detailLimit) || 30);
  const enrichAllMatched = opts.enrichAllMatched === true;
  const headless = opts.headless !== false;

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(listUrl, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1200);
    await dismissPopups(page);
    await page.getByRole('link', { name: tab, exact: true }).first().click();
    await page.waitForTimeout(2500);

    const byKey = new Map();
    for (let p = 1; p <= maxPages; p++) {
      try {
        await goToListPage(page, p);
      } catch (e) {
        if (String(e.message).startsWith('NO_PAGE_LINK')) break;
        throw e;
      }
      const chunk = await parseListPage(page);
      for (const row of chunk) {
        const k = `${row.ancmId}_${row.ancmPrg}`;
        if (!byKey.has(k)) {
          byKey.set(k, {
            ...row,
            url: irisDetailUrl(row.ancmId, row.ancmPrg),
          });
        }
      }
    }

    let rows = [...byKey.values()];
    const trimmedKw = keywords.map((k) => String(k).trim()).filter(Boolean);

    if (trimmedKw.length > 0) {
      rows = rows
        .map((row) => {
          const matchedKeywords = matchKeywordsInTitle(row.title, trimmedKw);
          return matchedKeywords ? { ...row, matchedKeywords } : null;
        })
        .filter(Boolean);
    }

    if (enrichDetailDates && rows.length > 0) {
      const limit = enrichAllMatched ? rows.length : detailLimit;
      const context = await browser.newContext();
      try {
        await enrichWithDetailDates(context, rows, limit);
      } finally {
        await context.close();
      }
    }

    return {
      source: 'iris',
      listUrl,
      tab,
      fetchedAt: new Date().toISOString(),
      keywords: trimmedKw.length ? trimmedKw : null,
      enrichDetailDates,
      detailLimit,
      enrichAllMatched,
      totalCollected: byKey.size,
      matchedCount: rows.length,
      items: rows,
    };
  } finally {
    await browser.close();
  }
}
