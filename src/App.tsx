import { useEffect } from "react";
import { Link2, RefreshCw, ServerCrash, ShieldCheck } from "lucide-react";
import { useApp } from "./state/AppContext";
import { Layout } from "./components/Layout";
import { SessionDrawer } from "./components/SessionDrawer";
import { ToastViewport } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Links } from "./pages/Links";
import { Sessions } from "./pages/Sessions";
import { ActivityPage } from "./pages/Activity";
import { Ads } from "./pages/Ads";
import { Infrastructure } from "./pages/Infrastructure";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";

const routeTitles: Record<string, string> = {
  overview: "Overview",
  links: "Links",
  sessions: "Sessions",
  activity: "Activity",
  ads: "Ad intelligence",
  infrastructure: "Infrastructure",
  analytics: "Analytics",
  settings: "Settings",
};

function Splash({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>

      <div className="relative flex flex-col items-center text-center">
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_20px_60px_-10px_rgba(124,58,237,0.6)]">
          {error ? <ServerCrash size={23} className="text-white" /> : <Link2 size={23} className="text-white" />}
          {!error ? <span className="absolute inset-0 animate-ping rounded-2xl border border-violet-400/30" /> : null}
        </span>
        <h1 className="mt-5 text-lg font-semibold tracking-tight text-white">LinkPilot <span className="text-violet-300">AI</span></h1>

        {error ? (
          <>
            <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-mist-500">The workspace could not reach its API. Confirm the server is running, then retry.</p>
            <div className="mt-3 max-w-md rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2 text-[9px] leading-relaxed text-rose-200">{error}</div>
            {onRetry ? (
              <button type="button" onClick={onRetry} className="btn-primary mt-4 h-9 px-4 text-xs">
                <RefreshCw size={12} /> Retry connection
              </button>
            ) : null}
            <div className="mt-4 flex items-center gap-1.5 text-[9px] text-mist-600">
              <ShieldCheck size={10} className="text-emerald-400/70" /> Safety policy remains enforced server-side.
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 flex items-center gap-2 text-[10px] text-mist-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
              Starting isolated runtime…
            </div>
            <div className="mt-4 h-px w-40 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-1/2 animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-violet-400 to-transparent" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { authState, bootError, boot, route } = useApp();

  useEffect(() => {
    document.title = authState === "ready" ? `${routeTitles[route] ?? "Workspace"} · LinkPilot AI` : "LinkPilot AI";
  }, [authState, route]);

  if (authState === "booting") return <Splash />;
  if (authState === "offline") return <Splash error={bootError ?? "API unavailable"} onRetry={() => void boot()} />;
  if (authState === "login") return <Login />;

  const page =
    route === "links" ? <Links /> :
    route === "sessions" ? <Sessions /> :
    route === "activity" ? <ActivityPage /> :
    route === "ads" ? <Ads /> :
    route === "infrastructure" ? <Infrastructure /> :
    route === "analytics" ? <Analytics /> :
    route === "settings" ? <Settings /> :
    <Dashboard />;

  return (
    <>
      <Layout>{page}</Layout>
      <SessionDrawer />
      <ToastViewport />
    </>
  );
}
