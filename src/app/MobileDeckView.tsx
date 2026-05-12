/**
 * 함정·현장용 초간단 모바일 화면 — 지도에 내 위치, 살포 시작/중지·AI·안전·금일 건수만.
 * 로그인 후: URL이 `/mobile` 이거나 가로 768px 미만이면 자동으로 이 화면.
 * 관제 대시보드와 `ship_command_logs` / BroadcastChannel 으로 살포 신호 동기.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, Tooltip, useMap } from "react-leaflet";
import * as L from "leaflet";
import {
  Brain,
  CircleSlash,
  Droplets,
  LocateFixed,
  Play,
  ShieldAlert,
  Sprout,
  Trash2,
} from "lucide-react";
import { OPS_AREA_CENTER } from "./geo/koreaOpsArea";
import { AiTicker } from "./components/AiTicker";
import { TILE_ATTR, TILE_CARTO_DARK } from "./components/MarineLeafletMap";
import {
  insertShipCommand,
  marineDbEnabled,
  fetchSeedDropRecords,
  subscribeShipCommandInserts,
  upsertSeedDropRecord,
  deleteSeedDropRecord,
  type SeedDropInput,
} from "@/lib/marine-db";
import { MARINE_OPS_SIGNAL_BC } from "@/lib/marine-ops-signals";
import { parseTestStyleDropLabel, seedDropMarkerColors } from "@/lib/seed-drop-visual";
import {
  assessEmergency,
  buildDeparturePlan,
  fetchKmaForecast,
  generateMockForecast,
  isKmaApiConfigured,
  pickCurrentOrNextKmaSlot,
  sortKmaSlotsByTime,
  estimatedVisibilityKmFromSlot,
  type SlotScore,
} from "@/lib/kma-weather";
import { analyzeWeatherWithGroq, isGroqConfigured } from "@/lib/groq-weather";
import { buildLocalWorkRecommendation } from "@/lib/work-recommendation";
import { endOfDayMs, startOfDayMs, ymdLocal } from "@/lib/seeding-day-eval";

const VESSEL_DEFAULT = "제3해양살포함";

function vesselLteIdFromEnv(): string {
  const v = import.meta.env.VITE_VESSEL_LTE_ID?.trim();
  return v && v.length > 0 ? v : VESSEL_DEFAULT;
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "위치 권한이 거부되었습니다. 주소창 왼쪽에서 위치를 허용해 주세요.";
    case err.POSITION_UNAVAILABLE:
      return "위치를 확인할 수 없습니다. GPS·실내에서는 창가로 이동해 보세요.";
    case err.TIMEOUT:
      return "위치 요청 시간이 초과되었습니다. 다시 눌러 주세요.";
    default:
      return err.message || "위치 정보를 가져오지 못했습니다.";
  }
}

function fmtDropTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

/** Geolocation API 는 보안 컨텍스트(HTTPS·localhost)에서만 동작 */
function canUseBrowserGeolocation(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!navigator.geolocation) return false;
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function posFromGeolocationCoords(c: GeolocationCoordinates): {
  lat: number;
  lng: number;
  heading: number;
} {
  const h = c.heading;
  const heading = typeof h === "number" && !Number.isNaN(h) ? h : 0;
  return { lat: c.latitude, lng: c.longitude, heading };
}

function MapFollowUser({
  lat,
  lng,
  zoom,
  recenterNonce,
}: {
  lat: number;
  lng: number;
  zoom: number;
  recenterNonce: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), zoom), { animate: true });
  }, [lat, lng, zoom, map, recenterNonce]);
  return null;
}

