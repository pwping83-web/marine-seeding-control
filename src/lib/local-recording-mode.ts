/**
 * 장비·현장 요구: 인터넷·로그인·외부 API 없이 로컬(브라우저 저장소·CSV 파일)만 사용.
 * 원격 DB를 다시 쓰려면 false 로 바꾸고 Supabase 환경 변수를 설정하세요.
 */
export const LOCAL_RECORDING_ONLY = true;

/**
 * true면 지도에 외부 타일(CARTO 등)을 요청하지 않음 — 배경만 보여 시연에 부적합.
 * 완전 오프라인 장비에서만 true 로 두세요.
 */
export const OFFLINE_MAP_NO_TILES = false;
