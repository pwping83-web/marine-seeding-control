#!/usr/bin/env node
/**
 * 나라장터 입찰공고 — 공공데이터포털 OpenAPI 조회 후 신규 공고만 알림.
 * (G2B 웹 크롤링 대신 조달청이 제공하는 표준 API 사용)
 *
 * 필요 환경변수:
 *   DATA_GO_KR_SERVICE_KEY — data.go.kr 일반 인증키(활용신청 후 발급)
 *   G2B_NOTIFY_WEBHOOK_URL — Discord/Slack 등 Incoming Webhook (JSON { "content" } 또는 { "text" })
 * 선택:
 *   G2B_KEYWORDS — 쉼표로 구분, 공고명에 하나라도 포함(대소문자 무시)될 때만 알림. 비우면 전체 신규
 *   G2B_INQRY_DAYS — 조회 시작일 = 오늘-N일 00:00 (기본 2)
 *   G2B_NUM_OF_ROWS — 페이지당 건수 (기본 100, 최대 999)
 *   G2B_STATE_FILE — 이미 알린 공고 ID 저장 경로 (기본 scripts/.g2b-bid-watch-state.json)
 *   G2B_NTFY_TOPIC — 설정 시 https://ntfy.sh/{토픽} 으로도 동일 본문 POST (웹훅 없이 스마트폰 알림용)
 *   G2B_FIRST_RUN_SEED_ONLY — 기본 1. 상태 파일이 비어 있으면 이번 조회분만 저장하고 알림은 보내지 않음(첫날 대량 알림 방지). 0 이면 첫 실행부터 알림
 *   G2B_BID_TYPES — 쉼표 구분: servc(용역), thng(물품), cnstwk(공사). 기본 servc,thng,cnstwk 전부
 *
 * 실행: pnpm run g2b:watch
 * Windows 3일마다 15시: scripts/Register-G2bWatchScheduledTask.ps1 등록 후 매일 15시 래퍼 실행(내부 3일 간격)
 * 기타: GitHub Actions cron 등에서 pnpm run g2b:watch 직접 호출 가능
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = "https://apis.data.go.kr/1230000/BidPublicInfoService";

/** 조달청 입찰공고정보서비스 매뉴얼: 입찰공고목록 정보에 대한 용역/물품/공사 조회 */
const OP_BY_KIND = {
  servc: "getBidPblancListInfoServc",
  thng: "getBidPblancListInfoThng",
  cnstwk: "getBidPblancListInfoCnstwk",
};

const LABEL_BY_KIND = {
  servc: "용역",
  thng: "물품",
  cnstwk: "공사",
};

