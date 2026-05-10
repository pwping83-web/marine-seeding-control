/**
 * 수동 등록 공고(config/manual-support-notices.json) 마감·자격 요약.
 *
 * 실행:
 *   npm run grant:manual
 *   npm run grant:manual -- --json
 *   npm run grant:manual -- --as-of=2026-05-10
 *   npm run grant:manual -- --gyeongbuk-sme --partner-daegu-gyeongbuk --kosme-struct-rec
 *
 * 플래그(자격 가정):
 *   --gyeongbuk-sme          경북 소재 중소기업
 *   --partner-daegu-gyeongbuk  대구·경북 소재 연구기관 파트너 확보(STEP4)
 *   --kosme-struct-rec       중진공 구조혁신 R&D 추천 기업
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calcDday, kstTodayYmd } from './grant-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const DEFAULT_DATA = path.join(root, 'config', 'manual-support-notices.json');

function parseArgs(argv) {
  const flags = new Set();
  let asOf = null;
  let json = false;
  let outPath = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a.startsWith('--as-of=')) asOf = a.slice('--as-of='.length);
    else if (a === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (a.startsWith('--')) flags.add(a);
  }
  return { flags, asOf, json, outPath };
}

function hasFlag(flags, name) {
  return flags.has(`--${name}`);
}

function compareYmd(a, b) {
  if (!a || !b) return 0;
  return a.localeCompare(b);
}

/**
 * 날짜만으로 창구 상태. 마감일 당일은 'open'(시각은 reasons에 안내).
 */
function windowStatus(window, todayYmd) {
  const start = window.applyStartYmd;
  const end = window.applyEndYmd;
  if (start && compareYmd(todayYmd, start) < 0) return 'upcoming';
  if (end && compareYmd(todayYmd, end) > 0) return 'closed';
  return 'open';
}

function eligibilityOk(eligibility, profile) {
  if (!eligibility || eligibility.mode === 'open') return true;
  if (eligibility.mode !== 'flags') return true;
  const req = eligibility.requireAllFlags || [];
  return req.every((f) => profile[f] === true);
}

function buildProfile(flags) {
  return {
    gyeongbuk_sme: hasFlag(flags, 'gyeongbuk-sme'),
    daegu_gyeongbuk_rd_partner: hasFlag(flags, 'partner-daegu-gyeongbuk'),
    kosme_struct_recommend: hasFlag(flags, 'kosme-struct-rec'),
  };
}

function loadNotices(dataPath) {
  const raw = fs.readFileSync(dataPath, 'utf8');
  return JSON.parse(raw);
}

function summarizeWindow(w, todayYmd) {
  const st = windowStatus(w, todayYmd);
  const dday = w.applyEndYmd ? calcDday(w.applyEndYmd) : null;
  return {
    id: w.id,
    label: w.label,
    applyStartYmd: w.applyStartYmd,
    applyEndYmd: w.applyEndYmd,
    applyEndTimeKst: w.applyEndTimeKst,
    channelKo: w.channelKo,
    status: st,
    ddayToEnd: dday,
  };
}

