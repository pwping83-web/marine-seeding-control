/** 클라이언트 측 로그인 실패 누적 완화(서버 MFA·계정 잠금과 병행) */
const FAIL_KEY = "marine_login_fail_n";
const LOCK_KEY = "marine_login_lock_until";
const MAX_FAILS = 5;
const LOCK_MS = 120_000;

export function isLoginLocked(): { locked: boolean; msLeft: number } {
  try {
    const until = Number(sessionStorage.getItem(LOCK_KEY) || "0");
    const now = Date.now();
    if (until > now) return { locked: true, msLeft: until - now };
    return { locked: false, msLeft: 0 };
  } catch {
    return { locked: false, msLeft: 0 };
  }
}

export function recordLoginFailure(): { locked: boolean; msLeft: number } {
  try {
    const n = Number(sessionStorage.getItem(FAIL_KEY) || "0") + 1;
    sessionStorage.setItem(FAIL_KEY, String(n));
    if (n >= MAX_FAILS) {
      const until = Date.now() + LOCK_MS;
      sessionStorage.setItem(LOCK_KEY, String(until));
      sessionStorage.setItem(FAIL_KEY, "0");
      return { locked: true, msLeft: LOCK_MS };
    }
    return { locked: false, msLeft: 0 };
  } catch {
    return { locked: false, msLeft: 0 };
  }
}

export function resetLoginGuard(): void {
  try {
    sessionStorage.removeItem(FAIL_KEY);
    sessionStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
}
