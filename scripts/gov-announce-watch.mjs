#!/usr/bin/env node
/**
 * 나라장터 외 공고: 여러 기관 목록을 병렬로 받아 키워드·마감일(또는 게시일)로 필터 → 상세 URL 출력.
 * 수동 검색 시간을 줄이기 위해 소스별 파서·재시도·(선택) 신규만 알림을 한 번에 처리합니다.
 *
 *   npm run gov:announce              # 전체 매칭 목록
 *   npm run gov:announce:json         # JSON
 *   npm run gov:announce:watch        # 신규만 (상태 파일·웹훅/ntfy 권장)
 *
 * CLI:
 *   --json          JSON 출력
 *   --new-only      이전 실행 이후 새로 나타난 공고만 (GOV_ANNOUNCE_STATE_FILE)
 *   --config PATH   설정 파일
 *
 * 환경변수:
 *   GOV_ANNOUNCE_CONFIG
 *   GOV_ANNOUNCE_AS_OF              기준일 YYYY-MM-DD
 *   GOV_ANNOUNCE_STATE_FILE         기본 scripts/.gov-announce-watch-state.json
 *   GOV_ANNOUNCE_FIRST_RUN_SEED_ONLY  기본 1 — 첫 실행은 알림 없이 ID만 시드
 *   GOV_ANNOUNCE_NOTIFY_WEBHOOK_URL  Discord/Slack 웹훅 (--new-only 이고 신규 있을 때)
 *   GOV_ANNOUNCE_NTFY_TOPIC          ntfy.sh 토픽
 *
 * 주의: HTML 구조 변경 시 파서 수정 필요. robots.txt·이용약관 준수, 호출은 하루 1~2회 수준 권장.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { format, isBefore, parseISO, startOfDay } from "date-fns";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadConfig() {
  const argConfig = parseArgConfigPath();
  const p =
    argConfig ||
    process.env.GOV_ANNOUNCE_CONFIG ||
    path.join(__dirname, "gov-announce-watch.config.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function parseArgConfigPath() {
  const i = process.argv.indexOf("--config");
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.cwd(), process.argv[i + 1]);
  return null;
}

function wantJson() {
  return process.argv.includes("--json");
}

function wantNewOnly() {
  return process.argv.includes("--new-only");
}

function env(name, fallback = "") {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

function asOfDate(config) {
  const e = env("GOV_ANNOUNCE_AS_OF");
  if (e && /^\d{4}-\d{2}-\d{2}$/.test(e)) return startOfDay(parseISO(e));
  if (config.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(config.asOfDate))
    return startOfDay(parseISO(config.asOfDate));
  return startOfDay(new Date());
}

/**
 * HTML은 대부분 UTF-8. 일부 구형 사이트만 EUC-KR/CP949 — meta/헤더에 명시될 때만 cp949 디코딩.
 */
function decodeHtmlBuffer(buf, contentTypeHeader) {
  const ct = (contentTypeHeader || "").toLowerCase();
  if (ct.includes("utf-8")) return buf.toString("utf8");
  const head = buf.subarray(0, Math.min(buf.length, 12000)).toString("latin1");
  const meta = /<meta[^>]+charset\s*=\s*["']?([^"'>\s]+)/i.exec(head);
  const declared = (meta?.[1] || "").toLowerCase();
  if (declared.includes("utf-8")) return buf.toString("utf8");
  if (
    /charset\s*=\s*(euc-kr|ks_c_5601-1987|cp949)/i.test(ct) ||
    /euc-kr|cp949|ks_c_5601/.test(declared)
  ) {
    return iconv.decode(buf, "cp949");
  }
  return buf.toString("utf8");
}

async function fetchText(url, userAgent, timeoutMs = 40000, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      return decodeHtmlBuffer(buf, res.headers.get("content-type"));
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeywords(text, keywords, mode) {
  const t = text.toLowerCase();
  const kws = keywords.map((k) => k.toLowerCase());
  if (mode === "all") return kws.every((k) => t.includes(k));
  return kws.some((k) => t.includes(k));
}

function isTitleExcluded(title, substrings) {
  if (!substrings?.length) return false;
  const t = title.toLowerCase();
  return substrings.some((s) => t.includes(String(s).toLowerCase()));
}

function parseYmd(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return startOfDay(parseISO(s));
}

/** 목록에 '2026.05.07.' 형식 */
function parseMofDotDate(s) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})\.?$/.exec(String(s).trim());
  if (!m) return null;
  return parseYmd(`${m[1]}-${m[2]}-${m[3]}`);
}

