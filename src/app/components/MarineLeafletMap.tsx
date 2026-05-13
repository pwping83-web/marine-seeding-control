import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import * as L from "leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import {
  OPS_AREA_MAX_BOUNDS,
  filterPointsNearKorea,
  opsCenterTuple,
} from "../geo/koreaOpsArea";

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

type Props = {
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

function tileUrl(basemap: MarineBasemap): string {
  return basemap === "dark" ? TILE_CARTO_DARK : TILE_CARTO_VOYAGER;
}

const MAP_PLACEHOLDER_ZOOM = 16;

/** fitNonce가 바뀔 때만 맞춤(흰색 ± 시절과 같이, 이후 확대·축소는 Leaflet zoomIn/Out) */
function MapFitBounds({
  fitNonce,
  points,
  postFitZoomLevels,
}: {
  fitNonce: number;
  points: L.LatLngExpression[];
  postFitZoomLevels: number;
}) {
  const map = useMap();
  const lastFitNonceRef = useRef<number>(-999);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    if (lastFitNonceRef.current === fitNonce) return;
    lastFitNonceRef.current = fitNonce;
    /** React 렌더·커밋 사이클이 끝난 뒤 Leaflet 조작 — 동기 실행 시 Leaflet 이벤트가
     *  React 렌더와 충돌해 에러 화면이 나는 것을 방지 */
    const raf = requestAnimationFrame(() => {
      map.invalidateSize();
      let pts = pointsRef.current;
      if (pts.length === 0) pts = [opsCenterTuple() as L.LatLngExpression];
      const b = L.latLngBounds(pts);
      if (b.isValid()) {
        if (pts.length === 1) {
          const p = pts[0];
          const lat = Array.isArray(p) ? p[0] : p.lat;
          const lng = Array.isArray(p) ? p[1] : p.lng;
          map.setView([lat, lng], 15, { animate: false });
        } else {
          map.fitBounds(b, {
            padding: [2, 2],
            maxZoom: 18,
            animate: false,
          });
        }
      }
      const extra = Math.max(0, Math.min(4, postFitZoomLevels));
      if (extra > 0) {
        map.setZoom(Math.min(18, map.getZoom() + extra), { animate: false });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [fitNonce, map, postFitZoomLevels]);
  return null;
}

/** Leaflet 기본 줌 컨트롤과 동일: 한 번에 1레벨 확대·축소 */
function MapZoomByNonce({
  zoomInNonce,
  zoomOutNonce,
}: {
  zoomInNonce: number;
  zoomOutNonce: number;
}) {
  const map = useMap();
  const lastInRef = useRef(0);
  const lastOutRef = useRef(0);

  useEffect(() => {
    const d = zoomInNonce - lastInRef.current;
    if (d > 0) {
      for (let i = 0; i < d; i++) map.zoomIn(1, { animate: false });
    }
    lastInRef.current = zoomInNonce;
  }, [zoomInNonce, map]);

  useEffect(() => {
    const d = zoomOutNonce - lastOutRef.current;
    if (d > 0) {
      for (let i = 0; i < d; i++) map.zoomOut(1, { animate: false });
    }
    lastOutRef.current = zoomOutNonce;
  }, [zoomOutNonce, map]);

  return null;
}

function MapZoomLevelReporter({ onLevel }: { onLevel: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const report = () => onLevel(map.getZoom());
    map.on("zoom zoomend", report);
    report();
    return () => {
      map.off("zoom zoomend", report);
    };
  }, [map, onLevel]);
  return null;
}

/** flex 레이아웃에서 지도 컨테이너 0×0으로 잡히는 경우 타일이 안 보이는 문제 완화 */
function MapLayoutFix() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const parent = el.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(parent);
    map.invalidateSize();
    const t1 = window.setTimeout(() => map.invalidateSize(), 50);
    const t2 = window.setTimeout(() => map.invalidateSize(), 300);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [map]);
  return null;
}

function DisableScrollWheelZoom() {
  const map = useMap();
  useEffect(() => {
    map.scrollWheelZoom.disable();
  }, [map]);
  return null;
}

