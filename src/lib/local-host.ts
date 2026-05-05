/** 브라우저가 로컬 머신에서 열렸는지 (개발 시 로그인 비밀번호 검증 생략에 사용) */
export function isLocalBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}
