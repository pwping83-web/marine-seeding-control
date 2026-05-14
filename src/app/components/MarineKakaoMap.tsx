/// <reference types="kakao.maps.d.ts" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CustomOverlayMap,
  Map,
  MapMarker,
  Polyline,
  useKakaoLoader,
} from "react-kakao-maps-sdk";
import { filterPointsNearKorea, opsCenterTuple } from "../geo/koreaOpsArea";
import type { MarineLeafletDrop, MarineLeafletMapProps } from "./marine-map-shared";

/** Leaflet 줌 배지와 비슷하게 보이도록 카카오 level(1=확대)을 가짜 정수 줌으로 변환 */
function kakaoLevelToPseudoLeaflet(level: number): number {
  return Math.max(3, Math.min(18, 19 - Math.round(level)));
}

function pseudoLeafletZoomToKakao(z: number): number {
  return Math.max(1, Math.min(14, 19 - Math.round(z)));
}

type Props = MarineLeafletMapProps & { appkey: string };

function KakaoWaypointEditorMarker({
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

  return (
    <MapMarker
      position={{ lat: position[0], lng: position[1] }}
      draggable
      zIndex={1400}
      onDragEnd={(m) => {
        const p = m.getPosition();
        onVertexDragEnd(index, p.getLat(), p.getLng());
      }}
      infoWindowOptions={{ disableAutoPan: true }}
    >
      <div
        className="w-[9.5rem] space-y-1.5 rounded-xl px-2.5 py-2 text-xs"
        style={{
          background: "rgba(7,20,40,0.96)",
          border: "1px solid rgba(45,212,191,0.38)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        <p className="text-[11px] font-bold text-teal-300">경유지 {index + 1}</p>
        <div className="grid grid-cols-[2rem_1fr] items-center gap-x-1.5 gap-y-1">
          <span className="text-[10px] text-white/45">위도</span>
          <input
            type="text"
            value={laStr}
            onChange={(ev) => setLaStr(ev.target.value)}
            className="w-full rounded border px-1 py-0.5 font-mono text-[10px] text-cyan-100 outline-none [color-scheme:dark]"
            style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(64,224,208,0.25)" }}
            spellCheck={false}
          />
          <span className="text-[10px] text-white/45">경도</span>
          <input
            type="text"
            value={lnStr}
            onChange={(ev) => setLnStr(ev.target.value)}
            className="w-full rounded border px-1 py-0.5 font-mono text-[10px] text-cyan-100 outline-none [color-scheme:dark]"
            style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(64,224,208,0.25)" }}
            spellCheck={false}
          />
        </div>
        <div className="flex gap-1.5 pt-0.5">
          <button
            type="button"
            className="flex-1 rounded bg-teal-600/80 py-1 text-[10px] font-bold text-white hover:bg-teal-500/90"
            onClick={() => {
              const la = parseFloat(laStr.replace(",", "."));
              const ln = parseFloat(lnStr.replace(",", "."));
              if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
              onVertexCoordsApply(index, la, ln);
            }}
          >
            적용
          </button>
          <button
            type="button"
            className="flex-1 rounded border border-rose-500/40 bg-rose-900/30 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-800/40"
            onClick={() => onVertexRemove(index)}
          >
            삭제
          </button>
        </div>
      </div>
    </MapMarker>
  );
}

function VesselOverlay({
  vessel,
  variant,
  seedingActive,
}: {
  vessel: { lat: number; lng: number; heading: number };
  variant: "ship" | "gpsDot";
  seedingActive: boolean;
}) {
  const pinCls =
    variant === "gpsDot"
      ? seedingActive
        ? "marine-gps-ownship-pin marine-gps-ownship-pin--seeding"
        : "marine-gps-ownship-pin"
      : seedingActive
        ? "marine-vessel-pin marine-vessel-pin--seeding"
        : "marine-vessel-pin";
  const wrapCls = variant === "gpsDot" ? "marine-gps-ownship-divicon" : "marine-vessel-divicon";
  const innerCls = variant === "gpsDot" ? "marine-gps-ownship-signals" : "marine-vessel-signals";
  const ringTag = variant === "gpsDot" ? "marine-gps-ownship-ring" : "marine-vessel-signal-ring";
  const hullCls = variant === "gpsDot" ? "marine-gps-ownship-hull" : "marine-vessel-hull";

  const html = useMemo(
    () =>
      `<div class="${wrapCls}"><div class="${pinCls}" style="transform:rotate(${vessel.heading}deg)"><div class="${innerCls}" aria-hidden="true"><span class="${ringTag}"></span><span class="${ringTag}"></span><span class="${ringTag}"></span></div><div class="${hullCls}"></div></div></div>`,
    [vessel.heading, pinCls, wrapCls, innerCls, ringTag, hullCls],
  );

  return (
    <CustomOverlayMap position={{ lat: vessel.lat, lng: vessel.lng }} yAnchor={0.5} xAnchor={0.5} zIndex={800}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </CustomOverlayMap>
  );
}

function DropOverlay({ d }: { d: MarineLeafletDrop }) {
  const r = d.highlight ? 9 : 6;
  return (
    <CustomOverlayMap position={{ lat: d.lat, lng: d.lng }} xAnchor={0} yAnchor={0.5} zIndex={500}>
      <div
        className="flex items-center gap-1.5"
        style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
      >
        <span
          style={{
            width: r * 2,
            height: r * 2,
            borderRadius: 9999,
            background: d.fill,
            border: `${d.highlight ? 2.2 : 1.4}px solid ${d.stroke}`,
            boxShadow: "0 1px 6px rgba(0,0,0,.45)",
            flexShrink: 0,
          }}
        />
        <span
          className="rounded border border-white/20 bg-[#041c2e]/95 px-2 py-0.5 font-mono text-[10px] font-bold text-white/90 shadow-lg"
          style={{ borderColor: "rgba(255,255,255,0.2)" }}
        >
          {d.label}
        </span>
      </div>
    </CustomOverlayMap>
  );
}

export function MarineKakaoMap({ appkey, ...props }: Props) {
  const [, loadErr] = useKakaoLoader({ appkey });
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const {
    className = "",
    basemap: _basemap,
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
    maxBounds,
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
  } = props;

  void _basemap;

  /** 카카오 ROADMAP: 작은 level = 확대. 운영구역 제한 시 확대/축소 한계. */
  const kakaoMinInLevel = maxBounds != null ? 2 : 1;
  const kakaoMaxOutLevel = maxBounds != null ? 12 : 14;
  /** react-kakao-maps-sdk Map.js 가 setMinLevel(maxLevel prop)·setMaxLevel(minLevel prop) 로 넘겨 순서가 뒤집혀 있음 → 교차 전달 */
  const mapPropMinLevel = kakaoMaxOutLevel;
  const mapPropMaxLevel = kakaoMinInLevel;

  const planned = plannedSeedMarkers ?? [];

  const fitPoints = useMemo(() => {
    const lte = ltePathLatLng ?? [];
    const replay = replayTrackPathLatLng ?? [];
    const plans = planMarkers ?? [];
    const planSeeds = planned.map(([la, ln]) => [la, ln] as [number, number]);
    type Pt = [number, number];
    if (scheduleFocusFit && plans.length > 0) {
      const raw: Pt[] = [
        [vessel.lat, vessel.lng],
        ...plans.map((p) => [p.lat, p.lng] as Pt),
      ];
      const k = filterPointsNearKorea(raw);
      return k.length > 0 ? k : [opsCenterTuple() as Pt];
    }
    if (hideVesselMarker && !fitToVesselOnly) {
      const raw: Pt[] = [
        ...drops.map((d) => [d.lat, d.lng] as Pt),
        ...pathLatLng,
        ...lte,
        ...replay,
        ...planSeeds,
      ];
      const k = filterPointsNearKorea(raw);
      return k.length > 0 ? k : [opsCenterTuple() as Pt];
    }
    if (fitToVesselOnly) {
      const raw: Pt[] = [
        [vessel.lat, vessel.lng],
        ...pathLatLng,
        ...lte,
        ...replay,
        ...planSeeds,
      ];
      const k = filterPointsNearKorea(raw);
      return k.length > 0 ? k : [opsCenterTuple() as Pt];
    }
    const raw: Pt[] = [
      [vessel.lat, vessel.lng],
      ...drops.map((d) => [d.lat, d.lng] as Pt),
      ...pathLatLng,
      ...lte,
      ...replay,
      ...(planMarkers ?? []).map((p) => [p.lat, p.lng] as Pt),
      ...planSeeds,
    ];
    const k = filterPointsNearKorea(raw);
    return k.length > 0 ? k : [opsCenterTuple() as Pt];
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

  const lastFitNonceRef = useRef(-999);
  const fitPointsRef = useRef(fitPoints);
  fitPointsRef.current = fitPoints;

  useEffect(() => {
    if (!map) return;
    if (lastFitNonceRef.current === fitNonce) return;
    lastFitNonceRef.current = fitNonce;
    const raf = requestAnimationFrame(() => {
      const pts = fitPointsRef.current;
      const m = map;
      (m as unknown as { relayout?: () => void }).relayout?.();
      if (pts.length === 0) {
        const o = opsCenterTuple();
        m.setCenter(new kakao.maps.LatLng(o[0], o[1]));
        m.setLevel(pseudoLeafletZoomToKakao(15), { animate: false });
        return;
      }
      if (pts.length === 1) {
        const [lat, lng] = pts[0];
        m.setCenter(new kakao.maps.LatLng(lat, lng));
        m.setLevel(pseudoLeafletZoomToKakao(15), { animate: false });
      } else {
        const b = new kakao.maps.LatLngBounds();
        for (const [la, ln] of pts) {
          b.extend(new kakao.maps.LatLng(la, ln));
        }
        m.setBounds(b, 2, 2, 2, 2);
      }
      const extra = Math.max(0, Math.min(4, postFitZoomLevels));
      if (extra > 0) {
        m.setLevel(Math.max(kakaoMinInLevel, m.getLevel() - extra), { animate: false });
      }
      onMapZoomLevel?.(kakaoLevelToPseudoLeaflet(m.getLevel()));
    });
    return () => cancelAnimationFrame(raf);
  }, [fitNonce, map, postFitZoomLevels, onMapZoomLevel, kakaoMinInLevel]);

  const lastInRef = useRef(0);
  const lastOutRef = useRef(0);
  useEffect(() => {
    if (!map) return;
    const d = mapZoomInNonce - lastInRef.current;
    lastInRef.current = mapZoomInNonce;
    if (d > 0) {
      const next = Math.max(kakaoMinInLevel, map.getLevel() - d);
      map.setLevel(next, { animate: true });
    }
    onMapZoomLevel?.(kakaoLevelToPseudoLeaflet(map.getLevel()));
  }, [mapZoomInNonce, map, onMapZoomLevel, kakaoMinInLevel]);

  useEffect(() => {
    if (!map) return;
    const d = mapZoomOutNonce - lastOutRef.current;
    lastOutRef.current = mapZoomOutNonce;
    if (d > 0) {
      const next = Math.min(kakaoMaxOutLevel, map.getLevel() + d);
      map.setLevel(next, { animate: true });
    }
    onMapZoomLevel?.(kakaoLevelToPseudoLeaflet(map.getLevel()));
  }, [mapZoomOutNonce, map, onMapZoomLevel, kakaoMaxOutLevel]);

  const prevVesselRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!map || !panMapToVesselOnMove) return;
    if (!Number.isFinite(vessel.lat) || !Number.isFinite(vessel.lng)) return;
    const p = prevVesselRef.current;
    if (p && p.lat === vessel.lat && p.lng === vessel.lng) return;
    prevVesselRef.current = { lat: vessel.lat, lng: vessel.lng };
    map.panTo(new kakao.maps.LatLng(vessel.lat, vessel.lng));
  }, [map, panMapToVesselOnMove, vessel.lat, vessel.lng]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !map) return;
    const ro = new ResizeObserver(() => {
      (map as unknown as { relayout?: () => void }).relayout?.();
    });
    ro.observe(el);
    (map as unknown as { relayout?: () => void }).relayout?.();
    const t1 = window.setTimeout(() => (map as unknown as { relayout?: () => void }).relayout?.(), 50);
    const t2 = window.setTimeout(() => (map as unknown as { relayout?: () => void }).relayout?.(), 300);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [map]);

  const onMapClick = useCallback(
    (_: kakao.maps.Map, me: kakao.maps.event.MouseEvent) => {
      const ll = me.latLng;
      const la = ll.getLat();
      const ln = ll.getLng();
      if (replayTrackVertexEditor) replayTrackVertexEditor.onMapClick(la, ln);
      else if (seedPlanMapEditor) seedPlanMapEditor.onMapClick(la, ln);
    },
    [replayTrackVertexEditor, seedPlanMapEditor],
  );

  /**
   * onCreate 를 인라인 함수로 넘기면 react-kakao-maps-sdk Map.js 가
   * useIsomorphicLayoutEffect([map, onCreate]) 로 감시하다가
   * 렌더마다 새 함수 참조가 생겨 onCreate(map) 을 재호출 → setLevel(초기값) 리셋.
   * useCallback([]) 으로 참조를 고정해 최초 1회만 실행되도록 한다.
   */
  const disableScrollWheelZoomRef = useRef(disableScrollWheelZoom);
  disableScrollWheelZoomRef.current = disableScrollWheelZoom;

  const handleMapCreate = useCallback((m: kakao.maps.Map) => {
    m.setLevel(pseudoLeafletZoomToKakao(16), { animate: false });
    if (disableScrollWheelZoomRef.current) {
      m.setZoomable(false);
    }
    setMap(m);
  }, []); // 빈 deps — 카카오 지도 인스턴스 최초 생성 시 1회만 실행

  /** disableScrollWheelZoom prop 이 런타임에 바뀌면 별도 effect 로 반영 */
  useEffect(() => {
    if (!map) return;
    map.setZoomable(!disableScrollWheelZoom);
  }, [map, disableScrollWheelZoom]);

  if (loadErr) {
    return (
      <div
        className={`flex h-full min-h-[200px] w-full items-center justify-center rounded border border-amber-500/40 bg-[#0a1628] px-3 text-center text-[12px] text-amber-100 ${className}`}
      >
        카카오 지도를 불러오지 못했습니다. 앱 키·도메인(플랫폼) 등록을 확인하세요.
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`marine-ops-map-root z-0 flex h-full w-full min-h-[200px] flex-col ${className}`}
    >
      <div className="relative min-h-0 flex-1" style={{ minHeight: 200 }}>
        {/*
         * level/zoomable/scrollwheel prop 을 Map 컴포넌트에 넘기면 react-kakao-maps-sdk 가
         * 매 렌더마다 setLevel / setZoomable / setScrollwheel 을 호출해 외부 zoom 제어를 덮어씀.
         * 초기 설정은 onCreate 에서 1회만 직접 호출.
         */}
        <Map
          center={{ lat: center[0], lng: center[1] }}
          style={{ width: "100%", height: "100%", minHeight: 200 }}
          mapTypeId="ROADMAP"
          onCreate={handleMapCreate}
          onZoomChanged={(m) => onMapZoomLevel?.(kakaoLevelToPseudoLeaflet(m.getLevel()))}
          onClick={replayTrackVertexEditor || seedPlanMapEditor ? onMapClick : undefined}
        >
          {pathLatLng.length > 1 ? (
            <Polyline
              path={pathLatLng.map(([la, ln]) => ({ lat: la, lng: ln }))}
              strokeWeight={2}
              strokeColor="#40E0D0"
              strokeOpacity={0.55}
              strokeStyle="shortdash"
              zIndex={2}
            />
          ) : null}

          {ltePathLatLng.length > 1 ? (
            <Polyline
              path={ltePathLatLng.map(([la, ln]) => ({ lat: la, lng: ln }))}
              strokeWeight={3}
              strokeColor="#fb923c"
              strokeOpacity={0.88}
              zIndex={3}
            />
          ) : null}

          {replayTrackPathLatLng.length > 1 ? (
            <Polyline
              path={replayTrackPathLatLng.map(([la, ln]) => ({ lat: la, lng: ln }))}
              strokeWeight={3}
              strokeColor="#d946ef"
              strokeOpacity={0.9}
              strokeStyle="shortdash"
              zIndex={3}
            />
          ) : null}

          {replayNavGuideLine ? (
            <Polyline
              path={[
                { lat: replayNavGuideLine.from[0], lng: replayNavGuideLine.from[1] },
                { lat: replayNavGuideLine.to[0], lng: replayNavGuideLine.to[1] },
              ]}
              strokeWeight={3}
              strokeColor="#fef08a"
              strokeOpacity={0.92}
              strokeStyle="longdash"
              zIndex={4}
            />
          ) : null}

          {drops.map((d) => (
            <DropOverlay key={d.id} d={d} />
          ))}

          {replayTrackShowVertexMarkers && replayTrackPathLatLng.length > 1
            ? replayTrackPathLatLng.map(([la, ln], i) => {
                const hi = replayTrackHighlightVertexIndex === i;
                return (
                  <CustomOverlayMap
                    key={`replay-vtx-${i}`}
                    position={{ lat: la, lng: ln }}
                    xAnchor={0.5}
                    yAnchor={0.5}
                    zIndex={600}
                  >
                    <div
                      title={`WPT${i + 1}`}
                      style={{
                        width: hi ? 18 : 10,
                        height: hi ? 18 : 10,
                        borderRadius: 9999,
                        background: hi ? "#f59e0b" : "#86198f",
                        border: `${hi ? 3 : 1.4}px solid ${hi ? "#fbbf24" : "#c026d3"}`,
                        boxShadow: "0 1px 6px rgba(0,0,0,.5)",
                        pointerEvents: "none",
                      }}
                    />
                  </CustomOverlayMap>
                );
              })
            : null}

          {(planMarkers ?? []).map((p, i) => (
            <CustomOverlayMap
              key={`plan-${p.label}-${i}`}
              position={{ lat: p.lat, lng: p.lng }}
              xAnchor={0.5}
              yAnchor={1}
              zIndex={550}
            >
              <div
                className="rounded border border-cyan-400/40 bg-[#041c2e]/95 px-2 py-0.5 text-[10px] font-bold text-cyan-100 shadow-lg"
                style={{ pointerEvents: "none" }}
              >
                {p.label}
              </div>
            </CustomOverlayMap>
          ))}

          {planned.map(([la, ln], i) => (
            <CustomOverlayMap
              key={`plan-seed-${i}-${la.toFixed(5)}-${ln.toFixed(5)}`}
              position={{ lat: la, lng: ln }}
              xAnchor={0.5}
              yAnchor={0.5}
              zIndex={520}
            >
              <div
                title={`예정 ${i + 1}`}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 9999,
                  background: "#bef264",
                  border: "1.6px solid #3f6212",
                  pointerEvents: "none",
                }}
              />
            </CustomOverlayMap>
          ))}

          {hideVesselMarker ? null : (
            <VesselOverlay vessel={vessel} variant={vesselMarkerVariant} seedingActive={vesselSeedingActive} />
          )}

          {remoteVessels.map((rv) => (
            <CustomOverlayMap
              key={`rv-${rv.id}`}
              position={{ lat: rv.lat, lng: rv.lng }}
              xAnchor={0.5}
              yAnchor={0.5}
              zIndex={700}
            >
              <div className="flex flex-col items-center" style={{ pointerEvents: "auto" }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9999,
                    background: "#fb923c",
                    border: "2px solid #f97316",
                    boxShadow: "0 2px 8px rgba(0,0,0,.4)",
                  }}
                />
                <span
                  className="mt-0.5 font-bold text-[10px] text-orange-500 drop-shadow"
                  style={{ textShadow: "0 0 4px #000" }}
                >
                  {rv.label ?? rv.id}
                </span>
              </div>
            </CustomOverlayMap>
          ))}

          {replayTrackVertexEditor
            ? replayTrackVertexEditor.vertices.map(([la, ln], i) => (
                <KakaoWaypointEditorMarker
                  key={`rwpt-ed-${i}`}
                  index={i}
                  position={[la, ln]}
                  onVertexDragEnd={replayTrackVertexEditor.onVertexDragEnd}
                  onVertexRemove={replayTrackVertexEditor.onVertexRemove}
                  onVertexCoordsApply={replayTrackVertexEditor.onVertexCoordsApply}
                />
              ))
            : null}
        </Map>
      </div>
    </div>
  );
}
