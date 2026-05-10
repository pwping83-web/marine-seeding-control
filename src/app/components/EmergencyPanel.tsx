/**
 * 양방향 비상통신 + 사이렌 제어 패널
 *
 * 기능:
 *  1. [긴급 회항 명령] 버튼 → DB `ship_command_logs` 기록 → 아두이노가 폴링 후 GPIO14 사이렌 ON
 *  2. [비상 SOS] 버튼 → 동일 채널로 선박 → 관제탑 방향 비상 신호 수신 표시
 *  3. 신호 이력 로그 (시간·방향·종류)
 *  4. AI 긴급 회항 자동 트리거 시 이 패널에 자동으로 상태 반영
 *
 * DB 테이블: `ship_command_logs` (`marine-db.ts` `insertShipCommand`)
 *   id, vessel_id, cmd, created_at, acked_at
 *
 * 아두이노 측: 30초마다 /ship-commands 를 폴링해 cmd="emergency_return" 수신 시
 *   GPIO14 릴레이 ON → 사이렌 울림
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Radio, RotateCcw, Volume2, VolumeX, CheckCircle2, Clock } from "lucide-react";
import { insertShipCommand, fetchRecentShipCommands, type ShipCommandRow } from "@/lib/marine-db";

// ─── 명령 정의 ────────────────────────────────────────────────────────────────

const COMMANDS = [
  {
    id: "emergency_return",
    label: "긴급 회항 명령",
    desc: "사이렌 울림 + 관제 로그",
    color: "bg-red-600 hover:bg-red-500",
    icon: <AlertTriangle size={16} />,
  },
  {
    id: "siren_on",
    label: "사이렌 ON",
    desc: "물리 부저 즉시 ON",
    color: "bg-orange-600 hover:bg-orange-500",
    icon: <Volume2 size={16} />,
  },
  {
    id: "siren_off",
    label: "사이렌 OFF",
    desc: "부저 해제",
    color: "bg-slate-600 hover:bg-slate-500",
    icon: <VolumeX size={16} />,
  },
  {
    id: "position_report",
    label: "위치 보고 요청",
    desc: "GPS 핀 즉시 전송",
    color: "bg-sky-700 hover:bg-sky-600",
    icon: <Radio size={16} />,
  },
  {
    id: "return_ack",
    label: "회항 확인 (선박→관제)",
    desc: "수신 확인 응답",
    color: "bg-emerald-700 hover:bg-emerald-600",
    icon: <CheckCircle2 size={16} />,
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmergencySignal {
  id: string;
  cmd: string;
  time: string;
  ack: boolean;
  source: "관제탑→선박" | "선박→관제탑";
}

interface Props {
  vesselId?: string;
  /** AI 긴급 회항 판정 시 부모에서 호출 — 자동으로 회항 명령 발송 */
  autoTriggerMessage?: string;
  onSignalChange?: (signals: EmergencySignal[]) => void;
}

// ─── 폴링 주기 ────────────────────────────────────────────────────────────────
const POLL_MS = 8000;

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function EmergencyPanel({ vesselId = "제3해양살포함", autoTriggerMessage, onSignalChange }: Props) {
  const [signals, setSignals] = useState<EmergencySignal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sirenActive, setSirenActive] = useState(false);
  const prevAutoRef = useRef<string | undefined>(undefined);

  // ─── 신호 이력 추가 헬퍼 ─────────────────────────────────────────────────
  const addSignal = useCallback(
    (sig: EmergencySignal) => {
      setSignals((prev) => {
        const next = [sig, ...prev].slice(0, 50);
        onSignalChange?.(next);
        return next;
      });
    },
    [onSignalChange]
  );

  // ─── DB에 명령 삽입 ──────────────────────────────────────────────────────
  const sendCommand = useCallback(
    async (cmdId: string) => {
      if (busy) return;
      setBusy(cmdId);
      try {
        const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await insertShipCommand({ id, vesselId, cmd: cmdId });

        if (cmdId === "siren_on" || cmdId === "emergency_return") setSirenActive(true);
        if (cmdId === "siren_off") setSirenActive(false);

        addSignal({
          id,
          cmd: COMMANDS.find((c) => c.id === cmdId)?.label ?? cmdId,
          time: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
          ack: false,
          source: "관제탑→선박",
        });
      } finally {
        setBusy(null);
      }
    },
    [busy, vesselId, addSignal]
  );

  // ─── AI 자동 긴급 회항 트리거 ─────────────────────────────────────────────
  useEffect(() => {
    if (autoTriggerMessage && autoTriggerMessage !== prevAutoRef.current) {
      prevAutoRef.current = autoTriggerMessage;
      sendCommand("emergency_return");
    }
  }, [autoTriggerMessage, sendCommand]);

  // ─── 선박→관제탑 신호 폴링 ───────────────────────────────────────────────
  useEffect(() => {
    async function poll() {
      const rows: ShipCommandRow[] | null = await fetchRecentShipCommands(vesselId, 5);
      if (!rows) return;
      setSignals((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const newSigs: EmergencySignal[] = rows
          .filter((r) => !existingIds.has(r.id) && r.cmd.startsWith("sos_"))
          .map((r) => ({
            id: r.id,
            cmd: r.cmd,
            time: new Date(r.createdAt).toLocaleTimeString("ko-KR", { hour12: false }),
            ack: Boolean(r.ackedAt),
            source: "선박→관제탑",
          }));
        if (newSigs.length === 0) return prev;
        const next = [...newSigs, ...prev].slice(0, 50);
        onSignalChange?.(next);
        return next;
      });
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [vesselId, onSignalChange]);

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 text-sm">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base flex items-center gap-1.5">
          <Radio size={16} className="text-red-400" />
          비상통신 · 사이렌 제어
        </h3>
        {sirenActive && (
          <span className="flex items-center gap-1 text-xs font-bold text-red-400 animate-pulse">
            <Volume2 size={13} /> 사이렌 작동 중
          </span>
        )}
      </div>

      {/* 명령 버튼 그리드 */}
      <div className="grid grid-cols-2 gap-2">
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            disabled={!!busy}
            onClick={() => sendCommand(cmd.id)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-white font-semibold text-xs transition-all ${cmd.color} disabled:opacity-50 disabled:cursor-wait`}
          >
            {busy === cmd.id ? (
              <RotateCcw size={14} className="animate-spin" />
            ) : (
              cmd.icon
            )}
            <span className="flex flex-col text-left leading-tight">
              <span>{cmd.label}</span>
              <span className="font-normal text-white/70">{cmd.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {/* 신호 이력 */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
        <p className="text-xs text-slate-400 mb-2 font-semibold flex items-center gap-1">
          <Clock size={12} /> 신호 이력
        </p>
        {signals.length === 0 ? (
          <p className="text-xs text-slate-500">아직 신호 없음</p>
        ) : (
          <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
            {signals.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-slate-500 shrink-0">{s.time}</span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-white text-xs font-bold ${
                    s.source === "관제탑→선박" ? "bg-red-700" : "bg-sky-700"
                  }`}
                >
                  {s.source === "관제탑→선박" ? "↓관제" : "↑선박"}
                </span>
                <span className="truncate text-slate-300">{s.cmd}</span>
                {s.ack && <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 아두이노 연동 안내 */}
      <p className="text-xs text-slate-500 leading-relaxed">
        아두이노(ESP32)는 30초마다 명령을 폴링합니다.
        <br />
        <code className="text-sky-400">emergency_return / siren_on</code> 수신 시 GPIO14 릴레이 ON → 사이렌 울림.
      </p>
    </div>
  );
}
