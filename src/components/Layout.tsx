import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Command,
  LayoutDashboard,
  Link2,
  Megaphone,
  Menu,
  MonitorPlay,
  Plus,
  Server,
  Settings,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { cn } from "./ui";
import { useApp, type RouteName } from "../state/AppContext";

const navigation: Array<{
  group: string;
  items: Array<{ route: RouteName; label: string; icon: ReactNode }>;
}> = [
  {
    group: "Workspace",
    items: [
      { route: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
      { route: "links", label: "URL inspector", icon: <Link2 size={16} /> },
      { route: "sessions", label: "Sessions", icon: <MonitorPlay size={16} /> },
      { route: "activity", label: "Agent activity", icon: <Activity size={16} /> },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { route: "ads", label: "Advertising", icon: <Megaphone size={16} /> },
      { route: "analytics", label: "Analytics", icon: <BarChart3 size={16} /> },
    ],
  },
  {
    group: "Operations",
    items: [
      { route: "infrastructure", label: "Infrastructure", icon: <Server size={16} /> },
      { route: "settings", label: "Settings", icon: <Settings size={16} /> },
    ],
  },
];

const pageMeta: Record<RouteName, { title: string; subtitle: string }> = {
  overview: { title: "Control room", subtitle: "Redirect QA and multi-window automation" },
  links: { title: "URL inspector", subtitle: "Validate links, follow redirects, surface risk" },
  sessions: { title: "Browser sessions", subtitle: "Live multi-window orchestration and previews" },
  activity: { title: "Agent activity", subtitle: "Timestamped event log from every session" },
  ads: { title: "Advertising analysis", subtitle: "Placements detected, never clicked" },
  analytics: { title: "Analytics", subtitle: "Measured automation activity and verified imports" },
  infrastructure: { title: "Infrastructure", subtitle: "Workers, capacity, isolation, and network" },
  settings: { title: "Settings", subtitle: "AI provider, policy, and deployment readiness" },
};

const mobileRoutes: RouteName[] = ["overview", "links", "sessions", "activity", "ads"];

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-[10px] border border-violet-400/30 bg-gradient-to-br from-violet-500/30 to-violet-900/20 shadow-[0_0_24px_-6px_rgba(139,92,246,0.8)]">
        <ArrowUpRight size={16} className="text-violet-200" strokeWidth={2.4} />
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ring-ink-900" />
      </div>
      {!compact ? (
        <div>
          <div className="text-[13px] font-semibold tracking-[-0.01em] text-white">
            LinkPilot <span className="text-violet-300">AI</span>
          </div>
          <div className="text-[9px] font-medium uppercase tracking-[0.2em] text-mist-600">Automation console</div>
        </div>
      ) : null}
    </div>
  );
}