export default function MobileDeckView() {
  const [pos, setPos] = useState<{ lat: number; lng: number; heading: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [seedingActive, setSeedingActive] = useState(false);
  const [sending, setSending] = useState(false);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [level, setLevel] = useState<"안전" | "주의" | "긴급">("안전");
  const [levelMsg, setLevelMsg] = useState("불러오는 중…");
  const [triggerLines, setTriggerLines] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  /** 버튼으로 즉시 재측정·지도 재맞춤(좌표 동일해도 pan 되도록 nonce) */
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [locating, setLocating] = useState(false);
  const [slotScores, setSlotScores] = useState<SlotScore[]>([]);
  const [tickerEnv, setTickerEnv] = useState({ wind: 0, wave: 0, temp: 18 });
  const [groqSummary, setGroqSummary] = useState("");
  const groqTickerLastRef = useRef(0);
  const firstGpsCenterRef = useRef(false);
  /** 함정 화면에서 센서 트리거 시뮬 시 라벨 순번 (세션 단위) */
  const manualDropSeqRef = useRef(0);
  const [sessionDrops, setSessionDrops] = useState<SeedDropInput[]>([]);
  const [dropToast, setDropToast] = useState<string | null>(null);
  const [dropBusy, setDropBusy] = useState(false);

  const center = useMemo<[number, number]>(
    () => (pos ? [pos.lat, pos.lng] : [OPS_AREA_CENTER.lat, OPS_AREA_CENTER.lng]),
    [pos],
  );

  const weatherNowcastNote = useMemo(() => {
    if (isKmaApiConfigured()) return "지금: 단기예보 동기화(주기 갱신)";
    return "지금: 목업(API 미설정)";
  }, []);

  const nowSlotForRec = useMemo(() => {
    if (slotScores.length === 0) return null;
    return pickCurrentOrNextKmaSlot(slotScores.map((s) => s.slot));
  }, [slotScores]);

  const workLocalRec = useMemo(
    () =>
      buildLocalWorkRecommendation(slotScores, level, tickerEnv.wind, tickerEnv.wave, {
        tempC: tickerEnv.temp,
        popPct: nowSlotForRec?.pop,
        ptyCode: nowSlotForRec?.ptyCode,
      }),
    [slotScores, level, tickerEnv, nowSlotForRec],
  );

  const refreshTodayCount = useCallback(async () => {
    if (!marineDbEnabled()) {
      setTodayCount(null);
      return;
    }
    const ymd = ymdLocal(new Date());
    const t0 = startOfDayMs(ymd);
    const t1 = endOfDayMs(ymd);
    const rows = await fetchSeedDropRecords(400);
    if (!rows) {
      setTodayCount(null);
      return;
    }
    setTodayCount(rows.filter((r) => r.recordedAt >= t0 && r.recordedAt <= t1 && r.status === "성공").length);
  }, []);

  const refreshSafety = useCallback(async () => {
    let slots = await fetchKmaForecast();
    if (!slots?.length) slots = sortKmaSlotsByTime(generateMockForecast());
    else slots = sortKmaSlotsByTime(slots);
    if (!slots.length) {
      setSlotScores([]);
      setLevel("안전");
      setLevelMsg("예보 없음");
      setTriggerLines("");
      return;
    }
    const plan = buildDeparturePlan(slots);
    setSlotScores(plan.allScores);
    const now = pickCurrentOrNextKmaSlot(slots);
    if (!now) {
      setLevel("안전");
      setLevelMsg("예보 없음");
      setTriggerLines("");
      return;
    }
    setTickerEnv({ wind: now.windSpeed, wave: now.waveHeight, temp: now.temp });
    const a = assessEmergency({
      windSpeed: now.windSpeed,
      windDir: now.windDir,
      waveHeight: now.waveHeight,
      ptyCode: now.ptyCode,
      pcp: now.pcp,
      temp: now.temp,
      pop: now.pop,
      sky: now.sky,
    });
    setLevel(a.level);
    setLevelMsg(a.message);
    setTriggerLines(a.triggers.length ? a.triggers.join(" · ") : "특이 조건 없음");
  }, []);

  /** 관제 Dashboard 와 유사: 먼저 한 번 고정밀 조회 후 watch — 모바일 첫 위치·권한에 유리 */
  useEffect(() => {
    if (!canUseBrowserGeolocation()) {
      setGeoErr(
        typeof navigator !== "undefined" && navigator.geolocation
          ? "위치 기능은 HTTPS 또는 localhost 에서만 동작합니다."
          : "이 브라우저는 위치 정보를 지원하지 않습니다.",
      );
      return;
    }
    let cancelled = false;
    const applyCoords = (c: GeolocationCoordinates) => {
      if (cancelled) return;
      setGeoErr(null);
      setPos(posFromGeolocationCoords(c));
      if (!firstGpsCenterRef.current) {
        firstGpsCenterRef.current = true;
        setRecenterNonce((n) => n + 1);
      }
    };
    const onErr = (e: GeolocationPositionError) => {
      if (cancelled) return;
      setGeoErr(geolocationErrorMessage(e));
    };

    navigator.geolocation.getCurrentPosition(
      (p) => applyCoords(p.coords),
      onErr,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 45_000 },
    );

    const watchId = navigator.geolocation.watchPosition(
      (p) => applyCoords(p.coords),
      onErr,
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 60_000 },
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const requestLocateNow = useCallback(() => {
    if (!canUseBrowserGeolocation()) {
      setGeoErr(
        typeof navigator !== "undefined" && navigator.geolocation
          ? "위치 기능은 HTTPS 또는 localhost 에서만 동작합니다."
          : "이 기기에서는 위치를 사용할 수 없습니다.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeoErr(null);
        setPos(posFromGeolocationCoords(p.coords));
        setRecenterNonce((n) => n + 1);
        setLocating(false);
      },
      (e) => {
        setGeoErr(geolocationErrorMessage(e));
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 45_000 },
    );
  }, []);

  useEffect(() => {
    void refreshTodayCount();
    const id = window.setInterval(() => void refreshTodayCount(), 45_000);
    return () => window.clearInterval(id);
  }, [refreshTodayCount]);

  useEffect(() => {
    void refreshSafety();
    const id = window.setInterval(() => void refreshSafety(), 60_000);
    return () => window.clearInterval(id);
  }, [refreshSafety]);

  /** 관제 상단과 동일 — Groq 요약을 자막 티커에 반영 */
  useEffect(() => {
    if (!isGroqConfigured()) {
      setGroqSummary("");
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const t = Date.now();
      if (t - groqTickerLastRef.current < 8000) return;
      let slots = await fetchKmaForecast();
      if (!slots?.length) slots = sortKmaSlotsByTime(generateMockForecast());
      else slots = sortKmaSlotsByTime(slots);
      const src = pickCurrentOrNextKmaSlot(slots);
      if (!src || cancelled) return;
      groqTickerLastRef.current = Date.now();
      const assessment = assessEmergency({
        windSpeed: src.windSpeed,
        windDir: src.windDir,
        waveHeight: src.waveHeight,
        ptyCode: src.ptyCode,
        pcp: src.pcp,
        temp: src.temp,
        pop: src.pop,
        sky: src.sky,
      });
      const vis = estimatedVisibilityKmFromSlot(src);
      try {
        const rep = await analyzeWeatherWithGroq({
          windSpeed: src.windSpeed,
          waveHeight: src.waveHeight,
          temp: src.temp,
          pop: src.pop,
          visibility: vis,
          assessment,
          minutesToDanger: null,
          nowcastContext: weatherNowcastNote,
        });
        if (!cancelled && rep) setGroqSummary(rep.summary);
      } catch {
        /* 틱 실패는 조용히 무시 */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [weatherNowcastNote]);

  useEffect(() => {
    const apply = (cmd: string) => {
      if (cmd === "seed_start") setSeedingActive(true);
      if (cmd === "seed_stop") setSeedingActive(false);
    };
    if (marineDbEnabled()) return subscribeShipCommandInserts(apply);
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(MARINE_OPS_SIGNAL_BC);
    const onMsg = (ev: MessageEvent<{ cmd?: string }>) => {
      const c = ev.data?.cmd;
      if (typeof c === "string") apply(c);
    };
    bc.addEventListener("message", onMsg);
    return () => {
      bc.removeEventListener("message", onMsg);
      bc.close();
    };
  }, []);

  const sendCmd = useCallback(async (cmd: "seed_start" | "seed_stop") => {
    if (sending) return;
    setSending(true);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const vesselId = vesselLteIdFromEnv();
    try {
      if (marineDbEnabled()) {
        await insertShipCommand({ id, vesselId, cmd });
      } else if (typeof BroadcastChannel !== "undefined") {
        new BroadcastChannel(MARINE_OPS_SIGNAL_BC).postMessage({ cmd });
      }
      if (cmd === "seed_start") setSeedingActive(true);
      if (cmd === "seed_stop") setSeedingActive(false);
    } finally {
      window.setTimeout(() => setSending(false), 400);
    }
  }, [sending]);

  /** 살포 중일 때만 — 현재 GPS 좌표에 센서 1회 트리거와 동일하게 1건 기록·지도 표시 */
  const recordManualSensorDrop = useCallback(async () => {
    if (dropBusy || !pos || !seedingActive) return;
    setDropBusy(true);
    try {
      const recordedAt = Date.now();
      manualDropSeqRef.current += 1;
      const seq = manualDropSeqRef.current;
      const ymd = ymdLocal(new Date(recordedAt));
      const jitter = () => (Math.random() - 0.5) * 0.00006;
      const newDrop: SeedDropInput = {
        id: `mob-${recordedAt}-${seq}`,
        label: `${ymd} T${String(seq).padStart(2, "0")}`,
        time: fmtDropTime(new Date(recordedAt)),
        lat: parseFloat((pos.lat + jitter()).toFixed(6)),
        lng: parseFloat((pos.lng + jitter()).toFixed(6)),
        status: "성공",
        recordedAt,
      };
      setSessionDrops((prev) => [...prev, newDrop].slice(-60));
      if (marineDbEnabled()) {
        const ok = await upsertSeedDropRecord(newDrop);
        void refreshTodayCount();
        setDropToast(
          ok
            ? `1건 기록 · ${newDrop.label}`
            : `지도에는 표시됨 · 서버 저장 실패 · ${newDrop.label}`,
        );
      } else {
        setDropToast(`1건(로컬 시연) · ${newDrop.label}`);
      }
      window.setTimeout(() => setDropToast(null), 3500);
    } finally {
      window.setTimeout(() => setDropBusy(false), 320);
    }
  }, [dropBusy, pos, seedingActive, refreshTodayCount]);

  const removeSessionDrop = useCallback(
    async (d: SeedDropInput) => {
      if (marineDbEnabled()) {
        const ok = await deleteSeedDropRecord(d.id);
        if (!ok) {
          setDropToast("서버에서 삭제하지 못했습니다.");
          window.setTimeout(() => setDropToast(null), 2800);
          return;
        }
        void refreshTodayCount();
      }
      setSessionDrops((prev) => prev.filter((x) => x.id !== d.id));
    },
    [refreshTodayCount],
  );

  const runAiBrief = useCallback(async () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiText("");
    try {
      let slots = await fetchKmaForecast();
      if (!slots?.length) slots = sortKmaSlotsByTime(generateMockForecast());
      const now = pickCurrentOrNextKmaSlot(slots);
      if (!now) {
        setAiText("예보를 불러오지 못했습니다.");
        return;
      }
      const assessment = assessEmergency({
        windSpeed: now.windSpeed,
        windDir: now.windDir,
        waveHeight: now.waveHeight,
        ptyCode: now.ptyCode,
        pcp: now.pcp,
        temp: now.temp,
        pop: now.pop,
        sky: now.sky,
      });
      const vis = estimatedVisibilityKmFromSlot(now);
      if (!isGroqConfigured()) {
        setAiText(
          `${assessment.level}: ${assessment.message}\n풍 ${now.windSpeed.toFixed(1)}m/s · 파고 ${now.waveHeight.toFixed(1)}m · 기온 ${now.temp.toFixed(0)}°C\n(Groq 미설정 — 키 없으면 위 요약만 표시)`,
        );
        return;
      }
      const rep = await analyzeWeatherWithGroq({
        windSpeed: now.windSpeed,
        waveHeight: now.waveHeight,
        temp: now.temp,
        pop: now.pop,
        visibility: vis,
        assessment,
        minutesToDanger: null,
        nowcastContext: weatherNowcastNote,
      });
      setAiText(
        rep
          ? `${rep.summary}\n\n${rep.detail}\n\n권고: ${rep.action}`
          : `${assessment.level}: ${assessment.message}`,
      );
      if (rep) setGroqSummary(rep.summary);
    } catch {
      setAiText("분석 중 오류가 났습니다.");
    } finally {
      setAiLoading(false);
    }
  }, [weatherNowcastNote]);

  const dangerUi =
    level === "긴급"
      ? { bg: "bg-red-600/95", ring: "ring-red-400/50", label: "지금 위험" }
      : level === "주의"
        ? { bg: "bg-amber-600/95", ring: "ring-amber-300/50", label: "주의" }
        : { bg: "bg-emerald-800/90", ring: "ring-emerald-400/35", label: "양호" };

  /** 함교 패널 느낌 — 상단 스펙큘러 + 아이콘 베젤 */
  const padFrame =
    "group relative flex min-h-[58px] flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border px-2 py-2.5 text-center outline-none transition-[transform,box-shadow] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
  const padGloss =
    "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent";
  const padIconShell =
    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/12";

  const ownShipIcon = useMemo(() => {
    if (!pos) return null;
    const pinCls = seedingActive
      ? "marine-gps-ownship-pin marine-gps-ownship-pin--seeding"
      : "marine-gps-ownship-pin";
    return L.divIcon({
      className: "marine-gps-ownship-divicon",
      html: `<div class="${pinCls}" style="transform:rotate(${pos.heading}deg)"><div class="marine-gps-ownship-signals" aria-hidden="true"><span class="marine-gps-ownship-ring"></span><span class="marine-gps-ownship-ring"></span><span class="marine-gps-ownship-ring"></span></div><div class="marine-gps-ownship-hull"></div></div>`,
      iconSize: [32, 40],
      iconAnchor: [16, 20],
    });
  }, [pos, seedingActive]);

  return (
    <div className="flex h-svh min-h-0 flex-col bg-[#050f18] text-slate-100">
      <header
        className="flex shrink-0 items-center justify-between gap-2 border-b border-teal-500/20 px-3 py-2"
        style={{
          paddingTop: "max(0.5rem, env(safe-area-inset-top))",
          background: "linear-gradient(180deg, #0c2748 0%, #081b34 100%)",
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <img
            src="/logo.svg"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg object-contain"
            alt=""
            decoding="async"
            style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight tracking-tight text-white">
              해양 종자 살포 관제
            </p>
            <p className="truncate text-[10px] leading-tight text-slate-400">
              {vesselLteIdFromEnv()} · 함정
            </p>
          </div>
        </div>
        <a
          href="/"
          className="shrink-0 rounded-lg border border-teal-500/30 px-2 py-1 text-[11px] font-medium text-teal-200/90 hover:bg-teal-950/50"
        >
          관제 전체
        </a>
      </header>

      <AiTicker
        vesselName={vesselLteIdFromEnv()}
        safetyLevel={level}
        groqSummary={groqSummary}
        aiMsg={levelMsg}
        windSpeed={tickerEnv.wind}
        waveHeight={tickerEnv.wave}
        temp={tickerEnv.temp}
        attachmentCue={workLocalRec.attachmentTickerCue}
      />

      <div className="relative min-h-0 flex-1">
        <MapContainer
          center={center}
          zoom={pos ? 15 : 11}
          className="h-full w-full min-h-[40vh]"
          scrollWheelZoom
          attributionControl
        >
          <TileLayer attribution={TILE_ATTR} url={TILE_CARTO_DARK} />
          {sessionDrops.map((d, i) => {
            const isLast = i === sessionDrops.length - 1;
            const c = seedDropMarkerColors({
              recordedAt: d.recordedAt,
              label: d.label,
              id: d.id,
              verificationMismatch: d.verificationMismatch,
            });
            const parts = parseTestStyleDropLabel(d.label);
            return (
              <CircleMarker
                key={d.id}
                center={[d.lat, d.lng]}
                radius={isLast ? 10 : 7}
                pathOptions={{
                  color: c.stroke,
                  fillColor: c.fill,
                  fillOpacity: 0.9,
                  weight: isLast ? 2.2 : 1.4,
                }}
              >
                <Tooltip
                  permanent
                  direction="right"
                  offset={[12, 0]}
                  opacity={1}
                  className="!rounded-md !border !border-white/20 !bg-[#041c2e]/95 !px-2 !py-0.5 !text-[10px] !font-mono !font-bold !text-teal-100 !shadow-lg"
                >
                  {parts ? (
                    <span className="block whitespace-nowrap font-mono text-[10px] font-bold leading-tight">
                      {parts.displayLine}
                    </span>
                  ) : (
                    <span className="block whitespace-nowrap font-mono text-[10px] leading-tight">{d.label}</span>
                  )}
                </Tooltip>
              </CircleMarker>
            );
          })}
          {pos && ownShipIcon ? (
            <>
              <Marker position={[pos.lat, pos.lng]} icon={ownShipIcon} zIndexOffset={900} />
              <MapFollowUser lat={pos.lat} lng={pos.lng} zoom={15} recenterNonce={recenterNonce} />
            </>
          ) : null}
        </MapContainer>
        {geoErr ? (
          <div className="pointer-events-none absolute left-2 right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-center text-[11px] text-amber-200">
            위치: {geoErr}
          </div>
        ) : null}
        <div
          className={`pointer-events-none absolute left-2 right-2 top-12 flex justify-center sm:top-3 ${geoErr ? "" : ""}`}
        >
          <button
            type="button"
            onClick={() => {
              void refreshSafety();
              setDangerOpen(true);
            }}
            className={`pointer-events-auto max-w-[min(100%,20rem)] rounded-lg px-3 py-2 text-center text-xs font-bold text-white shadow-lg ring-2 ${dangerUi.bg} ${dangerUi.ring}`}
          >
            {dangerUi.label} — 탭하여 상세
            <p className="mt-1 line-clamp-2 text-[10px] font-normal leading-snug opacity-95">{levelMsg}</p>
          </button>
        </div>

        {dropToast ? (
          <div className="pointer-events-none absolute bottom-[5.5rem] left-1/2 z-[480] max-w-[min(92vw,22rem)] -translate-x-1/2 rounded-lg border border-teal-400/35 bg-[#041c2e]/95 px-3 py-2 text-center text-[11px] font-semibold text-teal-100 shadow-lg">
            {dropToast}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void requestLocateNow()}
          disabled={locating || !canUseBrowserGeolocation()}
          className="pointer-events-auto absolute bottom-3 right-3 z-[500] flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 rounded-2xl border border-teal-400/35 bg-[#071a2e]/95 px-3 py-2 text-[10px] font-bold text-teal-100 shadow-[inset_0_1px_0_rgba(167,243,208,0.12),0_8px_24px_-4px_rgba(0,0,0,0.5)] backdrop-blur-sm active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
          style={{ marginBottom: "max(0px, env(safe-area-inset-bottom, 0px))" }}
          aria-label="현재 위치 찾기 — GPS로 다시 맞춤"
        >
          <LocateFixed
            className={`h-5 w-5 shrink-0 text-cyan-300 ${locating ? "animate-pulse" : ""}`}
            aria-hidden
          />
          <span className="max-w-[4.5rem] leading-tight">
            {locating ? "잡는 중…" : "현재 위치 찾기"}
          </span>
        </button>
      </div>

      {sessionDrops.length > 0 ? (
        <div
          className="shrink-0 border-t border-teal-500/20 bg-[#050f18]/95 px-2 py-2"
          style={{ paddingLeft: "max(0.5rem, env(safe-area-inset-left))", paddingRight: "max(0.5rem, env(safe-area-inset-right))" }}
        >
          <p className="mb-1 text-[10px] font-semibold tracking-tight text-teal-200/85">기록 이력 (이 기기 세션)</p>
          <div className="max-h-[min(28vh,10.5rem)] space-y-1 overflow-y-auto overscroll-contain pr-0.5">
            {[...sessionDrops].reverse().map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-teal-500/15 bg-[#071422]/85 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  {(() => {
                    const p = parseTestStyleDropLabel(d.label);
                    if (p) {
                      return (
                        <>
                          <p className="truncate font-mono text-[10px] font-bold leading-snug text-teal-100">
                            {p.displayLine}
                          </p>
                          <p className="truncate text-[9px] text-slate-400">{d.time}</p>
                        </>
                      );
                    }
                    return (
                      <>
                        <p className="truncate font-mono text-[10px] font-bold text-teal-100">{d.label}</p>
                        <p className="truncate text-[9px] text-slate-400">{d.time}</p>
                      </>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() => void removeSessionDrop(d)}
                  title="이 건만 삭제"
                  aria-label={`${d.label} 삭제`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-500/35 text-rose-200/90 transition-colors hover:bg-rose-950/50 hover:text-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <section
        className="shrink-0 border-t border-teal-500/20 px-2 pt-2"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          background: "linear-gradient(0deg, #050f18 0%, #0a1f38 100%)",
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Sprout className="h-3.5 w-3.5 text-teal-400/80" aria-hidden />
            금일 살포
            <span className="font-mono font-bold text-teal-200">
              {todayCount == null ? (marineDbEnabled() ? "…" : "—") : `${todayCount}건`}
            </span>
          </span>
          {seedingActive ? (
            <span className="rounded-full bg-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
              살포 중
            </span>
          ) : (
            <span className="text-[10px] text-slate-500">대기</span>
          )}
        </div>

        <div className="rounded-2xl border border-teal-500/15 bg-gradient-to-b from-[#071422]/95 to-[#030910]/90 p-1.5 shadow-[inset_0_1px_0_rgba(45,212,191,0.06),0_0_0_1px_rgba(0,0,0,0.35)]">
          <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={sending || seedingActive}
            onClick={() => void sendCmd("seed_start")}
            className={`${padFrame} border-cyan-400/35 bg-gradient-to-b from-teal-900/55 via-emerald-950/70 to-[#020a0e] text-cyan-50 shadow-[inset_0_1px_0_rgba(167,243,208,0.14),0_0_0_1px_rgba(45,212,191,0.12),0_10px_28px_-10px_rgba(20,184,166,0.45)]`}
          >
            <span className={padGloss} aria-hidden />
            <span className={`${padIconShell} text-teal-300`}>
              <Play className="h-4 w-4 drop-shadow-[0_0_6px_rgba(45,212,191,0.6)]" fill="currentColor" aria-hidden />
            </span>
            <span className="text-[11px] font-black tracking-tight">살포 시작</span>
            <span className="text-[8px] font-semibold tracking-wide text-teal-300/55">작전 개시</span>
          </button>
          <button
            type="button"
            disabled={sending || !seedingActive}
            onClick={() => void sendCmd("seed_stop")}
            className={`${padFrame} border-slate-500/45 bg-gradient-to-b from-slate-800/75 via-slate-950/90 to-[#030508] text-slate-100 shadow-[inset_0_1px_0_rgba(148,163,184,0.08),0_8px_22px_-12px_rgba(0,0,0,0.65)]`}
          >
            <span className={padGloss} aria-hidden />
            <span className={`${padIconShell} text-slate-300 ring-rose-900/40`}>
              <CircleSlash className="h-4 w-4 text-rose-300/95" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="text-[11px] font-black tracking-tight">살포 중지</span>
            <span className="text-[8px] font-semibold tracking-wide text-slate-500">작전 정지</span>
          </button>
          <button
            type="button"
            onClick={() => void runAiBrief()}
            className={`${padFrame} border-indigo-400/30 bg-gradient-to-b from-indigo-950/70 via-[#0c1628] to-[#050a12] text-indigo-50 shadow-[inset_0_1px_0_rgba(165,180,252,0.12),0_0_0_1px_rgba(99,102,241,0.15),0_10px_26px_-8px_rgba(79,70,229,0.35)]`}
          >
            <span className={padGloss} aria-hidden />
            <span className={`${padIconShell} text-violet-300 ring-cyan-500/15`}>
              <Brain className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="text-[11px] font-black tracking-tight">AI 현재 상황</span>
            <span className="text-[8px] font-semibold tracking-wide text-violet-300/50">기상·해역 요약</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void refreshSafety();
              setDangerOpen(true);
            }}
            className={`${padFrame} border-white/10 py-2.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-2 ring-inset ${dangerUi.bg} ${dangerUi.ring}`}
          >
            <span className={padGloss} aria-hidden />
            <span className={`${padIconShell} bg-black/25 text-white`}>
              <ShieldAlert className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="text-[11px] font-black tracking-tight">지금 위험</span>
            <span className="text-[8px] font-semibold tracking-wide text-white/60">안전 감시</span>
          </button>
          </div>
          <button
            type="button"
            disabled={dropBusy || !seedingActive || !pos}
            title={
              !pos
                ? "현재 위치가 잡혀야 기록 지점을 찍을 수 있습니다."
                : !seedingActive
                  ? "살포 중일 때만 센서 트리거를 시뮬할 수 있습니다."
                  : "현재 GPS 위치에 살포 1건을 기록합니다(센서 1회 트리거와 동일)."
            }
            onClick={() => void recordManualSensorDrop()}
            className="group relative mt-2.5 flex min-h-[52px] w-full flex-row items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/80 via-[#052018] to-[#020807] px-3 py-2.5 text-emerald-50 shadow-[inset_0_1px_0_rgba(167,243,208,0.12),0_8px_24px_-8px_rgba(16,185,129,0.38)] outline-none transition-[transform,box-shadow] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
          >
            <span className={padGloss} aria-hidden />
            <span className={`${padIconShell} shrink-0 text-emerald-300`}>
              <Droplets className="h-4 w-4 drop-shadow-[0_0_6px_rgba(52,211,153,0.55)]" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0 flex flex-col items-start gap-0.5 text-left">
              <span className="text-[12px] font-black tracking-tight">센서 시뮬 1건</span>
              <span className="text-[8px] font-semibold text-emerald-300/55">현재 위치에 1건 · 지도에 표시</span>
            </div>
          </button>
        </div>
      </section>

      {aiOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="AI 현재 상황"
          onClick={() => !aiLoading && setAiOpen(false)}
        >
          <div
            className="max-h-[min(70vh,32rem)] w-full max-w-md overflow-y-auto rounded-xl border border-teal-500/30 bg-[#0a1f38] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-teal-100">AI 현재 상황 분석</h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/10"
                onClick={() => setAiOpen(false)}
                disabled={aiLoading}
              >
                닫기
              </button>
            </div>
            {aiLoading ? (
              <p className="text-sm text-slate-400">분석 중…</p>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">{aiText}</pre>
            )}
          </div>
        </div>
      ) : null}

      {dangerOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="지금 위험"
          onClick={() => setDangerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-teal-500/30 bg-[#0a1f38] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-bold text-teal-100">지금 위험 · 안전 상태</h2>
            <p className="mt-2 text-lg font-black text-white">{level}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{levelMsg}</p>
            <p className="mt-3 text-xs text-slate-400">조건: {triggerLines}</p>
            <p className="mt-2 text-[10px] text-slate-500">{weatherNowcastNote}</p>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-teal-600/90 py-2.5 text-sm font-semibold text-white"
              onClick={() => {
                void refreshSafety();
              }}
            >
              다시 평가
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-lg py-2 text-sm text-slate-400 hover:bg-white/5"
              onClick={() => setDangerOpen(false)}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
