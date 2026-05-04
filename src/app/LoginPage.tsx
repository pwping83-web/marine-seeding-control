import { useState, useEffect, FormEvent } from "react";
import { Lock, Mail, ShieldCheck, AlertCircle } from "lucide-react";
import ManualModal, { ManualButton } from "./ManualModal";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { logSiteAccess, marineDbEnabled } from "@/lib/marine-db";
import { isEmailJsAccessNotifyConfigured, sendAccessNotifyEmail } from "@/lib/emailjs-access";
import {
  fetchClientAccessGeo,
  geoToAccessLocationLine,
  formatAccessTimeKorea,
} from "@/lib/fetch-client-access-geo";
async function sendLoginSuccessAccessEmail(): Promise<void> {
  if (!isEmailJsAccessNotifyConfigured()) return;
  try {
    const geo = await fetchClientAccessGeo();
    await sendAccessNotifyEmail({
      accessLocation: geoToAccessLocationLine(geo, { forEmail: true }),
      accessTime: formatAccessTimeKorea(),
    });
  } catch (e) {
    console.warn("[emailjs] 로그인 접속 알림 실패", e);
  }
}

// ─── Bubble data for background particles ─────────────────────────────────────
const BUBBLES: { left: string; size: number; dur: number; delay: number; opacity: number }[] = [
  { left: "5%",  size: 5,  dur: 14, delay: 0,  opacity: 0.18 },
  { left: "10%", size: 8,  dur: 18, delay: 3,  opacity: 0.12 },
  { left: "16%", size: 4,  dur: 12, delay: 7,  opacity: 0.22 },
  { left: "23%", size: 10, dur: 20, delay: 1,  opacity: 0.10 },
  { left: "31%", size: 5,  dur: 16, delay: 9,  opacity: 0.20 },
  { left: "38%", size: 3,  dur: 11, delay: 5,  opacity: 0.25 },
  { left: "46%", size: 7,  dur: 15, delay: 12, opacity: 0.14 },
  { left: "53%", size: 4,  dur: 19, delay: 2,  opacity: 0.22 },
  { left: "61%", size: 9,  dur: 13, delay: 6,  opacity: 0.11 },
  { left: "68%", size: 5,  dur: 17, delay: 10, opacity: 0.19 },
  { left: "74%", size: 6,  dur: 14, delay: 4,  opacity: 0.16 },
  { left: "81%", size: 3,  dur: 22, delay: 8,  opacity: 0.24 },
  { left: "87%", size: 8,  dur: 16, delay: 15, opacity: 0.13 },
  { left: "93%", size: 4,  dur: 12, delay: 11, opacity: 0.21 },
  { left: "27%", size: 6,  dur: 18, delay: 17, opacity: 0.15 },
  { left: "57%", size: 3,  dur: 13, delay: 14, opacity: 0.23 },
  { left: "42%", size: 7,  dur: 21, delay: 19, opacity: 0.12 },
  { left: "78%", size: 5,  dur: 15, delay: 16, opacity: 0.18 },
];

// ─── Depth ring decorations ───────────────────────────────────────────────────
const RINGS = [
  { cx: "12%",  cy: "70%", rx: "18%", ry: "12%", delay: 0   },
  { cx: "85%",  cy: "80%", rx: "14%", ry: "9%",  delay: 1.5 },
  { cx: "50%",  cy: "90%", rx: "35%", ry: "18%", delay: 0.8 },
];

