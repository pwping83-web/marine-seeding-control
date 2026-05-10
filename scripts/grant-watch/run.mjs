/**
 * 지원사업 통합 허브: IRIS + NTIS(국가R&D통합공고) 수집, 키워드·부처 필터, 마감 제외, 리포트
 *
 * 실행: npm run grant:watch  |  npm run grant:hub (동일)
 * 설정: scripts/grant-watch/config.json (없으면 config.default.json)
 * 루트 .env 는 run 시작 시 자동 로드(SMES_EXT_PBLANC_KEY 등).
 * 환경변수:
 *   GRANT_WATCH_CONFIG — config 경로
 *   HEADED=1 — 브라우저 표시
 *   GRANT_WATCH_SKIP_NTIS=1 — NTIS 생략(IRIS만)
 *   SMES_EXT_PBLANC_KEY — 중소벤처24 공고연계 API token (공고정보 연계 API 가이드)
 *   GRANT_WATCH_SKIP_SMES=1 — SMES API 생략
 *
 * CLI:
 *   node scripts/grant-watch/run.mjs --from-cache
 *     → 직전 grant-hub-last-run.json 으로 마감 필터·리포트만 갱신
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchIrisAnnouncements } from './fetch-iris.mjs';
import { fetchNtisAnnouncements } from './fetch-ntis.mjs';
import { fetchSmesExtPblanc } from './fetch-smes.mjs';
import {
  calcDday,
  kstTodayYmd,
  mergeAnnouncementBatches,
  normalizeForMatch,
  partitionByDeadline,
} from './grant-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function loadRootDotEnv() {
  try {
    const p = path.join(root, '.env');
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}
loadRootDotEnv();

function loadConfig() {
  const envPath = process.env.GRANT_WATCH_CONFIG;
  const paths = [
    envPath && path.isAbsolute(envPath) ? envPath : envPath && path.resolve(root, envPath),
    path.join(__dirname, 'config.json'),
    path.join(__dirname, 'config.default.json'),
  ].filter(Boolean);

  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      return { data: JSON.parse(raw), path: p };
    }
  }
  throw new Error('grant-watch: config.json 또는 config.default.json 을 찾을 수 없습니다.');
}

function safeReadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function keyOf(item) {
  if (item.roRndUid) return `ntis_${item.roRndUid}`;
  if (item.smesRowId) return `smes_${item.smesRowId}`;
  if (item.ancmId || item.ancmPrg)
    return `${item.ancmId || ''}_${item.ancmPrg || ''}`;
  if (item.source === 'smes') return `smes_t_${normalizeForMatch(item.title)}`;
  return `t_${normalizeForMatch(item.title)}`;
}

function snapshotMatchedItems(p) {
  if (Array.isArray(p?.itemsAllMatched)) return p.itemsAllMatched;
  return Array.isArray(p?.items) ? p.items : [];
}

function detectChanges(prev, curr) {
  const prevItems = snapshotMatchedItems(prev);
  const currItems = snapshotMatchedItems(curr);
  const prevMap = new Map(prevItems.map((it) => [keyOf(it), it]));
  const currMap = new Map(currItems.map((it) => [keyOf(it), it]));

  const added = currItems.filter((it) => !prevMap.has(keyOf(it)));
  const removed = prevItems.filter((it) => !currMap.has(keyOf(it)));
  const changed = [];

  currItems.forEach((it) => {
    const k = keyOf(it);
    const old = prevMap.get(k);
    if (!old) return;
    const diffs = [];
    if ((old.title || '') !== (it.title || '')) diffs.push('제목 변경');
    if ((old.applyPeriod || '') !== (it.applyPeriod || '')) diffs.push('접수기간 변경');
    if (diffs.length) changed.push({ item: it, diffs });
  });

  return { added, removed, changed };
}

const argv = new Set(process.argv.slice(2));
const fromCache = argv.has('--from-cache');

const { data: cfg, path: cfgPath } = loadConfig();
const irisCfg = cfg.iris || {};
const ntisCfg = cfg.ntis || {};
const smesCfg = cfg.smes || {};
const outDir = path.resolve(root, cfg.outputDir || 'artifacts/grant-watch');
fs.mkdirSync(outDir, { recursive: true });
const docsOutPath = path.resolve(
  root,
  cfg.docsOutputPath || 'docs/지원사업/99_공고-모니터링-최근결과.md',
);
fs.mkdirSync(path.dirname(docsOutPath), { recursive: true });

const headless = process.env.HEADED !== '1';
const ddayAlertThresholds = Array.isArray(cfg.ddayAlerts)
  ? cfg.ddayAlerts.map((n) => Number(n)).filter((n) => Number.isFinite(n))
  : [14, 7, 3, 1, 0];
const hubJson = path.join(outDir, 'grant-hub-last-run.json');
const legacyIrisJson = path.join(outDir, 'iris-last-run.json');
const prevResult = safeReadJson(hubJson) || safeReadJson(legacyIrisJson);
const skipNtis = process.env.GRANT_WATCH_SKIP_NTIS === '1';
const ntisEnabled = !skipNtis && ntisCfg.enabled !== false;
const skipSmes = process.env.GRANT_WATCH_SKIP_SMES === '1';
const smesKey = (process.env.SMES_EXT_PBLANC_KEY || '').trim();
const smesEnabled =
  !skipSmes && smesCfg.enabled !== false && smesKey.length > 0;

const excludePastDeadline = cfg.excludePastDeadline !== false;
const dropUnparsedDeadline = cfg.dropUnparsedDeadline === true;

console.log(`[grant-watch] 설정: ${cfgPath}`);
console.log(
  `[grant-watch] IRIS 탭=${irisCfg.tab || '접수중'}, IRIS 페이지=${irisCfg.maxPages ?? 8}, NTIS=${ntisEnabled ? `on (${ntisCfg.maxPages ?? 6}p)` : 'off'}, SMES=${smesEnabled ? `on (${smesCfg.dateRangeDays ?? 90}일)` : skipSmes ? 'off(env)' : !smesKey ? 'off(키 없음)' : smesCfg.enabled === false ? 'off(config)' : 'off'}, 마감필터=${excludePastDeadline}, 캐시=${fromCache}`,
);

let result;
if (fromCache) {
  if (!prevResult || typeof prevResult !== 'object') {
    console.error(
      '[grant-watch] --from-cache 인데 grant-hub-last-run.json(또는 구 iris-last-run.json)이 없습니다.',
    );
    process.exit(1);
  }
  result = { ...prevResult };
} else {
  let irisBundle = await fetchIrisAnnouncements({
    listUrl: irisCfg.listUrl,
    tab: irisCfg.tab,
    maxPages: irisCfg.maxPages,
    keywords: irisCfg.keywords,
    enrichDetailDates: irisCfg.enrichDetailDates,
    detailLimit: irisCfg.detailLimit,
    enrichAllMatched: irisCfg.enrichAllMatched !== false,
    headless,
  });
  const irisMatched = [...(irisBundle.items || [])].map((it) => ({
    ...it,
    source: it.source || 'iris',
  }));
  irisBundle = { ...irisBundle, itemsAllMatched: irisMatched };

  let ntisBundle = null;
  if (ntisEnabled) {
    const ntisKeywords =
      Array.isArray(ntisCfg.keywords) && ntisCfg.keywords.length > 0
        ? ntisCfg.keywords
        : irisCfg.keywords || [];
    const ntisMinistries = Array.isArray(ntisCfg.ministries) ? ntisCfg.ministries : [];
    console.log('[grant-watch] NTIS 수집 시작…');
    ntisBundle = await fetchNtisAnnouncements({
      listUrl: ntisCfg.listUrl,
      maxPages: ntisCfg.maxPages,
      keywords: ntisKeywords,
      ministries: ntisMinistries,
      ministryOrKeyword: ntisCfg.ministryOrKeyword !== false,
      headless,
    });
    console.log(
      `[grant-watch] NTIS ${ntisBundle.totalCollected}건 중 매칭 ${ntisBundle.matchedCount}건`,
    );
  }

  let smesBundle = null;
  if (smesEnabled) {
    const smesKeywords =
      Array.isArray(smesCfg.keywords) && smesCfg.keywords.length > 0
        ? smesCfg.keywords
        : irisCfg.keywords || [];
    console.log('[grant-watch] 중소벤처24 공고 API 호출…');
    try {
      smesBundle = await fetchSmesExtPblanc({
        apiKey: smesKey,
        baseUrl: smesCfg.baseUrl,
        authQueryKey: smesCfg.authQueryKey,
        dateRangeDays: smesCfg.dateRangeDays,
        strDt: smesCfg.strDt,
        endDt: smesCfg.endDt,
        html: smesCfg.html,
        keywords: smesKeywords,
        extraQuery: smesCfg.extraQuery,
      });
      console.log(
        `[grant-watch] SMES ${smesBundle.totalCollected}행 처리 → 키워드 후 ${smesBundle.matchedCount}건`,
      );
    } catch (e) {
      console.error('[grant-watch] SMES 실패(설정·가이드의 쿼리 파라미터 확인):', e.message);
    }
  }

  const mergedMatched = mergeAnnouncementBatches([
    ntisBundle?.items || [],
    smesBundle?.items || [],
    irisMatched,
  ]);

  if (prevResult) {
    fs.writeFileSync(
      path.join(outDir, 'grant-hub-prev-run.json'),
      JSON.stringify(prevResult, null, 2),
      'utf8',
    );
  }

  result = {
    fetchedAt: new Date().toISOString(),
    configPath: cfgPath,
    iris: irisBundle,
    ntis: ntisBundle,
    smes: smesBundle,
    itemsAllMatched: mergedMatched,
    totalCollectedIris: irisBundle.totalCollected,
    totalCollectedNtis: ntisBundle?.totalCollected ?? 0,
    totalCollectedSmes: smesBundle?.totalCollected ?? 0,
  };
}

const matchedPool = Array.isArray(result.itemsAllMatched)
  ? result.itemsAllMatched
  : [...(result.items || [])];

let deadlineExcluded = [];
if (excludePastDeadline) {
  const { open, excluded } = partitionByDeadline(matchedPool, {
    dropUnparsedDeadline,
  });
  deadlineExcluded = excluded;
  result = {
    ...result,
    itemsAllMatched: matchedPool,
    items: open,
    matchedCount: open.length,
    matchedCountBeforeDeadline: matchedPool.length,
    deadlineExcludedCount: excluded.length,
    deadlineExcluded,
    deadlineFilter: { today: kstTodayYmd(), dropUnparsedDeadline },
  };
} else {
  result = {
    ...result,
    itemsAllMatched: matchedPool,
    items: matchedPool,
    matchedCount: matchedPool.length,
    matchedCountBeforeDeadline: matchedPool.length,
    deadlineExcluded: [],
    deadlineExcludedCount: 0,
  };
}

fs.writeFileSync(hubJson, JSON.stringify(result, null, 2), 'utf8');

function mdEscapeLinkText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}
/** 리포트·채팅 인용용 마크다운 링크 (제목 클릭 시 공고 페이지로 이동) */
function mdLink(title, url) {
  const u = String(url ?? '').trim();
  const t = mdEscapeLinkText(title || '(제목 없음)');
  if (!u) return t;
  return `[${t}](${u})`;
}

