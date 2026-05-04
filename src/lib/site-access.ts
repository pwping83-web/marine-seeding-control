/** 배포·시연용 웹 접속 계정 (클라이언트 검증·기본 입력값) */
export const SITE_ACCESS_EMAIL = "marine@gmail.com";
export const SITE_ACCESS_PASSWORD = "1322aa";

export function isSiteAccessCredentials(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === SITE_ACCESS_EMAIL.toLowerCase() &&
    password === SITE_ACCESS_PASSWORD
  );
}
