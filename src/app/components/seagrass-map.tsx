import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ship,
  MapPin,
  Wifi,
  WifiOff,
  Layers,
  Maximize2,
  Plus,
  Minus,
  Crosshair,
} from "lucide-react";
import { OPS_AREA_CENTER, OPS_AREA_MAX_BOUNDS, SIM_SEA_OFFSET } from "../geo/koreaOpsArea";
import { MarineLeafletMap } from "./MarineLeafletMap";

export type DropPoint = {
  id: string;
  time: string;
  lat: number;
  lng: number;
  status: "Success" | "Pending" | "Failed";
  x: number;
  y: number;
};

export type MapMode = "test" | "real";

type Props = {
  drops: DropPoint[];
  vessel: { x: number; y: number; heading: number };
  path: { x: number; y: number }[];
  connected: boolean;
  todayCount: number;
  mapMode: MapMode;
  onMapModeChange: (mode: MapMode) => void;
  /** 실제 모드일 때만 채워짐 (WGS84) */
  gpsVessel: { lat: number; lng: number; heading: number } | null;
  gpsError: string | null;
};

/** App.tsx 시뮬 좌표 ↔ 위경도 (App.tsx와 동일 스케일) */
const BASE_LAT = OPS_AREA_CENTER.lat;
const BASE_LNG = OPS_AREA_CENTER.lng;
const APP_CY = 350;
const APP_CX = 500;
const APP_S = 0.0005;

function xyToLatLng(x: number, y: number) {
  return {
    lat: BASE_LAT + (y - APP_CY) * APP_S + SIM_SEA_OFFSET.lat,
    lng: BASE_LNG + (x - APP_CX) * APP_S + SIM_SEA_OFFSET.lng,
  };
}

function dropStyle(status: DropPoint["status"]) {
  switch (status) {
    case "Pending":
      return { fill: "#fbbf24", stroke: "#fffbeb", pulse: "#fcd34d" };
    case "Failed":
      return { fill: "#ef4444", stroke: "#fecaca", pulse: "#f87171" };
    default:
      return { fill: "#f97316", stroke: "#ffedd5", pulse: "#fb923c" };
  }
}

