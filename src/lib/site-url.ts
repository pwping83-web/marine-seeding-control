/** 공식 프로덕션(메인) 배포 주소 — 카카오·문서·리다이렉트와 동일하게 유지 */
const envUrl = import.meta.env.VITE_SITE_URL?.replace(/\/$/, "").trim();
export const SITE_PRODUCTION_ORIGIN =
  envUrl && envUrl.length > 0
    ? envUrl
    : "https://marine-seeding-control-git-main-pwping83-webs-projects.vercel.app";

/** 사용 중지(미리보기) 배포 호스트 — Vercel에서 해당 Deployment 삭제 권장 */
export const SITE_DEPRECATED_PREVIEW_HOST =
  "marine-seeding-control-brcqjevvx-pwping83-webs-projects.vercel.app";