/** 접수/마감 문자열에서 마지막 YYYY-MM-DD (정렬용) */
function lastYmdInString(s) {
  if (!s) return null;
  const re = /(\d{4}-\d{2}-\d{2})/g;
  let m;
  let last = null;
  while ((m = re.exec(s)) !== null) last = m[1];
  return last;
}

function sortDeadlineKey(item) {
  const fromDeadline = lastYmdInString(item.deadline);
  if (fromDeadline) {
    const d = parseYmd(fromDeadline);
    if (d) return d.getTime();
  }
  if (item.postedAt) {
    const p = parseYmd(item.postedAt);
    if (p) return p.getTime() + 3600000;
  }
  return Number.MAX_SAFE_INTEGER - 1;
}

function tooOldPosted(postedDay, asOf, maxAgeDays) {
  if (maxAgeDays == null || maxAgeDays <= 0 || !postedDay) return false;
  const p = typeof postedDay === "string" ? parseYmd(postedDay) : postedDay;
  if (!p) return false;
  const limit = new Date(asOf);
  limit.setDate(limit.getDate() - maxAgeDays);
  return isBefore(p, startOfDay(limit));
}

/** --- 파서 --- */

function parseKStartup(html, cfg, asOf, keywords, keywordMode, excludeTitle) {
  const $ = cheerio.load(html);
  const base = cfg.sources.kstartup.detailBase;
  const out = [];

  $("li.notice").each((_, el) => {
    const $el = $(el);
    const href = $el.find("a[href*='go_view']").first().attr("href") || "";
    const m = /go_view\((\d+)\)/.exec(href);
    if (!m) return;
    const pbancSn = m[1];
    const title = decodeEntities($el.find("p.tit").first().text());
    let deadline = null;
    $el.find("span.list").each((__, sp) => {
      const tx = $(sp).text();
      const dm = /마감일자\s*(\d{4}-\d{2}-\d{2})/.exec(tx);
      if (dm) deadline = dm[1];
    });
    const orgParts = [];
    $el.find("span.list").each((__, sp) => {
      const tx = $(sp).text();
      if (tx.includes("마감일자") || tx.includes("등록일자") || tx.includes("시작일자")) return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(tx.trim())) return;
      orgParts.push(tx.replace(/^[\s\u00a0]+/, "").trim());
    });
    const org = orgParts.find((x) => x && !x.startsWith("20")) || "";
    if (!matchesKeywords(title, keywords, keywordMode)) return;
    if (isTitleExcluded(title, excludeTitle)) return;

    const end = deadline ? parseYmd(deadline) : null;
    if (end && isBefore(end, asOf)) return;

    out.push({
      id: `k-startup:${pbancSn}`,
      source: "k-startup",
      title,
      org: org || "",
      deadline: deadline || "",
      postedAt: "",
      url: `${base}${pbancSn}`,
      rawStatus: "모집중(목록)",
    });
  });

  return out;
}

function parseNgii(html, cfg, asOf, keywords, keywordMode, excludeTitle) {
  const $ = cheerio.load(html);
  const base = cfg.sources.ngii.detailBase;
  const out = [];

  $("div.board_list table tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const $a = $tr.find("td.subject a").first();
    const title = decodeEntities($a.text());
    const onclick = $a.attr("href") || "";
    const sm = /'sq'\s*:\s*'(\d+)'/.exec(onclick);
    if (!sm) return;
    const sq = sm[1];

    const tds = $tr.find("td");
    const 마감텍스트 = tds.eq(3).text().trim();
    const 상태 = decodeEntities(tds.eq(5).text());

    if (상태.includes("마감")) return;

    const end = parseYmd(마감텍스트);
    if (end && isBefore(end, asOf)) return;

    if (!matchesKeywords(title, keywords, keywordMode)) return;
    if (isTitleExcluded(title, excludeTitle)) return;

    out.push({
      id: `ngii:${sq}`,
      source: "ngii",
      title,
      org: "국토지리정보원",
      deadline: 마감텍스트,
      postedAt: "",
      url: `${base}${sq}`,
      rawStatus: 상태,
    });
  });

  return out;
}

