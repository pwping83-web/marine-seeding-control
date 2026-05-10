/**
 * 공동·금융 인증서(구 공인인증서 계열) 로그인은 브라우저 단독으로 완결되지 않고,
 * 정부24·행안부 표준 전자서명 모듈, GPKI 연계 게이트웨이, 또는 IdP OIDC/SAML과
 * Supabase(Auth Hooks / Custom JWT / Enterprise SAML) 연동이 필요합니다.
 *
 * 여기서는 운영 시 `VITE_GOVT_CERT_LOGIN_GATEWAY_URL`에 게이트웨이(또는 OIDC 시작 URL)를
 * 넣으면 해당 주소로 리다이렉트합니다. 미설정 시 안내만 표시합니다.
 */
export function isGovCertGatewayConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOVT_CERT_LOGIN_GATEWAY_URL?.trim());
}

export function getGovCertGatewayUrl(returnPath?: string): string | null {
  const base = import.meta.env.VITE_GOVT_CERT_LOGIN_GATEWAY_URL?.trim();
  if (!base) return null;
  try {
    const u = new URL(base);
    if (returnPath) u.searchParams.set("return", returnPath);
    return u.toString();
  } catch {
    return null;
  }
}

export function redirectToGovCertGateway(returnPath?: string): void {
  const url = getGovCertGatewayUrl(returnPath);
  if (!url) return;
  window.location.assign(url);
}
