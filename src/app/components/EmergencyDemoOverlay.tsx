/**
 * B2G 시연용 오버레이 모음
 *
 * 1. <WeatherAlertOverlay>  — Phase 2: 전체화면 붉은 경고 팝업 (기상 악화 감지)
 * 2. <SosReceivedOverlay>   — Phase 4: SOS 수신 알림 (선박→관제탑)
 * 3. <DemoControlBar>       — 시연자 전용 Phase1/2 시뮬레이션 버튼 툴바
 * 4. <SafeDepartureNotice>  — Phase 1: 초록 "조업 최적 시간대" 배너
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Radio,
  RotateCcw,
  Siren,
  Sunset,
  Wind,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeatherSimState {
  mode: "normal" | "danger";
  windSpeed: number;
  waveHeight: number;
  trigger: number; // 변경마다 증가 — 팝업 재노출 트리거
}

// ─── 1. WeatherAlertOverlay ───────────────────────────────────────────────────
/**
 * Phase 2: 기상 악화 감지 시 화면 전체에 노출되는 경고 오버레이.
 * autoCloseMs 후 자동으로 닫힘 (0 = 수동 닫기만).
 */
export function WeatherAlertOverlay({
  visible,
  windSpeed,
  waveHeight,
  onClose,
  autoCloseMs = 0,
}: {
  visible: boolean;
  windSpeed: number;
  waveHeight: number;
  onClose: () => void;
  autoCloseMs?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible && autoCloseMs > 0) {
      timerRef.current = setTimeout(onClose, autoCloseMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, autoCloseMs, onClose]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        background: "rgba(120,0,0,0.82)",
        backdropFilter: "blur(6px)",
        animation: "dangerPulse 1s ease-in-out infinite alternate",
      }}
    >
      <style>{`
        @keyframes dangerPulse {
          from { background: rgba(120,0,0,0.82); }
          to   { background: rgba(200,20,20,0.88); }
        }
        @keyframes flashIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div
        className="flex flex-col items-center gap-6 px-12 py-10 rounded-3xl text-center"
        style={{
          background: "rgba(0,0,0,0.6)",
          border: "3px solid rgba(255,80,80,0.8)",
          boxShadow: "0 0 80px rgba(255,0,0,0.6)",
          animation: "flashIn 0.35s ease-out",
          maxWidth: 540,
        }}
      >
        {/* 아이콘 + 제목 */}
        <div className="flex flex-col items-center gap-3">
          <Siren size={72} className="text-red-400 drop-shadow-[0_0_20px_rgba(255,0,0,0.8)]" />
          <h1 className="text-4xl font-black text-white tracking-tight leading-tight">
            ⚠ 경고: 돌풍 감지
          </h1>
          <p className="text-red-300 text-lg font-semibold">
            AI 기상 이변 조기 경보 시스템
          </p>
        </div>

        {/* 수치 */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="rounded-xl bg-red-950/60 border border-red-500/40 p-4">
            <div className="flex items-center gap-2 text-red-400 mb-1">
              <Wind size={18} /> <span className="text-sm font-bold">풍속</span>
            </div>
            <p className="text-3xl font-black text-white">{windSpeed.toFixed(1)}<span className="text-lg font-normal text-red-300 ml-1">m/s</span></p>
            <p className="text-xs text-red-400 mt-1">위험 기준 ≥ 15 m/s</p>
          </div>
          <div className="rounded-xl bg-red-950/60 border border-red-500/40 p-4">
            <div className="flex items-center gap-2 text-red-400 mb-1">
              <Navigation size={18} /> <span className="text-sm font-bold">파고</span>
            </div>
            <p className="text-3xl font-black text-white">{waveHeight.toFixed(1)}<span className="text-lg font-normal text-red-300 ml-1">m</span></p>
            <p className="text-xs text-red-400 mt-1">위험 기준 ≥ 1.5 m</p>
          </div>
        </div>

        {/* 조치 안내 */}
        <div className="rounded-xl bg-black/40 border border-red-500/30 px-6 py-4 text-left w-full">
          <p className="text-red-300 font-bold text-sm mb-2">AI 권고 조치</p>
          <ul className="text-white/90 text-sm space-y-1.5 list-disc list-inside">
            <li>즉시 <span className="text-red-300 font-bold">긴급 회항 명령</span> 발송</li>
            <li>인근 해경 선박 대기 요청</li>
            <li>출항 대기 선박 <span className="text-red-300 font-bold">전면 통제</span></li>
          </ul>
        </div>

        <button
          onClick={onClose}
          className="px-10 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-base transition-all hover:scale-105 active:scale-95"
        >
          확인 · 관제 화면으로
        </button>
      </div>
    </div>
  );
}

// ─── 2. SosReceivedOverlay ────────────────────────────────────────────────────
/**
 * Phase 4: 선박 SOS 버튼 눌렸을 때 관제 화면에 뜨는 알림.
 * 화면 오른쪽 위에 슬라이드인.
 */
export function SosReceivedToast({
  visible,
  vesselId,
  lat,
  lng,
  onDismiss,
}: {
  visible: boolean;
  vesselId: string;
  lat: number;
  lng: number;
  onDismiss: () => void;
}) {
  // 5초 후 자동 닫힘
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-6 right-6 z-[9998] flex flex-col gap-3 rounded-2xl px-5 py-4 shadow-2xl"
      style={{
        background: "rgba(10,5,5,0.95)",
        border: "2px solid rgba(239,68,68,0.8)",
        boxShadow: "0 0 40px rgba(239,68,68,0.5)",
        minWidth: 320,
        animation: "slideIn 0.4s ease-out",
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(60px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="flex items-start gap-3">
        <Radio size={28} className="text-red-400 animate-pulse mt-0.5 shrink-0" />
        <div>
          <p className="text-white font-black text-base leading-tight">
            🚨 긴급 구조 요청 접수
          </p>
          <p className="text-red-300 text-sm font-semibold mt-0.5">{vesselId}</p>
        </div>
        <button onClick={onDismiss} className="ml-auto text-slate-500 hover:text-white text-lg leading-none">✕</button>
      </div>

      <div className="rounded-xl bg-red-950/50 border border-red-800/40 px-3 py-2.5 text-xs font-mono">
        <p className="text-slate-400">현재 좌표</p>
        <p className="text-white font-bold text-sm mt-0.5">
          {lat.toFixed(5)}°N, {lng.toFixed(5)}°E
        </p>
      </div>

      <div className="rounded-xl bg-amber-950/40 border border-amber-800/30 px-3 py-2 text-xs text-amber-300 font-semibold flex items-center gap-2">
        <CheckCircle2 size={14} />
        해경 자동 전송 완료 · 긴급 출동 대기 중
      </div>
    </div>
  );
}

// ─── 3. SafeDepartureNotice ───────────────────────────────────────────────────
/**
 * Phase 1: 기상 정상 시 초록 배너 (AI 출항 최적 시간 표시).
 */
export function SafeDepartureNotice({
  visible,
  bestHour,
}: {
  visible: boolean;
  bestHour: string;
}) {
  if (!visible) return null;
  return (
    <div
      className="fixed top-6 right-6 z-[9997] flex items-center gap-3 rounded-2xl px-5 py-4"
      style={{
        background: "rgba(5,20,10,0.95)",
        border: "2px solid rgba(16,185,129,0.7)",
        boxShadow: "0 0 30px rgba(16,185,129,0.3)",
        minWidth: 280,
        animation: "slideIn 0.4s ease-out",
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(60px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <Sunset size={28} className="text-emerald-400 shrink-0" />
      <div>
        <p className="text-emerald-300 font-black text-sm">현재 기상 양호</p>
        <p className="text-white text-xs mt-0.5">
          AI 분석: <span className="text-emerald-300 font-bold">{bestHour} 조업 최적</span>
        </p>
      </div>
    </div>
  );
}

// ─── 4. DemoControlBar ────────────────────────────────────────────────────────
/**
 * 시연자 전용 플로팅 버튼 바 (화면 하단).
 * 심사장에서 빠르게 Phase 1→2→3→4 전환.
 */
export function DemoControlBar({
  onSimNormal,
  onSimDanger,
  onSimSos,
  weatherMode,
}: {
  onSimNormal: () => void;
  onSimDanger: () => void;
  onSimSos: () => void;
  weatherMode: "normal" | "danger";
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="fixed bottom-5 left-1/2 z-[9990] flex flex-col items-center gap-2"
      style={{ transform: "translateX(-50%)" }}
    >
      {open && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-2xl"
          style={{
            background: "rgba(5,15,30,0.96)",
            border: "1px solid rgba(100,200,255,0.25)",
            boxShadow: "0 4px 32px rgba(0,0,0,0.7)",
          }}
        >
          {/* 라벨 */}
          <span className="text-xs text-slate-400 font-bold mr-2 whitespace-nowrap">🎬 시연 제어</span>

          {/* Phase 1 */}
          <button
            onClick={onSimNormal}
            disabled={weatherMode === "normal"}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
            style={{
              background: weatherMode === "normal" ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.15)",
              border: "1px solid rgba(16,185,129,0.5)",
              color: "#34d399",
            }}
          >
            <CheckCircle2 size={13} />
            Phase 1 · 기상 정상
          </button>

          {/* Phase 2 */}
          <button
            onClick={onSimDanger}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
            style={{
              background: weatherMode === "danger" ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.5)",
              color: "#f87171",
            }}
          >
            <AlertTriangle size={13} />
            Phase 2 · 돌풍 시뮬
          </button>

          {/* Phase 3 안내 */}
          <div
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "rgba(248,113,113,0.6)",
            }}
          >
            <Siren size={13} />
            Phase 3 · 긴급회항↑ 패널
          </div>

          {/* Phase 4 */}
          <button
            onClick={onSimSos}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
            style={{
              background: "rgba(251,191,36,0.15)",
              border: "1px solid rgba(251,191,36,0.4)",
              color: "#fbbf24",
            }}
          >
            <Radio size={13} />
            Phase 4 · SOS 수신
          </button>

          <button
            onClick={() => setOpen(false)}
            className="ml-2 text-slate-500 hover:text-white text-sm"
            title="시연 제어 숨기기"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
          style={{
            background: "rgba(5,15,30,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          🎬 시연 제어 열기
        </button>
      )}
    </div>
  );
}
