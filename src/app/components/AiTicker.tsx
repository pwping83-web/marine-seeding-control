/**
 * 관제·모바일 공통 — 상단 AI 자막(마퀴) 티커
 */

export function AiTicker({
  vesselName,
  safetyLevel,
  groqSummary,
  aiMsg,
  windSpeed,
  waveHeight,
  temp,
  attachmentCue,
}: {
  vesselName: string;
  safetyLevel: string;
  groqSummary: string;
  aiMsg: string;
  windSpeed: number;
  waveHeight: number;
  temp: number;
  attachmentCue: string;
}) {
  const color = safetyLevel === "긴급" ? "#fca5a5" : safetyLevel === "주의" ? "#fcd34d" : "#6ee7b7";
  const base = `${safetyLevel === "긴급" ? "🚨 즉시 회항 권고" : safetyLevel === "주의" ? "⚠️ 기상 주의" : "✅ 안전 운항"} · 풍속 ${windSpeed.toFixed(1)}m/s · 파고 ${waveHeight.toFixed(1)}m · 기온 ${temp.toFixed(0)}°C`;
  const g = groqSummary.trim();
  const a = aiMsg.trim();
  const extra = g ? ` · ⚡ ${g}` : a ? ` · ${a}` : "";
  const att = attachmentCue.trim();
  const attPart = att ? ` · 🌱 ${att}` : "";
  const segment = `${vesselName} · ${base}${extra}${attPart}`;
  const scrollSec = 22;
  const pauseSec = 30;
  const cycleSec = scrollSec + pauseSec;
  const scrollEndPct = (scrollSec / cycleSec) * 100;

  return (
    <div
      className="w-full min-w-0 shrink-0 overflow-hidden border-b border-white/[0.06]"
      style={{
        background: `${color}0a`,
        borderTop: `1px solid ${color}22`,
        backdropFilter: "blur(6px)",
      }}
      title={segment}
    >
      <style>{`
        @keyframes aiTickerCycle {
          0% { transform: translateX(100%); }
          ${scrollEndPct.toFixed(3)}% { transform: translateX(-100%); }
          100% { transform: translateX(-100%); }
        }
        .ai-marquee-track {
          display: inline-block;
          max-width: none;
          white-space: nowrap;
          padding-left: 1rem;
          padding-right: 1rem;
          animation: aiTickerCycle ${cycleSec}s linear infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .ai-marquee-track {
            animation: none;
            transform: none;
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
          }
        }
      `}</style>
      <div className="relative w-full min-w-0 py-1.5">
        <div className="ai-marquee-track text-[11px] font-semibold sm:text-[13px]" role="presentation" style={{ color }}>
          {segment}
        </div>
      </div>
    </div>
  );
}
