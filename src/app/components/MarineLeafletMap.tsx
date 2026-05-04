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
import L from "leaflet";
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
  /** 관제 대시보드: 휠로 줌 레일 조절 시 Leaflet 기본 휠 줌과 충돌 방지 */
  disableScrollWheelZoom?: boolean;
  maxBounds?: LatLngBoundsExpression;
  /** true면 XYZ 타일(인터넷) 요청 없음 — 장비 오프라인 기록 모드 */
  offlineNoTiles?: boolean;
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
          map.fitBounds(b, {
            padding: [2, 2],
            maxZoom: 18,
            animate: true,
          });
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
}: {
  vessel: { lat: number; lng: number; heading: number };
}) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "marine-vessel-divicon",
        html: `<div class="marine-vessel-pin" style="transform:rotate(${vessel.heading}deg)"><div class="marine-vessel-signals" aria-hidden="true"><span class="marine-vessel-signal-ring"></span><span class="marine-vessel-signal-ring"></span><span class="marine-vessel-signal-ring"></span></div><div class="marine-vessel-hull"></div></div>`,
        iconSize: [32, 40],
        iconAnchor: [16, 20],
      }),
    [vessel.heading]
  );

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

export function MarineLeafletMap({
  className = "",
  basemap,
  center,
  zoomRail,
  fitNonce,
  drops,
  vessel,
  pathLatLng,
  disableScrollWheelZoom,
  maxBounds = OPS_AREA_MAX_BOUNDS,
  offlineNoTiles = false,
}: Props) {
  const fitPoints = useMemo(() => {
    const raw: L.LatLngExpression[] = [
      [vessel.lat, vessel.lng],
      ...drops.map((d) => [d.lat, d.lng] as L.LatLngExpression),
      ...pathLatLng,
    ];
    const k = filterPointsNearKorea(raw);
    return k.length > 0 ? k : [opsCenterTuple() as L.LatLngExpression];
  }, [vessel.lat, vessel.lng, drops, pathLatLng]);

  return (
    <MapContainer
      center={center}
      zoom={MAP_PLACEHOLDER_ZOOM}
      minZoom={11}
      maxZoom={18}
      className={`marine-ops-map-root z-0 h-full w-full min-h-[200px] [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:bg-black/40 [&_.leaflet-control-attribution]:text-white/70 ${offlineNoTiles ? "[&_.leaflet-container]:bg-[#0a1628]" : ""} ${className}`}
      scrollWheelZoom={!disableScrollWheelZoom}
      maxBounds={maxBounds}
      maxBoundsViscosity={0.85}
    >
      {offlineNoTiles ? null : (
        <TileLayer attribution={TILE_ATTR} url={tileUrl(basemap)} noWrap />
      )}
      <MapLayoutFix />
      <MapFitAndZoomRail fitNonce={fitNonce} zoomRail={zoomRail} points={fitPoints} />
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

      <VesselMarker vessel={vessel} />
    </MapContainer>
  );
}
