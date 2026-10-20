import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, ArrowUpRight, CheckCircle2, CircleDashed, Clock3, Cpu,
  FolderUp, HardDrive, Loader2, Plus, Search, Server, ShieldCheck, SlidersHorizontal,
  Smartphone, Sparkles, Wifi, Zap,
} from 'lucide-react'
import type { ActivityEvent, Device, UsageSummary } from '@shared/contracts'
import type { MeResponse } from '../lib/auth'
import { useAuth } from '../lib/auth'
import { del, get, patch, post } from '../lib/api'
import { useToast } from '../lib/toast'
import { useRuntime } from '../lib/runtime'
import { PhoneCard } from '../components/PhoneCard'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Progress, Skeleton } from '../components/ui'
import { cn, formatGbFromMb, relativeTime } from '../lib/utils'

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'phone.starting': Loader2,
  'phone.running': CheckCircle2,
  'phone.stopped': CircleDashed,
  'phone.error': AlertTriangle,
  'phone.created': Smartphone,
  'phone.deleted': AlertTriangle,
  'file.uploaded': FolderUp,
  'apk.installed': Sparkles,
  'apk.failed': AlertTriangle,
  'billing.plan_changed': Zap,
  'account.created': Sparkles,
}

function StatCard({ icon: Icon, label, value, detail, tone = 'violet' }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  detail: React.ReactNode
  tone?: 'violet' | 'green' | 'amber' | 'cyan'
}) {
  const tones = {
    violet: 'border-iris-400/20 bg-iris-500/10 text-iris-300',
    green: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
    cyan: 'border-electric-400/20 bg-electric-500/10 text-electric-300',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className={cn('grid h-9 w-9 place-items-center rounded-xl border', tones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-zinc-700" />
      </div>
      <p className="mt-4 font-display text-[26px] font-semibold leading-none tracking-tight text-white">{value}</p>
      <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-3 text-[11px] text-zinc-500">{detail}</div>
    </Card>
  )
}

export default function DashboardPage() {
  const { user, usage: authUsage } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const runtime = useRuntime()
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped' | 'error'>('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null)
  const [settingsTarget, setSettingsTarget] = useState<Device | null>(null)
  const [settingsName, setSettingsName] = useState('')

  const devicesQuery = useQuery<{ devices: Device[] }>({
    queryKey: ['devices'],
    queryFn: () => get('/devices'),
    refetchInterval: 4000,
  })
  const activityQuery = useQuery<{ activity: ActivityEvent[] }>({
    queryKey: ['activity', 8],
    queryFn: () => get('/activity?limit=8'),
    refetchInterval: 15_000,
  })
  const usageQuery = useQuery<{ usage: UsageSummary }>({
    queryKey: ['usage'],
    queryFn: () => get('/usage'),
    refetchInterval: 20_000,
  })

  const devices = devicesQuery.data?.devices || []
  const usage = usageQuery.data?.usage || authUsage
  const activity = activityQuery.data?.activity || []

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return devices.filter((device) => {
      if (filter === 'running' && device.status !== 'running') return false
      if (filter === 'stopped' && device.status !== 'stopped') return false
      if (filter === 'error' && device.status !== 'error') return false
      if (!term) return true
      return `${device.name} ${device.androidVersion} ${device.profileName}`.toLowerCase().includes(term)
    })
  }, [devices, filter, search])

  const running = devices.filter((device) => device.status === 'running' && !device.isDemo).length
  const stopped = devices.filter((device) => device.status === 'stopped').length
  const demoCount = devices.filter((device) => device.isDemo).length

  async function runAction(device: Device, action: 'start' | 'stop' | 'restart') {
    setBusy({ id: device.id, action })
    try {
      await post(`/devices/${device.id}/${action}`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['devices'] }),
        queryClient.invalidateQueries({ queryKey: ['activity'] }),
      ])
      if (action === 'start') {
        toast(device.isDemo ? 'Demo phone starting' : 'Android boot requested', {
          kind: 'info',
          description: device.isDemo ? 'This demo phone has no live Android runtime.' : 'Booting the Android instance. The workspace will show live status.',
        })
        navigate(`/app/phones/${device.id}`)
      } else if (action === 'restart') {
        toast('Restart requested', { kind: 'info', description: 'Android will reboot and reconnect to the workspace.' })
        navigate(`/app/phones/${device.id}`)
      } else {
        toast('Phone stopped', { kind: 'success', description: 'Persistent storage is retained.' })
      }
    } catch (error: any) {
      toast('Action failed', { kind: 'error', description: error?.message })
    } finally {
      setBusy(null)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (deviceId: string) => del(`/devices/${deviceId}`),
    onSuccess: async () => {
      toast('Phone deleted', { kind: 'success', description: 'The runtime and stored files were removed.' })
      setDeleteTarget(null)
      await queryClient.invalidateQueries()
    },
    onError: (error: any) => toast('Could not delete phone', { kind: 'error', description: error?.message }),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => patch(`/devices/${id}`, { name }),
    onSuccess: async () => {
      toast('Phone renamed', { kind: 'success' })
      setSettingsTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (error: any) => toast('Rename failed', { kind: 'error', description: error?.message }),
  })

  const storagePct = usage?.limits.storageMb ? (usage.storageMb / usage.limits.storageMb) * 100 : 0
  const concurrencyPct = usage?.limits.maxConcurrent ? (usage.runningCount / usage.limits.maxConcurrent) * 100 : 0
  const hoursPct = usage?.limits.monthlyHours ? ((usage.minutes / 60) / usage.limits.monthlyHours) * 100 : 0
  const isDemoRuntime = runtime.data?.mode === 'demo'
  const isDegraded = runtime.data?.mode === 'degraded'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user?.name?.split(' ')[0] || 'there'}`}
        description="Your Android workspace, live infrastructure and persistent phones."
        actions={
          <>
            <Link to="/app/files"><Button variant="secondary" size="md"><FolderUp className="h-4 w-4" /> Files</Button></Link>
            <Link to="/app/create"><Button variant="primary" size="md"><Plus className="h-4 w-4" /> New cloud phone</Button></Link>
          </>
        }
      />

      <div className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        runtime.data?.mode === 'live' && 'border-emerald-400/15 bg-emerald-500/[0.04]',
        isDemoRuntime && 'border-amber-400/20 bg-amber-500/[0.05]',
        isDegraded && 'border-rose-400/20 bg-rose-500/[0.05]',
        !runtime.data && 'border-white/10 bg-white/[0.02]',
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border',
            runtime.data?.mode === 'live' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : isDegraded ? 'border-rose-400/25 bg-rose-400/10 text-rose-300' : 'border-amber-400/25 bg-amber-400/10 text-amber-300',
          )}>
            {runtime.data?.mode === 'live' ? <Server className="h-4 w-4" /> : isDegraded ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </div>
          <div>
            <p className="text-[13px] font-medium text-white">
              {runtime.isLoading ? 'Checking Android runtime…' : runtime.data?.label || 'Runtime status unavailable'}
            </p>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-zinc-400">
              {isDemoRuntime
                ? 'Demo environment: phones marked DEMO are illustrative data and are not connected to an Android instance. No stream is faked.'
                : runtime.data?.detail || 'The API will only report Running after adb confirms the Android boot.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
          <Badge tone={runtime.data?.mode === 'live' ? 'green' : isDegraded ? 'rose' : 'amber'}>
            {runtime.data?.bootedDevices || 0} booted
          </Badge>
          <Badge tone="default">{runtime.data?.gmsAvailable ? 'Google Play · GMS' : 'AOSP · no GMS'}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Smartphone} label="Cloud phones" value={String(devices.length)}
          detail={<span>{devices.length === 1 ? '1 device' : `${devices.length} devices`} · {demoCount} demo</span>}
          tone="violet"
        />
        <StatCard
          icon={Wifi} label="Running" value={String(running)}
          detail={<span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Verified by runtime</span>}
          tone="green"
        />
        <StatCard
          icon={CircleDashed} label="Stopped" value={String(stopped)}
          detail={<span>{devices.filter((d) => d.status === 'starting').length} starting · {devices.filter((d) => d.status === 'error').length} errors</span>}
          tone="amber"
        />
        <StatCard
          icon={HardDrive} label="Storage used" value={formatGbFromMb(Math.round(usage?.storageMb || 0))}
          detail={<span>of {formatGbFromMb(usage?.limits.storageMb || 0)} allowance</span>}
          tone="cyan"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.5fr,1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-white">Resource allocation</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">{usage?.period || ''} usage against your plan</p>
            </div>
            <Link to="/app/billing" className="text-[11px] font-medium text-iris-300 hover:text-iris-200">Manage plan</Link>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-zinc-400">Concurrent phones</span>
                <span className="font-mono text-[11px] text-zinc-300">{usage?.runningCount || 0}/{usage?.limits.maxConcurrent}</span>
              </div>
              <Progress className="mt-2" value={concurrencyPct} tone={concurrencyPct > 85 ? 'rose' : 'cyan'} />
              <p className="mt-1.5 text-[9px] text-zinc-600">Only running instances count</p>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-zinc-400">Object storage</span>
                <span className="font-mono text-[11px] text-zinc-300">{Math.round(storagePct)}%</span>
              </div>
              <Progress className="mt-2" value={storagePct} tone={storagePct > 85 ? 'rose' : 'violet'} />
              <p className="mt-1.5 text-[9px] text-zinc-600">Uploaded files and APKs</p>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-zinc-400">Runtime hours</span>
                <span className="font-mono text-[11px] text-zinc-300">{Math.round((usage?.minutes || 0) / 6) / 10}/{usage?.limits.monthlyHours}</span>
              </div>
              <Progress className="mt-2" value={hoursPct} tone={hoursPct > 85 ? 'rose' : 'green'} />
              <p className="mt-1.5 text-[9px] text-zinc-600">Estimated from sessions</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-4 border-t border-white/[0.06] pt-4 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5"><Cpu className="h-3 w-3" /> {usage?.limits.ramMb ? `${Math.round(usage.limits.ramMb / 1024)} GB RAM limit` : '—'}</span>
            <span className="flex items-center gap-1.5"><SlidersHorizontal className="h-3 w-3" /> {usage?.limits.vcpu} vCPU limit</span>
            <span className="flex items-center gap-1.5"><Clock3 className="h-3 w-3" /> Resets monthly</span>
          </div>
        </Card>

        <Card className="flex min-h-[220px] flex-col p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Recent activity</h2>
            <Link to="/app/settings" className="text-[10px] text-zinc-500 hover:text-zinc-300">Audit</Link>
          </div>
          <div className="mt-3 flex-1 space-y-0.5 overflow-y-auto">
            {activity.length === 0 ? (
              <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center">
                <Activity className="h-5 w-5 text-zinc-700" />
                <p className="mt-2 text-[11px] text-zinc-600">No activity yet</p>
              </div>
            ) : activity.slice(0, 6).map((event) => {
              const Icon = activityIcons[event.action] || Activity
              return (
                <div key={event.id} className="flex items-start gap-2.5 rounded-lg px-1 py-2 transition hover:bg-white/[0.03]">
                  <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-white/[0.03] text-zinc-400">
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-zinc-300">{event.detail}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-[9px] text-zinc-600">
                      <span>{relativeTime(event.createdAt)}</span>
                      {event.demo && <span className="rounded border border-amber-400/20 px-1 text-[8px] uppercase tracking-wider text-amber-400/80">Demo</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Your cloud phones</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">Open, start, stop or manage each device.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search phones" className="h-9 w-full pl-9 text-xs sm:w-52" />
            </div>
            <div className="no-scrollbar flex overflow-x-auto rounded-lg border border-white/10 bg-ink-900 p-0.5">
              {(['all', 'running', 'stopped', 'error'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-[10px] font-medium capitalize transition',
                    filter === value ? 'bg-white/[0.09] text-white' : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>

        {devicesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-[360px]" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title={devices.length === 0 ? 'No cloud phones yet' : 'No phones match this filter'}
            description={devices.length === 0
              ? 'Create a phone to boot a real Android instance and stream it to your browser.'
              : 'Try a different search term or status filter.'}
            action={devices.length === 0
              ? <Link to="/app/create"><Button variant="primary"><Plus className="h-4 w-4" /> Create your first phone</Button></Link>
              : <Button variant="secondary" onClick={() => { setSearch(''); setFilter('all') }}>Clear filters</Button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((device) => (
              <PhoneCard
                key={device.id}
                device={device}
                busy={busy?.id === device.id ? busy.action : null}
                onStart={(target) => runAction(target, 'start')}
                onStop={(target) => runAction(target, 'stop')}
                onRestart={(target) => runAction(target, 'restart')}
                onDelete={setDeleteTarget}
                onSettings={(target) => { setSettingsTarget(target); setSettingsName(target.name) }}
              />
            ))}
            <Link to="/app/create" className="group flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-6 text-center transition hover:border-iris-400/30 hover:bg-iris-500/[0.03]">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-500 transition group-hover:border-iris-400/30 group-hover:text-iris-300">
                <Plus className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-medium text-zinc-300">Add another phone</p>
              <p className="mt-1 max-w-[180px] text-[11px] leading-relaxed text-zinc-600">Provision a new isolated Android device.</p>
            </Link>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this cloud phone?"
        description={deleteTarget ? `${deleteTarget.name} will be stopped and its Android data, AVD and stored files will be permanently removed.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-rose-400/15 bg-rose-500/[0.05] p-3 text-[11px] leading-relaxed text-rose-200/80">
          This cannot be undone. Downloaded files remain on your computer, but the Android instance and cloud copies are destroyed.
        </div>
      </Modal>

      <Modal
        open={Boolean(settingsTarget)}
        onClose={() => setSettingsTarget(null)}
        title={settingsTarget ? `${settingsTarget.name} settings` : 'Phone settings'}
        description="Rename the device or inspect the provisioned configuration."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSettingsTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={renameMutation.isPending}
              disabled={!settingsName.trim() || settingsName.trim() === settingsTarget?.name}
              onClick={() => settingsTarget && renameMutation.mutate({ id: settingsTarget.id, name: settingsName.trim() })}
            >
              Save changes
            </Button>
          </>
        }
      >
        {settingsTarget && (
          <div className="space-y-4">
            <Field label="Phone name">
              <Input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} maxLength={40} />
            </Field>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                ['Android', `${settingsTarget.androidVersion} · API ${settingsTarget.apiLevel}`],
                ['Profile', settingsTarget.profileName],
                ['Display', settingsTarget.resolution],
                ['Memory', `${formatGbFromMb(settingsTarget.ramMb)} RAM · ${settingsTarget.vcpu} vCPU`],
                ['Storage', `${settingsTarget.storageGb} GB`],
                ['Google services', settingsTarget.gms ? 'Google Play · GMS' : 'AOSP · no Play Services'],
                ['Runtime', settingsTarget.isDemo ? 'Demo data (not live)' : settingsTarget.provider],
                ['Status', settingsTarget.status],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
                  <p className="mt-0.5 text-zinc-300">{value}</p>
                </div>
              ))}
            </div>
            {settingsTarget.isDemo && (
              <div className="rounded-lg border border-amber-400/20 bg-amber-500/[0.05] p-3 text-[11px] text-amber-200/80">
                This device is demo data. It has no Android runtime or stream.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
