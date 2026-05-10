import { useCallback, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { WorkRecommendationLocal } from "@/lib/work-recommendation";
import type { WorkPlanGroqBrief } from "@/lib/groq-work-plan";

interface Props {
  open: boolean;
  onClose: () => void;
  local: WorkRecommendationLocal;
  ai: WorkPlanGroqBrief | null;
  aiLoading: boolean;
  groqConfigured: boolean;
  /** localStorage에서 불러온 현장 메모 */
  userNote: string;
  onUserNoteSave: (text: string) => void;
}

function Section({
  title,
  body,
  hint,
  hintReserved,
}: {
  title: string;
  body: string;
  hint?: string;
  hintReserved?: boolean;
}) {
  const h = hint?.trim();
  const showHintRow = Boolean(h) || hintReserved;
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(64,224,208,0.16)",
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200/55">{title}</p>
      <p className="mt-1 text-[13px] leading-snug text-white/90">{body}</p>
      {showHintRow ? (
        <p
          className={`mt-1.5 min-h-[2.35rem] border-t pt-1.5 text-[11px] leading-snug ${
            h ? "text-cyan-100/75" : "text-white/35"
          }`}
          style={{ borderColor: "rgba(64,224,208,0.12)" }}
        >
          {h || (hintReserved ? "\u00a0" : null)}
        </p>
      ) : null}
    </div>
  );
}

export function WorkPlanAiModal({
  open,
  onClose,
  local,
  ai,
  aiLoading,
  groqConfigured,
  userNote,
  onUserNoteSave,
}: Props) {
  const [draft, setDraft] = useState(userNote);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    if (open) setDraft(userNote);
  }, [open, userNote]);

  const handleSave = useCallback(() => {
    onUserNoteSave(draft.trim());
    setSavedHint(true);
    window.setTimeout(() => setSavedHint(false), 2200);
  }, [draft, onUserNoteSave]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 px-4 pb-10 pt-10 sm:pt-14 sm:pb-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="work-ai-modal-title"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-md min-h-0 flex-col self-start rounded-xl shadow-2xl min-h-[min(28rem,calc(100dvh-7rem))] max-h-[min(calc(100dvh-4.5rem),42rem)]"
        style={{
          background: "linear-gradient(160deg, #0c2748 0%, #081b34 100%)",
          border: "1px solid rgba(64,224,208,0.22)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3"
          style={{ borderColor: "rgba(64,224,208,0.15)", background: "rgba(0,0,0,0.2)" }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-black tracking-tight text-teal-100"
              style={{
                background: "rgba(64,224,208,0.12)",
                border: "1px solid rgba(64,224,208,0.35)",
              }}
            >
              AI
            </span>
            <div className="min-w-0">
              <h2 id="work-ai-modal-title" className="text-sm font-bold tracking-tight text-white sm:text-base">
                금일 작업 보조 요약
              </h2>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-cyan-200/70">
                <Sparkles className="h-3 w-3 shrink-0 text-cyan-300/80" aria-hidden />
                추천 시간 · 작업량 · 범위(예보·안전레벨 기반)
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

        {/* 현장 메모 — 스크롤 밖에 고정 */}
        <div className="shrink-0 border-b px-4 py-2.5" style={{ borderColor: "rgba(64,224,208,0.12)", background: "rgba(0,0,0,0.15)" }}>
          <label htmlFor="work-ai-user-note" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-cyan-200/60">
            현장·상황 메모
          </label>
          <textarea
            id="work-ai-user-note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="예: 인력 2명만 승선, 오후만 작업, 인근 양식장과 협의 필요…"
            rows={3}
            maxLength={4000}
            className="w-full resize-y rounded-lg px-2.5 py-2 text-[12px] leading-snug text-white placeholder:text-white/35 outline-none transition-colors [color-scheme:dark]"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(64,224,208,0.2)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2)",
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg border border-cyan-500/35 bg-cyan-950/50 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-900/55"
            >
              저장
            </button>
            <span className="text-[10px] text-white/40">이 PC 브라우저에만 저장됩니다.</span>
            {savedHint ? (
              <span className="text-[10px] font-medium text-teal-300">저장됨</span>
            ) : null}
          </div>
          {groqConfigured ? (
            <p className="mt-1.5 text-[10px] leading-snug text-cyan-200/55">
              저장 시 위 메모가 AI 보조 한 줄에 반영되도록 다시 분석합니다.
            </p>
          ) : (
            <p className="mt-1.5 text-[10px] leading-snug text-white/40">
              Groq 키가 없으면 메모만 저장되며, 아래 참고 문구는 예보·안전레벨 기준입니다.
            </p>
          )}
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(51,65,85,0.6) transparent" }}
        >
          <div className="space-y-2.5">
            <Section
              title="추천 작업 시간"
              body={local.recommendedTime}
              hint={ai?.timeHint}
              hintReserved={groqConfigured}
            />
            <Section
              title="작업량(강도) 권고"
              body={local.workload}
              hint={ai?.workloadHint}
              hintReserved={groqConfigured}
            />
            <Section
              title="작업 범위"
              body={local.scope}
              hint={ai?.scopeHint}
              hintReserved={groqConfigured}
            />

            <div className="flex min-h-[1.375rem] items-center justify-center text-center text-[11px] text-cyan-200/60">
              {aiLoading && groqConfigured ? "보조 문구 생성 중…" : "\u00a0"}
            </div>

            {!groqConfigured && (
              <p
                className="rounded-lg px-2.5 py-2 text-[11px] leading-snug text-white/50"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(64,224,208,0.12)" }}
              >
                API 키가 없을 때는 위 항목만 표시됩니다. Groq 키를 설정하면 짧은 보조 설명이 추가됩니다.
              </p>
            )}

            {ai?.caution ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-2.5 py-2 text-[11px] leading-snug text-amber-200/80">
                {ai.caution}
              </p>
            ) : null}

            <p
              className="rounded-lg px-3 py-2.5 text-[11px] leading-relaxed text-cyan-50/90 sm:text-xs"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(64,224,208,0.18)" }}
            >
              {local.basisNote}
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t px-4 py-2.5" style={{ borderColor: "rgba(64,224,208,0.12)", background: "rgba(0,0,0,0.15)" }}>
          <button
            type="button"
            className="w-full rounded-lg py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99]"
            style={{
              background: "linear-gradient(135deg, #1FB5A8 0%, #0e7490 100%)",
              boxShadow: "0 2px 12px rgba(31,181,168,0.35)",
            }}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
