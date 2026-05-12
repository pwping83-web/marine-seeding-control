/** `use-mobile.ts` 와 동일 기준 — 함정용 간편 화면 자동 전환 */
const MOBILE_DECK_BREAKPOINT_PX = 768;

export function isMobileDeckPath(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname.replace(/\/$/, "") || "/";
  return p.endsWith("/mobile");
}

export function isMobileDeckNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_DECK_BREAKPOINT_PX;
}

/** 로그인 후 함정용 레이아웃: `/mobile` 이거나 좁은 뷰포트 */
export function shouldUseMobileDeckLayout(): boolean {
  return isMobileDeckPath() || isMobileDeckNarrowViewport();
}