const changes = fromCache ? { added: [], removed: [], changed: [] } : detectChanges(prevResult, result);
const ddayAlerts = result.items
  .map((it) => {
    const dday = calcDday(it.applyEndDate);
    return Number.isFinite(dday) ? { ...it, dday } : null;
  })
  .filter(Boolean)
  .filter((it) => ddayAlertThresholds.includes(it.dday))
  .sort((a, b) => a.dday - b.dday);

const portalLinks = cfg.monitorLinks || {};
const lines = [
  '# 지원사업 공고 모니터링 최근 결과',
  '',
  '> **내부 참고용** 공개 공고 목록을 저장소 스크립트가 수집·갱신한 결과입니다. 법적 효력·최종 해석은 각 기관 게시 원문이 우선이며, 제출·계약에는 원문·공문을 사용하십시오. 아래 제목은 상세 페이지로 연결되는 링크입니다.',
  '',
  `- 생성시각: ${new Date().toLocaleString('ko-KR', { hour12: false })}`,
  `- 기준 소스: IRIS + NTIS + 중소벤처24(키 설정 시)`,
  `- IRIS 목록 수집: ${result.totalCollectedIris ?? result.iris?.totalCollected ?? '—'}건`,
  `- NTIS 접수중 수집: ${result.totalCollectedNtis ?? result.ntis?.totalCollected ?? '—'}건`,
  `- SMES API 행 수: ${result.totalCollectedSmes ?? result.smes?.totalCollected ?? '—'}건`,
  `- 키워드 일치(마감 필터 전): ${result.matchedCountBeforeDeadline ?? result.matchedCount}건`,
  `- 신청 가능(마감일 지난 공고 제외 후): ${result.matchedCount}건`,
  excludePastDeadline
    ? `- 마감 제외: ${deadlineExcluded.length}건 (IRIS=상세 파싱, NTIS=목록 마감일 컬럼)`
    : `- 마감 필터: 사용 안 함`,
  `- 변경감지(통합 목록·키워드 기준): 신규 ${changes.added.length}건 / 삭제 ${changes.removed.length}건 / 변경 ${changes.changed.length}건`,
  '',
  '## 모니터링 접속 링크',
  '',
  `- [NTIS 국가R&D통합공고](https://www.ntis.go.kr/rndgate/eg/un/ra/mng.do)`,
  `- [IRIS](${portalLinks.iris || 'https://www.iris.go.kr/'})`,
  `- [중소벤처기업부 사업공고](${portalLinks.mss || 'https://www.mss.go.kr/site/smba/ex/bbs/List.do?cbIdx=310'})`,
  `- [기업마당](${portalLinks.bizinfo || 'https://www.bizinfo.go.kr/'})`,
  `- [중소벤처24](${portalLinks.smes || 'https://www.smes.go.kr/main/sportsBsnsPolicy'})`,
  '',
  '## 변경 감지 결과',
  '',
];

