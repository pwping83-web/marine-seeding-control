/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 공식 배포 URL(선택). 미설정 시 site-url.ts 기본값 사용 */
  readonly VITE_SITE_URL?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_KAKAO_JAVASCRIPT_KEY?: string;
  /** EmailJS — 로그인 성공 시 접속 알림. 템플릿에 service_name, access_location, access_time */
  readonly VITE_EMAILJS_PUBLIC_KEY?: string;
  readonly VITE_EMAILJS_SERVICE_ID?: string;
  readonly VITE_EMAILJS_TEMPLATE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
