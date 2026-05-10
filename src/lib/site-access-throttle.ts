/** 동일 브라우저 세션에서 접속 로그 연타 완화(서버 측 IP 분당 상한과 병행) */
const KEY = "marine_site_access_log_ts";
const MIN_INTERVAL_MS = 45_000;

export function reserveSiteAccessLogSlot(): boolean {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(KEY) || "0");
    if (now - last < MIN_INTERVAL_MS) return false;
    sessionStorage.setItem(KEY, String(now));
    return true;
  } catch {
    return true;
  }
}
