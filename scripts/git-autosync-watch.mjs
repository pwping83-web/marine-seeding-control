/**
 * 파일 변경을 감지해 디바운스 후 `git-autosync.mjs` 실행 (add → 조건부 commit/push).
 * 터미널에서: npm run git:autosync:watch
 */
import { watch } from "node:fs";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEBOUNCE_MS = 15_000;
const IGNORE = /[/\\](\.git|node_modules|dist|\.vite)([/\\]|$)/i;

let timer = null;
let pending = false;

function runAutosync() {
  pending = false;
  const child = spawn(process.execPath, [join(root, "scripts", "git-autosync.mjs")], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  child.on("error", (e) => console.error("[git-autosync-watch]", e.message));
}

function schedule() {
  pending = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (pending) runAutosync();
  }, DEBOUNCE_MS);
}

if (!existsSync(join(root, ".git"))) {
  console.error("[git-autosync-watch] .git 없음 — 종료");
  process.exit(1);
}

console.log("[git-autosync-watch] listening");
console.log("[git-autosync-watch] ready");
console.log(`[git-autosync-watch] ${DEBOUNCE_MS / 1000}s 디바운스 후 동기화 (git-autosync.mjs 규칙 적용)`);

try {
  watch(root, { recursive: true }, (_event, filename) => {
    if (!filename || IGNORE.test(join(root, filename))) return;
    schedule();
  });
} catch (e) {
  console.error("[git-autosync-watch] watch 실패:", e.message);
  process.exit(1);
}
