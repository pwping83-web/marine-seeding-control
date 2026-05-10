/**
 * AnimatedWeatherIcons
 *
 * 순수 CSS + SVG 애니메이션 날씨 아이콘 모음
 *  - WindIcon   : 바람 (흐르는 선)
 *  - WaveIcon   : 파도 (물결 사인 곡선)
 *  - RainIcon   : 비  (떨어지는 빗줄기)
 *  - WeatherStrip: 기상 수치 + 아이콘 통합 가로 띠
 */

// ─── WindIcon ─────────────────────────────────────────────────────────────────
export function WindIcon({ speed, size = 36 }: { speed: number; size?: number }) {
  // 풍속에 따라 선의 수·길이·애니메이션 속도 조절
  const intensity = speed >= 13 ? "fast" : speed >= 7 ? "mid" : "slow";
  const lineColor = speed >= 13 ? "#f87171" : speed >= 7 ? "#fbbf24" : "#67e8f9";

  const lines = [
    { y: 30, w: 60, delay: "0s"   },
    { y: 45, w: 45, delay: "0.3s" },
    { y: 60, w: 70, delay: "0.15s"},
    { y: 75, w: 35, delay: "0.45s"},
  ];

  const dur = intensity === "fast" ? "0.7s" : intensity === "mid" ? "1.2s" : "2s";

  return (
    <div style={{ width: size, height: size }}>
      <style>{`
        @keyframes windBlowFast { 0%{stroke-dashoffset:120} 100%{stroke-dashoffset:0} }
        @keyframes windBlowMid  { 0%{stroke-dashoffset:100} 100%{stroke-dashoffset:0} }
        @keyframes windBlowSlow { 0%{stroke-dashoffset:80}  100%{stroke-dashoffset:0} }
      `}</style>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        {lines.map((l, i) => (
          <line
            key={i}
            x1={100 - l.w} y1={l.y} x2={90} y2={l.y}
            stroke={lineColor}
            strokeWidth={intensity === "fast" ? 5 : 4}
            strokeLinecap="round"
            strokeDasharray="120"
            style={{
              animation: `windBlow${intensity === "fast" ? "Fast" : intensity === "mid" ? "Mid" : "Slow"} ${dur} ${l.delay} linear infinite`,
              opacity: 0.85,
            }}
          />
        ))}
        {/* 화살표 머리 */}
        <polygon
          points="88,24 100,30 88,36"
          fill={lineColor}
          opacity={0.9}
          style={{ animation: `windBlow${intensity === "fast" ? "Fast" : intensity === "mid" ? "Mid" : "Slow"} ${dur} linear infinite` }}
        />
      </svg>
    </div>
  );
}

// ─── WaveIcon ─────────────────────────────────────────────────────────────────
export function WaveIcon({ height, size = 36 }: { height: number; size?: number }) {
  const danger = height >= 1.5;
  const caution = height >= 1.0;
  const color = danger ? "#f87171" : caution ? "#fbbf24" : "#93c5fd";
  const amp = danger ? 18 : caution ? 13 : 9; // 파고 진폭
  const dur = danger ? "1.0s" : caution ? "1.5s" : "2.2s";

  // 사인 곡선 path 생성
  const makeWavePath = (phase: number) => {
    const pts = [];
    for (let x = 0; x <= 100; x += 5) {
      const y = 50 + amp * Math.sin((x / 100) * Math.PI * 2 + phase);
      pts.push(`${x},${y}`);
    }
    return `M ${pts.join(" L ")}`;
  };

  return (
    <div style={{ width: size, height: size }}>
      <style>{`
        @keyframes waveScroll1 { 0%{d:path("${makeWavePath(0)}")} 50%{d:path("${makeWavePath(Math.PI)}")} 100%{d:path("${makeWavePath(Math.PI * 2)}")} }
        @keyframes waveRise { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      `}</style>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        {/* 파도 3겹 */}
        {[0, 1, 2].map((layer) => (
          <path
            key={layer}
            d={makeWavePath(layer * (Math.PI / 1.5))}
            stroke={color}
            strokeWidth={3 - layer * 0.5}
            fill="none"
            strokeLinecap="round"
            opacity={1 - layer * 0.25}
            style={{
              animation: `waveRise ${dur} ${(layer * 0.3).toFixed(1)}s ease-in-out infinite`,
            }}
          />
        ))}
        {/* 물보라 점 */}
        {danger && [30, 55, 75].map((cx, i) => (
          <circle
            key={i}
            cx={cx}
            cy={32 + i * 4}
            r={2.5}
            fill={color}
            opacity={0.7}
            style={{ animation: `waveRise ${dur} ${(i * 0.2).toFixed(1)}s ease-in-out infinite` }}
          />
        ))}
      </svg>
    </div>
  );
}

