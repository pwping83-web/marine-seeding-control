import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
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
  /** 0–4: fitBounds 직후 줌에 더해 추가 확대(최대 18) */
  zoomRail: number;
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
  /** true면 fitBounds에 살포·항적을 넣지 않고 선박 위치만 사용(실제 모드 초기 맞춤) */
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
  /** 작업 계획 등 — 살포 점과 별도의 계획 후보 마커(예: 제1구역 격자) */
  planMarkers?: ReadonlyArray<{ lat: number; lng: number; label: string }>;
  /** true면 맞춤 줌에 살포·항적·LTE 궤적을 넣지 않고 선박+planMarkers만 사용 */
  scheduleFocusFit?: boolean;
};

function tileUrl(basemap: MarineBasemap): string {
  return basemap === "dark" ? TILE_CARTO_DARK : TILE_CARTO_VOYAGER;
}

const MAP_PLACEHOLDER_ZOOM = 16;

/**
 * fitBounds로 살포·선박·항적이 다 들어오는 한 최대 줌(18)까지 맞춘 뒤,
 * zoomRail만큼 추가 확대. (기존에는 setZoom(11+rail)이 fit 결과를 덮어써 확대가 깨짐)
 */
function MapFitAndZoomRail({
  fitNonce,
  zoomRail,
  points,
}: {
  fitNonce: number;
  zoomRail: number;
  points: L.LatLngExpression[];
}) {
  const map = useMap();
  const pointsRef = useRef(points);
  const fittedZoomRef = useRef(MAP_PLACEHOLDER_ZOOM);
  const lastFitNonceRef = useRef<number>(-999);

  pointsRef.current = points;

  useEffect(() => {
    const rail = Math.max(0, Math.min(4, zoomRail));
    const id = requestAnimationFrame(() => {
      map.invalidateSize();
      if (lastFitNonceRef.current !== fitNonce) {
        lastFitNonceRef.current = fitNonce;
        let pts = pointsRef.current;
        if (pts.length === 0) pts = [opsCenterTuple() as L.LatLngExpression];
        const b = L.latLngBounds(pts);
        if (b.isValid()) {
          if (pts.length === 1) {
            const p = pts[0];
            const lat = Array.isArray(p) ? p[0] : p.lat;
            const lng = Array.isArray(p) ? p[1] : p.lng;
            const targetZoom = Math.min(18, 15 + rail);
            map.setView([lat, lng], targetZoom, { animate: true });
          } else {
            map.fitBounds(b, {
              padding: [2, 2],
              maxZoom: 18,
              animate: true,
            });
          }
        }
        fittedZoomRef.current = map.getZoom();
      }
      map.setZoom(Math.min(18, fittedZoomRef.current + rail));
    });
    return () => cancelAnimationFrame(id);
  }, [fitNonce, zoomRail, map]);
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
  zoomRail,
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
  planMarkers = [],
  scheduleFocusFit = false,
}: Props) {
  const fitPoints = useMemo(() => {
    const lte = ltePathLatLng ?? [];
    const replay = replayTrackPathLatLng ?? [];
    const plans = planMarkers ?? [];
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
      ];
      const k = filterPointsNearKorea(raw);
      return k.length > 0 ? k : [opsCenterTuple() as L.LatLngExpression];
    }
    if (fitToVesselOnly) {
      const raw: L.LatLngExpression[] = [
        [vessel.lat, vessel.lng] as L.LatLngExpression,
        ...lte.map(([la, ln]) => [la, ln] as L.LatLngExpression),
        ...replay.map(([la, ln]) => [la, ln] as L.LatLngExpression),
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
      className={`marine-ops-map-root z-0 h-full w-full min-h-[200px] [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:bg-black/40 [&_.leaflet-control-attribution]:text-white/70 ${offlineNoTiles ? "[&_.leaflet-container]:bg-[#0a1628]" : ""} ${className}`}
      scrollWheelZoom={!disableScrollWheelZoom}
      {...boundsProps}
    >
      {offlineNoTiles ? null : (
        <TileLayer attribution={TILE_ATTR} url={tileUrl(basemap)} noWrap />
      )}
      <MapLayoutFix />
      <MapFitAndZoomRail fitNonce={fitNonce} zoomRail={zoomRail} points={fitPoints} />
      {panMapToVesselOnMove ? (
        <MapPanToVessel lat={vessel.lat} lng={vessel.lng} enabled={panMapToVesselOnMove} />
      ) : null}
      {disableScrollWheelZoom ? <DisableScrollWheelZoom /> : null}

      {pathLatLng.length > 1 ? (
        <Polyline
          positions={pathLatLng.map(([la, ln]) => L.latLng(la, ln))}
          pathOptions={{
            color: "#40E0D0",
            weight: 2,
            opacity: 0.55,
            dashArray: "6 8",
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

      {hideVesselMarker ? null : (
        <VesselMarker
          vessel={vessel}
          variant={vesselMarkerVariant}
          seedingActive={vesselSeedingActive}
        />
      )}
    </MapContainer>
  );
}
