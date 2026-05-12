/**
 * 사이드바「항로 길안내」행 가운데 — 경로를 따라가는 느낌으로 네비·길안내 목적을 암시하는 미니 시각.
 */
export function TrackRecordSidebarHint() {
  return (
    <div
      className="pointer-events-none flex min-h-[22px] min-w-0 flex-1 select-none items-center justify-center px-0.5"
      title="지도·항로 안내로 이어지는 경로를 떠올리게 합니다. 상세 수치·보고는 오른쪽 보고 버튼에서 확인합니다"
      aria-hidden
    >
      <style>{`
        @keyframes trk-hint-dash {
          to { stroke-dashoffset: -22; }
        }
        @keyframes trk-hint-boat {
          0%, 100% { transform: translate(0, 0); opacity: 0.85; }
          50% { transform: translate(-1px, 0.5px); opacity: 1; }
        }
        .trk-hint-path {
          animation: trk-hint-dash 2.4s linear infinite;
        }
        .trk-hint-boat {
          animation: trk-hint-boat 1.8s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>
      <svg
        viewBox="0 0 104 28"
        className="h-[22px] w-full max-w-[6.75rem] text-teal-300/75"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          className="trk-hint-path"
          d="M3 19 C22 7 42 24 62 12 S88 8 100 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeDasharray="5 4"
          strokeOpacity="0.55"
        />
        <g className="trk-hint-boat" transform="translate(62,12)">
          <path
            d="M-2 2 L5 -1 L5 1 L-2 4 Z"
            fill="#99f6e4"
            fillOpacity="0.95"
            stroke="#5eead4"
            strokeWidth="0.4"
          />
          <path d="M-4 3 L-2 2 L-2 4 Z" fill="#ccfbf1" fillOpacity="0.7" />
        </g>
      </svg>
    </div>
  );
}
