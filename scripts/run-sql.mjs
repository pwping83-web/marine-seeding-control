/**
 * Supabase Postgres에 SQL 실행 (대시보드 SQL Editor와 동일 DB).
 *
 * .env:
 *   DATABASE_URL_POOLER — 권장 (대시보드 Database → Session pooler URI)
 *   DATABASE_URL        — 없으면 이것만 사용
 *
 * npm run sql:run -- "SELECT now();"
 * npm run sql:run -- ./scripts/sql/example.sql
 */
import dns from "node:dns";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stdin } from "node:process";
import pg from "pg";

dns.setDefaultResultOrder("ipv4first");

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) process.env[key] = val;
  }
}

loadDotEnv(join(rootDir, ".env"));

const databaseUrl =
  process.env.DATABASE_URL_POOLER?.trim() || process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error(
    "DATABASE_URL 또는 DATABASE_URL_POOLER 가 .env 에 없습니다.\n" +
      "Supabase → Settings → Database → Connection string 에서 Session pooler URI 복사.",
  );
  process.exit(1);
}

function readStdin() {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    if (stdin.isTTY) {
      resolvePromise("");
      return;
    }
    stdin.on("data", (c) => chunks.push(c));
    stdin.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    stdin.on("error", reject);
  });
}

function printHelp() {
  console.log(`사용법 (프로젝트 루트에서, 한 줄씩 실행):
  npm run sql:run -- "SELECT 1;"
  npm run sql:run -- ./scripts/sql/example.sql
  Get-Content .\\scripts\\sql\\example.sql | npm run sql:run

연결 실패 시: .env 에 대시보드의 Session pooler URI 를 DATABASE_URL_POOLER 로 추가.
https://supabase.com/docs/guides/database/connecting-to-postgres
`);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  printHelp();
  process.exit(args.length === 0 ? 1 : 0);
}

let sql = "";
if (args[0] === "--") {
  sql = args.slice(1).join(" ").trim();
} else if (args.length === 1 && args[0].toLowerCase().endsWith(".sql")) {
  const fp = resolve(process.cwd(), args[0]);
  if (!existsSync(fp)) {
    console.error("파일 없음:", fp);
    process.exit(1);
  }
  sql = readFileSync(fp, "utf8");
} else {
  sql = args.join(" ").trim();
}

if (!sql) {
  const fromPipe = await readStdin();
  sql = fromPipe.trim();
}

if (!sql) {
  console.error("실행할 SQL 이 없습니다.");
  printHelp();
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
} catch (err) {
  const code = err?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    console.error("DNS/연결 실패:", err.message);
    console.error(`
대시보드에서 Session pooler 연결 문자열을 쓰세요:
  https://supabase.com/dashboard/project/zdmsprrpmpshkmiboxts/settings/database
  → Connection string → Session pooler → URI 복사
  → .env 에 한 줄 추가:
  DATABASE_URL_POOLER=여기에_붙여넣기

(Direct 의 db.*.supabase.co 는 IPv6 전용이거나 이 PC에서 이름이 안 풀릴 수 있습니다.)
`);
    process.exit(1);
  }
  console.error(err.message || err);
  process.exit(1);
}

try {
  const result = await client.query(sql);
  if (result.rows?.length > 0) {
    console.table(result.rows);
  }
  if (result.command && result.command !== "SELECT") {
    console.log(result.command, result.rowCount != null ? `(행 ${result.rowCount})` : "");
  }
  if (result.command === "SELECT" && result.rows?.length === 0) {
    console.log("SELECT 결과 행 없음");
  }
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
