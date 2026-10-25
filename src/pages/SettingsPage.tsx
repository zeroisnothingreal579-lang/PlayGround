import {
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  ClipboardCopy,
  Cloud,
  Database,
  ExternalLink,
  Fingerprint,
  Gauge,
  KeyRound,
  Link2,
  LockKeyhole,
  LogOut,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react'
import { useApp } from '../lib/AppContext'
import { SectionHeader } from '../components/ui'
import { cn } from '../lib/utils'

const envRows = [
  { key: 'DATABASE_URL', required: 'Production', detail: 'PostgreSQL connection string. Falls back to durable local JSON when unset.' },
  { key: 'DASHBOARD_PASSWORD', required: 'Production', detail: 'Enables password authentication for the dashboard and WebSocket.' },
  { key: 'AUTH_SECRET', required: 'Recommended', detail: 'HMAC secret for signed 12-hour sessions. Defaults to the dashboard password if omitted.' },
  { key: 'APP_ENCRYPTION_KEY', required: 'Required for connectors', detail: 'AES-256-GCM key material for encrypting stored connector secrets.' },
  { key: 'BROWSER_EXECUTABLE_PATH', required: 'Deployment', detail: 'Absolute Chromium/Chrome path used by Playwright. Automation falls back to static inspection without it.' },
  { key: 'AI_API_URL', required: 'Optional', detail: 'OpenAI-compatible chat completions endpoint for page summaries.' },
  { key: 'AI_API_KEY', required: 'Optional', detail: 'Bearer token for the model endpoint. Never exposed to the browser.' },
  { key: 'AI_MODEL', required: 'Optional', detail: 'Model identifier. Heuristic analysis is used when AI config is incomplete.' },
  { key: 'ANALYTICS_INGEST_TOKEN', required: 'Optional', detail: 'Bearer token for authorized verified-metric ingestion at /api/integrations/verified-metrics.' },
  { key: 'WORKERS_JSON', required: 'Optional', detail: 'JSON array of remote worker definitions for health telemetry. Distributed execution needs the worker service.' },
  { key: 'MAX_CONCURRENT_SESSIONS', required: 'Tuning', detail: 'Global browser context concurrency. Default 3 to protect worker memory.' },
  { key: 'RATE_LIMIT_PER_MINUTE', required: 'Production', detail: 'Per-IP API request limit. Default 90.' },
]

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.012] px-3.5 py-3">
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="h-4 w-4 shrink-0 text-slate-700" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-slate-300">{label}</p>
        <p className="mt-0.5 truncate text-[9px] text-slate-600">{detail}</p>
      </div>
      <span className={cn('chip shrink-0', ok ? 'border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-300' : 'border-white/[0.06] bg-white/[0.015] text-slate-600')}>
        {ok ? 'Ready' : 'Configure'}
      </span>
    </div>
  )
}

