import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudRain,
  Download,
  Eye,
  FileSpreadsheet,
  List,
  Printer,
  Sun,
  Thermometer,
  Waves,
  Waypoints,
  Wind,
  X,
} from "lucide-react";
import {
  addDaysYmd,
  attachmentMeetsPublicThreshold,
  endOfDayMs,
  estimateAttachmentPercent,
  filterDropsByYmdRange,
  haversineKm,
  mpsToKt,
  routeSummaryFromDrops,
  startOfDayMs,
  type SeedDropLike,
  type WeatherLike,
  ymdLocal,
} from "@/lib/seeding-day-eval";
import {
  buildSampleDropsForYmdRange,
  buildSampleLteForYmdRange,
  trackReportUsesTestSample,
} from "@/lib/track-report-test-sample";

const SEED_KG_PER_SUCCESS = 2.2;

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob(["\uFEFF" + text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dropsToCsv(drops: SeedDropLike[]): string {
  const header = "식별번호,구역,시각,위도,경도,상태,기록일,recorded_at_ms\n";
  const rows = drops
    .map((d) => {
      const day = ymdLocal(new Date(d.recordedAt));
      return `${d.id},${d.label},${d.time},${d.lat},${d.lng},${d.status},${day},${d.recordedAt}`;
    })
    .join("\n");
  return header + rows;
}

function CollapseBtn({
  open,
  label,
  onClick,
  icon,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] font-semibold text-white/90 transition-colors hover:bg-white/[0.06]"
      style={{ borderColor: "rgba(64,224,208,0.2)", background: "rgba(0,0,0,0.12)" }}
    >
      <span className="shrink-0 text-teal-200/80">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-teal-400/25 bg-teal-500/10 text-teal-100">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function Row3({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <tr className="border-b border-white/[0.06] last:border-0">
      <td className="py-2 pr-2 align-top text-[11px] font-medium text-cyan-200/65">{k}</td>
      <td className="py-2 align-top text-right text-[12px] font-semibold text-white/92">{v}</td>
      {sub != null ? (
        <td className="py-2 pl-2 align-top text-right text-[10px] text-slate-400">{sub}</td>
      ) : (
        <td className="py-2 pl-2" />
      )}
    </tr>
  );
}

function WeatherStrip({ weather }: { weather: WeatherLike }) {
  const wKt = mpsToKt(weather.windSpeed);
  const gusty = weather.windGust >= 16;
  const rough = weather.waveHeight >= 1.1;
  const lowVis = weather.visibility < 6;
  const sunny = wKt < 11 && !rough && !lowVis;
  const rainish = rough || gusty;

  const MainIcon = rainish ? CloudRain : sunny ? Sun : Cloud;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "rgba(64,224,208,0.18)", background: "rgba(0,0,0,0.14)" }}>
      <div className="flex items-center gap-2">
        <MainIcon className="h-8 w-8 shrink-0 text-amber-200/90" aria-hidden />
        <div>
          <p className="text-[10px] font-semibold uppercase text-cyan-200/55">기상 아이콘 요약</p>
          <p className="text-[11px] text-white/55">{rainish ? "난조·강풍/고파고 쪽" : sunny ? "비교적 양호" : "보통"}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-slate-300">
        <span className="inline-flex items-center gap-1 text-[11px]" title="풍속">
          <Wind className="h-3.5 w-3.5 text-sky-300/90" aria-hidden />
          <span className="font-mono tabular-nums">{wKt.toFixed(1)}kt</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px]" title="파고">
          <Waves className="h-3.5 w-3.5 text-teal-300/90" aria-hidden />
          <span className="font-mono tabular-nums">{weather.waveHeight.toFixed(1)}m</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px]" title="시정">
          <Eye className="h-3.5 w-3.5 text-violet-300/85" aria-hidden />
          <span className="font-mono tabular-nums">{weather.visibility.toFixed(0)}km</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px]" title="기온">
          <Thermometer className="h-3.5 w-3.5 text-orange-300/85" aria-hidden />
          <span className="font-mono tabular-nums">{weather.temp.toFixed(0)}°C</span>
        </span>
      </div>
    </div>
  );
}

export interface TodayTrackReportModalProps {
  open: boolean;
  onClose: () => void;
  /** 관제 화면 시계와 동일 기준일 */
  referenceDate: Date;
  drops: SeedDropLike[];
  weather: WeatherLike;
  vesselLat: number;
  vesselLng: number;
  pathLatLng: [number, number][];
  lteTrackPoints: { lat: number; lng: number; recorded_at: string }[];
  vesselName: string;
  /** false이면 실제 이력·LTE만 사용. 기본은 환경변수로 제어(`trackReportUsesTestSample`). */
  useTestSample?: boolean;
}

