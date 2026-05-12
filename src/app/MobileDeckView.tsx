/**
 * 함정·현장용 초간단 모바일 화면 — 지도에 내 위치, 살포 시작/중지·AI·안전·금일 건수만.
 * 경로: `/mobile` (로그인 후). 관제 대시보드와 `ship_command_logs` / BroadcastChannel 으로 살포 신호 동기.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap } from "react-leaflet";
import { Anchor, Brain, CircleSlash, Play, ShieldAlert, Sprout } from "lucide-react";
import { OPS_AREA_CENTER } from "./geo/koreaOpsArea";
import { TILE_ATTR, TILE_CARTO_DARK } from "./components/MarineLeafletMap";
import {
  insertShipCommand,
  marineDbEnabled,
  fetchSeedDropRecords,
  subscribeShipCommandInserts,
} from "@/lib/marine-db";
import { MARINE_OPS_SIGNAL_BC } from "@/lib/marine-ops-signals";
import {
  assessEmergency,
  fetchKmaForecast,
  generateMockForecast,
  isKmaApiConfigured,
  pickCurrentOrNextKmaSlot,
  sortKmaSlotsByTime,
  estimatedVisibilityKmFromSlot,
} from "@/lib/kma-weather";
import { analyzeWeatherWithGroq, isGroqConfigured } from "@/lib/groq-weather";
import { endOfDayMs, startOfDayMs, ymdLocal } from "@/lib/seeding-day-eval";

const VESSEL_DEFAULT = "제3해양살포함";

function vesselLteIdFromEnv(): string {
  const v = import.meta.env.VITE_VESSEL_LTE_ID?.trim();
  return v && v.length > 0 ? v : VESSEL_DEFAULT;
}

function isMobileDeckPath(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname.replace(/\/$/, "") || "/";
  return p.endsWith("/mobile");
}

function MapFollowUser({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), zoom), { animate: true });
  }, [lat, lng, zoom, map]);
  return null;
}

export default function MobileDeckView() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
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

  const center = useMemo<[number, number]>(
    () => (pos ? [pos.lat, pos.lng] : [OPS_AREA_CENTER.lat, OPS_AREA_CENTER.lng]),
    [pos],
  );

  const weatherNowcastNote = useMemo(() => {
    if (isKmaApiConfigured()) return "지금: 단기예보 동기화(주기 갱신)";
    return "지금: 목업(API 미설정)";
  }, []);

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
    const now = pickCurrentOrNextKmaSlot(slots);
    if (!now) {
      setLevel("안전");
      setLevelMsg("예보 없음");
      setTriggerLines("");
      return;
    }
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

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoErr("위치를 사용할 수 없습니다.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoErr(null);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      (e) => setGeoErr(e.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
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

  return (
    <div className="flex h-svh min-h-0 flex-col bg-[#050f18] text-slate-100">
      <header
        className="flex shrink-0 items-center justify-between gap-2 border-b border-teal-500/20 px-3 py-2"
        style={{
          paddingTop: "max(0.5rem, env(safe-area-inset-top))",
          background: "linear-gradient(180deg, #0c2748 0%, #081b34 100%)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Anchor className="h-5 w-5 shrink-0 text-teal-400" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">함정 모바일</p>
            <p className="truncate text-[10px] text-slate-500">{vesselLteIdFromEnv()}</p>
          </div>
        </div>
        <a
          href="/"
          className="shrink-0 rounded-lg border border-teal-500/30 px-2 py-1 text-[11px] font-medium text-teal-200/90 hover:bg-teal-950/50"
        >
          관제 전체
        </a>
      </header>

      <div className="relative min-h-0 flex-1">
        <MapContainer
          center={center}
          zoom={pos ? 15 : 11}
          className="h-full w-full min-h-[40vh]"
          scrollWheelZoom
          attributionControl
        >
          <TileLayer attribution={TILE_ATTR} url={TILE_CARTO_DARK} />
          {pos ? (
            <>
              <CircleMarker
                center={[pos.lat, pos.lng]}
                radius={11}
                pathOptions={{
                  color: "#22d3ee",
                  fillColor: "#06b6d4",
                  fillOpacity: 0.85,
                  weight: 2,
                }}
              />
              <MapFollowUser lat={pos.lat} lng={pos.lng} zoom={15} />
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
      </div>

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

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={sending || seedingActive}
            onClick={() => void sendCmd("seed_start")}
            className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border border-emerald-500/40 bg-emerald-950/60 py-2 text-sm font-bold text-emerald-100 shadow disabled:opacity-40 active:scale-[0.98]"
          >
            <Play className="h-5 w-5" fill="currentColor" />
            살포 시작
          </button>
          <button
            type="button"
            disabled={sending || !seedingActive}
            onClick={() => void sendCmd("seed_stop")}
            className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-500/40 bg-slate-900/80 py-2 text-sm font-bold text-slate-100 shadow disabled:opacity-40 active:scale-[0.98]"
          >
            <CircleSlash className="h-5 w-5" />
            살포 중지
          </button>
          <button
            type="button"
            onClick={() => void runAiBrief()}
            className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border border-violet-500/40 bg-violet-950/55 py-2 text-sm font-bold text-violet-100 shadow active:scale-[0.98]"
          >
            <Brain className="h-5 w-5" />
            AI 현재 상황
          </button>
          <button
            type="button"
            onClick={() => {
              void refreshSafety();
              setDangerOpen(true);
            }}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border py-2 text-sm font-bold text-white shadow ring-2 active:scale-[0.98] ${dangerUi.bg} ${dangerUi.ring}`}
          >
            <ShieldAlert className="h-5 w-5" />
            지금 위험
          </button>
        </div>
        <p className="mt-2 px-1 text-center text-[9px] leading-snug text-slate-500">
          블루투스 거치대로 버튼 원격 누르기는 추후 연동 예정 —{" "}
          <span className="text-slate-400">docs/기획-연동-초안</span> 참고
        </p>
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

export { isMobileDeckPath };
