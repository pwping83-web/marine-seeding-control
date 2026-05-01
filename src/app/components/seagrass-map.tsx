import { useRef } from "react";
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

export type DropPoint = {
  id: string;
  time: string;
  lat: number;
  lng: number;
  status: "Success" | "Pending" | "Failed";
  x: number;
  y: number;
};

type Props = {
  drops: DropPoint[];
  vessel: { x: number; y: number; heading: number };
  path: { x: number; y: number }[];
  connected: boolean;
  todayCount: number;
};

/**
 * Empty container for a Map API (Google Maps, Kakao Map, Mapbox, etc.).
 *
 * Mount the map inside the #map div via a useEffect:
 *
 *   // Google Maps
 *   const map = new google.maps.Map(mapRef.current!, {
 *     center: { lat: 34.582, lng: 128.719 },
 *     zoom: 13,
 *   });
 *
 *   // Kakao Maps
 *   const map = new kakao.maps.Map(mapRef.current!, {
 *     center: new kakao.maps.LatLng(34.582, 128.719),
 *     level: 5,
 *   });
 *
 * Then plot `drops`, `vessel`, and `path` as Markers / Polylines.
 */
export function SeagrassMap({ drops, connected, todayCount }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      {/* === MAP API MOUNT POINT === */}
      <div
        id="map"
        ref={mapRef}
        className="absolute inset-0 w-full h-full bg-slate-200"
        style={{
          backgroundImage:
            "linear-gradient(rgba(11,37,69,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(11,37,69,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#0B2545]/5 border border-[#0B2545]/15 mb-3">
              <MapPin className="w-6 h-6 text-[#0B2545]/50" />
            </div>
            <div className="text-slate-500" style={{ fontSize: 13, fontWeight: 500 }}>
              Map API container
            </div>
            <div className="text-slate-400 mt-1" style={{ fontSize: 11 }}>
              Initialize Google Maps / Kakao Map on{" "}
              <code className="bg-slate-200 px-1 py-0.5 rounded">#map</code>
            </div>
            <div className="text-slate-400 mt-2 tabular-nums" style={{ fontSize: 11 }}>
              {drops.length} drops · ready to render
            </div>
          </div>
        </div>
      </div>
      {/* === /MAP API MOUNT POINT === */}

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
                Vessel — RV Poseidon
              </div>
              <div className="text-slate-700 tabular-nums" style={{ fontSize: 13 }}>
                34.5821° N, 128.7194° E
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map navigation controls */}
      <div className="absolute top-4 left-4 flex flex-col items-center gap-3 z-10">
        {/* Zoom pill */}
        <div className="flex flex-col bg-white rounded-full shadow-[0_4px_14px_rgba(11,37,69,0.12)] border border-slate-200/80 overflow-hidden">
          <button
            aria-label="Zoom in"
            className="w-10 h-10 flex items-center justify-center text-slate-700 hover:text-[#0B2545] hover:bg-slate-50 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.25} />
          </button>
          <div className="mx-2.5 h-px bg-slate-200" />
          <button
            aria-label="Zoom out"
            className="w-10 h-10 flex items-center justify-center text-slate-700 hover:text-[#0B2545] hover:bg-slate-50 transition-colors"
          >
            <Minus className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>

        {/* Recenter */}
        <button
          aria-label="Recenter map"
          className="w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-[0_4px_14px_rgba(11,37,69,0.12)] border border-slate-200/80 text-slate-700 hover:text-[#0B2545] hover:bg-slate-50 transition-colors"
        >
          <Crosshair className="w-4 h-4" strokeWidth={2} />
        </button>

        {/* Secondary actions */}
        <div className="flex flex-col bg-white rounded-full shadow-[0_4px_14px_rgba(11,37,69,0.12)] border border-slate-200/80 overflow-hidden">
          <button
            aria-label="Layers"
            className="w-10 h-10 flex items-center justify-center text-slate-700 hover:text-[#0B2545] hover:bg-slate-50 transition-colors"
          >
            <Layers className="w-4 h-4" strokeWidth={2} />
          </button>
          <div className="mx-2.5 h-px bg-slate-200" />
          <button
            aria-label="Fullscreen"
            className="w-10 h-10 flex items-center justify-center text-slate-700 hover:text-[#0B2545] hover:bg-slate-50 transition-colors"
          >
            <Maximize2 className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
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