function env(name, fallback = "") {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatInqryDt(d) {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}`
  );
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function normalizeItems(body) {
  const raw = body?.items;
  if (raw == null || raw === "") return [];
  const item = raw.item;
  if (item == null) return [];
  return Array.isArray(item) ? item : [item];
}

function bidId(row) {
  const no = row.bidNtceNo ?? row.bidntceNo ?? "";
  const ord = row.bidNtceOrd ?? row.bidntceOrd ?? "";
  return `${no}|${ord}`;
}

/** 상태 저장용: 용역/물품/공사 동일 공고번호가 겹칠 가능성에 대비해 종류 접두 */
function stateId(kind, row) {
  const core = bidId(row);
  if (!core || core === "|") return "";
  return `${kind}:${core}`;
}

function parseKeywords() {
  const s = env("G2B_KEYWORDS");
  if (!s) return [];
  return s
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => k.toLowerCase());
}

function parseBidKinds() {
  const s = env("G2B_BID_TYPES", "servc,thng,cnstwk");
  const parts = s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(Object.keys(OP_BY_KIND));
  const out = parts.filter((k) => allowed.has(k));
  return out.length ? out : ["servc", "thng", "cnstwk"];
}

function titleMatches(row, keywords) {
  if (keywords.length === 0) return true;
  const name = String(row.bidNtceNm ?? row.bidntceNm ?? "").toLowerCase();
  return keywords.some((k) => name.includes(k));
}

function loadState(file) {
  try {
    const t = fs.readFileSync(file, "utf8");
    const j = JSON.parse(t);
    if (j && typeof j === "object" && j.seenIds && Array.isArray(j.seenIds)) {
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
  const payload = {
    updatedAt: new Date().toISOString(),
    seenIds: [...seen].slice(-12000),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 0), "utf8");
}

async function fetchBidPage({ operation, serviceKey, bgn, end, pageNo, numOfRows }) {
  const u = new URL(`${BASE}/${operation}`);
  u.searchParams.set("serviceKey", serviceKey);
  u.searchParams.set("type", "json");
  u.searchParams.set("inqryDiv", "1");
  u.searchParams.set("inqryBgnDt", bgn);
  u.searchParams.set("inqryEndDt", end);
  u.searchParams.set("pageNo", String(pageNo));
  u.searchParams.set("numOfRows", String(numOfRows));
  const res = await fetch(u.toString(), { method: "GET" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`API 응답이 JSON이 아닙니다 (HTTP ${res.status}). 본문 앞 200자: ${text.slice(0, 200)}`);
  }
  const header = json?.response?.header;
  const code = header?.resultCode ?? header?.resultcode;
  const msg = header?.resultMsg ?? header?.resultmsg ?? "";
  if (code && code !== "00") {
    throw new Error(`OpenAPI 오류 resultCode=${code} resultMsg=${msg}`);
  }
  return json;
}

async function fetchAllForOperation({ operation, serviceKey, bgn, end, numOfRows }) {
  const rows = [];
  let pageNo = 1;
  const maxPages = 50;
  for (;;) {
    const json = await fetchBidPage({ operation, serviceKey, bgn, end, pageNo, numOfRows });
    const body = json?.response?.body;
    const batch = normalizeItems(body);
    rows.push(...batch);
    const total = Number(body?.totalCount ?? 0);
    if (!Number.isFinite(total) || total <= 0) break;
    if (rows.length >= total) break;
    if (batch.length === 0) break;
    pageNo += 1;
    if (pageNo > maxPages) break;
  }
  return rows;
}

function formatLine(row, kindLabel) {
  const nm = row.bidNtceNm ?? row.bidntceNm ?? "(제목없음)";
  const inst = row.ntceInsttNm ?? row.dminsttNm ?? "";
  const close = row.bidClseDt ?? row.clseDt ?? "";
  const no = row.bidNtceNo ?? "";
  const ord = row.bidNtceOrd ?? "";
  const parts = [`· [${kindLabel}] ${nm}`];
  if (inst) parts.push(`  기관: ${inst}`);
  if (close) parts.push(`  마감: ${close}`);
  if (no) parts.push(`  공고번호: ${no}-${ord}`);
  parts.push("  나라장터: https://www.g2b.go.kr (공고명·번호로 검색)");
  return parts.join("\n");
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

async function main() {
  const serviceKey = env("DATA_GO_KR_SERVICE_KEY");
  const webhook = env("G2B_NOTIFY_WEBHOOK_URL");
  const ntfyTopic = env("G2B_NTFY_TOPIC");

  if (!serviceKey) {
    console.error("DATA_GO_KR_SERVICE_KEY 가 없습니다. 공공데이터포털에서 '나라장터 입찰공고' API 키를 발급한 뒤 .env 에 넣으세요.");
    process.exit(1);
  }
  if (!webhook && !ntfyTopic) {
    console.error("G2B_NOTIFY_WEBHOOK_URL 또는 G2B_NTFY_TOPIC 중 하나는 필요합니다.");
    process.exit(1);
  }

  const days = Math.max(1, Math.min(14, Number(env("G2B_INQRY_DAYS", "2")) || 2));
  const numOfRows = Math.max(10, Math.min(999, Number(env("G2B_NUM_OF_ROWS", "100")) || 100));
  const stateFile = env("G2B_STATE_FILE", path.join(__dirname, ".g2b-bid-watch-state.json"));
  const keywords = parseKeywords();
  const firstRunSeedOnly = env("G2B_FIRST_RUN_SEED_ONLY", "1") !== "0";
  const kinds = parseBidKinds();

  const end = new Date();
  const begin = startOfDay(end);
  begin.setDate(begin.getDate() - days);
  const bgn = formatInqryDt(begin);
  const endDt = formatInqryDt(end);

  const kindLabels = kinds.map((k) => `${LABEL_BY_KIND[k]}(${OP_BY_KIND[k]})`).join(", ");
  console.log(`조회 기간: ${bgn} ~ ${endDt}`);
  console.log(`조회 유형: ${kindLabels}`);
  if (keywords.length) console.log(`키워드 필터: ${keywords.join(", ")}`);
  else console.log("키워드 필터: 없음 (신규 공고 전체)");

  /** @type {{ row: Record<string, unknown>, kind: string }[]} */
  const rows = [];
  for (const kind of kinds) {
    const operation = OP_BY_KIND[kind];
    try {
      const batch = await fetchAllForOperation({
        operation,
        serviceKey,
        bgn,
        end: endDt,
        numOfRows,
      });
      for (const row of batch) rows.push({ row, kind });
      console.log(`[${LABEL_BY_KIND[kind]}] ${batch.length}건 수집`);
    } catch (e) {
      console.error(`[${LABEL_BY_KIND[kind]}] 조회 실패: ${e?.message || e}`);
    }
  }

  const seen = loadState(stateFile);
  const isColdStart = seen.size === 0 && firstRunSeedOnly;
  const fresh = [];

  for (const { row, kind } of rows) {
    const id = stateId(kind, row);
    if (!id) continue;
    if (seen.has(id)) continue;
    if (!titleMatches(row, keywords)) {
      seen.add(id);
      continue;
    }
    fresh.push({ id, row, kind });
  }

  if (fresh.length === 0) {
    console.log("알림할 신규 공고가 없습니다.");
    for (const { row, kind } of rows) {
      const id = stateId(kind, row);
      if (id) seen.add(id);
    }
    saveState(stateFile, seen);
    return;
  }

  if (isColdStart) {
    console.log(
      `첫 실행(G2B_FIRST_RUN_SEED_ONLY=1): ${fresh.length}건을 알림 없이 상태에만 기록합니다. 다음 실행부터 신규만 알림됩니다.`,
    );
    for (const { row, kind } of rows) {
      const id = stateId(kind, row);
      if (id) seen.add(id);
    }
    saveState(stateFile, seen);
    return;
  }

  const lines = fresh.map(({ row, kind }) => formatLine(row, LABEL_BY_KIND[kind]));
  const typeSummary = [...new Set(fresh.map((f) => LABEL_BY_KIND[f.kind]))].join("·");
  const header = `[나라장터] 신규 ${fresh.length}건 (${typeSummary})`;
  const fullText = `${header}\n\n${lines.join("\n\n")}`;

  if (webhook) {
    for (const chunk of chunkStrings([header, ...lines], 1900)) {
      await postDiscordOrSlack(webhook, chunk);
    }
  }
  if (ntfyTopic) {
    await postNtfy(ntfyTopic, header, fullText.slice(0, 3900));
  }

  for (const { id } of fresh) seen.add(id);
  for (const { row, kind } of rows) {
    const id = stateId(kind, row);
    if (id) seen.add(id);
  }
  saveState(stateFile, seen);

  console.log(`알림 전송 완료: ${fresh.length}건`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