function NavLink({ route, label, icon, onNavigate, active }: { route: RouteName; label: string; icon: ReactNode; onNavigate: (route: RouteName) => void; active: boolean }) {
  return (
    <button type="button" onClick={() => onNavigate(route)} className={cn("nav-item w-full text-left", active && "nav-item-active")}>
      <span className={cn(active ? "text-violet-300" : "text-mist-500")}>{icon}</span>
      <span className="flex-1">{label}</span>
      {active ? <span className="h-1 w-1 rounded-full bg-violet-300 shadow-[0_0_8px_rgba(167,139,250,1)]" /> : null}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { route, navigate, live, overview, health, authState, logout } = useApp();
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    setMobileMenu(false);
  }, [route]);

  const activeCount = overview?.sessions.active ?? 0;
  const adsCount = overview?.ads.detected ?? 0;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col border-r border-white/[0.055] bg-ink-950/70 px-3.5 py-5 backdrop-blur-2xl lg:flex">
        <div className="px-2">
          <Logo />
        </div>

        <nav className="mt-8 flex-1 space-y-6 overflow-y-auto pb-4">
          {navigation.map((group) => (
            <div key={group.group}>
              <div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.22em] text-mist-600">{group.group}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className={cn("nav-item w-full text-left", route === item.route && "nav-item-active")}
                  >
                    <span className={cn(route === item.route ? "text-violet-300" : "text-mist-500")}>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.route === "sessions" && activeCount > 0 ? (
                      <span className="rounded-md border border-emerald-400/15 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">{activeCount}</span>
                    ) : null}
                    {item.route === "ads" && adsCount > 0 ? (
                      <span className="rounded-md border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-mist-400">{adsCount}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-2.5">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
            <div className="flex items-center gap-2 text-[10px] font-medium text-mist-300">
              <ShieldCheck size={13} className="text-emerald-300" />
              Authorized testing only
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-mist-600">
              No ad clicks, CAPTCHA bypass, or artificial traffic. Verified metrics require an authorized import.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-xl px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[10px] font-semibold text-mist-300">QA</div>
              <div>
                <div className="text-[10px] font-medium text-mist-300">{health?.demoMode ? "Demo operator" : "Operator"}</div>
                <div className="flex items-center gap-1 text-[9px] text-mist-600">
                  {live ? <Wifi size={9} className="text-emerald-400" /> : <WifiOff size={9} className="text-amber-400" />}
                  {live ? "Realtime connected" : "Polling mode"}
                </div>
              </div>
            </div>
            {authState === "ready" && health?.authRequired ? (
              <button type="button" onClick={logout} className="rounded-md p-1 text-mist-600 hover:bg-white/[0.05] hover:text-mist-300" title="Sign out">
                <X size={12} />
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-30 border-b border-white/[0.055] bg-ink-950/65 backdrop-blur-2xl">
          <div className="mx-auto flex h-16 max-w-[1560px] items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenu(true)}
                className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-2 text-mist-400 lg:hidden"
                aria-label="Open menu"
              >
                <Menu size={16} />
              </button>
              <div className="lg:hidden">
                <Logo compact />
              </div>
              <div className="hidden min-w-0 lg:block">
                <h2 className="text-[13px] font-semibold text-mist-100">{pageMeta[route].title}</h2>
                <p className="text-[10px] text-mist-600">{pageMeta[route].subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.025] px-2.5 py-1 text-[10px] text-mist-500 sm:flex">
                <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-amber-400")} />
                {live ? "Live" : "Polling"}
              </div>
              {health?.demoMode ? (
                <button
                  type="button"
                  onClick={() => navigate("settings")}
                  className="hidden items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/[0.08] px-2.5 py-1 text-[10px] font-medium text-violet-200 sm:flex"
                >
                  <Command size={11} />
                  Demo workspace
                </button>
              ) : null}
              <button type="button" onClick={() => navigate("links")} className="btn-primary h-9 px-3 text-xs">
                <Plus size={14} />
                <span className="hidden sm:inline">New inspection</span>
                <span className="sm:hidden">Inspect</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1560px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:pb-12">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/90 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl lg:hidden">
        <div className="flex items-center justify-around">
          {mobileRoutes.map((routeName) => {
            const item = navigation.flatMap((group) => group.items).find((nav) => nav.route === routeName)!;
            const active = route === routeName;
            return (
              <button
                key={routeName}
                type="button"
                onClick={() => navigate(routeName)}
                className={cn("flex min-w-[54px] flex-col items-center gap-1 rounded-lg px-1 py-1 text-[9px] font-medium transition-colors", active ? "text-violet-300" : "text-mist-600")}
              >
                <span className={cn("flex h-7 w-9 items-center justify-center rounded-lg", active && "bg-violet-500/10")}>{item.icon}</span>
                {item.label.split(" ")[0]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenu(true)}
            className="flex min-w-[54px] flex-col items-center gap-1 rounded-lg px-1 py-1 text-[9px] font-medium text-mist-600"
          >
            <span className="flex h-7 w-9 items-center justify-center rounded-lg">
              <Menu size={16} />
            </span>
            More
          </button>
        </div>
      </nav>

      {mobileMenu ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileMenu(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-ink-900 p-5 pb-8 animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setMobileMenu(false)} className="rounded-lg p-2 text-mist-500" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {navigation.flatMap((group) => group.items).map((item) => (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => navigate(item.route)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-left text-xs font-medium text-mist-300",
                    route === item.route && "border-violet-400/25 bg-violet-500/10 text-violet-200",
                  )}
                >
                  <span className="text-mist-500">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[10px] leading-relaxed text-mist-500">
              LinkPilot AI performs authorized redirect QA and ad-placement analysis. It never clicks ads, bypasses gates, or fabricates traffic.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