// ─── RainIcon ─────────────────────────────────────────────────────────────────
export function RainIcon({ pop, size = 36 }: { pop: number; size?: number }) {
  const heavy = pop >= 70;
  const moderate = pop >= 50;
  const color = heavy ? "#818cf8" : moderate ? "#93c5fd" : "#bfdbfe";
  const dropCount = heavy ? 6 : moderate ? 4 : 2;
  const dur = heavy ? "0.6s" : moderate ? "0.9s" : "1.4s";

  const drops = Array.from({ length: dropCount }, (_, i) => ({
    cx: 12 + i * (76 / (dropCount - 1 || 1)),
    delay: `${(i * 0.15).toFixed(2)}s`,
  }));

  return (
    <div style={{ width: size, height: size }}>
      <style>{`
        @keyframes rainFall {
          0%   { transform: translateY(-15px); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(30px); opacity: 0; }
        }
      `}</style>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        {/* 구름 */}
        <ellipse cx="50" cy="38" rx="30" ry="16" fill={color} opacity={0.35} />
        <ellipse cx="38" cy="34" rx="18" ry="13" fill={color} opacity={0.4} />
        <ellipse cx="62" cy="36" rx="16" ry="11" fill={color} opacity={0.35} />
        {/* 빗줄기 */}
        {drops.map((d, i) => (
          <line
            key={i}
            x1={d.cx} y1={58}
            x2={d.cx - 4} y2={82}
            stroke={color}
            strokeWidth={heavy ? 2.5 : 2}
            strokeLinecap="round"
            opacity={0.9}
            style={{
              animation: `rainFall ${dur} ${d.delay} linear infinite`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

// ─── SunnyIcon ────────────────────────────────────────────────────────────────
export function SunnyIcon({ size = 36 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }}>
      <style>{`
        @keyframes sunRotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes sunPulse { 0%,100%{r:16} 50%{r:18} }
      `}</style>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <g style={{ transformOrigin: "50px 50px", animation: "sunRotate 12s linear infinite" }}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
            const r = (deg * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={50 + 22 * Math.cos(r)} y1={50 + 22 * Math.sin(r)}
                x2={50 + 34 * Math.cos(r)} y2={50 + 34 * Math.sin(r)}
                stroke="#fbbf24" strokeWidth={3.5} strokeLinecap="round"
              />
            );
          })}
        </g>
        <circle cx="50" cy="50" r="16" fill="#fcd34d" opacity={0.95}
          style={{ animation: "sunPulse 3s ease-in-out infinite" }} />
      </svg>
    </div>
  );
}

// ─── WeatherStrip ─────────────────────────────────────────────────────────────
/**
 * 기상 수치 + 애니메이션 아이콘을 한 줄에 배치하는 통합 띠.
 * Dashboard 사이드바 날씨 섹션을 완전히 대체합니다.
 */
export function WeatherStrip({
  windSpeed,
  windDir,
  windGust,
  waveHeight,
  visibility,
  temp,
  pop = 0,
}: {
  windSpeed: number;
  windDir: number;
  windGust: number;
  waveHeight: number;
  visibility: number;
  temp: number;
  pop?: number;
}) {
  const windColor = windSpeed >= 13 ? "#f87171" : windSpeed >= 10 ? "#fbbf24" : "#67e8f9";
  const waveColor = waveHeight >= 1.5 ? "#f87171" : waveHeight >= 1.0 ? "#fbbf24" : "#93c5fd";
  const rainColor = pop >= 70 ? "#818cf8" : pop >= 50 ? "#93c5fd" : "#bfdbfe";
  const isRaining = pop >= 30;
  const isSunny   = pop < 30 && windSpeed < 7 && waveHeight < 0.5;

  function windLabel(deg: number) {
    const dirs = ["N","NE","E","SE","S","SW","W","NW"];
    return dirs[Math.round(deg / 45) % 8];
  }

  return (
    <div className="flex items-stretch gap-0 w-full">
      {/* ── 아이콘 3칸 ── */}
      <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-xl"
        style={{ background: "rgba(255,255,255,0.04)", minWidth: 50 }}>
        <WindIcon speed={windSpeed} size={30} />
        <span className="text-[9px] font-bold" style={{ color: windColor }}>
          {windSpeed.toFixed(1)}<span className="text-white/40 font-normal">m/s</span>
        </span>
      </div>

      <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-xl mx-1"
        style={{ background: "rgba(255,255,255,0.04)", minWidth: 50 }}>
        <WaveIcon height={waveHeight} size={30} />
        <span className="text-[9px] font-bold" style={{ color: waveColor }}>
          {waveHeight.toFixed(1)}<span className="text-white/40 font-normal">m</span>
        </span>
      </div>

      <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-xl"
        style={{ background: "rgba(255,255,255,0.04)", minWidth: 50 }}>
        {isRaining ? (
          <RainIcon pop={pop} size={30} />
        ) : isSunny ? (
          <SunnyIcon size={30} />
        ) : (
          <WaveIcon height={0.3} size={30} />
        )}
        <span className="text-[9px] font-bold" style={{ color: isRaining ? rainColor : "#fcd34d" }}>
          {isRaining ? `${pop}%` : isSunny ? "맑음" : "구름"}
        </span>
      </div>

      {/* ── 수치 그리드 ── */}
      <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 ml-1 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)" }}>
        <DataCell label="풍향" val={windLabel(windDir)} color="rgba(255,255,255,0.7)" />
        <DataCell label="돌풍" val={`${windGust.toFixed(1)}m/s`} color="#fbbf24" />
        <DataCell label="시정" val={`${visibility.toFixed(0)}km`} color="#6ee7b7" />
        <DataCell label="기온" val={`${temp.toFixed(0)}°C`} color="#fdba74" />
      </div>
    </div>
  );
}

function DataCell({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] text-white/35 shrink-0">{label}</span>
      <span className="text-[11px] font-mono font-bold truncate" style={{ color }}>{val}</span>
    </div>
  );
}