function RouteEditorMapClick({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function WaypointEditorMarker({
  index,
  position,
  onVertexDragEnd,
  onVertexRemove,
  onVertexCoordsApply,
}: {
  index: number;
  position: [number, number];
  onVertexDragEnd: (i: number, la: number, ln: number) => void;
  onVertexRemove: (i: number) => void;
  onVertexCoordsApply: (i: number, la: number, ln: number) => void;
}) {
  const [laStr, setLaStr] = useState(() => String(position[0]));
  const [lnStr, setLnStr] = useState(() => String(position[1]));
  useEffect(() => {
    setLaStr(String(position[0]));
    setLnStr(String(position[1]));
  }, [position[0], position[1]]);

  /** 매 부모 리렌더마다 새 배열 참조가 오면 Leaflet Marker가 setLatLng로 드래그를 되돌림 → 참조는 값이 바뀔 때만 갱신 */
  const stablePosition = useMemo(
    (): [number, number] => [position[0], position[1]],
    [position[0], position[1]],
  );

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "route-wpt-editor-divicon",
        html: `<div style="width:26px;height:26px;border-radius:50%;background:rgba(15,118,110,0.95);border:2px solid #5eead4;color:#ecfeff;font:bold 11px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.45)">${index + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    [index],
  );

  const stableEventHandlers = useMemo(
    () => ({
      dragend: (e: L.LeafletMouseEvent) => {
        const t = e.target as L.Marker;
        const ll = t.getLatLng?.();
        if (!ll) return;
        onVertexDragEnd(index, ll.lat, ll.lng);
      },
    }),
    [index, onVertexDragEnd],
  );

  return (
    <Marker
      position={stablePosition}
      icon={icon}
      draggable
      zIndexOffset={1400}
      eventHandlers={stableEventHandlers}
    >
      <Popup>
        <div className="min-w-[10.5rem] space-y-2 p-0.5 text-xs text-slate-800">
          <p className="font-bold text-slate-700">경유지 {index + 1}</p>
          <p className="text-[10px] leading-snug text-slate-600">마커를 드래그해 옮기거나, 아래 좌표를 고친 뒤 「좌표 적용」을 누르세요.</p>
          <label className="block">
            <span className="text-[10px] text-slate-500">위도</span>
            <input
              type="text"
              value={laStr}
              onChange={(ev) => setLaStr(ev.target.value)}
              className="mt-0.5 w-full rounded border border-slate-300 px-1 py-0.5 font-mono text-[11px]"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-slate-500">경도</span>
            <input
              type="text"
              value={lnStr}
              onChange={(ev) => setLnStr(ev.target.value)}
              className="mt-0.5 w-full rounded border border-slate-300 px-1 py-0.5 font-mono text-[11px]"
              spellCheck={false}
            />
          </label>
          <div className="flex flex-wrap gap-1 pt-0.5">
            <button
              type="button"
              className="rounded bg-teal-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-teal-500"
              onClick={() => {
                const la = parseFloat(laStr.replace(",", "."));
                const ln = parseFloat(lnStr.replace(",", "."));
                if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
                onVertexCoordsApply(index, la, ln);
              }}
            >
              좌표 적용
            </button>
            <button
              type="button"
              className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
              onClick={() => onVertexRemove(index)}
            >
              삭제
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function VesselMarker({
  vessel,
  variant,
  seedingActive,
}: {
  vessel: { lat: number; lng: number; heading: number };
  variant: VesselMarkerVariant;
  seedingActive: boolean;
}) {
  const icon = useMemo(() => {
    if (variant === "gpsDot") {
      const pinCls = seedingActive
        ? "marine-gps-ownship-pin marine-gps-ownship-pin--seeding"
        : "marine-gps-ownship-pin";
      return L.divIcon({
        className: "marine-gps-ownship-divicon",
        html: `<div class="${pinCls}" style="transform:rotate(${vessel.heading}deg)"><div class="marine-gps-ownship-signals" aria-hidden="true"><span class="marine-gps-ownship-ring"></span><span class="marine-gps-ownship-ring"></span><span class="marine-gps-ownship-ring"></span></div><div class="marine-gps-ownship-hull"></div></div>`,
        iconSize: [32, 40],
        iconAnchor: [16, 20],
      });
    }
    const pinCls = seedingActive
      ? "marine-vessel-pin marine-vessel-pin--seeding"
      : "marine-vessel-pin";
    return L.divIcon({
      className: "marine-vessel-divicon",
      html: `<div class="${pinCls}" style="transform:rotate(${vessel.heading}deg)"><div class="marine-vessel-signals" aria-hidden="true"><span class="marine-vessel-signal-ring"></span><span class="marine-vessel-signal-ring"></span><span class="marine-vessel-signal-ring"></span></div><div class="marine-vessel-hull"></div></div>`,
      iconSize: [32, 40],
      iconAnchor: [16, 20],
    });
  }, [vessel.heading, variant, seedingActive]);

  return (
    <Marker position={L.latLng(vessel.lat, vessel.lng)} icon={icon} zIndexOffset={800}>
      <Popup>
        <span className="text-xs font-mono">
          {vessel.lat.toFixed(5)}°N, {vessel.lng.toFixed(5)}°E
        </span>
      </Popup>
    </Marker>
  );
}

/** 실제 위치 갱신 시 지도가 마커를 따라가도록 패닝 */
function MapPanToVessel({
  lat,
  lng,
  enabled,
}: {
  lat: number;
  lng: number;
  enabled: boolean;
}) {
  const map = useMap();
  const prev = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const p = prev.current;
    if (p && p.lat === lat && p.lng === lng) return;
    prev.current = { lat, lng };
    map.panTo([lat, lng], { animate: true });
  }, [lat, lng, enabled, map]);

  return null;
}

export function MarineLeafletMap({
  className = "",
  basemap,
  center,
  mapZoomInNonce = 0,
  mapZoomOutNonce = 0,
  postFitZoomLevels = 0,
  onMapZoomLevel,
  fitNonce,
  drops,
  vessel,
  pathLatLng,
  vesselMarkerVariant = "ship",
  vesselSeedingActive = false,
  panMapToVesselOnMove = false,
  fitToVesselOnly = false,
  hideVesselMarker = false,
  disableScrollWheelZoom,
  maxBounds = OPS_AREA_MAX_BOUNDS,
  offlineNoTiles = false,
  ltePathLatLng = [],
  replayTrackPathLatLng = [],
  replayTrackShowVertexMarkers = false,
  replayTrackHighlightVertexIndex = null,
  replayNavGuideLine = null,
  planMarkers = [],
  scheduleFocusFit = false,
  replayTrackVertexEditor = null,
  seedPlanMapEditor = null,
  plannedSeedMarkers = [],
  remoteVessels = [],
}: Props) {
  const planned = plannedSeedMarkers ?? [];
  const fitPoints = useMemo(() => {
    const lte = ltePathLatLng ?? [];
    const replay = replayTrackPathLatLng ?? [];
    const plans = planMarkers ?? [];
    const planSeeds = planned.map(([la, ln]) => [la, ln] as L.LatLngExpression);
    if (scheduleFocusFit && plans.length > 0) {
      const raw: L.LatLngExpression[] = [
        [vessel.lat, vessel.lng] as L.LatLngExpression,
        ...plans.map((p) => [p.lat, p.lng] as L.LatLngExpression),
      ];
      const k = filterPointsNearKorea(raw);
      return k.length > 0 ? k : [opsCenterTuple() as L.LatLngExpression];
    }
    if (hideVesselMarker && !fitToVesselOnly) {
      const raw: L.LatLngExpression[] = [
        ...drops.map((d) => [d.lat, d.lng] as L.LatLngExpression),
        ...pathLatLng,
        ...lte.map(([la, ln]) => [la, ln] as L.LatLngExpression),
        ...replay.map(([la, ln]) => [la, ln] as L.LatLngExpression),
        ...planSeeds,
      ];
      const k = filterPointsNearKorea(raw);
      return k.length > 0 ? k : [opsCenterTuple() as L.LatLngExpression];
    }
    if (fitToVesselOnly) {
      const raw: L.LatLngExpression[] = [
        [vessel.lat, vessel.lng] as L.LatLngExpression,
        ...pathLatLng.map(([la, ln]) => [la, ln] as L.LatLngExpression),
        ...lte.map(([la, ln]) => [la, ln] as L.LatLngExpression),
        ...replay.map(([la, ln]) => [la, ln] as L.LatLngExpression),
        ...planSeeds,
      ];
      const k = filterPointsNearKorea(raw);
      return k.length > 0 ? k : [opsCenterTuple() as L.LatLngExpression];
    }
    const raw: L.LatLngExpression[] = [
      [vessel.lat, vessel.lng],
      ...drops.map((d) => [d.lat, d.lng] as L.LatLngExpression),
      ...pathLatLng,
      ...lte.map(([la, ln]) => [la, ln] as L.LatLngExpression),
      ...replay.map(([la, ln]) => [la, ln] as L.LatLngExpression),
      ...(planMarkers ?? []).map((p) => [p.lat, p.lng] as L.LatLngExpression),
      ...planSeeds,
    ];
    const k = filterPointsNearKorea(raw);
    return k.length > 0 ? k : [opsCenterTuple() as L.LatLngExpression];
  }, [
    vessel.lat,
    vessel.lng,
    drops,
    pathLatLng,
    fitToVesselOnly,
    hideVesselMarker,
    ltePathLatLng,
    replayTrackPathLatLng,
    planMarkers,
    scheduleFocusFit,
    planned,
  ]);

  const boundsProps =
    maxBounds != null
      ? ({ maxBounds, maxBoundsViscosity: 0.85 } as const)
      : ({} as const);

  return (
    <MapContainer
      center={center}
      zoom={MAP_PLACEHOLDER_ZOOM}
      minZoom={maxBounds != null ? 11 : 3}
      maxZoom={18}
      zoomControl={false}
      className={`marine-ops-map-root z-0 h-full w-full min-h-[200px] [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:bg-black/40 [&_.leaflet-control-attribution]:text-white/70 ${offlineNoTiles ? "[&_.leaflet-container]:bg-[#0a1628]" : ""} ${className}`}
      scrollWheelZoom={!disableScrollWheelZoom}
      {...boundsProps}
    >
      {offlineNoTiles ? null : (
        <TileLayer attribution={TILE_ATTR} url={tileUrl(basemap)} noWrap />
      )}
      <MapLayoutFix />
      <MapFitBounds fitNonce={fitNonce} points={fitPoints} postFitZoomLevels={postFitZoomLevels} />
      <MapZoomByNonce zoomInNonce={mapZoomInNonce} zoomOutNonce={mapZoomOutNonce} />
      {onMapZoomLevel ? <MapZoomLevelReporter onLevel={onMapZoomLevel} /> : null}
      {panMapToVesselOnMove ? (
        <MapPanToVessel lat={vessel.lat} lng={vessel.lng} enabled={panMapToVesselOnMove} />
      ) : null}
      {disableScrollWheelZoom ? <DisableScrollWheelZoom /> : null}

      {replayTrackVertexEditor ? (
        <RouteEditorMapClick onClick={replayTrackVertexEditor.onMapClick} />
      ) : seedPlanMapEditor ? (
        <RouteEditorMapClick onClick={seedPlanMapEditor.onMapClick} />
      ) : null}

      {pathLatLng.length > 1 ? (
        <Polyline
          positions={pathLatLng.map(([la, ln]) => L.latLng(la, ln))}
          pathOptions={{
            color: "#40E0D0",
            weight: 2,
            opacity: 0.55,
            dashArray: "6 8",
            interactive: replayTrackVertexEditor == null,
          }}
        />
      ) : null}

      {ltePathLatLng.length > 1 ? (
        <Polyline
          positions={ltePathLatLng.map(([la, ln]) => L.latLng(la, ln))}
          pathOptions={{
            color: "#fb923c",
            weight: 3,
            opacity: 0.88,
            interactive: replayTrackVertexEditor == null,
          }}
        />
      ) : null}

      {replayTrackPathLatLng.length > 1 ? (
        <Polyline
          positions={replayTrackPathLatLng.map(([la, ln]) => L.latLng(la, ln))}
          pathOptions={{
            color: "#d946ef",
            weight: 3,
            opacity: 0.9,
            dashArray: "5 7",
            /** 꼭짓점 편집 시 선이 클릭·드래그를 가로채지 않게 */
            interactive: replayTrackVertexEditor == null,
          }}
        />
      ) : null}

      {replayTrackShowVertexMarkers && replayTrackPathLatLng.length > 1
        ? replayTrackPathLatLng.map(([la, ln], i) => {
            const hi = replayTrackHighlightVertexIndex === i;
            return (
              <CircleMarker
                key={`replay-vtx-${i}`}
                center={L.latLng(la, ln)}
                radius={hi ? 10 : 5}
                pathOptions={{
                  color: hi ? "#fbbf24" : "#c026d3",
                  fillColor: hi ? "#f59e0b" : "#86198f",
                  fillOpacity: hi ? 0.95 : 0.78,
                  weight: hi ? 3 : 1.4,
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -4]}
                  opacity={1}
                  className="marine-drop-tooltip !rounded !border !border-fuchsia-400/35 !bg-[#041c2e]/95 !px-2 !py-0.5 !text-[10px] !font-mono !font-bold !text-fuchsia-100 !shadow-lg"
                >
                  WPT{i + 1}
                </Tooltip>
              </CircleMarker>
            );
          })
        : null}

      {replayNavGuideLine ? (
        <Polyline
          positions={[
            L.latLng(replayNavGuideLine.from[0], replayNavGuideLine.from[1]),
            L.latLng(replayNavGuideLine.to[0], replayNavGuideLine.to[1]),
          ]}
          pathOptions={{
            color: "#fef08a",
            weight: 3,
            opacity: 0.92,
            dashArray: "12 10",
            lineCap: "round",
            interactive: replayTrackVertexEditor == null,
          }}
        />
      ) : null}

      {drops.map((d) => (
        <CircleMarker
          key={d.id}
          center={L.latLng(d.lat, d.lng)}
          radius={d.highlight ? 9 : 6}
          pathOptions={{
            color: d.stroke,
            fillColor: d.fill,
            fillOpacity: 0.92,
            weight: d.highlight ? 2.2 : 1.4,
          }}
        >
          <Tooltip
            permanent
            direction="right"
            offset={[10, 0]}
            opacity={1}
            className="marine-drop-tooltip !rounded !border !border-white/20 !bg-[#041c2e]/95 !px-2 !py-0.5 !text-[10px] !font-mono !font-bold !text-white/90 !shadow-lg"
          >
            {d.label}
          </Tooltip>
        </CircleMarker>
      ))}

      {(planMarkers ?? []).map((p, i) => (
        <CircleMarker
          key={`plan-${p.label}-${i}`}
          center={L.latLng(p.lat, p.lng)}
          radius={10}
          pathOptions={{
            color: "#38bdf8",
            fillColor: "#0891b2",
            fillOpacity: 0.42,
            weight: 2,
          }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -6]}
            opacity={1}
            className="marine-drop-tooltip !rounded !border !border-cyan-400/40 !bg-[#041c2e]/95 !px-2 !py-0.5 !text-[10px] !font-bold !text-cyan-100 !shadow-lg"
          >
            {p.label}
          </Tooltip>
        </CircleMarker>
      ))}

      {planned.map(([la, ln], i) => (
        <CircleMarker
          key={`plan-seed-${i}-${la.toFixed(5)}-${ln.toFixed(5)}`}
          center={L.latLng(la, ln)}
          radius={5}
          pathOptions={{
            color: "#3f6212",
            fillColor: "#bef264",
            fillOpacity: 0.92,
            weight: 1.6,
          }}
        >
          <Tooltip
            direction="top"
            offset={[0, -4]}
            opacity={1}
            className="marine-drop-tooltip !rounded !border !border-lime-400/45 !bg-[#041c2e]/95 !px-2 !py-0.5 !text-[10px] !font-mono !font-bold !text-lime-100 !shadow-lg"
          >
            예정 {i + 1}
          </Tooltip>
        </CircleMarker>
      ))}

      {hideVesselMarker ? null : (
        <VesselMarker
          vessel={vessel}
          variant={vesselMarkerVariant}
          seedingActive={vesselSeedingActive}
        />
      )}

      {/* 실시간 공유 선박 — Supabase vessel_positions */}
      {remoteVessels.map((rv) => (
        <CircleMarker
          key={`rv-${rv.id}`}
          center={[rv.lat, rv.lng]}
          radius={9}
          pathOptions={{
            color: "#f97316",
            fillColor: "#fb923c",
            fillOpacity: 0.92,
            weight: 2,
          }}
        >
          <Popup>
            <span style={{ fontWeight: 700, color: "#f97316" }}>
              🚢 {rv.label ?? rv.id}
            </span>
            <br />
            {rv.lat.toFixed(5)}°N, {rv.lng.toFixed(5)}°E
          </Popup>
          <Tooltip permanent direction="top" offset={[0, -12]} opacity={0.92}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316" }}>
              {rv.label ?? rv.id}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}

      {replayTrackVertexEditor
        ? replayTrackVertexEditor.vertices.map(([la, ln], i) => (
            <WaypointEditorMarker
              key={`rwpt-ed-${i}`}
              index={i}
              position={[la, ln]}
              onVertexDragEnd={replayTrackVertexEditor.onVertexDragEnd}
              onVertexRemove={replayTrackVertexEditor.onVertexRemove}
              onVertexCoordsApply={replayTrackVertexEditor.onVertexCoordsApply}
            />
          ))
        : null}
    </MapContainer>
  );
}
