/**
 * release / ship: 문서 백업 2종 → git 저장(commit) → 원격 푸시(Vercel 자동 배포)
 * 동의 프롬프트 없음. 메시지: npm run release -- "커밋 메시지"
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
process.chdir(root);

const MANUAL = path.join("docs", "사용자매뉴얼_v1.5.md");
const OVERVIEW = path.join("docs", "해양-종자-살포-관제-시스템-개요.md");

for (const p of [MANUAL, OVERVIEW]) {
  if (!fs.existsSync(p)) {
    console.error("필수 파일 없음:", p);
    process.exit(1);
  }
}

const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const snapDir = path.join("backups", "snapshots", stamp);
const lastDir = path.join("backups", "last-release");
fs.mkdirSync(snapDir, { recursive: true });
fs.mkdirSync(lastDir, { recursive: true });

const manualBase = path.basename(MANUAL);
const overviewBase = path.basename(OVERVIEW);
for (const dir of [snapDir, lastDir]) {
  fs.copyFileSync(MANUAL, path.join(dir, manualBase));
  fs.copyFileSync(OVERVIEW, path.join(dir, overviewBase));
}
console.log("백업(문서 2종 × 위치 2곳):", snapDir, "+", lastDir);

function run(cmd) {
  execSync(cmd, { stdio: "inherit", shell: true, cwd: root, env: process.env });
}

run("git add -A");
const status = execSync("git status --porcelain", { encoding: "utf8", cwd: root });
if (!status.trim()) {
  console.log("커밋할 변경 없음. 종료.");
  process.exit(0);
}

const msg =
  process.argv.slice(2).join(" ").trim() ||
  `chore(release): v1.5 snapshot ${stamp}`;
run(`git commit -m ${JSON.stringify(msg)}`);
run("git push");
console.log("완료: 백업 → 커밋 → 푸시(배포 트리거)");