export function TodayTrackReportModal({
  open,
  onClose,
  referenceDate,
  drops,
  weather,
  vesselLat,
  vesselLng,
  pathLatLng,
  lteTrackPoints,
  vesselName,
  useTestSample = trackReportUsesTestSample(),
}: TodayTrackReportModalProps) {
  const todayYmd = ymdLocal(referenceDate);
  const [rangeStart, setRangeStart] = useState(todayYmd);
  const [rangeEnd, setRangeEnd] = useState(todayYmd);
  const [openSummary, setOpenSummary] = useState(true);
  const [openRoute, setOpenRoute] = useState(false);
  const [openEval, setOpenEval] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const rangeNorm = useMemo(() => {
    let a = rangeStart;
    let b = rangeEnd;
    if (startOfDayMs(a) > startOfDayMs(b)) {
      const t = a;
      a = b;
      b = t;
    }
    return { start: a, end: b };
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    if (open) {
      setRangeStart(todayYmd);
      setRangeEnd(todayYmd);
      setOpenSummary(true);
      setOpenRoute(false);
      setOpenEval(true);
    }
  }, [open, todayYmd]);

  const inRange = useMemo(
    () => filterDropsByYmdRange(drops, rangeNorm.start, rangeNorm.end),
    [drops, rangeNorm],
  );

  const reportDrops = useMemo(() => {
    if (useTestSample) return buildSampleDropsForYmdRange(rangeNorm.start, rangeNorm.end);
    return inRange;
  }, [useTestSample, inRange, rangeNorm.start, rangeNorm.end]);

  const sorted = useMemo(() => [...reportDrops].sort((a, b) => a.recordedAt - b.recordedAt), [reportDrops]);

  const lteInRange = useMemo(() => {
    const t0 = startOfDayMs(rangeNorm.start);
    const t1 = endOfDayMs(rangeNorm.end);
    return lteTrackPoints.filter((p) => {
      const ts = new Date(p.recorded_at).getTime();
      return ts >= t0 && ts <= t1;
    });
  }, [lteTrackPoints, rangeNorm]);

  const reportLte = useMemo(() => {
    if (useTestSample && lteInRange.length === 0) {
      return buildSampleLteForYmdRange(rangeNorm.start, rangeNorm.end);
    }
    return lteInRange;
  }, [useTestSample, lteInRange, rangeNorm.start, rangeNorm.end]);

  const attachPct = useMemo(() => estimateAttachmentPercent(weather), [weather]);
  const meets50 = attachmentMeetsPublicThreshold(attachPct);

  const successCount = sorted.filter((d) => d.status === "성공").length;
  const estKg = Math.round(successCount * SEED_KG_PER_SUCCESS * 10) / 10;

  const departure = useMemo(() => {
    if (reportLte.length > 0) {
      const p = reportLte[0];
      return { text: `${p.lat.toFixed(4)}°N / ${p.lng.toFixed(4)}°E`, src: "LTE 궤적(기간 내 최초)" };
    }
    if (sorted.length > 0) {
      const p = sorted[0];
      return { text: `${p.lat.toFixed(4)}°N / ${p.lng.toFixed(4)}°E (${p.label})`, src: "당일 최초 살포 지점" };
    }
    if (pathLatLng.length > 0) {
      const [la, ln] = pathLatLng[0];
      return { text: `${la.toFixed(4)}°N / ${ln.toFixed(4)}°E`, src: "시뮬 항적 출발 추정" };
    }
    return { text: "기록 없음", src: "—" };
  }, [reportLte, sorted, pathLatLng]);

  const returnPt = useMemo(() => {
    if (reportLte.length > 0) {
      const p = reportLte[reportLte.length - 1];
      return { text: `${p.lat.toFixed(4)}°N / ${p.lng.toFixed(4)}°E`, src: "LTE 궤적(기간 내 최종)" };
    }
    return {
      text: `${vesselLat.toFixed(4)}°N / ${vesselLng.toFixed(4)}°E`,
      src: sorted.length ? "현재 선박(복귀·대기 추정)" : "현재 선박 위치",
    };
  }, [reportLte, vesselLat, vesselLng, sorted.length]);

  const routeKm = useMemo(() => {
    if (sorted.length < 2) return 0;
    let s = 0;
    for (let i = 1; i < sorted.length; i++) {
      s += haversineKm(sorted[i - 1].lat, sorted[i - 1].lng, sorted[i].lat, sorted[i].lng);
    }
    return Math.round(s * 10) / 10;
  }, [sorted]);

  const routeText = routeSummaryFromDrops(sorted);

  const evalNote = meets50
    ? `이 기상·해역 조건에 대한 추정 안착률은 ${attachPct}%로, 사후 평가 기준(50%) 이상으로 분류됩니다.`
    : `이 기상·해역 조건에 대한 추정 안착률은 ${attachPct}%로, 사후 평가 기준(50%) 미만으로 분류됩니다.`;

  const setPreset = useCallback((days: number) => {
    const end = todayYmd;
    const start = days <= 1 ? end : addDaysYmd(end, -(days - 1));
    setRangeStart(start);
    setRangeEnd(end);
  }, [todayYmd]);

  const dlPrefix = useTestSample ? "테스트_" : "";

  const handleDownloadDrops = useCallback(() => {
    const { start, end } = rangeNorm;
    const tag = start === end ? start : `${start}_${end}`;
    downloadText(`${dlPrefix}종자살포이력_${tag}.csv`, dropsToCsv(reportDrops), "text/csv");
  }, [reportDrops, rangeNorm, dlPrefix]);

  const handleDownloadSummary = useCallback(() => {
    const rows: string[] = [];
    rows.push(
      "일자,살포건수,추정살포량_kg,추정안착률_퍼센트,50퍼센트기준충족,살포경로요약,출발좌표요약,복귀좌표요약,비고",
    );
    let cur = rangeNorm.start;
    const endMs = endOfDayMs(rangeNorm.end);
    while (startOfDayMs(cur) <= endMs) {
      const dayDrops = filterDropsByYmdRange(reportDrops, cur, cur).sort((a, b) => a.recordedAt - b.recordedAt);
      const okN = dayDrops.filter((d) => d.status === "성공").length;
      const kg = Math.round(okN * SEED_KG_PER_SUCCESS * 10) / 10;
      const pct = estimateAttachmentPercent(weather);
      const ok = attachmentMeetsPublicThreshold(pct) ? "예" : "아니오";
      const r = routeSummaryFromDrops(dayDrops);
      const dep =
        dayDrops.length > 0
          ? `${dayDrops[0].lat.toFixed(4)}/${dayDrops[0].lng.toFixed(4)}`
          : pathLatLng[0]
            ? `${pathLatLng[0][0].toFixed(4)}/${pathLatLng[0][1].toFixed(4)}`
            : "";
      const ret =
        dayDrops.length > 0
          ? `${dayDrops[dayDrops.length - 1].lat.toFixed(4)}/${dayDrops[dayDrops.length - 1].lng.toFixed(4)}`
          : `${vesselLat.toFixed(4)}/${vesselLng.toFixed(4)}`;
      rows.push(
        `${cur},${dayDrops.length},${kg},${pct},${ok},"${r.replace(/"/g, '""')}",${dep},${ret},${useTestSample ? "테스트샘플" : "기상추정·시연용"}`,
      );
      cur = addDaysYmd(cur, 1);
    }
    const { start, end } = rangeNorm;
    const tag = start === end ? start : `${start}_${end}`;
    downloadText(`${dlPrefix}항적기록_평가요약_${tag}.csv`, rows.join("\n"), "text/csv");
  }, [reportDrops, rangeNorm, weather, pathLatLng, vesselLat, vesselLng, dlPrefix, useTestSample]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 px-3 pb-8 pt-8 sm:px-4 sm:pt-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-report-title"
      onClick={onClose}
    >
      <div
        className="print-report-modal relative flex w-full max-w-lg min-h-0 flex-col self-start rounded-xl shadow-2xl max-h-[min(calc(100dvh-3rem),40rem)] sm:max-w-xl"
        style={{
          background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
          border: "1px solid rgba(64,224,208,0.22)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2.5 sm:px-4"
          style={{ borderColor: "rgba(64,224,208,0.15)", background: "rgba(0,0,0,0.2)" }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-teal-400/35 bg-teal-500/15 text-teal-100"
              aria-hidden
            >
              <Waypoints className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="track-report-title" className="text-sm font-bold tracking-tight text-white sm:text-[15px]">
                항적 기록
              </h2>
              <p className="truncate text-[10px] text-cyan-200/65">
                {vesselName}
                {useTestSample ? " · 테스트 샘플(살포·LTE)" : " · 실제 이력 · 기상 기반 추정"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 space-y-2 border-b px-3 py-2.5 sm:px-4" style={{ borderColor: "rgba(64,224,208,0.12)", background: "rgba(0,0,0,0.12)" }}>
          <p className="text-[10px] font-semibold uppercase text-cyan-200/55">기간 선택</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { d: 1, lab: "오늘" },
              { d: 7, lab: "7일" },
              { d: 30, lab: "30일" },
            ].map((p) => (
              <button
                key={p.d}
                type="button"
                onClick={() => setPreset(p.d)}
                className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-teal-100/90 hover:bg-teal-500/15"
              >
                {p.lab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-[11px] outline-none [color-scheme:dark]"
              style={{ background: "rgba(12,39,72,0.75)", borderColor: "rgba(64,224,208,0.22)" }}
            />
            <span className="shrink-0 text-[10px] text-teal-200/55">~</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-[11px] outline-none [color-scheme:dark]"
              style={{ background: "rgba(12,39,72,0.75)", borderColor: "rgba(64,224,208,0.22)" }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadDrops}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/35 bg-teal-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-teal-50 hover:bg-teal-900/45"
            >
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
              살포 이력 CSV ({reportDrops.length}건)
            </button>
            <button
              type="button"
              onClick={handleDownloadSummary}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-950/35 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-50 hover:bg-cyan-900/40"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden />
              일자별 평가 요약 CSV
            </button>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5 sm:px-4"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(51,65,85,0.6) transparent" }}
        >
          <WeatherStrip weather={weather} />

          <div className="mt-2 space-y-1.5">
            <CollapseBtn
              open={openSummary}
              onClick={() => setOpenSummary((v) => !v)}
              label="한눈에 보기 — 항적·살포 요약 표"
              icon={<Waypoints className="h-3.5 w-3.5" aria-hidden />}
            />
            {openSummary ? (
              <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: "rgba(64,224,208,0.16)", background: "rgba(0,0,0,0.1)" }}>
                <table className="w-full border-collapse text-left">
                  <tbody>
                    <Row3 k="조회 기간" v={`${rangeNorm.start} ~ ${rangeNorm.end}`} sub={`${reportDrops.length}건`} />
                    <Row3 k="출발(추정)" v={departure.text} sub={departure.src} />
                    <Row3 k="살포 경로(구역)" v={routeText} sub={routeKm > 0 ? `살포점 간 ${routeKm} km` : undefined} />
                    <Row3 k="복귀·현재(추정)" v={returnPt.text} sub={returnPt.src} />
                    <Row3 k="살포 건수" v={`${sorted.length}건`} sub={`성공 ${successCount}건`} />
                    <Row3 k="추정 살포량" v={`${estKg} kg`} sub={`건당 ${SEED_KG_PER_SUCCESS}kg 가정`} />
                    <Row3 k="추정 안착률" v={`${attachPct}%`} sub={meets50 ? "≥50%" : "<50%"} />
                  </tbody>
                </table>
              </div>
            ) : null}

            <CollapseBtn
              open={openEval}
              onClick={() => setOpenEval((v) => !v)}
              label="사후 평가용 문구"
              icon={<FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />}
            />
            {openEval ? (
              <div className="rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed text-cyan-100/85" style={{ borderColor: "rgba(64,224,208,0.16)", background: "rgba(0,0,0,0.1)" }}>
                <p>{evalNote}</p>
                <p className="mt-1.5 text-[10px] text-white/45">
                  본 수치는 현재 화면 기상값으로 산출한 모형 추정치이며, 실제 안착률 검증을 대체하지 않습니다.
                  {useTestSample ? " 살포·궤적 수치는 테스트 샘플입니다." : ""}
                </p>
              </div>
            ) : null}

            <CollapseBtn
              open={openRoute}
              onClick={() => setOpenRoute((v) => !v)}
              label="기간 내 살포 시각 순 목록"
              icon={<List className="h-3.5 w-3.5" aria-hidden />}
            />
            {openRoute ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: "rgba(64,224,208,0.14)", background: "rgba(0,0,0,0.12)" }}>
                {sorted.length === 0 ? (
                  <li className="py-2 text-center text-slate-500">선택 기간에 살포 기록이 없습니다.</li>
                ) : (
                  sorted.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2 border-b border-white/[0.05] py-1 last:border-0">
                      <span className="font-medium text-teal-100/90">{d.label}</span>
                      <span className="shrink-0 font-mono text-slate-300">{d.time}</span>
                      <span className="min-w-0 truncate font-mono text-[10px] text-slate-500">
                        {d.lat.toFixed(4)}, {d.lng.toFixed(4)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="print-hide shrink-0 border-t px-3 py-2.5 sm:px-4" style={{ borderColor: "rgba(64,224,208,0.12)", background: "rgba(0,0,0,0.18)" }}>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpenSummary(true);
                setOpenRoute(true);
                setOpenEval(true);
                setTimeout(() => window.print(), 80);
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-semibold text-teal-100 transition-colors hover:bg-teal-900/30"
              style={{ borderColor: "rgba(45,212,191,0.35)", background: "rgba(45,212,191,0.08)" }}
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden />
              PDF 출력
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.08] py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.12]"
            >
              닫기
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-white/30">
            인쇄 대화상자에서 「PDF로 저장」을 선택하면 보고서 파일이 만들어집니다.
          </p>
        </div>
      </div>
    </div>
  );
}