type LoginPageProps = { onSuccess: () => void };

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("marine@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [mounted, setMounted]   = useState(false);
  const [clock, setClock]       = useState(new Date());
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!marineDbEnabled()) return;

    let cancelled = false;
    (async () => {
      const geo = await fetchClientAccessGeo();
      if (cancelled) return;
      try {
        await logSiteAccess({
          ip: geo.ip,
          country: geo.country,
          region: geo.region,
          city: geo.city,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          path:
            typeof window !== "undefined"
              ? `${window.location.pathname}${window.location.search}`
              : "/",
        });
      } catch {
        /* DB 기록 실패는 조용히 무시 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (isSupabaseConfigured()) {
      try {
        const { error: signError } = await getSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signError) {
          setError(signError.message);
          return;
        }
        void sendLoginSuccessAccessEmail();
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : "연결에 실패했습니다.");
      } finally {
        setLoading(false);
      }
      return;
    }
    setTimeout(() => {
      setLoading(false);
      void sendLoginSuccessAccessEmail();
      onSuccess();
    }, 600);
  }

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(175deg, #071f3a 0%, #051629 40%, #031020 100%)" }}
    >
      {/* ── CSS Keyframes ──────────────────────────────────────────────── */}
      <style>{`
        @keyframes anchorGlow {
          0%,65%,100% {
            filter: drop-shadow(0 0 6px rgba(64,224,208,0.35)) brightness(1);
          }
          70% {
            filter: drop-shadow(0 0 14px rgba(64,224,208,0.75))
                    drop-shadow(0 0 30px rgba(64,224,208,0.4)) brightness(1.18);
          }
          73% {
            filter: drop-shadow(0 0 22px rgba(255,255,255,0.55))
                    drop-shadow(0 0 50px rgba(64,224,208,0.55)) brightness(1.3);
          }
          76% {
            filter: drop-shadow(0 0 14px rgba(64,224,208,0.75))
                    drop-shadow(0 0 30px rgba(64,224,208,0.4)) brightness(1.18);
          }
          80% {
            filter: drop-shadow(0 0 6px rgba(64,224,208,0.35)) brightness(1);
          }
        }
        @keyframes orbitRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes floatBubble {
          0%   { transform: translateY(0) scale(1);   opacity: 0; }
          8%   { opacity: 1; }
          90%  { opacity: 0.8; }
          100% { transform: translateY(-100vh) scale(0.55); opacity: 0; }
        }
        @keyframes waveSlide {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(28px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes scanLine {
          0%   { top: -3px; opacity: 0; }
          6%   { opacity: 0.5; }
          92%  { opacity: 0.5; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes ringPulse {
          0%,100% { opacity: 0.08; }
          50%     { opacity: 0.18; }
        }
        @keyframes btnShimmer {
          from { background-position: -200% 0; }
          to   { background-position: 200% 0; }
        }
        @keyframes dotBlink {
          0%,100% { opacity:0.2; } 50% { opacity:1; }
        }
        @keyframes statusPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.45); }
          50%     { box-shadow: 0 0 0 5px rgba(52,211,153,0); }
        }
      `}</style>

      {/* ── Floating depth rings (decorative) ──────────────────────────── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      >
        {RINGS.map((r, i) => (
          <ellipse
            key={i}
            cx={r.cx}
            cy={r.cy}
            rx={r.rx}
            ry={r.ry}
            fill="none"
            stroke="rgba(64,224,208,1)"
            strokeWidth="0.6"
            strokeDasharray="6 8"
            style={{ animation: `ringPulse 5s ease-in-out ${r.delay}s infinite` }}
          />
        ))}
      </svg>

      {/* ── Grid overlay ────────────────────────────────────────────────── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.04, zIndex: 0 }}
      >
        <defs>
          <pattern id="loginGrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#40E0D0" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#loginGrid)" />
      </svg>

      {/* ── Ambient glow orbs ───────────────────────────────────────────── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-10%", right: "-5%", width: "45%", height: "45%",
          background: "radial-gradient(circle, rgba(31,181,168,0.14) 0%, transparent 70%)",
          filter: "blur(40px)", zIndex: 0,
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "5%", left: "-8%", width: "40%", height: "40%",
          background: "radial-gradient(circle, rgba(14,77,123,0.25) 0%, transparent 65%)",
          filter: "blur(50px)", zIndex: 0,
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: "30%", left: "50%", transform: "translateX(-50%)",
          width: "60%", height: "30%",
          background: "radial-gradient(ellipse, rgba(64,224,208,0.04) 0%, transparent 70%)",
          filter: "blur(30px)", zIndex: 0,
        }}
      />

      {/* ── Floating bubble particles ───────────────────────────────────── */}
      {BUBBLES.map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: b.left,
            bottom: "-20px",
            width: b.size,
            height: b.size,
            background: `rgba(64,224,208,${b.opacity})`,
            border: "1px solid rgba(64,224,208,0.3)",
            zIndex: 1,
            animation: `floatBubble ${b.dur}s ease-in-out ${b.delay}s infinite`,
          }}
        />
      ))}

      {/* ── Wave animation at bottom ────────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{ height: 120, overflow: "hidden", zIndex: 1 }}
      >
        <svg
          viewBox="0 0 1920 120"
          preserveAspectRatio="none"
          style={{
            position: "absolute", bottom: 0, left: 0,
            width: "200%", height: "100%",
            animation: "waveSlide 14s linear infinite",
          }}
        >
          <path
            d="M 0 70 C 160 40 320 95 480 70 C 640 40 800 95 960 70 C 1120 40 1280 95 1440 70 C 1600 40 1760 95 1920 70 L 1920 120 L 0 120 Z"
            fill="rgba(64,224,208,0.07)"
          />
        </svg>
        <svg
          viewBox="0 0 1920 120"
          preserveAspectRatio="none"
          style={{
            position: "absolute", bottom: 0, left: 0,
            width: "200%", height: "100%",
            animation: "waveSlide 20s linear infinite reverse",
            opacity: 0.6,
          }}
        >
          <path
            d="M 0 85 C 120 65 240 100 360 85 C 480 65 600 100 720 85 C 840 65 960 100 1080 85 C 1200 65 1320 100 1440 85 C 1560 65 1680 100 1800 85 C 1860 78 1920 92 1920 85 L 1920 120 L 0 120 Z"
            fill="rgba(64,224,208,0.05)"
          />
        </svg>
      </div>

      {/* Manual modal */}
      <ManualModal isOpen={manualOpen} onClose={() => setManualOpen(false)} />

      {/* ── Corner metadata labels ───────────────────────────────────────── */}
      <div className="absolute top-4 left-5 text-xs font-mono text-cyan-400/35 pointer-events-none" style={{ zIndex: 2 }}>
        34.582°N · 128.719°E
      </div>
      {/* 우상단: 시각 위 · M 버튼 아래 (겹침 방지) */}
      <div className="absolute top-4 right-5 z-20 flex flex-col items-end gap-2">
        <div className="text-xs font-mono text-cyan-400/35 text-right pointer-events-none">
          <span>{clock.toLocaleTimeString("ko-KR", { hour12: false })}</span>
          <span className="ml-2">KST</span>
        </div>
        <div className="pointer-events-auto">
          <ManualButton onClick={() => setManualOpen(true)} />
        </div>
      </div>
      <div className="absolute bottom-4 left-5 text-[10px] font-mono text-white/20 pointer-events-none" style={{ zIndex: 2 }}>
        해양수산부 · 해양 종자 살포 관제체계
      </div>
      <div className="absolute bottom-4 right-5 text-[10px] font-mono text-white/20 pointer-events-none" style={{ zIndex: 2 }}>
        v2.1.0 · SECURE
      </div>

      {/* ══ Login card ══════════════════════════════════════════════════════ */}
      <div
        className="relative w-full max-w-[420px] mx-4"
        style={{
          zIndex: 10,
          animation: mounted ? "cardIn 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards" : "none",
          opacity: mounted ? undefined : 0,
        }}
      >
        {/* Card body */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, rgba(11,37,69,0.92) 0%, rgba(6,22,44,0.97) 100%)",
            border: "1px solid rgba(64,224,208,0.15)",
            boxShadow: `
              0 32px 100px rgba(0,0,0,0.55),
              0 0 0 1px rgba(255,255,255,0.04) inset,
              0 1px 0 rgba(255,255,255,0.07) inset
            `,
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Horizontal scan line */}
          <div
            className="absolute inset-x-0 pointer-events-none"
            style={{
              height: 2,
              background: "linear-gradient(90deg, transparent 0%, rgba(64,224,208,0.45) 40%, rgba(255,255,255,0.3) 50%, rgba(64,224,208,0.45) 60%, transparent 100%)",
              animation: "scanLine 10s ease-in-out 2s infinite",
              zIndex: 20,
            }}
          />

          {/* Top accent line */}
          <div
            className="absolute top-0 inset-x-0 h-[1px] pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(64,224,208,0.6) 50%, transparent 100%)",
            }}
          />

          <div className="p-8 sm:p-10">
            {/* ── Logo section ─────────────────────────────────────── */}
            <div className="flex flex-col items-center text-center mb-8">
              {/* Logo with orbit ring */}
              <div className="relative mb-5">
                {/* Outer orbit ring */}
                <div
                  className="absolute inset-[-14px] rounded-full pointer-events-none"
                  style={{
                    border: "1px dashed rgba(64,224,208,0.2)",
                    animation: "orbitRing 18s linear infinite",
                  }}
                >
                  {/* Orbit dot */}
                  <div
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      top: "50%",
                      left: "-4px",
                      transform: "translateY(-50%)",
                      background: "#40E0D0",
                      boxShadow: "0 0 6px #40E0D0",
                    }}
                  />
                </div>

                {/* Inner glow ring */}
                <div
                  className="absolute inset-[-6px] rounded-2xl pointer-events-none"
                  style={{
                    background: "radial-gradient(circle, rgba(64,224,208,0.12) 0%, transparent 70%)",
                  }}
                />

                {/* Logo image — anchor glow animation */}
                <img
                  src="/logo.svg"
                  width={80}
                  height={80}
                  className="relative h-20 w-20 rounded-2xl"
                  alt="해양 종자 살포 관제"
                  style={{
                    animation: "anchorGlow 14s ease-in-out infinite",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  }}
                />
              </div>

              {/* Title */}
              <h1
                className="text-white font-bold tracking-tight"
                style={{ fontSize: 22, letterSpacing: "-0.02em" }}
              >
                해양 종자 살포 관제
              </h1>
              <p
                className="mt-1.5 font-medium tracking-widest uppercase"
                style={{ color: "rgba(64,224,208,0.75)", fontSize: 10, letterSpacing: "0.18em" }}
              >
                Marine Seeding Control System
              </p>

              {/* Status badges */}
              <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    background: "rgba(52,211,153,0.1)",
                    border: "1px solid rgba(52,211,153,0.25)",
                    color: "rgba(52,211,153,0.9)",
                  }}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"
                    style={{ animation: "statusPulse 2s ease-in-out infinite" }}
                  />
                  <ShieldCheck className="w-3 h-3" />
                  내부망 인증 전용
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  관공서 납품 시연
                </span>
              </div>
            </div>

            {/* Divider */}
            <div
              className="mb-6 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
            />

            {/* ── Form ─────────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label
                  htmlFor="login-email"
                  className="block mb-2 text-xs font-semibold tracking-wide"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  이메일 (계정)
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: "rgba(64,224,208,0.5)" }}
                  />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="예: marine@gmail.com"
                    className="w-full rounded-xl py-3 pl-10 pr-4 text-sm text-white outline-none transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.9)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(64,224,208,0.5)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(64,224,208,0.08)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="login-password"
                  className="block mb-2 text-xs font-semibold tracking-wide"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  비밀번호
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: "rgba(64,224,208,0.5)" }}
                  />
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-full rounded-xl py-3 pl-10 pr-4 text-sm text-white outline-none transition-all duration-200"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.9)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(64,224,208,0.5)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(64,224,208,0.08)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    color: "#fca5a5",
                  }}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl py-3.5 text-sm font-bold tracking-wide text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-1"
                style={{
                  background: loading
                    ? "linear-gradient(135deg, #0e7490 0%, #0a5f73 100%)"
                    : "linear-gradient(135deg, #1FB5A8 0%, #0e7490 50%, #1FB5A8 100%)",
                  backgroundSize: loading ? "100% 100%" : "200% 100%",
                  backgroundPosition: "0% 0%",
                  boxShadow: loading
                    ? "none"
                    : "0 4px 24px rgba(31,181,168,0.38), 0 0 0 1px rgba(31,181,168,0.2) inset",
                  animation: loading ? "none" : "btnShimmer 3s ease-in-out infinite",
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2.5">
                    <span
                      className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent"
                      style={{ animation: "orbitRing 0.7s linear infinite" }}
                    />
                    접속 인증 중
                    <span style={{ animation: "dotBlink 1s 0.0s infinite" }}>.</span>
                    <span style={{ animation: "dotBlink 1s 0.3s infinite" }}>.</span>
                    <span style={{ animation: "dotBlink 1s 0.6s infinite" }}>.</span>
                  </span>
                ) : (
                  "관제 시스템 접속"
                )}
              </button>
            </form>

            {/* ── Footer info ──────────────────────────────────────── */}
            <div
              className="mt-6 pt-5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p
                className="text-center leading-relaxed"
                style={{ color: "rgba(255,255,255,0.28)", fontSize: 11 }}
              >
                Supabase 미연동 시: 이메일·비밀번호 없이도 접속 버튼만으로 대시보드로 이동합니다.
              </p>

              {/* System status row */}
              <div className="mt-3 flex items-center justify-center gap-3">
                {[
                  { label: "위성 연결", ok: true },
                  { label: "서버 정상", ok: true },
                  { label: "암호화 활성", ok: true },
                ].map((s) => (
                  <span
                    key={s.label}
                    className="flex items-center gap-1 text-[10px]"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{
                        background: s.ok ? "#34d399" : "#f87171",
                        boxShadow: s.ok ? "0 0 4px rgba(52,211,153,0.6)" : "0 0 4px rgba(248,113,113,0.6)",
                      }}
                    />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card bottom shadow glow */}
        <div
          className="absolute inset-x-4 bottom-0 h-12 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse, rgba(31,181,168,0.18) 0%, transparent 70%)",
            filter: "blur(12px)",
            transform: "translateY(50%)",
            zIndex: -1,
          }}
        />
      </div>
    </div>
  );
}
