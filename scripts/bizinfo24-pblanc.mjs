#!/usr/bin/env node
/**
 * 지원사업 공고 Open API
 * · 기업마당(Bizinfo) RSS: crtfcKey, 페이징 (pageIndex·pageUnit)
 * · 중소벤처24 공고연계 extPblancInfo: token(URL 인코딩), strDt·endDt(yyyyMMdd 선택) — 「공고정보 연계 API 가이드」
 *
 *   npm run bizinfo24:pblanc
 *   npm run bizinfo24:pblanc:json
 *
 * CLI: --json  ·  --no-filter  ·  --config PATH
 *
 * 환경변수: BIZINFO24_CRTFC_KEY (필수), BIZINFO24_API_URL, BIZINFO24_SMES_STR_DT, BIZINFO24_SMES_END_DT, BIZINFO24_CONFIG
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_BIZINFO_URL = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";
const DEFAULT_SMES_PBLANC_URL = "https://www.smes.go.kr/fnct/apiReqst/extPblancInfo";

function parseArgConfigPath() {
  const i = process.argv.indexOf("--config");
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.cwd(), process.argv[i + 1]);
  return null;
}

function loadConfig() {
  const p =
    parseArgConfigPath() ||
    process.env.BIZINFO24_CONFIG ||
    path.join(__dirname, "bizinfo24-pblanc.config.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function wantJson() {
  return process.argv.includes("--json");
}

function wantNoFilter() {
  return process.argv.includes("--no-filter");
}

function isSmesExtPblancUrl(apiUrl) {
  try {
    return new URL(apiUrl).pathname.includes("extPblancInfo");
  } catch {
    return false;
  }
}

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeywords(text, keywords, mode) {
  const t = String(text || "").toLowerCase();
  const kws = keywords.map((k) => k.toLowerCase());
  if (mode === "all") return kws.every((k) => t.includes(k));
  return kws.some((k) => t.includes(k));
}

function isTitleExcluded(title, substrings) {
  if (!substrings?.length) return false;
  const t = String(title || "").toLowerCase();
  return substrings.some((s) => t.includes(String(s).toLowerCase()));
}

function isSmesItem(it) {
  return it != null && (it.pblancSeq != null || it.pblancDtlUrl != null || (it.pblancNm && it.creatDt));
}

function itemTitle(it) {
  if (isSmesItem(it)) return String(it.pblancNm || it.detailBsnsNm || "").trim();
  return String(it.title || it.pblancNm || "").trim();
}

function itemSearchText(it) {
  if (isSmesItem(it)) {
    return [
      it.pblancNm,
      it.detailBsnsNm,
      it.policyCnts,
      it.sportCnts,
      it.sportTrget,
      it.sportInsttNm,
      it.bizType,
      it.induty,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    itemTitle(it),
    it.description,
    it.bsnsSumryCn,
    it.author,
    it.jrsdInsttNm,
    it.excInsttNm,
    it.trgetNm,
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeBizinfoItems(body) {
  if (body && typeof body.reqErr === "string" && body.reqErr.trim()) {
    throw new Error(body.reqErr.trim());
  }
  const ja = body?.jsonArray;
  let items = [];
  if (Array.isArray(ja)) items = ja;
  else if (ja && typeof ja === "object") {
    const raw = ja.item;
    if (raw == null) items = [];
    else if (Array.isArray(raw)) items = raw;
    else items = [raw];
  }
  return items;
}

function normalizeSmesData(body) {
  const cd = body?.resultCd != null ? String(body.resultCd) : "";
  if (cd !== "0") {
    const msg = body?.resultMsg || `resultCd=${cd}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  let d = body?.data;
  if (d === "" || d == null) return [];
  if (!Array.isArray(d)) return [d];
  return d;
}

function stableId(it) {
  if (isSmesItem(it) && it.pblancSeq != null && it.pblancSeq !== "") return String(it.pblancSeq);
  return String(it.seq ?? it.pblancId ?? it.link ?? it.pblancUrl ?? "").trim();
}

function toRecord(it) {
  if (isSmesItem(it)) {
    const title = String(it.pblancNm || it.detailBsnsNm || "").trim();
    const b = it.pblancBgnDt || "";
    const e = it.pblancEndDt || "";
    const period =
      b && e ? `${b} ~ ${e}` : stripHtml(String(it.reqstRcept || "").trim()).slice(0, 200);
    const rawSum = it.policyCnts || it.sportCnts || "";
    return {
      id: String(it.pblancSeq ?? stableId(it)),
      title: title || "(제목 없음)",
      link: String(it.pblancDtlUrl || it.reqstLinkInfo || "").trim(),
      pubDate: String(it.creatDt || "").trim(),
      jrsdInsttNm: String(it.sportInsttNm || "").trim(),
      reqstPeriod: period,
      summary: stripHtml(String(rawSum)).slice(0, 500),
    };
  }
  return {
    id: stableId(it),
    title: itemTitle(it) || "(제목 없음)",
    link: String(it.link || it.pblancUrl || "").trim(),
    pubDate: String(it.pubDate || it.creatPnttm || "").trim(),
    jrsdInsttNm: String(it.jrsdInsttNm || it.author || "").trim(),
    reqstPeriod: String(it.reqstDt || it.reqstBeginEndDe || "").trim(),
    summary: String(it.bsnsSumryCn || it.description || "").trim().slice(0, 500),
  };
}

async function fetchBizinfoPage(apiUrl, crtfcKey, pageIndex, pageUnit, hashtags, userAgent) {
  const u = new URL(apiUrl);
  const q = new URLSearchParams();
  q.set("crtfcKey", crtfcKey);
  q.set("dataType", "json");
  q.set("pageIndex", String(pageIndex));
  q.set("pageUnit", String(pageUnit));
  if (hashtags && String(hashtags).trim()) q.set("hashtags", String(hashtags).trim());
  u.search = q.toString();

  const res = await fetch(u.toString(), {
    headers: { "User-Agent": userAgent },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: 응답이 JSON이 아닙니다. BIZINFO24_API_URL·발급 문서를 확인하세요.`);
  }
  if (!res.ok) {
    const errMsg = body?.reqErr || text.slice(0, 200);
    throw new Error(`HTTP ${res.status}: ${errMsg}`);
  }
  return body;
}

async function fetchSmesExtPblanc(apiUrl, token, { strDt, endDt, html }, userAgent) {
  const u = new URL(apiUrl);
  const q = new URLSearchParams();
  q.set("token", token);
  if (strDt) q.set("strDt", strDt);
  if (endDt) q.set("endDt", endDt);
  if (html === "yes" || html === "no") q.set("html", html);
  u.search = q.toString();

  const res = await fetch(u.toString(), {
    headers: { "User-Agent": userAgent },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: 응답이 JSON이 아닙니다. 공고정보 연계 API 가이드·URL을 확인하세요.`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return body;
}

async function main() {
  const secret = process.env.BIZINFO24_CRTFC_KEY?.trim();
  if (!secret) {
    console.error(
      "BIZINFO24_CRTFC_KEY 가 설정되지 않았습니다. 프로젝트 루트 .env 에 키를 넣고 npm run bizinfo24:pblanc 를 실행하세요.",
    );
    process.exitCode = 1;
    return;
  }

  const rawUrl = (process.env.BIZINFO24_API_URL || "").trim();
  const apiUrl = rawUrl || DEFAULT_BIZINFO_URL;
  const config = loadConfig();
  const pageUnit = Math.min(100, Math.max(1, Number(config.pageUnit) || 20));
  const maxPages = Math.min(50, Math.max(1, Number(config.maxPages) || 3));
  const keywords = Array.isArray(config.keywords) ? config.keywords : [];
  const keywordMode = config.keywordMode || "any";
  const excludeTitle = config.excludeTitleSubstrings || [];
  const userAgent = config.userAgent || "Bizinfo24Pblanc/1.0";
  const hashtags = config.hashtags;

  const merged = [];
  const seen = new Set();

  if (isSmesExtPblancUrl(apiUrl)) {
    const envStr = process.env.BIZINFO24_SMES_STR_DT?.trim();
    const envEnd = process.env.BIZINFO24_SMES_END_DT?.trim();
    let strDt = envStr && /^\d{8}$/.test(envStr) ? envStr : null;
    let endDt = envEnd && /^\d{8}$/.test(envEnd) ? envEnd : null;
    if (!strDt || !endDt) {
      const days = Math.min(366, Math.max(1, Number(config.smesDateRangeDays) || 90));
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - days);
      strDt = strDt || formatYmd(start);
      endDt = endDt || formatYmd(end);
    }
    const htmlOpt = config.smesHtml === "yes" ? "yes" : "no";
    const body = await fetchSmesExtPblanc(apiUrl, secret, { strDt, endDt, html: htmlOpt }, userAgent);
    const pageItems = normalizeSmesData(body);
    for (const it of pageItems) {
      const id = stableId(it);
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      merged.push(it);
    }
  } else {
    const bizUrl = apiUrl || DEFAULT_BIZINFO_URL;
    for (let p = 1; p <= maxPages; p++) {
      const body = await fetchBizinfoPage(bizUrl, secret, p, pageUnit, hashtags, userAgent);
      const pageItems = normalizeBizinfoItems(body);
      if (pageItems.length === 0) break;
      for (const it of pageItems) {
        const id = stableId(it);
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        merged.push(it);
      }
      if (pageItems.length < pageUnit) break;
    }
  }

  let out = merged.map(toRecord);
  if (!wantNoFilter() && keywords.length) {
    out = out.filter((rec) => {
      const full = merged.find((m) => stableId(m) === rec.id);
      const text = itemSearchText(full);
      if (!matchesKeywords(text, keywords, keywordMode)) return false;
      if (isTitleExcluded(itemTitle(full), excludeTitle)) return false;
      return true;
    });
  }

  if (wantJson()) {
    console.log(JSON.stringify({ count: out.length, items: out }, null, 2));
    return;
  }

  if (out.length === 0) {
    console.log("매칭된 공고가 없습니다. (--no-filter 로 전체 페이지를 보거나 키워드를 조정하세요.)");
    return;
  }

  for (const rec of out) {
    console.log("—");
    console.log(rec.title);
    if (rec.link) console.log(rec.link);
    if (rec.pubDate) console.log(`게시: ${rec.pubDate}`);
    if (rec.jrsdInsttNm) console.log(`소관: ${rec.jrsdInsttNm}`);
    if (rec.reqstPeriod) console.log(`신청: ${rec.reqstPeriod}`);
  }
  console.log(`\n총 ${out.length}건`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