if (!prevResult) {
  lines.push('- 이전 실행 데이터가 없어 이번 실행을 기준 스냅샷으로 저장했습니다.');
} else if (
  changes.added.length === 0 &&
  changes.removed.length === 0 &&
  changes.changed.length === 0
) {
  lines.push('- 변경 사항 없음');
} else {
  if (changes.added.length) {
    lines.push('- 신규');
    changes.added.slice(0, 20).forEach((it) => {
      lines.push(`  - ${mdLink(it.title, it.url)}`);
    });
  }
  if (changes.changed.length) {
    lines.push('- 변경');
    changes.changed.slice(0, 20).forEach(({ item, diffs }) => {
      lines.push(`  - ${mdLink(item.title, item.url)} (${diffs.join(', ')})`);
    });
  }
  if (changes.removed.length) {
    lines.push('- 목록 제외');
    changes.removed.slice(0, 20).forEach((it) => {
      lines.push(`  - ${it.title}`);
    });
  }
}

lines.push('');
lines.push('## D-day 경고');
lines.push('');
if (ddayAlerts.length === 0) {
  lines.push('- 경고 임계값(D-14/D-7/D-3/D-1/D-day)에 해당하는 공고가 없습니다.');
} else {
  ddayAlerts.forEach((it) => {
    const label = it.dday === 0 ? 'D-day' : `D-${it.dday}`;
    lines.push(`- ${label}: ${mdLink(it.title, it.url)}`);
    if (it.applyPeriod) lines.push(`  - 접수기간: ${it.applyPeriod}`);
  });
}

