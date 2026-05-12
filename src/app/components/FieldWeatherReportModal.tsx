/**
 * 현장 상황보고 — 관제사·함정 보고 풍속·파고 등을 입력하면
 * AI 안전·하단 타임라인「지금」구간이 예보가 아닌 보고값 기준으로 판정됩니다.
 */

import { useEffect, useState } from "react";
import { ClipboardList, X } from "lucide-react";

export interface FieldWeatherReportPayload {
  windSpeed: number;
  windDir: number;
  waveHeight: number;
  temp: number;
  ptyCode: number;
  pop: number;
  sky: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** m/s, °, m, °C — 모달 열 때 초깃값 */
  initial: Pick<FieldWeatherReportPayload, "windSpeed" | "windDir" | "waveHeight" | "temp">;
  initialExtras?: Pick<FieldWeatherReportPayload, "ptyCode" | "pop" | "sky">;
  onSubmit: (p: FieldWeatherReportPayload) => void;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function FieldWeatherReportModal({ open, onClose, initial, initialExtras, onSubmit }: Props) {
  const [windSpeed, setWindSpeed] = useState(String(initial.windSpeed));
  const [windDir, setWindDir] = useState(String(Math.round(initial.windDir)));
  const [waveHeight, setWaveHeight] = useState(String(initial.waveHeight));
  const [temp, setTemp] = useState(String(initial.temp));
  const [pop, setPop] = useState(String(initialExtras?.pop ?? 0));
  const [ptyCode, setPtyCode] = useState(String(initialExtras?.ptyCode ?? 0));
  const [sky, setSky] = useState(String(initialExtras?.sky ?? 1));

  useEffect(() => {
    if (!open) return;
    setWindSpeed(String(initial.windSpeed));
    setWindDir(String(Math.round(initial.windDir)));
    setWaveHeight(String(initial.waveHeight));
    setTemp(String(initial.temp));
    setPop(String(initialExtras?.pop ?? 0));
    setPtyCode(String(initialExtras?.ptyCode ?? 0));
    setSky(String(initialExtras?.sky ?? 1));
  }, [open, initial, initialExtras]);

  if (!open) return null;

  const parse = () => {
    const ws = clamp(Number(windSpeed.replace(",", ".")), 0, 45);
    const wd = ((Number(windDir.replace(",", ".")) % 360) + 360) % 360;
    const wh = clamp(Number(waveHeight.replace(",", ".")), 0, 8);
    const tp = clamp(Number(temp.replace(",", ".")), -20, 45);
    const po = clamp(Math.round(Number(pop.replace(",", "."))), 0, 100);
    const pty = [0, 1, 3, 4].includes(Number(ptyCode)) ? Number(ptyCode) : 0;
    const sk = [1, 3, 4].includes(Number(sky)) ? Number(sky) : 1;
    if (!Number.isFinite(ws) || !Number.isFinite(wh)) return null;
    return {
      windSpeed: ws,
      windDir: Number.isFinite(wd) ? wd : 0,
      waveHeight: wh,
      temp: Number.isFinite(tp) ? tp : 15,
      ptyCode: pty,
      pop: po,
      sky: sk,
    };
  };

  const submit = () => {
    const p = parse();
    if (!p) return;
    onSubmit(p);
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-report-title"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-xl border border-teal-500/30 p-4 shadow-2xl sm:p-5"
        style={{
          background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-teal-300/90 shrink-0" aria-hidden />
            <h2 id="field-report-title" className="text-base font-bold text-slate-100 tracking-tight">
              현장 상황보고
            </h2>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            aria-label="닫기"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          함정·관제탑에서 확인한 값을 넣으면 <span className="text-teal-200/90">지금 구간 안전 판정·타임라인</span>에 반영됩니다.
          기상청 예보는 이후 시간대에만 사용됩니다.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">풍속 (m/s)</span>
            <input
              className="rounded-md border border-teal-500/25 bg-black/25 px-2 py-1.5 font-mono text-slate-100 outline-none focus:border-teal-400/50"
              inputMode="decimal"
              value={windSpeed}
              onChange={(e) => setWindSpeed(e.target.value)}
            />
          </label>
          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">풍향 (°)</span>
            <input
              className="rounded-md border border-teal-500/25 bg-black/25 px-2 py-1.5 font-mono text-slate-100 outline-none focus:border-teal-400/50"
              inputMode="numeric"
              value={windDir}
              onChange={(e) => setWindDir(e.target.value)}
            />
          </label>
          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">파고 (m)</span>
            <input
              className="rounded-md border border-teal-500/25 bg-black/25 px-2 py-1.5 font-mono text-slate-100 outline-none focus:border-teal-400/50"
              inputMode="decimal"
              value={waveHeight}
              onChange={(e) => setWaveHeight(e.target.value)}
            />
          </label>
          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">기온 (°C)</span>
            <input
              className="rounded-md border border-teal-500/25 bg-black/25 px-2 py-1.5 font-mono text-slate-100 outline-none focus:border-teal-400/50"
              inputMode="decimal"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">강수확률 (%)</span>
            <input
              className="rounded-md border border-teal-500/25 bg-black/25 px-2 py-1.5 font-mono text-slate-100 outline-none focus:border-teal-400/50"
              inputMode="numeric"
              value={pop}
              onChange={(e) => setPop(e.target.value)}
            />
          </label>
          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">하늘상태</span>
            <select
              className="rounded-md border border-teal-500/25 bg-black/25 px-2 py-1.5 text-slate-100 outline-none focus:border-teal-400/50"
              value={sky}
              onChange={(e) => setSky(e.target.value)}
            >
              <option value="1">맑음</option>
              <option value="3">구름많음</option>
              <option value="4">흐림</option>
            </select>
          </label>
          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">강수</span>
            <select
              className="rounded-md border border-teal-500/25 bg-black/25 px-2 py-1.5 text-slate-100 outline-none focus:border-teal-400/50"
              value={ptyCode}
              onChange={(e) => setPtyCode(e.target.value)}
            >
              <option value="0">없음</option>
              <option value="1">비</option>
              <option value="3">눈</option>
              <option value="4">소나기</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-slate-200"
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            className="rounded-lg bg-teal-600/90 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-teal-500/90"
            onClick={submit}
          >
            보고 반영
          </button>
        </div>
      </div>
    </div>
  );
}
