import { chromium } from "playwright";

const url = process.env.CAPTURE_URL || "http://127.0.0.1:5199/";
const out = process.env.CAPTURE_OUT || "submission-dashboard.png";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: "관제 시스템 접속" }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "살포 색상 안내" }).click();
  await page.locator("#seed-color-legend-panel").waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: out,
    type: "png",
    fullPage: false,
  });
  console.log("Saved:", out);
} finally {
  await browser.close();
}