lines.push('');
lines.push('## 마감일 지난 공고 (자동 제외)');
lines.push('');
if (!excludePastDeadline) {
  lines.push('- `excludePastDeadline` 가 꺼져 있어 이 절에서는 제외하지 않습니다.');
} else if (deadlineExcluded.length === 0) {
  lines.push('- 해당 없음 (또는 상세에서 마감일을 읽지 못해 제외 판단을 하지 않음)');
} else {
  deadlineExcluded.slice(0, 30).forEach((it, idx) => {
    lines.push(`${idx + 1}. ${mdLink(it.title, it.url)}`);
    lines.push(`   - 사유: ${it.excludeReason || '마감'}`);
  });
  if (deadlineExcluded.length > 30) {
    lines.push(`- 외 ${deadlineExcluded.length - 30}건은 JSON의 deadlineExcluded 참고`);
  }
}

lines.push('');
lines.push('## 키워드 매칭 공고 (신청 가능)');
lines.push('');

if (result.items.length === 0) {
  lines.push('- 매칭된 공고가 없습니다.');
} else {
  result.items.slice(0, 50).forEach((it, idx) => {
    const kw =
      it.matchedKeywords?.length > 0 ? ` [${it.matchedKeywords.join(', ')}]` : '';
    const src = it.source ? ` (${it.source})` : '';
    const min = it.ministry ? ` | ${it.ministry}` : '';
    lines.push(`${idx + 1}. ${mdLink(it.title, it.url)}${kw}${src}${min}`);
    if (it.applyPeriod) lines.push(`   - 접수기간: ${it.applyPeriod}`);
    if (it.applyEndDate) {
      const dday = calcDday(it.applyEndDate);
      if (Number.isFinite(dday)) {
        const label = dday === 0 ? 'D-day' : `D-${dday}`;
        lines.push(`   - 마감: ${label} (${it.applyEndDate})`);
      }
    }
  });
  if (result.items.length > 50) {
    lines.push(`- 외 ${result.items.length - 50}건은 JSON 파일 참고`);
  }
}

