/**
 * 관공서 제출용 화면 캡처 — Playwright
 *
 * 사전: `pnpm dev` 로 서버가 떠 있어야 합니다 (기본 http://localhost:5111).
 *
 *   pnpm run capture:gov
 *
 * 환경 변수:
 *   CAPTURE_URL — 기본 http://localhost:5111/
 *   CAPTURE_OUT_DIR — PNG 저장 폴더 (기본 관공서-제출용/captures/)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultDir = path.join(repoRoot, "관공서-제출용", "captures");
const baseUrl = (process.env.CAPTURE_URL || "http://localhost:5111/").replace(/\/?$/, "/");
const outDir = path.resolve(process.env.CAPTURE_OUT_DIR || defaultDir);

fs.mkdirSync(outDir, { recursive: true });

function out(name) {
  return path.join(outDir, name);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});

async function shot(file, fullPage = true) {
  await page.screenshot({ path: out(file), type: "png", fullPage });
  console.log("Saved:", out(file));
}

try {
  await page.goto(baseUrl, { waitUntil: "load", timeout: 90_000 });
  await sleep(900);
  await shot("01-login.png");

  await page.getByRole("button", { name: "관제 시스템 접속" }).click();
  await page.getByRole("button", { name: "실시간 관제" }).waitFor({ state: "visible", timeout: 45_000 });
  await page.getByText("해양 종자 살포 관제", { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
  await sleep(2500);
  await shot("02-dashboard-map.png");

  await page.getByRole("button", { name: "살포 색상 안내" }).click();
  await sleep(700);
  await shot("03-color-legend.png");

  await page.getByRole("button", { name: "닫기" }).first().click();
  await sleep(500);

  await page.getByRole("button", { name: "작업 계획" }).click();
  await page.getByText("작업 일정", { exact: false }).first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(1200);
  await shot("04-work-plan.png");

  await page.getByRole("button", { name: "실시간 관제" }).click();
  await sleep(1200);

  await page.getByTitle("사용자 매뉴얼").click();
  await page.getByText("무엇을 하는 시스템인가요?", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  await sleep(600);
  await shot("05-manual-modal.png", false);

  await page.mouse.click(40, 450);
  await sleep(400);

  console.log("완료. 미리보기: 관공서-제출용/index.html");
} catch (e) {
  console.error(e?.message || e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