function run() {
  const { flags, asOf, json, outPath } = parseArgs(process.argv);
  const todayYmd = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : kstTodayYmd();
  const dataPath = process.env.MANUAL_NOTICES_JSON
    ? path.resolve(root, process.env.MANUAL_NOTICES_JSON)
    : DEFAULT_DATA;

  if (!fs.existsSync(dataPath)) {
    console.error(`manual-notices: 파일 없음: ${dataPath}`);
    process.exit(1);
  }

  const bundle = loadNotices(dataPath);
  const profile = buildProfile(flags);
  const results = [];

  for (const n of bundle.notices || []) {
    const windows = (n.windows || []).map((w) => summarizeWindow(w, todayYmd));
    const anyOpen = windows.some((w) => w.status === 'open');
    const eligible = eligibilityOk(n.eligibility, profile);

    results.push({
      id: n.id,
      title: n.title,
      kind: n.kind,
      issuerKo: n.issuerKo,
      publishedYmd: n.publishedYmd,
      asOfYmd: todayYmd,
      windows,
      eligibilitySummaryKo: n.eligibility?.summaryKo,
      eligibleGivenProfile: eligible,
      /** 창구가 열려 있고 자격 가정을 통과한 경우 */
      actionableNow: eligible && anyOpen,
      reasonsKo: n.reasonsKo || [],
      heuristicNoteKo: n.heuristicNoteKo,
      contactsKo: n.contactsKo || [],
    });
  }

  const payload = {
    generatedAtKst: new Date().toISOString(),
    dataPath,
    profileAssumptions: profile,
    oneLinerFromHeuristicFile: null,
    notices: results,
  };

  const heurPath = path.join(root, 'config', 'support-notice-recommend-heuristic.json');
  if (fs.existsSync(heurPath)) {
    try {
      const h = JSON.parse(fs.readFileSync(heurPath, 'utf8'));
      payload.oneLinerFromHeuristicFile = h.oneLinerKo || null;
    } catch {
      /* ignore */
    }
  }

  if (json) {
    const text = JSON.stringify(payload, null, 2);
    if (outPath) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, text, 'utf8');
    } else {
      console.log(text);
    }
    return;
  }

  const lines = [];
  lines.push(`# 수동 등록 공고 요약 (기준일 KST: **${todayYmd}**)`);
  lines.push('');
  if (payload.oneLinerFromHeuristicFile) {
    lines.push(`> 휴리스틱 한 줄: ${payload.oneLinerFromHeuristicFile}`);
    lines.push('');
  }
  lines.push('## 프로필 가정(플래그)');
  lines.push(
    `- 경북 중소기업: **${profile.gyeongbuk_sme ? '예' : '아니오'}** (\`--gyeongbuk-sme\`)`,
  );
  lines.push(
    `- 대구·경북 연구기관 파트너: **${profile.daegu_gyeongbuk_rd_partner ? '예' : '아니오'}** (\`--partner-daegu-gyeongbuk\`)`,
  );
  lines.push(
    `- 중진공 구조혁신 R&D 추천: **${profile.kosme_struct_recommend ? '예' : '아니오'}** (\`--kosme-struct-rec\`)`,
  );
  lines.push('');
  lines.push('| ID | 제목 | 창구 | 지금 신청 가능* | 자격(가정) |');
  lines.push('|----|------|------|----------------|------------|');
  for (const r of results) {
    const ws = r.windows
      .map((w) => `${w.label}: ${w.status}${w.applyEndYmd ? ` (D-day ${w.ddayToEnd ?? '?'})` : ''}`)
      .join('<br>');
    lines.push(
      `| ${r.id} | ${r.title} | ${ws} | **${r.actionableNow ? '예' : '아니오'}** | **${r.eligibleGivenProfile ? '통과' : '미통과'}** |`,
    );
  }
  lines.push('');
  lines.push('\\* 자격 가정을 통과하고, 접수 기간이 `open`인 창구가 하나 이상 있을 때.');
  lines.push('');

  for (const r of results) {
    lines.push(`## ${r.title}`);
    lines.push('');
    lines.push(`- **종류:** ${r.kind}`);
    lines.push(`- **발행/기관:** ${r.issuerKo || ''}`);
    lines.push(`- **지금 신청 가능(가정 반영):** ${r.actionableNow ? '예' : '아니오'}`);
    lines.push(`- **자격(가정):** ${r.eligibleGivenProfile ? '통과' : '미통과'}`);
    lines.push(`- **자격 요약:** ${r.eligibilitySummaryKo || ''}`);
    lines.push(`- **휴리스틱 메모:** ${r.heuristicNoteKo || ''}`);
    lines.push('');
    lines.push('**이유**');
    for (const t of r.reasonsKo) lines.push(`- ${t}`);
    lines.push('');
    lines.push('**창구**');
    for (const w of r.windows) {
      const timeNote = w.applyEndTimeKst ? `, 마감 ${w.applyEndTimeKst}` : '';
      lines.push(
        `- ${w.label}: ${w.status} (${w.applyStartYmd || '?'} ~ ${w.applyEndYmd || '?'})${timeNote} — ${w.channelKo || ''}`,
      );
    }
    if (r.contactsKo.length) {
      lines.push('');
      lines.push(`**문의:** ${r.contactsKo.join(', ')}`);
    }
    lines.push('');
  }

  const md = lines.join('\n');
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, md, 'utf8');
  } else {
    console.log(md);
  }
}

run();
