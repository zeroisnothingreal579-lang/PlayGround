import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Download,
  KeyRound,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Webhook,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api, getToken } from '../lib/api'
import type { IntegrationsPayload, SettingsPayload } from '../lib/types'
import { cn, formatDateTime } from '../lib/utils'
import { InfoNote, PageHeader, SectionTitle, Spinner, StatusPill } from '../components/ui'

function CopyField({ label, value }: { label: string; value: string }) {
  const { notify } = useApp()
  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-ink-950/55 px-2.5 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-ink-400">{value}</code>
        <button className="icon-btn h-6 w-6 shrink-0 rounded-md" onClick={() => void navigator.clipboard?.writeText(value).then(() => notify('Copied to clipboard', 'success')).catch(() => notify('Copy failed', 'error'))} aria-label={`Copy ${label}`}>
          <Copy size={10} />
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { notify, health, refresh } = useApp()
  const [settings, setSettings] = useState<SettingsPayload | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationsPayload | null>(null)
  const [testingAi, setTestingAi] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {})
    api.integrations().then(setIntegrations).catch(() => {})
  }, [])

  const testAi = async () => {
    setTestingAi(true)
    try {
      const result = await api.testAi()
      notify(result.message, result.ok ? 'success' : 'warn')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'AI connection failed', 'error')
    } finally {
      setTestingAi(false)
    }
  }

  const syncAnalytics = async () => {
    setSyncing(true)
    try {
      const result = await api.testAnalytics()
      notify(`${result.imported} verified event${result.imported === 1 ? '' : 's'} imported.`, 'success')
      const next = await api.integrations()
      setIntegrations(next)
      await refresh()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Analytics sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const token = getToken()
  const origin = window.location.origin
  const env = settings?.environment

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Inspect runtime capabilities, connect authorized services, and review the policy controls that protect this workspace."
        actions={<span className="chip text-[10px]"><Lock size={10} className="text-mint" />Policy locked</span>}
      />

      <div className="mb-4">
        <InfoNote tone="mint" icon={<ShieldCheck size={15} />}>
          <strong className="text-mint">Safety controls cannot be disabled through the UI or API.</strong> Ad engagement, rewarded-control automation, IP rotation for traffic, and artificial visitor generation remain off.
        </InfoNote>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle title="AI page agent" description="Configurable language-model analysis with heuristic fallback." />
              <StatusPill status={env?.aiConfigured ? 'ok' : 'paused'} label={env?.aiConfigured ? 'configured' : 'heuristics'} />
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">Model</span>
                <span className="font-mono text-[10px] text-ink-200">{settings?.settings.aiModel || '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">Endpoint</span>
                <span className={cn('text-[10px]', env?.aiEndpoint ? 'text-mint' : 'text-ink-500')}>{env?.aiEndpoint ? 'configured' : 'not configured'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">API key</span>
                <span className={cn('text-[10px]', settings?.settings.aiApiKeyConfigured ? 'text-mint' : 'text-ink-500')}>{settings?.settings.aiApiKeyConfigured ? 'encrypted / env' : 'not configured'}</span>
              </div>
            </div>
            <button className="btn-secondary mt-3 w-full py-2 text-[10.5px]" onClick={() => void testAi()} disabled={testingAi}>
              {testingAi ? <Spinner size={12} /> : <Sparkles size={12} />}
              Test AI connection
            </button>
            <div className="mt-3 rounded-lg border border-white/[0.045] bg-ink-950/45 p-2.5">
              <p className="text-[8.5px] leading-relaxed text-ink-500">Configure with <code className="text-ink-300">AI_BASE_URL</code>, <code className="text-ink-300">AI_API_KEY</code>, and <code className="text-ink-300">AI_MODEL</code>. Page content is treated as untrusted evidence, never as instructions. The model cannot navigate, click, or change policy.</p>
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle title="Analytics integration" description="Verified clicks, impressions, and earnings only." />
              <StatusPill status={integrations?.analytics.configured ? 'ok' : 'paused'} label={integrations?.analytics.configured ? 'connected' : 'not connected'} />
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">Provider</span>
                <span className="text-[10px] text-ink-200">{integrations?.analytics.provider || '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">Verified events</span>
                <span className="font-mono text-[10px] text-ink-200">{integrations?.analytics.verifiedEventCount || 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">Last sync</span>
                <span className="text-[10px] text-ink-200">{integrations?.analytics.lastSyncAt ? formatDateTime(integrations.analytics.lastSyncAt) : 'never'}</span>
              </div>
            </div>
            {integrations?.analytics.lastError && <p className="mt-2 rounded-lg border border-coral/10 bg-coral/[0.03] p-2.5 text-[9.5px] text-coral">{integrations.analytics.lastError}</p>}
            <button className="btn-secondary mt-3 w-full py-2 text-[10.5px]" onClick={() => void syncAnalytics()} disabled={syncing}>
              {syncing ? <Spinner size={12} /> : <RefreshCw size={12} />}
              Sync authorized analytics
            </button>
            <div className="mt-3 rounded-lg border border-white/[0.045] bg-ink-950/45 p-2.5">
              <p className="text-[8.5px] leading-relaxed text-ink-500">Set <code className="text-ink-300">ANALYTICS_API_URL</code> and <code className="text-ink-300">ANALYTICS_API_KEY</code> for pull sync. Or use the signed webhook below. No values are inferred.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <SectionTitle title="Signed verified-events webhook" description="HMAC-SHA256 authenticated ingestion." />
            <div className="mt-4 space-y-3">
              <CopyField label="Webhook URL" value={`${origin}/api/webhooks/verified`} />
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">Webhook secret</span>
                <span className={cn('text-[10px]', integrations?.analytics.webhookConfigured ? 'text-mint' : 'text-ink-500')}>{integrations?.analytics.webhookConfigured ? 'configured' : 'not configured'}</span>
              </div>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-ink-950/70">
              <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2"><Terminal size={10} className="text-ink-500" /><span className="text-[8.5px] uppercase tracking-[0.1em] text-ink-500">Payload schema</span></div>
              <pre className="overflow-x-auto p-3 font-mono text-[8.5px] leading-relaxed text-ink-400">{`{
  "events": [{
    "id": "provider-event-id",
    "type": "click",
    "value": 1,
    "at": "2026-01-01T00:00:00Z",
    "source": "authorized-publisher"
  }]
}`}</pre>
            </div>
            <p className="mt-2 text-[8.5px] leading-relaxed text-ink-500">Allowed types: <code className="text-ink-300">click</code>, <code className="text-ink-300">impression</code>, <code className="text-ink-300">earning</code>, <code className="text-ink-300">visit</code>. Requests require the <code className="text-ink-300">X-LinkPilot-Signature: sha256=…</code> header.</p>
          </div>

          <div className="panel p-4 sm:p-5">
            <SectionTitle title="Automation & resources" description="Effective runtime limits." />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { label: 'Automation', value: integrations?.automation.playwrightAvailable ? 'Playwright' : 'HTTP analysis' },
                { label: 'Database', value: integrations?.database || env?.database || '—' },
                { label: 'Concurrency', value: `${integrations?.automation.concurrentLimit || '—'} contexts` },
                { label: 'Max job size', value: `${integrations?.automation.maxSessions || '—'} sessions` },
                { label: 'Session duration', value: `${Math.round((settings?.settings.sessionDurationMs || 45000) / 1000)}s cap` },
                { label: 'Safe mode', value: settings?.settings.safeMode ? 'enforced' : '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-2.5">
                  <p className="text-[8.5px] uppercase tracking-[0.1em] text-ink-500">{item.label}</p>
                  <p className="mt-1 text-[10.5px] capitalize text-ink-200">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-white/[0.045] bg-ink-950/45 p-2.5">
              <p className="text-[8.5px] leading-relaxed text-ink-500">Tune limits with <code className="text-ink-300">MAX_CONCURRENT_BROWSERS</code>, <code className="text-ink-300">MAX_SESSIONS</code>, and <code className="text-ink-300">SESSION_TIMEOUT_MS</code>. Credentials are read from the environment and never returned.</p>
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <KeyRound size={14} className="text-violet-300" />
              <h3 className="text-[12.5px] font-semibold text-white">Authentication & API</h3>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">Bearer auth</span>
                <span className={cn('text-[10px]', health?.authRequired ? 'text-mint' : 'text-amber')}>{health?.authRequired ? 'required' : 'not enabled'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-400">Session token</span>
                <span className="text-[10px] text-ink-200">{token ? 'stored in this browser' : 'not set'}</span>
              </div>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-ink-950/70">
              <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2"><Code2 size={10} className="text-ink-500" /><span className="text-[8.5px] uppercase tracking-[0.1em] text-ink-500">Inspect via API</span></div>
              <pre className="overflow-x-auto p-3 font-mono text-[8.5px] leading-relaxed text-ink-400">{`curl -X POST ${origin}/api/inspect \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"urls":["https://example.com"]}'`}</pre>
            </div>
            <p className="mt-2 text-[8.5px] leading-relaxed text-ink-500">Set <code className="text-ink-300">LINKPILOT_AUTH_TOKEN</code> in production. The API applies per-IP rate limits and SSRF protection to every inspection.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="panel p-4 sm:p-5">
          <SectionTitle title="Policy controls" description="Read-only by design." />
          <div className="mt-4 space-y-1.5">
            {[
              ['Automated ad clicks', false],
              ['Rewarded-control activation', false],
              ['Countdown bypass', false],
              ['IP rotation for traffic', false],
              ['Artificial visitor generation', false],
              ['Analysis-only mode', true],
            ].map(([label, enabled]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-lg border border-white/[0.045] bg-white/[0.015] px-3 py-2.5">
                <span className="text-[10px] text-ink-300">{label}</span>
                <span className={cn('flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em]', enabled ? 'text-mint' : 'text-ink-500')}>
                  {enabled ? <Check size={10} /> : <Lock size={9} />}
                  {enabled ? 'on' : 'locked off'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4 sm:p-5">
          <SectionTitle title="Data & exports" description="Operational records, not fabricated metrics." />
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button className="btn-secondary justify-start py-2.5 text-[10.5px]" onClick={() => api.exportCsv('sessions')}><Download size={12} />Export sessions</button>
            <button className="btn-secondary justify-start py-2.5 text-[10.5px]" onClick={() => api.exportCsv('inspections')}><Download size={12} />Export inspections</button>
          </div>
          <div className="mt-3 space-y-2">
            {[
              { icon: Database, label: 'Storage', value: env?.database === 'postgres' ? 'PostgreSQL' : 'Local JSON fallback' },
              { icon: Server, label: 'Retention', value: `${settings?.settings.retentionDays || 30} days` },
              { icon: Webhook, label: 'Verified source', value: integrations?.analytics.configured ? 'authorized API' : 'not connected' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-2.5 rounded-lg border border-white/[0.045] bg-white/[0.015] px-3 py-2.5">
                  <Icon size={11} className="text-ink-500" />
                  <span className="flex-1 text-[10px] text-ink-400">{item.label}</span>
                  <span className="text-[10px] text-ink-200">{item.value}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.045] bg-ink-950/45 p-2.5">
            <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-mint" />
            <p className="text-[8.5px] leading-relaxed text-ink-500">Exports contain only records created by this workspace. Browser sessions are explicitly labelled as automation runs.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { icon: Bot, title: 'AI agent', value: env?.aiConfigured ? 'Model-backed' : 'Heuristic fallback' },
          { icon: Database, title: 'Persistence', value: env?.database === 'postgres' ? 'PostgreSQL' : 'File store' },
          { icon: ShieldCheck, title: 'Policy', value: 'Analysis-only' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.title} className="panel flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300"><Icon size={15} /></div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.1em] text-ink-500">{item.title}</p>
                <p className="mt-0.5 text-[11px] font-medium text-ink-200">{item.value}</p>
              </div>
              <ArrowRight size={12} className="ml-auto text-ink-600" />
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        <InfoNote tone="violet" icon={<XCircle size={15} />}>
          LinkPilot is intended for authorized URL inspection, owned advertising-placement testing, and redirect-flow QA. You are responsible for complying with destination terms, ad-network policies, and applicable law.
        </InfoNote>
      </div>
    </>
  )
}
