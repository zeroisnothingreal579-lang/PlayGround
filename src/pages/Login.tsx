import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Link2,
  LockKeyhole,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useApp } from "../state/AppContext";
import { cn } from "../components/ui";

export function Login() {
  const { login, health, notify } = useApp();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const demo = Boolean(health && !health.authRequired);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to unlock the workspace.");
    } finally {
      setSubmitting(false);
    }
  };

  const enterDemo = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await login("");
      notify("Demo workspace opened. Configure AUTH_PASSWORD before deploying.", "warn");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open demo mode.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-20%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[130px]" />
        <div className="absolute bottom-[-30%] right-[-10%] h-[420px] w-[520px] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d12]/90 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden flex-col justify-between border-r border-white/[0.06] p-8 lg:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/40">
                <Link2 size={17} className="text-white" />
              </span>
              <div>
                <div className="text-sm font-semibold tracking-tight text-white">LinkPilot <span className="text-violet-300">AI</span></div>
                <div className="text-[8px] uppercase tracking-[0.18em] text-mist-600">Authorized URL operations</div>
              </div>
            </div>

            <h1 className="mt-10 text-2xl font-semibold leading-tight tracking-tight text-white">
              Inspect redirects.<br />
              Run isolated sessions.<br />
              <span className="bg-gradient-to-r from-violet-300 to-sky-300 bg-clip-text text-transparent">Measure only what is real.</span>
            </h1>
            <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-mist-500">
              A multi-window browser automation and analytics workspace built for authorized QA, redirect-chain inspection, and ad-placement observation.
            </p>

            <div className="mt-7 space-y-2.5">
              {[
                [ShieldCheck, "Safety-enforced", "No ad clicks, CAPTCHA solving, or rewarded-step bypass."],
                [MonitorPlay, "Isolated contexts", "Fresh cookies and storage per session, across local or remote workers."],
                [Bot, "AI-assisted analysis", "Optional LLM planning with a strict action allowlist and deterministic fallback."],
                [Fingerprint, "Verified metrics only", "Visits, clicks, impressions, and earnings come from authorized imports."],
              ].map(([Icon, title, detail]) => (
                <div key={String(title)} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.03] text-violet-300">
                    <Icon size={11} />
                  </span>
                  <div>
                    <div className="text-[10px] font-medium text-mist-200">{String(title)}</div>
                    <div className="text-[9px] leading-relaxed text-mist-600">{String(detail)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-medium text-mist-300"><Sparkles size={10} className="text-violet-300" /> Automation, not artificial traffic</div>
            <p className="mt-1 text-[8px] leading-relaxed text-mist-600">
              LinkPilot never simulates human visitors, rotates identities, or reports session activity to ad networks. Use it only on properties you own or are authorized to test.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
              <Link2 size={15} className="text-white" />
            </span>
            <div className="text-xs font-semibold text-white">LinkPilot <span className="text-violet-300">AI</span></div>
          </div>

          <div className="mb-5">
            <div className="flex items-center gap-2">
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", demo ? "border-violet-400/20 bg-violet-500/10 text-violet-300" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-300")}>
                {demo ? <LockKeyhole size={14} /> : <KeyRound size={14} />}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-white">{demo ? "Demo workspace" : "Unlock workspace"}</h2>
                <p className="text-[9px] text-mist-600">{demo ? "Authentication is not configured on this server." : "Enter the operator password to continue."}</p>
              </div>
            </div>
          </div>

          {demo ? (
            <div className="space-y-3">
              <div className="flex gap-2 rounded-lg border border-violet-400/15 bg-violet-400/[0.045] p-3 text-[9px] leading-relaxed text-violet-100/70">
                <ShieldCheck size={12} className="mt-0.5 shrink-0 text-violet-300" />
                <p>
                  <span className="font-semibold text-violet-100">Demo mode is active.</span> Anyone who can reach this server can use the workspace. Set <span className="mono text-violet-200">AUTH_PASSWORD</span> and <span className="mono text-violet-200">AUTH_SECRET</span> before exposing it.
                </p>
              </div>
              <button type="button" onClick={() => void enterDemo()} disabled={submitting} className="btn-primary h-10 w-full justify-center text-xs">
                {submitting ? "Opening…" : "Enter demo workspace"} <ArrowRight size={13} />
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[9px] uppercase tracking-wider text-mist-600">Operator password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••••••"
                    className="input h-10 pr-10 text-xs"
                    autoComplete="current-password"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-mist-500 hover:text-mist-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </label>

              {error ? <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[10px] text-rose-200">{error}</div> : null}

              <button type="submit" disabled={submitting || !password} className="btn-primary h-10 w-full justify-center text-xs">
                {submitting ? "Unlocking…" : "Unlock workspace"} <ArrowRight size={13} />
              </button>
            </form>
          )}

          <div className="mt-6 space-y-1.5 border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-mist-600">API</span>
              <span className={cn("flex items-center gap-1", health ? "text-emerald-300" : "text-mist-500")}>
                <span className={cn("h-1 w-1 rounded-full", health ? "bg-emerald-400" : "bg-mist-500")} />
                {health ? "reachable" : "unknown"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-mist-600">Database</span>
              <span className="text-mist-400">{health?.database === "postgres" ? "PostgreSQL" : "Local JSON"}</span>
            </div>
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-mist-600">Browser runtime</span>
              <span className={health?.browser.configured ? "text-emerald-300" : "text-amber-300"}>{health?.browser.configured ? "available" : "not configured"}</span>
            </div>
          </div>

          <p className="mt-5 text-[8px] leading-relaxed text-mist-700">
            By continuing you confirm you are authorized to inspect and automate the URLs you submit, and that you will not use this tool to generate fraudulent traffic, clicks, impressions, or revenue.
          </p>
        </div>
      </div>
    </div>
  );
}
