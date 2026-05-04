import { useState, type FormEvent } from "react";
import { Waves, Mail, Lock, Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { BusinessInfoFooter } from "./BusinessInfoFooter";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin();
    }, 700);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-50">
      <div className="flex flex-1 min-h-0 w-full">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[44%] relative overflow-hidden bg-gradient-to-br from-[#0B2545] via-[#0d3a5f] to-[#0a4670] text-white p-12 flex-col justify-between">
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 400 600" preserveAspectRatio="none">
          <defs>
            <pattern id="lp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="400" height="600" fill="url(#lp-grid)" />
          <path
            d="M 0 420 Q 80 400 160 420 T 320 420 T 480 420 V 600 H 0 Z"
            fill="rgba(64,224,208,0.25)"
          />
          <path
            d="M 0 470 Q 80 450 160 470 T 320 470 T 480 470 V 600 H 0 Z"
            fill="rgba(64,224,208,0.4)"
          />
        </svg>

        <div className="relative flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 p-2.5">
            <Waves className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-white" style={{ fontSize: 16, fontWeight: 600 }}>
              SeaRestore
            </div>
            <div className="text-cyan-200" style={{ fontSize: 11, letterSpacing: 1 }}>
              MARINE OPS · GOV PORTAL
            </div>
          </div>
        </div>

        <div className="relative space-y-4 max-w-md">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span style={{ fontSize: 11, letterSpacing: 0.5 }}>SECURE GOVERNMENT ACCESS</span>
          </div>
          <h1 className="text-white" style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2 }}>
            Marine Ecosystem<br />Restoration Console
          </h1>
          <p className="text-slate-300" style={{ fontSize: 14, lineHeight: 1.6 }}>
            Real-time monitoring of vessel routes and seagrass seed-block deployments
            across coastal restoration zones. Authorized personnel only.
          </p>
        </div>

        <div className="relative text-slate-400 flex items-center justify-between gap-4" style={{ fontSize: 11 }}>
          <span>© 2026 SeaRestore</span>
          <span>v2.4.1</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 p-2">
              <Waves className="w-5 h-5 text-white" />
            </div>
            <div className="text-[#0B2545]" style={{ fontSize: 16, fontWeight: 600 }}>
              SeaRestore
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-[#0B2545]" style={{ fontSize: 26, fontWeight: 600 }}>
              Sign in to your account
            </h2>
            <p className="text-slate-500 mt-1.5" style={{ fontSize: 13 }}>
              Use your government-issued admin credentials.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-slate-700" style={{ fontSize: 12, fontWeight: 500 }}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="email"
                  placeholder="marine@gmail.com"
                  className="pl-9 h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-slate-700" style={{ fontSize: 12, fontWeight: 500 }}>
                  Password
                </label>
                <button
                  type="button"
                  className="text-[#0B2545] hover:underline"
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type={show ? "text" : "password"}
                  placeholder="••••••••••"
                  className="pl-9 pr-9 h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-slate-300 text-[#0B2545] focus:ring-[#0B2545]"
              />
              <span className="text-slate-600" style={{ fontSize: 13 }}>
                Keep me signed in on this device
              </span>
            </label>

            {err && (
              <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2" style={{ fontSize: 12 }}>
                {err}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#0B2545] hover:bg-[#0a1f3a] text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Authenticating…
                </>
              ) : (
                "Login"
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-start gap-2 text-slate-500" style={{ fontSize: 11, lineHeight: 1.5 }}>
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
              <span>
                This is a restricted government system. All activity is logged and monitored.
                Unauthorized access is prohibited under law.
              </span>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-8">
        <BusinessInfoFooter className="!mt-0 !pt-0 max-w-4xl mx-auto border-0" />
      </div>
    </div>
  );
}
