import { Progress } from "./ui/progress";
import { CheckCircle2, Clock, Target } from "lucide-react";
import type { DropPoint } from "./seagrass-map";

export function DataPanel({ drops, target }: { drops: DropPoint[]; target: number }) {
  const completed = drops.length;
  const pct = Math.min(100, Math.round((completed / target) * 100));

  return (
    <div className="w-80 shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="px-4 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-[#0B2545]" />
          <span className="text-slate-700" style={{ fontSize: 13, fontWeight: 600 }}>
            Project Progress
          </span>
        </div>
        <div className="flex items-end justify-between mb-1.5">
          <span className="text-[#0B2545] tabular-nums" style={{ fontSize: 22, fontWeight: 600 }}>
            {completed.toLocaleString()}
          </span>
          <span className="text-slate-500 tabular-nums" style={{ fontSize: 12 }}>
            / {target.toLocaleString()} blocks
          </span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex justify-between mt-2 text-slate-500" style={{ fontSize: 11 }}>
          <span>{pct}% complete</span>
          <span>ETA: 14 days</span>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#0B2545]" />
          <span className="text-slate-700" style={{ fontSize: 13, fontWeight: 600 }}>
            Real-time Log
          </span>
        </div>
        <span className="text-emerald-600 flex items-center gap-1" style={{ fontSize: 11 }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          LIVE
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {drops.length === 0 && (
          <div className="text-center text-slate-400 py-10" style={{ fontSize: 12 }}>
            Waiting for telemetry…
          </div>
        )}
        {[...drops].reverse().map((d, idx) => (
          <div
            key={d.id}
            className={`px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
              idx === 0 ? "bg-orange-50/50" : ""
            }`}
          >
            <div className="flex items-start justify-between mb-1">
              <span className="text-slate-700 tabular-nums" style={{ fontSize: 12, fontWeight: 500 }}>
                {d.time}
              </span>
              <span className="flex items-center gap-1 text-emerald-600" style={{ fontSize: 11 }}>
                <CheckCircle2 className="w-3 h-3" />
                {d.status}
              </span>
            </div>
            <div className="text-slate-500 tabular-nums" style={{ fontSize: 11 }}>
              {d.lat.toFixed(5)}° N · {d.lng.toFixed(5)}° E
            </div>
            <div className="text-slate-400 mt-0.5" style={{ fontSize: 10.5 }}>
              Drop #{d.id} · Restoration Zone A-04
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