function parseKimstPage(html, cfg, asOf, keywords, keywordMode, excludeTitle) {
  const $ = cheerio.load(html);
  const base = cfg.sources.kimst.detailBase;
  const out = [];

  $("table.table-list tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const $a = $tr.find("td a[href*='anucno=']").first();
    const href = $a.attr("href") || "";
    const am = /anucno=([^&"']+)/.exec(href);
    if (!am) return;
    const anucno = am[1];
    const title = decodeEntities($a.text());

    const tds = $tr.find("td");
    const period = tds.eq(4).text().trim();
    let endStr = "";
    const range = /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/.exec(period);
    if (range) endStr = range[2];
    else {
      const single = /(\d{4}-\d{2}-\d{2})/.exec(period);
      if (single) endStr = single[1];
    }

    if (!matchesKeywords(title, keywords, keywordMode)) return;
    if (isTitleExcluded(title, excludeTitle)) return;

    const end = endStr ? parseYmd(endStr) : null;
    if (end && isBefore(end, asOf)) return;

    out.push({
      id: `kimst:${anucno}`,
      source: "kimst",
      title,
      org: "해양수산과학기술진흥원",
      deadline: period,
      postedAt: "",
      url: `${base}${encodeURIComponent(anucno)}`,
      rawStatus: "사업공고",
    });
  });

  return out;
}

function parseMof(html, cfg, asOf, keywords, keywordMode, excludeTitle) {
  const $ = cheerio.load(html);
  const s = cfg.sources.mof;
  if (!s?.enabled) return [];
  const out = [];

  $("table tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const $a = $tr.find("td.tit a.link-t[onclick*='fn_selectDoc']").first();
    if (!$a.length) return;
    const oc = $a.attr("onclick") || "";
    const dm = /fn_selectDoc\('(\d+)'\)/.exec(oc);
    if (!dm) return;
    const docSeq = dm[1];
    const title = decodeEntities($a.text());
    const postedRaw = $tr.find("td.t-date").first().text().trim();
    const posted = parseMofDotDate(postedRaw);
    const postedStr = posted ? format(posted, "yyyy-MM-dd") : "";

    if (!matchesKeywords(title, keywords, keywordMode)) return;
    if (isTitleExcluded(title, excludeTitle)) return;

    const maxAge = s.maxPostedAgeDays ?? 0;
    if (tooOldPosted(postedStr, asOf, maxAge)) return;

    const url = `${s.detailBase}${docSeq}&menuSeq=${s.menuSeq}&bbsSeq=${s.bbsSeq}`;

    out.push({
      id: `mof:${docSeq}`,
      source: "mof",
      title,
      org: "해양수산부",
      deadline: "",
      postedAt: postedStr,
      url,
      rawStatus: "공지(마감은 본문 확인)",
    });
  });

  return out;
}

/**
 * 국해원 입찰공고 — GET 파라미터로 상세 열림(POST와 동일 파라미터).
 */
function parseKhoa(html, cfg, asOf, keywords, keywordMode, excludeTitle) {
  const $ = cheerio.load(html);
  const s = cfg.sources.khoa;
  if (!s?.enabled) return [];
  const out = [];

  $("table tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const $a = $tr.find("td.table-tit a[onclick*='fnBbsDetail']").first();
    if (!$a.length) return;
    const oc = $a.attr("onclick") || "";
    const bm = /fnBbsDetail\('([^']+)','([^']*)','([^']*)'\)/.exec(oc);
    if (!bm) return;
    const bbsSeq = bm[1];
    const bbsFileSeq = bm[2];
    const title = decodeEntities($a.text());

    const tds = $tr.find("td");
    const postedRaw = tds.eq(3).text().trim();
    const posted = parseYmd(postedRaw) || null;
    const postedStr = posted ? format(posted, "yyyy-MM-dd") : "";

    if (!matchesKeywords(title, keywords, keywordMode)) return;
    if (isTitleExcluded(title, excludeTitle)) return;

    const maxAge = s.maxPostedAgeDays ?? 0;
    if (tooOldPosted(postedStr, asOf, maxAge)) return;

    const q = new URLSearchParams({
      bbsMasterSeq: s.bbsMasterSeq,
      bbsSeq,
      bbsFileSeq,
      answerUpper: bm[3] || "",
    });
    const url = `${s.detailBase}?${q.toString()}`;

    out.push({
      id: `khoa:${bbsSeq}|${bbsFileSeq}`,
      source: "khoa",
      title,
      org: "국립해양조사원",
      deadline: "",
      postedAt: postedStr,
      url,
      rawStatus: "입찰공고(마감은 본문 확인)",
    });
  });

  return out;
}

