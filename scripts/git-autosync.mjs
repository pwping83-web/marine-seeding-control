/**
 * 저장 후 Run on Save 등에서 호출: stage → (디바운스 후) commit → push
 * - 직전 성공 푸시 후 MIN_GAP_MS 안에는 add만 하고 커밋/푸시는 건너뜀(연속 저장 시 커밋 폭주 완화)
 * - 동시 실행 방지용 락 파일 사용
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const MIN_GAP_MS = 45_000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = join(root, ".git");
const lastPath = join(gitDir, "autosync.last");
const lockPath = join(gitDir, "autosync.lock");

process.chdir(root);

if (!existsSync(gitDir)) {
  process.stderr.write("[git-autosync] not a git repository\n");
  process.exit(0);
}

let lockFd;
try {
  lockFd = openSync(lockPath, "wx");
} catch {
  process.exit(0);
}

function releaseLock() {
  try {
    closeSync(lockFd);
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

function lastSuccessMs() {
  try {
    const t = Number(readFileSync(lastPath, "utf8").trim());
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function markSuccess() {
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(lastPath, String(Date.now()), "utf8");
}

try {
  execSync("git add -A", { stdio: "pipe" });

  let hasStaged = true;
  try {
    execSync("git diff --cached --quiet", { stdio: "pipe" });
    hasStaged = false;
  } catch {
    hasStaged = true;
  }

  if (!hasStaged) {
    releaseLock();
    process.exit(0);
  }

  const now = Date.now();
  if (now - lastSuccessMs() < MIN_GAP_MS) {
    releaseLock();
    process.exit(0);
  }

  execSync('git commit -m "chore: auto save"', { stdio: "inherit" });
  execSync("git push", { stdio: "inherit" });
  markSuccess();
} catch {
  process.exitCode = 1;
} finally {
  releaseLock();
}
