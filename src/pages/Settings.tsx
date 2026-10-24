import { useEffect, useState } from "react";
import {
  Bot,
  Check,
  Database,
  KeyRound,
  LockKeyhole,
  LogOut,
  Save,
  Server,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "../state/AppContext";
import { Badge, PageHeader, Panel, SectionHeader, Toggle, cn } from "../components/ui";

const envChecklist = [
  ["DATABASE_URL", "PostgreSQL connection string for the production store."],
  ["AUTH_PASSWORD", "Enables password authentication. Without it the app runs in demo mode."],
  ["AUTH_SECRET", "HMAC secret for signed session tokens. Set a long random value."],
  ["CREDENTIAL_ENCRYPTION_KEY", "32-byte hex key used to encrypt stored AI credentials with AES-256-GCM."],
  ["WORKER_TOKEN", "Shared bearer token for remote worker registration and job reporting."],
  ["ANALYTICS_API_KEY", "Bearer token for the authorized verified-metrics import endpoint."],
  ["CHROMIUM_PATH", "Optional path to a Chromium executable for browser sessions."],
  ["MAX_CONCURRENT_SESSIONS", "Browser contexts per local worker (default 3)."],
  ["MAX_ACTIVE_SESSIONS", "Fleet-wide active-session quota (default 25)."],
  ["BLOCK_PRIVATE_TARGETS", "Keep true in production to prevent SSRF during inspection."],
];

export function Settings() {
  const { settings, policy, health, saveAiSettings, logout, notify } = useApp();
  const [enabled, setEnabled] = useState(settings?.ai.enabled ?? false);
  const [baseUrl, setBaseUrl] = useState(settings?.ai.baseUrl ?? "");
  const [model, setModel] = useState(settings?.ai.model ?? "");
  const [temperature, setTemperature] = useState(settings?.ai.temperature ?? 0.2);
  const [maxActions, setMaxActions] = useState(settings?.ai.maxActions ?? 8);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.ai.enabled);
    setBaseUrl(settings.ai.baseUrl);
    setModel(settings.ai.model);
    setTemperature(settings.ai.temperature);
    setMaxActions(settings.ai.maxActions);
  }, [settings]);

  const save = async () => {
    setSaving(true);
    await saveAiSettings({
      enabled,
      baseUrl,
      model,
      temperature,
      maxActions,
      ...(clearKey ? { apiKey: null } : apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    });
    setApiKey("");
    setClearKey(false);
    setSaving(false);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`Copied ${text}`, "success");
    } catch {
      notify("Clipboard unavailable", "warn");
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Workspace settings"
        description="Configure the AI provider, review the enforced automation boundary, and confirm production readiness. Secrets are stored encrypted and never returned by the API."
        actions={
          <>
            <Badge tone={health?.demoMode ? "violet" : "emerald"} dot>{health?.demoMode ? "Demo mode" : "Protected"}</Badge>
            {health?.authRequired ? (
              <button type="button" onClick={logout} className="btn-secondary h-9 px-3 text-xs"><LogOut size={12} /> Sign out</button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <SectionHeader title="AI page agent" description="OpenAI-compatible chat completions API with deterministic fallback." />
              <Badge tone={settings?.ai.hasApiKey ? "emerald" : "neutral"} dot>
                {settings?.ai.keySource === "env" ? "env key" : settings?.ai.hasApiKey ? "stored key" : "no key"}
              </Badge>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <Toggle
                checked={enabled}
                onChange={setEnabled}
                label="Enable language-model analysis"
                description="When disabled or unavailable, the deterministic DOM analyzer still detects pages, controls, and placements."
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[9px] uppercase tracking-wider text-mist-600">Base URL</span>
                  <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" className="input font-mono text-[11px]" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[9px] uppercase tracking-wider text-mist-600">Model</span>
                  <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4o-mini" className="input font-mono text-[11px]" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[9px] uppercase tracking-wider text-mist-600">Temperature</span>
                  <input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} className="input font-mono text-[11px]" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[9px] uppercase tracking-wider text-mist-600">Default max actions</span>
                  <input type="number" min="1" max="20" value={maxActions} onChange={(event) => setMaxActions(Number(event.target.value))} className="input font-mono text-[11px]" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[9px] uppercase tracking-wider text-mist-600">API key</span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={settings?.ai.hasApiKey ? "•••••••••••••••• (unchanged)" : "sk-…"}
                    className="input font-mono text-[11px]"
                    autoComplete="new-password"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[10px] text-mist-500">
                  <input type="checkbox" checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} className="accent-violet-500" />
                  Clear stored API key
                </label>
                <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary h-9 px-4 text-xs">
                  {saving ? <Sparkles size={12} className="animate-pulse" /> : <Save size={12} />} Save configuration
                </button>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[9px] leading-relaxed text-mist-500">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-mist-300"><KeyRound size={10} /> Credential handling</div>
                Keys are encrypted at rest with AES-256-GCM using CREDENTIAL_ENCRYPTION_KEY. An environment LLM_API_KEY takes precedence over a stored key. The API returns only a boolean and source, never the secret.
              </div>
              {settings?.ai.keySource === "env" ? (
                <div className="flex gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.045] p-2.5 text-[9px] leading-relaxed text-amber-200/80">
                  <TriangleAlert size={11} className="mt-0.5 shrink-0" /> LLM_API_KEY is set in the environment, so a stored key will be ignored until the environment variable is removed.
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <SectionHeader title="Enforced automation boundary" description={`Policy version ${policy?.version ?? "—"}`} />
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300"><ShieldCheck size={10} /> Permitted</div>
                <ul className="space-y-1.5">
                  {policy?.allowed.map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-[9px] leading-relaxed text-mist-400">
                      <Check size={9} className="mt-0.5 shrink-0 text-emerald-400/70" /> {item.replaceAll("_", " ")}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-rose-300"><ShieldX size={10} /> Blocked</div>
                <ul className="space-y-1.5">
                  {policy?.blocked.map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-[9px] leading-relaxed text-mist-400">
                      <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-rose-400/70" /> {item.replaceAll("_", " ")}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="space-y-1.5 border-t border-white/[0.05] px-4 py-3 sm:px-5">
              {policy?.statements.map((statement) => (
                <p key={statement} className="text-[9px] leading-relaxed text-mist-600">· {statement}</p>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Deployment readiness" description="Current runtime configuration." />
            <div className="mt-3 divide-y divide-white/[0.05]">
              {[
                ["Authentication", health?.authRequired ? "Password protected" : "Demo mode — set AUTH_PASSWORD", health?.authRequired],
                ["Database", settings?.integrations.database === "postgres" ? "PostgreSQL connected" : "Local JSON fallback", settings?.integrations.database === "postgres"],
                ["Browser runtime", health?.browser.configured ? "Chromium available" : "Chromium not found", Boolean(health?.browser.configured)],
                ["Remote workers", health?.features.workerRegistration ? "Registration enabled" : "Disabled — set WORKER_TOKEN", Boolean(health?.features.workerRegistration)],
                ["Verified import", health?.features.verifiedAnalyticsImport ? "API key configured" : "Disabled — set ANALYTICS_API_KEY", Boolean(health?.features.verifiedAnalyticsImport)],
                ["AI provider", health?.features.aiProvider ? "Credentials configured" : "Heuristic fallback", Boolean(health?.features.aiProvider)],
                ["SSRF guard", settings?.safety.blockPrivateTargets ? "Private targets blocked" : "Private targets allowed", Boolean(settings?.safety.blockPrivateTargets)],
              ].map(([label, value, ok]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[10px] text-mist-500">{label}</span>
                  <span className={cn("flex items-center gap-1.5 text-right text-[9px]", ok ? "text-emerald-300" : "text-amber-300")}>
                    {ok ? <Check size={9} /> : <TriangleAlert size={9} />}
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                <div className="text-[8px] uppercase tracking-wider text-mist-600">Region</div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-mist-300"><Server size={10} /> {settings?.deployment.region ?? "local"}</div>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                <div className="text-[8px] uppercase tracking-wider text-mist-600">Version</div>
                <div className="mono mt-1 text-[10px] text-mist-300">{settings?.deployment.version ?? "1.0.0"}</div>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                <div className="text-[8px] uppercase tracking-wider text-mist-600">Max batch</div>
                <div className="mono mt-1 text-[10px] text-mist-300">{settings?.safety.maxSessionsPerBatch ?? 100}</div>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                <div className="text-[8px] uppercase tracking-wider text-mist-600">Active quota</div>
                <div className="mono mt-1 text-[10px] text-mist-300">{settings?.safety.maxActiveSessions ?? 25}</div>
              </div>
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <SectionHeader title="Environment variables" description="Required for production deployment. Click to copy a variable name." />
            <div className="mt-3 space-y-1.5">
              {envChecklist.map(([name, description]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => void copy(name)}
                  className="flex w-full items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2 text-left hover:border-white/[0.12]"
                >
                  <Terminal size={10} className="mt-0.5 shrink-0 text-violet-300/70" />
                  <span>
                    <span className="mono block text-[9px] text-mist-300">{name}</span>
                    <span className="mt-0.5 block text-[8px] leading-relaxed text-mist-600">{description}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[8px] text-mist-600">
              <LockKeyhole size={9} /> Values are never displayed in the browser.
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-violet-300"><Database size={14} /></span>
              <div>
                <h3 className="text-[11px] font-semibold text-mist-100">Production checklist</h3>
                <ul className="mt-1.5 space-y-1 text-[9px] leading-relaxed text-mist-500">
                  <li>· Provision PostgreSQL and set DATABASE_URL.</li>
                  <li>· Set AUTH_PASSWORD, AUTH_SECRET, and CREDENTIAL_ENCRYPTION_KEY.</li>
                  <li>· Run behind TLS with an egress firewall for browser workers.</li>
                  <li>· Keep BLOCK_PRIVATE_TARGETS=true.</li>
                  <li>· Configure a worker token and scale remote workers as needed.</li>
                </ul>
                <p className="mt-2 text-[8px] text-mist-600">See docs/DEPLOYMENT.md for Docker Compose, reverse proxy, and quota guidance.</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