async function runKimstPages(config, asOf, keywords, keywordMode, excludeTitle) {
  const { listUrl, maxPages } = config.sources.kimst;
  const ua = config.userAgent;
  const pages = Array.from({ length: maxPages }, (_, i) => i + 1);
  const chunks = await Promise.all(
    pages.map(async (page) => {
      const url = `${listUrl}${listUrl.includes("?") ? "&" : "?"}page=${page}`;
      const html = await fetchText(url, ua);
      return parseKimstPage(html, config, asOf, keywords, keywordMode, excludeTitle);
    }),
  );
  return chunks.flat();
}

function dedupeByUrl(items) {
  const m = new Map();
  for (const it of items) {
    if (!m.has(it.url)) m.set(it.url, it);
  }
  return [...m.values()];
}

function loadState(file) {
  try {
    const t = fs.readFileSync(file, "utf8");
    const j = JSON.parse(t);
    if (j && typeof j === "object" && Array.isArray(j.seenIds)) {
      return new Set(j.seenIds);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveState(file, seen) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ updatedAt: new Date().toISOString(), seenIds: [...seen].slice(-15000) }, null, 0),
    "utf8",
  );
}

async function postDiscordOrSlack(webhookUrl, text) {
  const isDiscord = /discord\.com\/api\/webhooks\//i.test(webhookUrl);
  const body = isDiscord ? { content: text } : { text };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`웹훅 실패 HTTP ${res.status} ${t.slice(0, 300)}`);
  }
}

async function postNtfy(topic, title, message) {
  const url = `https://ntfy.sh/${encodeURIComponent(topic)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Title: title.slice(0, 200),
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: message,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ntfy 실패 HTTP ${res.status} ${t.slice(0, 300)}`);
  }
}

function chunkStrings(lines, maxLen) {
  const chunks = [];
  let cur = "";
  for (const line of lines) {
    const piece = line + "\n\n";
    if (cur.length + piece.length > maxLen) {
      if (cur) chunks.push(cur.trimEnd());
      cur = piece;
    } else {
      cur += piece;
    }
  }
  if (cur.trim()) chunks.push(cur.trimEnd());
  return chunks;
}

function formatItemLine(it) {
  const parts = [`· [${it.source}] ${it.title}`, `  ${it.url}`];
  if (it.deadline) parts.push(`  마감/접수: ${it.deadline}`);
  if (it.postedAt) parts.push(`  게시: ${it.postedAt}`);
  return parts.join("\n");
}

