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
  /** 공동·금융 인증서/GPKI OIDC 등 외부 게이트웨이 시작 URL(미설정 시 로그인 화면에서 안내만) */
  readonly VITE_GOVT_CERT_LOGIN_GATEWAY_URL?: string;
  /** LTE 궤적 조회 시 선박 ID(DB vessel_id). 미설정 시 기본 함명 사용 */
  readonly VITE_VESSEL_LTE_ID?: string;
  /** 선박 궤적 폴링 주기(ms). 미설정 시 12000 */
  readonly VITE_VESSEL_LTE_POLL_MS?: string;
  /** DB 살포 마커 폴링(아두이노·Edge 수신 반영). 미설정 시 12000 */
  readonly VITE_SEED_DROP_POLL_MS?: string;
  /**
   * 기상청 공공데이터포털 단기예보 API 인증키 (URL인코딩 값).
   * 없으면 WeatherAIPanel이 목업 데이터로 동작(시연 모드).
   * 발급: https://www.data.go.kr/data/15084084/openapi.do
   */
  readonly VITE_KMA_SERVICE_KEY?: string;
  /** 기상청 격자 X 좌표. 기본 58(남해안 권역). */
  readonly VITE_KMA_NX?: string;
  /** 기상청 격자 Y 좌표. 기본 74(남해안 권역). */
  readonly VITE_KMA_NY?: string;
  /**
   * 중기육상예보 지점코드. 기본 11H20000(남해안).
   * 발급: https://www.data.go.kr/data/15059468/openapi.do (중기예보)
   */
  readonly VITE_KMA_MIDLAND_REGION?: string;
  /** 중기기온예보 지점코드. 기본 11H20000. */
  readonly VITE_KMA_MIDTA_REGION?: string;
  /** 중기해상예보 지점코드. 기본 12B20000(남해중부). */
  readonly VITE_KMA_MIDSEA_REGION?: string;
  /** 중기예보 폴링 주기(ms). 기본 21600000(6h), 2~12h로 클램프 */
  readonly VITE_KMA_MID_POLL_MS?: string;
  /** 단기예보 API 폴링(ms). 기본 480000(8분), 3~30분으로 클램프 */
  readonly VITE_KMA_FORECAST_POLL_MS?: string;
  /** 긴급·주의 재평가(ms). 기본 45000(45초), 15~120초로 클램프 */
  readonly VITE_KMA_REALTIME_CHECK_MS?: string;
  /**
   * Groq AI API 키 (LLM 기반 기상 분석·자연어 리포트 생성).
   * console.groq.com 에서 발급.
   */
  readonly VITE_GROQ_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
