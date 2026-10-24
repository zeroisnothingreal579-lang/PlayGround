import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  Filter,
  Link2,
  MonitorDot,
  Radio,
  ScanLine,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import type { ActivityEvent } from '../lib/types'
import { cn, formatDateTime, timeAgo } from '../lib/utils'
import { EmptyState, InfoNote, PageHeader, SectionTitle } from '../components/ui'

const typeIcons: Record<string, typeof Activity> = {
  inspection: ScanLine,
  session: MonitorDot,
  ad: Sparkles,
  control: Radio,
  integration: Database,
  system: Server,
}

const filters = ['all', 'inspection', 'session', 'ad', 'control', 'integration', 'system'] as const

export default function ActivityPage() {
  const { revision } = useApp()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [filter, setFilter] = useState<(typeof filters)[number]>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    api.activity(250).then((result) => setEvents(result.events)).catch(() => {})
  }, [revision])

  const filtered = useMemo(() => {
    const lower = query.toLowerCase().trim()
    return events.filter((event) => {
      const typeMatch = filter === 'all' || event.type === filter
      const queryMatch = !lower || `${event.title} ${event.detail} ${event.type}`.toLowerCase().includes(lower)
      return typeMatch && queryMatch
    })
  }, [events, filter, query])

  const groups = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>()
    for (const event of filtered) {
      const key = new Date(event.at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      map.set(key, [...(map.get(key) || []), event])
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <>
      <PageHeader
        eyebrow="Audit trail"
        title="Activity log"
        description="Every inspection, session control, advertising detection, and integration event is timestamped for review."
        actions={<span className="chip text-[10px]"><ShieldCheck size={11} className="text-mint" />Audit trail active</span>}
      />

      <div className="panel mb-4 p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
            {filters.map((option) => (
              <button key={option} onClick={() => setFilter(option)} className={cn('shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-medium capitalize transition-colors', filter === option ? 'border-violet-500/25 bg-violet-500/[0.09] text-violet-200' : 'border-white/[0.055] bg-white/[0.015] text-ink-400 hover:text-ink-200')}>
                {option}
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="input py-1.5 pl-8 text-[11px]" placeholder="Search the audit trail…" />
            {query && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-200" onClick={() => setQuery('')}><X size={11} /></button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
        <div className="panel p-4 sm:p-5">
          {groups.length ? (
            <div className="space-y-7">
              {groups.map(([label, group]) => (
                <div key={label}>
                  <div className="mb-3 flex items-center gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{label}</p>
                    <div className="h-px flex-1 bg-white/[0.05]" />
                    <span className="text-[9px] text-ink-600">{group.length} events</span>
                  </div>
                  <div className="relative space-y-0 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-white/[0.055]">
                    {group.map((event) => {
                      const Icon = typeIcons[event.type] || Activity
                      return (
                        <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                          <div className={cn('relative z-10 mt-0.5 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-lg border bg-ink-850', event.level === 'error' ? 'border-coral/20 text-coral' : event.level === 'warn' ? 'border-amber/20 text-amber' : event.level === 'success' ? 'border-mint/20 text-mint' : 'border-white/[0.07] text-ink-400')}>
                            <Icon size={13} />
                          </div>
                          <div className="min-w-0 flex-1 rounded-xl border border-white/[0.045] bg-white/[0.012] px-3 py-2.5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="text-[11px] font-medium text-ink-100">{event.title}</p>
                              <span className="shrink-0 text-[8.5px] text-ink-600">{formatDateTime(event.at)}</span>
                            </div>
                            <p className="mt-1 text-[10px] leading-relaxed text-ink-400">{event.detail}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="rounded bg-white/[0.035] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-ink-500">{event.type}</span>
                              <span className="text-[8.5px] text-ink-600">{timeAgo(event.at)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Activity size={20} />} title={query || filter !== 'all' ? 'No matching events' : 'The audit trail is empty'} description={query || filter !== 'all' ? 'Adjust the filter or search term.' : 'Run an inspection or launch sessions to create timestamped events.'} action={(query || filter !== 'all') ? <button className="btn-secondary text-[11px]" onClick={() => { setQuery(''); setFilter('all') }}>Clear filters</button> : undefined} />
          )}
        </div>

        <div className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <SectionTitle title="Log coverage" description="What this audit trail records." />
            <div className="mt-4 space-y-2">
              {[
                { label: 'Link inspections', icon: Link2, detail: 'chain, status, risk' },
                { label: 'Session controls', icon: MonitorDot, detail: 'start, pause, stop' },
                { label: 'Advertising signals', icon: Sparkles, detail: 'detection only' },
                { label: 'AI summaries', icon: Bot, detail: 'evidence-grounded' },
                { label: 'Integration sync', icon: Database, detail: 'verified events' },
                { label: 'Policy actions', icon: ShieldCheck, detail: 'always enforced' },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                    <Icon size={12} className="text-violet-300" />
                    <span className="flex-1 text-[10px] text-ink-300">{item.label}</span>
                    <span className="text-[8.5px] text-ink-600">{item.detail}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <SectionTitle title="Record counts" description="Current retention window." />
            <div className="mt-4 space-y-3">
              {[
                { label: 'Events shown', value: events.length, max: 250 },
                { label: 'Filtered results', value: filtered.length, max: Math.max(1, events.length) },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[10px]"><span className="text-ink-400">{item.label}</span><span className="font-mono text-ink-300">{item.value}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.045] bg-white/[0.015] p-2.5">
              <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-mint" />
              <p className="text-[8.5px] leading-relaxed text-ink-500">Session logs are capped per session. Activity events are capped at 500 in the local workspace.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <InfoNote tone="violet" icon={<Filter size={15} />}>
          The audit trail is an operational record. It does not claim that any session, page view, ad detection, or redirect represents a human visitor or a billable impression.
        </InfoNote>
      </div>
    </>
  )
}
