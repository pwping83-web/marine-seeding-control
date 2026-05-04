import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/sidebar";
import { DataPanel } from "./components/data-panel";
import { SeagrassMap, type DropPoint } from "./components/seagrass-map";
import { HistoryView } from "./components/history-view";
import { LoginPage } from "./components/login-page";
import { BusinessInfoFooter } from "./components/BusinessInfoFooter";
import { OPS_AREA_CENTER, SIM_SEA_OFFSET } from "./geo/koreaOpsArea";
import { Bell, HelpCircle, LogOut, User } from "lucide-react";

type View = "dashboard" | "history";

const BASE_LAT = OPS_AREA_CENTER.lat;
const BASE_LNG = OPS_AREA_CENTER.lng;

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function seedInitialDrops(): DropPoint[] {
  const points: { x: number; y: number }[] = [
    { x: 420, y: 220 }, { x: 460, y: 250 }, { x: 500, y: 270 },
    { x: 540, y: 290 }, { x: 580, y: 305 }, { x: 620, y: 320 },
    { x: 660, y: 335 }, { x: 690, y: 360 },
  ];
  const now = Date.now();
  return points.map((p, i) => {
    const t = new Date(now - (points.length - i) * 4 * 60 * 1000);
    return {
      id: String(1001 + i).padStart(4, "0"),
      time: formatTime(t),
      lat:
        BASE_LAT +
        (p.y - 350) * 0.0005 +
        SIM_SEA_OFFSET.lat +
        (Math.random() - 0.5) * 0.0002,
      lng:
        BASE_LNG +
        (p.x - 500) * 0.0005 +
        SIM_SEA_OFFSET.lng +
        (Math.random() - 0.5) * 0.0002,
      status: "Success",
      x: p.x,
      y: p.y,
    };
  });
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [drops, setDrops] = useState<DropPoint[]>(() => seedInitialDrops());
  const [vessel, setVessel] = useState({ x: 700, y: 365, heading: 60 });
  const [path, setPath] = useState<{ x: number; y: number }[]>(() => [
    { x: 380, y: 200 }, { x: 420, y: 220 }, { x: 460, y: 250 },
    { x: 500, y: 270 }, { x: 540, y: 290 }, { x: 580, y: 305 },
    { x: 620, y: 320 }, { x: 660, y: 335 }, { x: 690, y: 360 },
  ]);
  const [connected] = useState(true);
  const counter = useRef(1009);

  useEffect(() => {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#123A66"/>
      <stop offset="100%" stop-color="#0B2545"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <path d="M4 42 Q14 36 24 42 T44 42 T64 42 V52 Q54 46 44 52 T24 52 T4 52 Z" fill="#40E0D0" opacity="0.85"/>
  <path d="M4 50 Q14 44 24 50 T44 50 T64 50 V64 H4 Z" fill="#1FB5A8"/>
  <circle cx="42" cy="22" r="9" fill="#FF8A1F" stroke="#fff" stroke-width="2.5"/>
  <circle cx="42" cy="22" r="2.5" fill="#fff"/>
</svg>`.trim();
    const href = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = href;
    document.title = "SeaRestore · Marine Ops Console";
  }, []);

  useEffect(() => {
    const moveIv = setInterval(() => {
      setVessel((v) => {
        const dx = (Math.random() - 0.3) * 8;
        const dy = (Math.random() - 0.4) * 6;
        const nx = Math.max(380, Math.min(760, v.x + dx));
        const ny = Math.max(180, Math.min(390, v.y + dy));
        const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
        setPath((p) => {
          const next = [...p, { x: nx, y: ny }];
          return next.length > 80 ? next.slice(-80) : next;
        });
        return { x: nx, y: ny, heading };
      });
    }, 2000);

    const dropIv = setInterval(() => {
      setVessel((v) => {
        counter.current += 1;
        const id = String(counter.current).padStart(4, "0");
        const newDrop: DropPoint = {
          id,
          time: formatTime(new Date()),
          lat:
            BASE_LAT +
            (v.y - 350) * 0.0005 +
            SIM_SEA_OFFSET.lat +
            (Math.random() - 0.5) * 0.0002,
          lng:
            BASE_LNG +
            (v.x - 500) * 0.0005 +
            SIM_SEA_OFFSET.lng +
            (Math.random() - 0.5) * 0.0002,
          status: "Success",
          x: v.x,
          y: v.y,
        };
        setDrops((d) => [...d, newDrop].slice(-200));
        return v;
      });
    }, 6000);

    return () => {
      clearInterval(moveIv);
      clearInterval(dropIv);
    };
  }, []);

  const today = 124 + drops.length - 8;

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="h-screen w-full flex bg-slate-50 text-slate-900 overflow-hidden">
      <Sidebar view={view} onChange={setView} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
          <div>
            <div className="text-slate-500" style={{ fontSize: 11, letterSpacing: 1 }}>
              MARINE ECOSYSTEM RESTORATION · SEAGRASS SEEDING
            </div>
            <div className="text-[#0B2545]" style={{ fontSize: 14, fontWeight: 600 }}>
              {view === "dashboard" ? "Operations Dashboard" : "Historical Records"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-md hover:bg-slate-100 text-slate-600">
              <HelpCircle className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-md hover:bg-slate-100 text-slate-600 relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-orange-500" />
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <div className="flex items-center gap-2 pl-1 pr-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white">
                <User className="w-4 h-4" />
              </div>
              <div className="leading-tight">
                <div className="text-slate-700" style={{ fontSize: 12, fontWeight: 500 }}>
                  J. Park
                </div>
                <div className="text-slate-500" style={{ fontSize: 11 }}>
                  Project Manager
                </div>
              </div>
              <button
                onClick={() => setAuthed(false)}
                title="Sign out"
                className="ml-1 p-2 rounded-md hover:bg-slate-100 text-slate-500"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {view === "dashboard" ? (
          <div className="flex-1 flex overflow-hidden">
            <DataPanel drops={drops} target={2000} />
            <div className="flex-1 p-4 overflow-hidden">
              <SeagrassMap
                drops={drops}
                vessel={vessel}
                path={path}
                connected={connected}
                todayCount={today}
              />
            </div>
          </div>
        ) : (
          <HistoryView drops={drops} />
        )}

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2">
          <BusinessInfoFooter className="!mt-0 !pt-0 max-w-5xl mx-auto border-0" />
        </div>
      </div>
    </div>
  );
}
