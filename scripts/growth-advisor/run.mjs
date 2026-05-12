/**
 * 성장·IP·지원사업 주기 점검: 질문형 마크다운 생성 + (선택) grant:watch 등 자동 실행
 *
 *   npm run growth:advisor
 *   npm run growth:advisor:execute   # 설정 주기에 따라 grant:watch 등 실행
 *   npm run growth:advisor -- --force   # 주기 무시하고 모든 섹션·아이디어 풀 출력
 *
 * 설정: config/growth-advisor.json
 * 상태: scripts/.growth-advisor-state.json (gitignore)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

function kstYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function kstIsoMinute() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00+09:00`;
}

/** Days from calendar a to b (inclusive-ish); a,b are YYYY-MM-DD */
function daysBetweenYmd(a, b) {
  const ta = Date.parse(`${a}T00:00:00+09:00`);
  const tb = Date.parse(`${b}T00:00:00+09:00`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 999;
  return Math.floor((tb - ta) / 86400000);
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function loadConfig() {
  const p = path.join(root, 'config', 'growth-advisor.json');
  if (!fs.existsSync(p)) {
    throw new Error(`growth-advisor: 설정 없음 ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function pickIdeas(pool, count, seedDay) {
  const out = [];
  const n = pool.length;
  if (!n) return out;
  let s = 0;
  for (let i = 0; i < seedDay.length; i++) s = (s * 31 + seedDay.charCodeAt(i)) >>> 0;
  const used = new Set();
  for (let k = 0; k < count; k++) {
    let idx = (s + k * 17) % n;
    let guard = 0;
    while (used.has(idx) && guard < n) {
      idx = (idx + 1) % n;
      guard++;
    }
    used.add(idx);
    out.push(pool[idx]);
  }
  return out;
}

function runNpm(scriptName) {
  const r = spawnSync('npm', ['run', scriptName], {
    cwd: root,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env },
  });
  return r.status === 0;
}

function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const execute = argv.includes('--execute');

  const cfg = loadConfig();
  const statePath = path.isAbsolute(cfg.statePath)
    ? cfg.statePath
    : path.join(root, cfg.statePath);
  const outPath = path.isAbsolute(cfg.outputMarkdownPath)
    ? cfg.outputMarkdownPath
    : path.join(root, cfg.outputMarkdownPath);

  const today = kstYmd();
  const state = loadJson(statePath) || {
    sectionLastFull: {},
    lastGrantWatch: null,
    lastGovAnnounceWatch: null,
    lastRunAt: null,
  };

  const lines = [];
  lines.push('# 성장 어드바이저 — 최근 프롬프트');
  lines.push('');
  lines.push(
    `자동 생성: **${kstIsoMinute()}** (KST) · \`npm run growth:advisor\`${execute ? ' **`--execute` 포함**' : ''}${force ? ' **`--force`**' : ''}`,
  );
  lines.push('');
  lines.push(
    '이 파일은 **Cursor 등 AI에게 붙여넣을 질문·맥락**과, **직접 체크할 항목**을 모읍니다. 답은 채팅·이슈·`docs/운영-우선순위/README.md`에 반영하면 됩니다.',
  );
  lines.push('');

  const dueSections = [];
  for (const sec of cfg.sections || []) {
    const last = state.sectionLastFull?.[sec.id];
    const every = Number(sec.everyDays) > 0 ? Number(sec.everyDays) : 7;
    const due = force || !last || daysBetweenYmd(last, today) >= every;
    dueSections.push({ sec, due, every, last });
  }

  lines.push('## 1. 이번 주기에 나온 점검 블록');
  lines.push('');

  let anyDue = false;
  for (const { sec, due, every, last } of dueSections) {
    if (!due) {
      lines.push(`### ${sec.title} _(스킵 · 마지막 전체 점검: ${last || '없음'} · 주기 ${every}일)_**`);
      lines.push('');
      continue;
    }
    anyDue = true;
    lines.push(`### ${sec.title}`);
    lines.push('');
    let i = 1;
    for (const q of sec.questions || []) {
      lines.push(`${i}. ${q}`);
      i++;
    }
    lines.push('');
    if (Array.isArray(sec.docLinks) && sec.docLinks.length) {
      lines.push('참고 문서:');
      for (const l of sec.docLinks) {
        lines.push(`- \`${l.path}\` — ${l.label}`);
      }
      lines.push('');
    }
  }

  if (!anyDue && !force) {
    lines.push('_(주기 내이라 전체 질문 블록은 생략되었습니다. 강제로 모두 보려면 `npm run growth:advisor -- --force`)_');
    lines.push('');
  }

  lines.push('## 2. 로테이션 아이디어 (이번에 골라 본 것)');
  lines.push('');
  const pool = Array.isArray(cfg.ideaPool) ? cfg.ideaPool : [];
  const pickN = Math.min(
    Number(cfg.ideasPickCount) > 0 ? Number(cfg.ideasPickCount) : 3,
    pool.length,
  );
  const ideas = pickIdeas(pool, pickN, today);
  ideas.forEach((t, idx) => {
    lines.push(`${idx + 1}. ${t}`);
  });
  lines.push('');

  lines.push('## 3. Cursor·AI에 한 번에 넣기 좋은 프롬프트');
  lines.push('');
  lines.push('아래 블록을 복사해 AI에게내면, 저장소 맥락에 맞춰 다음 액션을 정리하기 쉽습니다.');
  lines.push('');
  lines.push('```text');
  lines.push(
    `나는 "해양 종자 살포 관제" 웹 프로젝트(Leaflet·기상·IoT·관공서 제출용 문서 포함)를 운영 중이다.`,
  );
  lines.push(`오늘 날짜(KST 기준): ${today}.`);
  if (anyDue || force) {
    lines.push('다음 질문에 대해 각각 (1) 지금 상태로 답이 어떻게 될지 추정 (2) 이번 주 할 일 1~2개로 줄여서 제안해 줘:');
    for (const { sec, due } of dueSections) {
      if (!due) continue;
      for (const q of sec.questions || []) {
        lines.push(`- ${q}`);
      }
    }
  } else {
    lines.push(
      '지원사업·특허·제품 성장 중 **가장 비용 대비 효과 큰 한 가지**와, **방치되기 쉬운 리스크 한 가지**만 짚어 줘.',
    );
  }
  lines.push(
    '저장소 경로는 Windows 기준 `d:\\Marine Seeding Control System` 이다. 문서는 `docs/` 아래를 우선 본다.',
  );
  lines.push('```');
  lines.push('');

  lines.push('## 4. 자동 실행 로그 (이번 실행)');
  lines.push('');
  const auto = cfg.autoExecute || {};
  const execLog = [];

  if (execute) {
    const gEvery = Number(auto.grantWatchEveryDays) || 0;
    if (gEvery > 0) {
      const lastG = state.lastGrantWatch;
      const runGrant =
        force ||
        !lastG ||
        daysBetweenYmd(lastG, today) >= gEvery;
      if (runGrant) {
        execLog.push(`- \`grant:watch\` 실행 시도 (주기 ${gEvery}일)`);
        const ok = runNpm('grant:watch');
        if (ok) {
          state.lastGrantWatch = today;
          execLog.push('  - **성공** — `docs/사업-공고/99_공고-모니터링-최근결과.md` 갱신됨');
        } else {
          execLog.push('  - **실패** — 터미널 로그 확인(.env·네트워크)');
        }
      } else {
        execLog.push(
          `- \`grant:watch\` 생략 (마지막: ${lastG} · ${gEvery}일 주기 미충족)`,
        );
      }
    } else {
      execLog.push('- `grant:watch` 자동 실행: 설정상 비활성(`grantWatchEveryDays: 0`)');
    }

    const govEvery = Number(auto.govAnnounceWatchEveryDays) || 0;
    if (govEvery > 0) {
      const lastGov = state.lastGovAnnounceWatch;
      const runGov =
        force ||
        !lastGov ||
        daysBetweenYmd(lastGov, today) >= govEvery;
      if (runGov) {
        execLog.push(`- \`gov:announce:watch\` 실행 시도 (주기 ${govEvery}일)`);
        const ok = runNpm('gov:announce:watch');
        if (ok) {
          state.lastGovAnnounceWatch = today;
          execLog.push('  - **성공**');
        } else {
          execLog.push('  - **실패**');
        }
      } else {
        execLog.push(
          `- \`gov:announce:watch\` 생략 (마지막: ${lastGov})`,
        );
      }
    }
  } else {
    execLog.push(
      '- 자동 실행 없음. 공고 허브를 갱신하려면: `npm run growth:advisor:execute` (또는 `npm run growth:advisor -- --execute`)',
    );
  }

  lines.push(...execLog);
  lines.push('');

  state.sectionLastFull = state.sectionLastFull || {};
  for (const { sec, due } of dueSections) {
    if (due) state.sectionLastFull[sec.id] = today;
  }
  state.lastRunAt = kstIsoMinute();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

  console.log(`growth-advisor: wrote ${path.relative(root, outPath)}`);
  console.log(`growth-advisor: state ${path.relative(root, statePath)}`);
}

main();