lines.push('');
lines.push(`- JSON 원본: ${path.relative(root, hubJson)}`);

fs.writeFileSync(docsOutPath, `${lines.join('\n')}\n`, 'utf8');
console.log(
  `[grant-watch] 통합 매칭 ${result.matchedCountBeforeDeadline ?? result.matchedCount}건 → 마감 제외 후 ${result.matchedCount}건`,
);
console.log(
  `[grant-watch] 변경감지 신규 ${changes.added.length} / 삭제 ${changes.removed.length} / 변경 ${changes.changed.length}`,
);
console.log(`[grant-watch] D-day 경고 ${ddayAlerts.length}건`);
console.log(`[grant-watch] 저장: ${hubJson}`);
console.log(`[grant-watch] 문서 리포트 저장: ${docsOutPath}`);

if (result.items.length) {
  console.log('\n--- 매칭 상위 ---');
  for (const it of result.items.slice(0, 25)) {
    const kw = it.matchedKeywords?.length ? ` [${it.matchedKeywords.join(', ')}]` : '';
    const src = it.source ? ` (${it.source})` : '';
    const period = it.applyPeriod ? `\n  ${it.applyPeriod}` : '';
    console.log(`· ${it.title}${kw}${src}${period}\n  ${it.url}`);
  }
  if (result.items.length > 25) {
    console.log(`… 외 ${result.items.length - 25}건은 JSON 참고`);
  }
}
