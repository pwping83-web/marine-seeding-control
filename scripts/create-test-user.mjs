/**
 * Supabase Auth 에 테스트 사용자 생성(또는 비밀번호 재설정).
 * .env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 필요 (VITE_ 아님)
 *
 * npm run auth:create-test-user
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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

const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  console.error("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}

const email = process.env.TEST_AUTH_EMAIL?.trim() || "marine@gmail.com";
const password = process.env.TEST_AUTH_PASSWORD?.trim() || "1322aa";

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!createErr && created.user) {
    console.log("생성 완료:", created.user.email, created.user.id);
    return;
  }

  const msg = createErr?.message || "";
  if (/already|registered|exists|duplicate/i.test(msg)) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (listErr) {
      console.error(listErr.message);
      process.exit(1);
    }
    const u = list.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (!u) {
      console.error("이미 존재한다고 나오나 사용자 목록에서 찾지 못했습니다:", msg);
      process.exit(1);
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(u.id, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error("비밀번호 갱신 실패:", updErr.message);
      process.exit(1);
    }
    console.log("이미 있던 계정의 비밀번호를 갱신했습니다:", email);
    return;
  }

  console.error("실패:", createErr?.message || createErr);
  if (/password|length|weak|6/i.test(msg)) {
    console.error(`
비밀번호 정책: Supabase 기본이 최소 6자인 경우가 많습니다.
  대시보드 → Authentication → Providers → Email → 최소 비밀번호 길이 확인
  또는 TEST_AUTH_PASSWORD=123456 처럼 6자 이상으로:
  TEST_AUTH_PASSWORD=123456 npm run auth:create-test-user
`);
  }
  process.exit(1);
}

await main();