export function SeagrassMap({
  drops,
  vessel,
  path,
  connected,
  todayCount,
  mapMode,
  onMapModeChange,
  gpsVessel,
  gpsError,
}: Props) {
  const [zoomRail, setZoomRail] = useState(0);
  const [fitNonce, setFitNonce] = useState(1);
  const hadGpsFixRef = useRef(false);

  const vesselLL = useMemo(() => xyToLatLng(vessel.x, vessel.y), [vessel.x, vessel.y]);

  const pathLatLng = useMemo(
    () =>
      mapMode === "real"
        ? []
        : path.map((p) => {
            const ll = xyToLatLng(p.x, p.y);
            return [ll.lat, ll.lng] as [number, number];
          }),
    [path, mapMode]
  );

  useEffect(() => {
    if (mapMode === "real" && gpsVessel) {
      if (!hadGpsFixRef.current) {
        hadGpsFixRef.current = true;
        setFitNonce((n) => n + 1);
      }
    } else if (mapMode === "test") {
      hadGpsFixRef.current = false;
    }
  }, [mapMode, gpsVessel]);

  const leafletDrops = useMemo(
    () =>
      drops.map((d, i) => {
        const st = dropStyle(d.status);
        const highlight = i === drops.length - 1;
        return {
          id: d.id,
          label: d.id,
          lat: d.lat,
          lng: d.lng,
          highlight,
          ...st,
        };
      }),
    [drops]
  );

  const vesselPos = useMemo(() => {
    if (mapMode === "real" && gpsVessel) {
      return {
        lat: gpsVessel.lat,
        lng: gpsVessel.lng,
        heading: gpsVessel.heading,
      };
    }
    return { lat: vesselLL.lat, lng: vesselLL.lng, heading: vessel.heading };
  }, [mapMode, gpsVessel, vesselLL.lat, vesselLL.lng, vessel.heading]);

  const isRealWithGps = mapMode === "real" && gpsVessel != null;
  const awaitingGps = mapMode === "real" && gpsVessel == null;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <div className="absolute inset-0 z-0">
        <MarineLeafletMap
          basemap="dark"
          center={[BASE_LAT, BASE_LNG]}
          zoomRail={zoomRail}
          fitNonce={fitNonce}
          drops={leafletDrops}
          vessel={vesselPos}
          pathLatLng={pathLatLng}
          vesselMarkerVariant={isRealWithGps ? "gpsDot" : "ship"}
          panMapToVesselOnMove={isRealWithGps}
          fitToVesselOnly={isRealWithGps}
          hideVesselMarker={awaitingGps}
          maxBounds={mapMode === "real" ? null : OPS_AREA_MAX_BOUNDS}
        />
      </div>

      {/* Floating Status Panel */}
      <div className="absolute top-4 right-4 w-72 rounded-lg border border-slate-200 bg-white/95 backdrop-blur-md shadow-xl p-4 z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-slate-500" style={{ fontSize: 11, letterSpacing: 1 }}>
            LIVE STATUS
          </span>
          <div className="flex items-center gap-1.5">
            {connected ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700" style={{ fontSize: 12 }}>
                  Connected
                </span>
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <WifiOff className="w-3.5 h-3.5 text-red-500" />
                <span className="text-red-600" style={{ fontSize: 12 }}>
                  Offline
                </span>
              </>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-orange-100 p-2">
              <MapPin className="w-4 h-4 text-orange-600" />
            </div>
            <div className="flex-1">
              <div className="text-slate-500" style={{ fontSize: 11 }}>
                Seed Blocks Dropped Today
              </div>
              <div className="text-[#0B2545]" style={{ fontSize: 22, fontWeight: 600 }}>
                {todayCount}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <div className="rounded-md bg-cyan-100 p-2">
              <Ship className="w-4 h-4 text-cyan-700" />
            </div>
            <div className="flex-1">
              <div className="text-slate-500" style={{ fontSize: 11 }}>
                {mapMode === "real" ? "내 위치 (GPS)" : "Vessel — RV Poseidon"}
              </div>
              <div className="text-slate-700 tabular-nums" style={{ fontSize: 13 }}>
                {awaitingGps ? (
                  <span className="text-amber-700">위치 수신 대기…</span>
                ) : (
                  <>
                    {vesselPos.lat.toFixed(4)}° N, {vesselPos.lng.toFixed(4)}° E
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map navigation controls */}
      <div className="absolute top-4 left-4 flex flex-col items-center gap-3 z-10">
        <div className="flex flex-col bg-white rounded-full shadow-[0_4px_14px_rgba(11,37,69,0.12)] border border-slate-200/80 overflow-hidden">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoomRail((z) => Math.min(4, z + 1))}
            className="w-10 h-10 flex items-center justify-center text-slate-700 hover:text-[#0B2545] hover:bg-slate-50 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.25} />
          </button>
          <div className="mx-2.5 h-px bg-slate-200" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoomRail((z) => Math.max(0, z - 1))}
            className="w-10 h-10 flex items-center justify-center text-slate-700 hover:text-[#0B2545] hover:bg-slate-50 transition-colors"
          >
            <Minus className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>

        <button
          type="button"
          aria-label="Recenter map"
          onClick={() => {
            setZoomRail(0);
            setFitNonce((n) => n + 1);
          }}
          className="w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-[0_4px_14px_rgba(11,37,69,0.12)] border border-slate-200/80 text-slate-700 hover:text-[#0B2545] hover:bg-slate-50 transition-colors"
        >
          <Crosshair className="w-4 h-4" strokeWidth={2} />
        </button>

        <div className="flex flex-col bg-white rounded-full shadow-[0_4px_14px_rgba(11,37,69,0.12)] border border-slate-200/80 overflow-hidden">
          <button
            type="button"
            aria-label="Layers"
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors cursor-not-allowed"
            disabled
          >
            <Layers className="w-4 h-4" strokeWidth={2} />
          </button>
          <div className="mx-2.5 h-px bg-slate-200" />
          <button
            type="button"
            aria-label="Fullscreen"
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors cursor-not-allowed"
            disabled
          >
            <Maximize2 className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* 내 위치 찾기: 꺼짐 선박 / 켜짐 GPS */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1">
        <button
          type="button"
          role="switch"
          aria-checked={mapMode === "real"}
          title={
            mapMode === "real"
              ? "끄면 선박 위치·항적으로 돌아갑니다"
              : "켜면 브라우저로 현재 위치를 찾아 표시합니다"
          }
          onClick={() => {
            if (mapMode === "real") {
              onMapModeChange("test");
              setZoomRail(0);
              setFitNonce((n) => n + 1);
              return;
            }
            onMapModeChange("real");
          }}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[10px] font-semibold shadow-md backdrop-blur-sm transition-colors ${
            mapMode === "real"
              ? "border-cyan-600 bg-cyan-600 text-white"
              : "border-slate-200/90 bg-white/95 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Crosshair
            className={`h-4 w-4 shrink-0 stroke-[2.25] ${mapMode === "real" ? "text-white" : "text-slate-600"}`}
            aria-hidden
          />
          <span className="leading-none">내 위치 찾기</span>
        </button>
        {gpsError ? (
          <p className="max-w-[11rem] rounded border border-amber-200 bg-amber-50/95 px-2 py-1 text-[10px] text-amber-900 shadow-sm">
            {gpsError}
          </p>
        ) : null}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 rounded-md border border-slate-200 bg-white/95 backdrop-blur-md px-3 py-2 shadow-md z-10">
        <div className="flex items-center gap-4 text-slate-700" style={{ fontSize: 11 }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
            Vessel
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
            Drop point
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-orange-400" />
            Route
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 border border-dashed border-cyan-600/70" />
            Zone
          </span>
        </div>
      </div>
    </div>
  );
}
