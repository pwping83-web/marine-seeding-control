import { LayoutDashboard, Database, FileBarChart2, Settings, Waves, Map as MapIcon } from "lucide-react";

type View = "dashboard" | "history";

export function Sidebar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const items: { key: View | "settings" | "team"; label: string; icon: any; disabled?: boolean }[] = [
    { key: "dashboard", label: "Live Dashboard", icon: LayoutDashboard },
    { key: "history", label: "History & Reports", icon: FileBarChart2 },
    { key: "team", label: "Vessels & Crew", icon: MapIcon, disabled: true },
    { key: "settings", label: "Settings", icon: Settings, disabled: true },
  ];

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-[#0B2545] text-slate-100 flex flex-col">
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-2.5">
        <div className="rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 p-1.5">
          <Waves className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-white" style={{ fontSize: 14, fontWeight: 600 }}>SeaRestore</div>
          <div className="text-slate-400" style={{ fontSize: 11 }}>Marine Ops Console</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <div className="text-slate-500 px-2 pt-2 pb-1" style={{ fontSize: 10, letterSpacing: 1.5 }}>
          MONITORING
        </div>
        {items.map((it) => {
          const active = it.key === view;
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              disabled={it.disabled}
              onClick={() => !it.disabled && onChange(it.key as View)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left ${
                active
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/20"
                  : it.disabled
                  ? "text-slate-500 cursor-not-allowed opacity-60"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
              style={{ fontSize: 13 }}
            >
              <Icon className="w-4 h-4" />
              {it.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="rounded-md bg-white/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-3.5 h-3.5 text-cyan-300" />
            <span className="text-slate-300" style={{ fontSize: 11 }}>Data Stream</span>
          </div>
          <div className="text-slate-400" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
            AIS + GPS telemetry · 1Hz<br />
            Last sync: just now
          </div>
        </div>
      </div>
    </aside>
  );
}