async function main() {
  const config = loadConfig();
  const asOf = asOfDate(config);
  const keywords = config.keywords || [];
  const keywordMode = config.keywordMode || "any";
  const excludeTitle = config.excludeTitleSubstrings || [];
  const ua = config.userAgent;
  const errors = [];

  if (!keywords.length) {
    console.error("config.keywords 가 비어 있습니다.");
    process.exit(1);
  }

  async function safe(name, fn) {
    try {
      return await fn();
    } catch (e) {
      errors.push({ source: name, message: e?.message || String(e) });
      console.error(`[${name}] ${e?.message || e}`);
      return [];
    }
  }

  const tasks = [];

  if (config.sources?.kstartup?.enabled) {
    tasks.push(
      safe("k-startup", async () => {
        const html = await fetchText(config.sources.kstartup.url, ua);
        return parseKStartup(html, config, asOf, keywords, keywordMode, excludeTitle);
      }),
    );
  }

  if (config.sources?.ngii?.enabled) {
    tasks.push(
      safe("ngii", async () => {
        const html = await fetchText(config.sources.ngii.url, ua);
        return parseNgii(html, config, asOf, keywords, keywordMode, excludeTitle);
      }),
    );
  }

  if (config.sources?.kimst?.enabled) {
    tasks.push(
      safe("kimst", async () => runKimstPages(config, asOf, keywords, keywordMode, excludeTitle)),
    );
  }

  if (config.sources?.mof?.enabled) {
    tasks.push(
      safe("mof", async () => {
        const html = await fetchText(config.sources.mof.listUrl, ua);
        return parseMof(html, config, asOf, keywords, keywordMode, excludeTitle);
      }),
    );
  }

  if (config.sources?.khoa?.enabled) {
    tasks.push(
      safe("khoa", async () => {
        const html = await fetchText(config.sources.khoa.listUrl, ua);
        return parseKhoa(html, config, asOf, keywords, keywordMode, excludeTitle);
      }),
    );
  }

  const batches = await Promise.all(tasks);
  let results = dedupeByUrl(batches.flat());
  results.sort((a, b) => sortDeadlineKey(a) - sortDeadlineKey(b));

  const stateFile = env("GOV_ANNOUNCE_STATE_FILE", path.join(__dirname, ".gov-announce-watch-state.json"));
  const firstRunSeed = env("GOV_ANNOUNCE_FIRST_RUN_SEED_ONLY", "1") !== "0";
  const webhook = env("GOV_ANNOUNCE_NOTIFY_WEBHOOK_URL");
  const ntfyTopic = env("GOV_ANNOUNCE_NTFY_TOPIC");
  const newOnly = wantNewOnly();

  if (newOnly) {
    const seen = loadState(stateFile);
    const cold = seen.size === 0 && firstRunSeed;
    const fresh = results.filter((it) => it.id && !seen.has(it.id));

    if (cold) {
      for (const it of results) {
        if (it.id) seen.add(it.id);
      }
      saveState(stateFile, seen);
      const msg = `첫 실행(GOV_ANNOUNCE_FIRST_RUN_SEED_ONLY): ${results.length}건 ID 시드(알림 없음). 다음부터 신규만 알림.`;
      if (wantJson()) {
        console.log(
          JSON.stringify(
            {
              mode: "new-only-seed",
              asOf: format(asOf, "yyyy-MM-dd"),
              seeded: results.length,
              errors,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(msg);
      }
      return;
    }

    if (fresh.length === 0) {
      for (const it of results) {
        if (it.id) seen.add(it.id);
      }
      saveState(stateFile, seen);
      if (wantJson()) {
        console.log(
          JSON.stringify(
            {
              mode: "new-only",
              asOf: format(asOf, "yyyy-MM-dd"),
              newCount: 0,
              totalMatched: results.length,
              errors,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`신규 공고 없음 (매칭 전체 ${results.length}건은 상태에 반영).`);
      }
      return;
    }

    const lines = fresh.map(formatItemLine);
    const header = `[공고 모니터] 신규 ${fresh.length}건 (${format(asOf, "yyyy-MM-dd")})`;
    const fullText = `${header}\n\n${lines.join("\n\n")}`;

    if (webhook) {
      for (const chunk of chunkStrings([header, ...lines], 1900)) {
        await postDiscordOrSlack(webhook, chunk);
      }
    }
    if (ntfyTopic) {
      await postNtfy(ntfyTopic, header, fullText.slice(0, 3900));
    }

    for (const it of results) {
      if (it.id) seen.add(it.id);
    }
    saveState(stateFile, seen);

    if (wantJson()) {
      console.log(
        JSON.stringify(
          {
            mode: "new-only",
            asOf: format(asOf, "yyyy-MM-dd"),
            newCount: fresh.length,
            newItems: fresh,
            totalMatched: results.length,
            errors,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(header);
      console.log("");
      for (const line of lines) console.log(line + "\n");
      if (webhook || ntfyTopic) console.log("알림 전송 완료.");
      else console.log("(웹훅/ntfy 미설정 — 콘솔만 출력. GOV_ANNOUNCE_NOTIFY_WEBHOOK_URL 등 설정)");
    }
    return;
  }

  if (wantJson()) {
    console.log(
      JSON.stringify(
        {
          asOf: format(asOf, "yyyy-MM-dd"),
          count: results.length,
          items: results,
          errors,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`기준일: ${format(asOf, "yyyy-MM-dd")} (마감일 알 수 없는 공고는 본문에서 확인)`);
  if (errors.length) console.log(`수집 오류 ${errors.length}건 — JSON 모드에서 errors 확인.\n`);
  console.log(`매칭 ${results.length}건\n`);
  for (const r of results) {
    console.log(`[${r.source}] ${r.title}`);
    if (r.deadline) console.log(`  마감/접수: ${r.deadline}`);
    if (r.postedAt) console.log(`  게시일: ${r.postedAt}`);
    console.log(`  URL: ${r.url}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