export function SettingsPage() {
  const { config, auth, notify, logout } = useApp()
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notify('Copied to clipboard.', 'success')
    } catch {
      notify('Clipboard access was denied.', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Control plane"
        title="Settings & configuration"
        description="LinkPilot reads production configuration from environment variables. Secrets stay server-side and are never sent to this dashboard."
        action={
          <div className="flex items-center gap-2">
            <span className="chip border-violet-500/15 bg-violet-500/[0.06] text-violet-300"><Sparkles className="h-3 w-3" /> v{config?.version || '1.0.0'}</span>
            {auth?.authEnabled && (
              <button type="button" onClick={() => void logout()} className="btn-ghost text-[11px]"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
            )}
          </div>
        }
      />

      {config?.notes.length ? (
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.035] p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-[11px] font-semibold text-amber-200">Configuration notices</p>
              <ul className="mt-1.5 space-y-1">
                {config.notes.map((note) => <li key={note} className="text-[10px] leading-relaxed text-amber-200/60">· {note}</li>)}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <p className="text-[11px] font-semibold text-emerald-200">Core production configuration is present.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <section className="panel p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Runtime status</h3>
                <p className="mt-0.5 text-[10px] text-slate-600">Effective server capabilities in this environment</p>
              </div>
              <span className="chip border-white/[0.06] bg-white/[0.015] text-slate-500">{config?.environment || 'environment'}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <StatusLine ok={Boolean(config?.automationEnabled)} label="Playwright automation" detail={config?.browserAvailable ? 'Chromium executable available' : 'Static inspection fallback'} />
              <StatusLine ok={Boolean(config?.aiConfigured)} label="Language-model agent" detail={config?.aiConfigured ? `${config.aiModel}` : 'Deterministic heuristics active'} />
              <StatusLine ok={config?.database === 'postgresql'} label="PostgreSQL persistence" detail={config?.database === 'postgresql' ? 'DATABASE_URL connected' : 'Local JSON store active'} />
              <StatusLine ok={Boolean(config?.authEnabled)} label="Dashboard authentication" detail={config?.authEnabled ? 'Signed session cookie + 12h expiry' : 'Open access — set DASHBOARD_PASSWORD'} />
              <StatusLine ok={Boolean(config?.encryptionConfigured)} label="Connector encryption" detail={config?.encryptionConfigured ? 'AES-256-GCM key configured' : 'Set APP_ENCRYPTION_KEY'} />
              <StatusLine ok={Boolean(config?.workers && config.workers > 0)} label="Worker registry" detail={`${config?.workers ?? 1} worker${(config?.workers ?? 1) === 1 ? '' : 's'} · ${config?.region || 'local'}`} />
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/[0.07] text-violet-300"><Bot className="h-4 w-4" /></span>
              <div>
                <h3 className="text-xs font-semibold text-white">AI page agent</h3>
                <p className="text-[10px] text-slate-600">Analyze page evidence without delegating control</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.012] p-3.5">
                <p className="label">Current mode</p>
                <p className="mt-1.5 text-xs font-semibold text-slate-200">{config?.aiConfigured ? 'Configured LLM' : 'Heuristic fallback'}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                  {config?.aiConfigured
                    ? `Summaries use ${config.aiModel}. Page text is delimited as untrusted evidence. The agent has no click or navigation tools.`
                    : 'Page summaries use deterministic signals. Configure AI_API_URL, AI_API_KEY and AI_MODEL for model summaries.'}
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.012] p-3.5">
                <p className="label">Agent boundary</p>
                <ul className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-slate-500">
                  <li className="flex gap-1.5"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/70" /> Inspect and summarize page evidence</li>
                  <li className="flex gap-1.5"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/70" /> Identify controls and advertising containers</li>
                  <li className="flex gap-1.5"><XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-400/70" /> No click execution, CAPTCHA solving or traffic generation</li>
                </ul>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-white/[0.05] bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[9px] text-slate-500">AI_API_URL · AI_API_KEY · AI_MODEL</p>
                <button type="button" onClick={() => void copy('AI_API_URL=\nAI_API_KEY=\nAI_MODEL=')} className="text-slate-600 hover:text-slate-300"><ClipboardCopy className="h-3 w-3" /></button>
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/15 bg-sky-500/[0.07] text-sky-300"><Database className="h-4 w-4" /></span>
              <div>
                <h3 className="text-xs font-semibold text-white">Authorized analytics ingestion</h3>
                <p className="text-[10px] text-slate-600">Supply verified clicks, impressions and earnings</p>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              Set <code className="text-violet-300/80">ANALYTICS_INGEST_TOKEN</code> and POST a JSON metric with an Authorization bearer header. LinkPilot stores the source, period and figures; it never derives them from probes.
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/30 p-3.5">
              <pre className="text-[9px] leading-relaxed text-slate-500">{`curl -X POST https://your-host/api/integrations/verified-metrics \\
  -H "Authorization: Bearer $ANALYTICS_INGEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source": "Authorized platform",
    "clicks": 42,
    "impressions": 900,
    "earnings": 12.50,
    "currency": "USD",
    "periodStart": "2026-10-01",
    "periodEnd": "2026-10-07"
  }'`}</pre>
            </div>
            <button type="button" onClick={() => void copy('POST /api/integrations/verified-metrics')} className="mt-2 flex items-center gap-1 text-[9px] text-slate-600 hover:text-slate-300">
              <ClipboardCopy className="h-3 w-3" /> Copy endpoint
            </button>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-white/[0.05] px-5 py-4">
              <h3 className="text-sm font-semibold text-white">Environment reference</h3>
              <p className="mt-0.5 text-[10px] text-slate-600">Values are masked server-side. Configure these in your deployment platform.</p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {envRows.map((row) => (
                <div key={row.key} className="flex items-start gap-3 px-5 py-3">
                  <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-700" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-[10px] font-semibold text-slate-300">{row.key}</code>
                      <span className="rounded border border-white/[0.06] bg-white/[0.015] px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-slate-600">{row.required}</span>
                    </div>
                    <p className="mt-0.5 text-[9px] leading-relaxed text-slate-600">{row.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="panel border-emerald-500/10 p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/[0.07] text-emerald-300"><ShieldCheck className="h-4 w-4" /></span>
              <div>
                <h3 className="text-xs font-semibold text-white">Enforced safety boundaries</h3>
                <p className="text-[10px] text-slate-600">Built into server behavior</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[
                'No endpoint exists to click ads or sponsored elements.',
                'CAPTCHAs are reported; the browser stops at verification.',
                'No rewarded-link bypass, countdown manipulation or reward claims.',
                'No proxy rotation, IP spoofing or artificial-visitor routing.',
                'Probable ad containers are marked unverified by contract.',
                'Private, loopback and non-approved ports are blocked (SSRF guard).',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-500">
                  <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/70" /> {item}
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-300"><Gauge className="h-4 w-4" /></span>
              <div>
                <h3 className="text-xs font-semibold text-white">Resource limits</h3>
                <p className="text-[10px] text-slate-600">Orchestrator quotas</p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                ['Max sessions per run', `${config?.maxSessionsPerRun ?? 100}`],
                ['Concurrent browser contexts', `${config?.maxConcurrentSessions ?? 3}`],
                ['API rate limit', `${config?.rateLimitPerMinute ?? 90} / min / IP`],
                ['Session cookie lifetime', '12 hours'],
                ['Redirect inspection limit', '12 hops'],
                ['Stored screenshot retention', 'Until data store is cleared'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                  <span className="text-[10px] text-slate-500">{label}</span>
                  <span className="text-[10px] font-semibold text-slate-300">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/15 bg-violet-500/[0.07] text-violet-300"><Cloud className="h-4 w-4" /></span>
              <div>
                <h3 className="text-xs font-semibold text-white">Deployment checklist</h3>
                <p className="text-[10px] text-slate-600">Before exposure to the internet</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {[
                { icon: LockKeyhole, text: 'Enable TLS at a reverse proxy and set SECURE_COOKIES=true.' },
                { icon: KeyRound, text: 'Set DASHBOARD_PASSWORD, AUTH_SECRET and APP_ENCRYPTION_KEY.' },
                { icon: Database, text: 'Provision PostgreSQL and run with DATABASE_URL.' },
                { icon: Server, text: 'Run Chromium in an isolated worker container with memory limits.' },
                { icon: Fingerprint, text: 'Rotate analytics and worker tokens; restrict network egress.' },
              ].map((item) => {
                const Icon = item.icon
                return <div key={item.text} className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-500"><Icon className="mt-0.5 h-3 w-3 shrink-0 text-violet-400/60" /> {item.text}</div>
              })}
            </div>
            <div className="mt-4 rounded-xl border border-rose-500/10 bg-rose-500/[0.025] p-3">
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-rose-300/80"><Ban className="h-3 w-3" /> Not a traffic tool</div>
              <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
                Do not use multi-window navigation to inflate visits, impressions, clicks or payouts. That violates most platform terms and may be unlawful.
              </p>
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-300"><Link2 className="h-4 w-4" /></span>
              <div>
                <h3 className="text-xs font-semibold text-white">Documentation</h3>
                <p className="text-[10px] text-slate-600">Deployment & API notes</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {['README.md — setup, architecture, worker deployment', 'docker-compose.yml — app, PostgreSQL, Chromium worker runtime', '.env.example — all supported configuration keys'].map((doc) => (
                <div key={doc} className="flex items-center gap-2 text-[10px] text-slate-500">
                  <ExternalLink className="h-3 w-3 shrink-0 text-slate-700" /> {doc}
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-white/[0.05] pt-3 text-[9px] text-slate-700">
              {config?.appName} v{config?.version} · {config?.region} · {config?.database}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
