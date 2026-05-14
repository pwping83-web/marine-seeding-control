import type { LatLngBoundsExpression } from "leaflet";

/** CARTO Dark Matter (XYZ) */
export const TILE_CARTO_DARK =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

/** CARTO Voyager (XYZ) */
export const TILE_CARTO_VOYAGER =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

export const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export type MarineBasemap = "dark" | "voyager";

export type MarineLeafletDrop = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  fill: string;
  stroke: string;
  pulse: string;
  highlight: boolean;
};

/** `ship`: 시뮬 선박(주황 선체). `gpsDot`: 실시간 내 위치(GPS) — 빨간 선체·물결 링(모바일과 동일). */
export type VesselMarkerVariant = "ship" | "gpsDot";

export type MarineLeafletMapProps = {
  className?: string;
  basemap: MarineBasemap;
  /** 기본 중심 (타일만 보일 때) */
  center: [number, number];
  /** fit 이후 `map.zoomIn(1)` 호출 횟수(대시보드 ±·휠). Leaflet 기본 확대와 동일 */
  mapZoomInNonce?: number;
  /** fit 이후 `map.zoomOut(1)` 호출 횟수 */
  mapZoomOutNonce?: number;
  /** fit 직후 한 번만: `getZoom()`에 더하는 단계(0–4). 일정 보기 지도 등 */
  postFitZoomLevels?: number;
  /** 현재 Leaflet 줌(배지·표시용) */
  onMapZoomLevel?: (zoom: number) => void;
  /** 증가할 때마다 경로·살포·선박에 맞춰 fitBounds */
  fitNonce: number;
  drops: MarineLeafletDrop[];
  vessel: { lat: number; lng: number; heading: number };
  pathLatLng: [number, number][];
  /** 실제 GPS: 빨간 배 실루엣 + 물결 링(모바일 함정과 동일 스타일) */
  vesselMarkerVariant?: VesselMarkerVariant;
  /** 살포 시작 후 — 선박 마커를 살포 시작 버튼과 같은 녹색 톤으로 */
  vesselSeedingActive?: boolean;
  /** 위치 갱신 시 지도 중심을 선박에 맞춰 패닝(마커가 화면 밖으로 나가지 않게) */
  panMapToVesselOnMove?: boolean;
  /** true면 fitBounds에 살포 점은 넣지 않고 선박·시뮬 항적·LTE·재생 궤적만 사용(테스트/실GNSS 중심 맞춤) */
  fitToVesselOnly?: boolean;
  /** GPS 대기 등 — 선박/위치 마커 비표시 */
  hideVesselMarker?: boolean;
  /** 관제 대시보드: 휠로 줌 레일 조절 시 Leaflet 기본 휠 줌과 충돌 방지 */
  disableScrollWheelZoom?: boolean;
  maxBounds?: LatLngBoundsExpression | null;
  /** true면 XYZ 타일(인터넷) 요청 없음 — 장비 오프라인 기록 모드 */
  offlineNoTiles?: boolean;
  /** 해상 기기(LTE)로 수집한 선박 궤적 — 시뮬 항적과 구분해 주황색으로 표시 */
  ltePathLatLng?: [number, number][];
  /** 금일 항적 기록 재생(시뮬) — 보라색 실선, 끄면 비표시 */
  replayTrackPathLatLng?: [number, number][];
  /** 항적 꼭짓점을 지도에 마커로 표시(운항 시인용) */
  replayTrackShowVertexMarkers?: boolean;
  /** 강조할 꼭짓점 인덱스(0-based), null이면 동일 크기 */
  replayTrackHighlightVertexIndex?: number | null;
  /** 항해 안내: 선수(또는 GNSS)에서 다음 지점까지 직선 */
  replayNavGuideLine?: { from: [number, number]; to: [number, number] } | null;
  /** 작업 계획 등 — 살포 점과 별도의 계획 후보 마커(예: 제1구역 격자) */
  planMarkers?: ReadonlyArray<{ lat: number; lng: number; label: string }>;
  /** true면 맞춤 줌에 살포·항적·LTE 궤적을 넣지 않고 선박+planMarkers만 사용 */
  scheduleFocusFit?: boolean;
  /** 지도 클릭으로 항로 꼭짓점 추가 + 마커 드래그·팝업에서 좌표 수정 */
  replayTrackVertexEditor?: null | {
    vertices: [number, number][];
    onMapClick: (lat: number, lng: number) => void;
    onVertexDragEnd: (index: number, lat: number, lng: number) => void;
    onVertexRemove: (index: number) => void;
    onVertexCoordsApply: (index: number, lat: number, lng: number) => void;
  };
  /** 살포 예정(계획)만 지도 클릭으로 추가 */
  seedPlanMapEditor?: null | { onMapClick: (lat: number, lng: number) => void };
  /** 실시간 공유 선박 위치 (Supabase vessel_positions) — 주황 원 마커로 표시 */
  remoteVessels?: { id: string; lat: number; lng: number; heading: number; label?: string }[];
  /** 경로를 따라 미리 찍은 살포 예정점 */
  plannedSeedMarkers?: [number, number][];
};
