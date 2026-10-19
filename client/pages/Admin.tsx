import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, Cpu, Database, HardDrive, RefreshCw, Server, ShieldCheck,
  Smartphone, Users, Zap,
} from 'lucide-react'
import type { AdminOverview, Device, RuntimeInfo } from '@shared/contracts'
import { get } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Badge, Button, Card, PageHeader, Progress, Skeleton, StatusBadge } from '../components/ui'
import { cn, formatGbFromMb, relativeTime } from '../lib/utils'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  planId: string
  status: string
  createdAt: string
  deviceCount: number
}

interface AdminDevice extends Device {
  ownerEmail: string
  avdName: string | null
}

interface AuditEvent {
  id: string
  actor: string | null
  action: string
  target: string | null
  meta: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

export default function AdminPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'users' | 'devices' | 'audit'>('users')

  const overviewQuery = useQuery<{ overview: AdminOverview }>({
    queryKey: ['admin-overview'],
    queryFn: () => get('/admin/overview'),
    refetchInterval: 10_000,
    enabled: user?.role === 'admin',
  })
  const usersQuery = useQuery<{ users: AdminUser[] }>({
    queryKey: ['admin-users'],
    queryFn: () => get('/admin/users'),
    enabled: user?.role === 'admin',
  })
  const devicesQuery = useQuery<{ devices: AdminDevice[] }>({
    queryKey: ['admin-devices'],
    queryFn: () => get('/admin/devices'),
    refetchInterval: 8000,
    enabled: user?.role === 'admin',
  })
  const auditQuery = useQuery<{ audit: AuditEvent[] }>({
    queryKey: ['admin-audit'],
    queryFn: () => get('/admin/audit'),
    enabled: user?.role === 'admin',
  })

  if (user?.role !== 'admin') {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-zinc-600" />
          <h1 className="mt-4 font-display text-xl font-semibold text-white">Administrator access required</h1>
          <p className="mt-1 text-sm text-zinc-500">Your account does not have permission to view this console.</p>
        </div>
      </div>
    )
  }

  const overview = overviewQuery.data?.overview
  const runtime: RuntimeInfo | undefined = overview?.runtime
  const users = usersQuery.data?.users || []
  const devices = devicesQuery.data?.devices || []
  const audit = auditQuery.data?.audit || []

  const refreshAll = () => {
    void overviewQuery.refetch()
    void usersQuery.refetch()
    void devicesQuery.refetch()
    void auditQuery.refetch()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin console"
        title="Runtime & fleet overview"
        description="Operational view of users, devices, storage and the Android runtime node."
        actions={<Button variant="secondary" onClick={refreshAll}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { icon: Users, label: 'Users', value: overview?.users ?? '—', tone: 'violet' },
          { icon: Smartphone, label: 'Devices', value: overview?.devices ?? '—', tone: 'cyan' },
          { icon: Zap, label: 'Running', value: overview?.running ?? '—', tone: 'green' },
          { icon: AlertTriangle, label: 'Demo devices', value: overview?.demoDevices ?? '—', tone: 'amber' },
          { icon: HardDrive, label: 'Storage', value: overview ? formatGbFromMb(Math.round(overview.storageMb)) : '—', tone: 'violet' },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <stat.icon className={cn(
              'h-4 w-4',
              stat.tone === 'green' ? 'text-emerald-400' : stat.tone === 'amber' ? 'text-amber-400' : stat.tone === 'cyan' ? 'text-electric-400' : 'text-iris-300',
            )} />
            <p className="mt-3 font-display text-xl font-semibold text-white">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{stat.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.3fr,1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-white"><Server className="h-4 w-4 text-iris-300" /> Android runtime node</h2>
            <Badge tone={runtime?.mode === 'live' ? 'green' : runtime?.mode === 'degraded' ? 'rose' : 'amber'}>{runtime?.mode || 'unknown'}</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ['Provider', runtime?.provider || '—'],
              ['Booted devices', String(runtime?.bootedDevices ?? '—')],
              ['Transport', runtime?.streamingTransport || '—'],
              ['ADB reachable', runtime?.adbAvailable ? 'yes' : 'no'],
              ['GMS licensed', runtime?.gmsAvailable ? 'yes' : 'no (AOSP)'],
              ['Demo seed', runtime?.demoSeed ? 'enabled' : 'disabled'],
              ['Server time', runtime ? new Date(runtime.serverTime).toLocaleTimeString() : '—'],
              ['External serial', runtime?.externalSerial || 'not configured'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                <p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-300">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">{runtime?.detail}</p>
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex-1">
              <div className="flex justify-between text-[10px]"><span className="text-zinc-500">Fleet capacity</span><span className="text-zinc-300">{overview?.running || 0} running</span></div>
              <Progress className="mt-1.5" value={Math.min(100, ((overview?.running || 0) / Math.max(1, runtime?.maxRunning || 1)) * 100)} tone="green" />
            </div>
            <span className="font-mono text-[10px] text-zinc-600">max {runtime?.maxRunning ?? '—'}</span>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-white"><Activity className="h-4 w-4 text-electric-300" /> Recent audit</h2>
          <div className="mt-3 space-y-2">
            {(overview?.recentAudit || []).map((event) => (
              <div key={event.id} className="flex items-start gap-2.5 rounded-lg border border-white/[0.04] bg-white/[0.015] p-2.5">
                <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-iris-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-zinc-300">{event.action} <span className="text-zinc-600">·</span> <span className="text-zinc-500">{event.target}</span></p>
                  <p className="text-[9px] text-zinc-600">{event.actor || 'system'} · {relativeTime(event.createdAt)}</p>
                </div>
              </div>
            ))}
            {!overview?.recentAudit?.length && <p className="py-6 text-center text-[11px] text-zinc-600">No audit events yet.</p>}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex gap-1 rounded-lg border border-white/10 bg-ink-900 p-0.5">
            {(['users', 'devices', 'audit'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[11px] font-medium capitalize transition',
                  tab === value ? 'bg-white/[0.09] text-white' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <Badge tone="default">
            {tab === 'users' ? `${users.length} users` : tab === 'devices' ? `${devices.length} devices` : `${audit.length} events`}
          </Badge>
        </div>

        {tab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[11px]">
              <thead className="border-b border-white/[0.06] text-[9px] uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="px-4 py-2.5 font-medium">Phones</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {users.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-200">{row.name}</p>
                      <p className="text-[9px] text-zinc-500">{row.email}</p>
                    </td>
                    <td className="px-4 py-3"><Badge tone={row.role === 'admin' ? 'violet' : 'default'}>{row.role}</Badge></td>
                    <td className="px-4 py-3 capitalize text-zinc-400">{row.planId}</td>
                    <td className="px-4 py-3 text-zinc-300">{row.deviceCount}</td>
                    <td className="px-4 py-3"><Badge tone={row.status === 'active' ? 'green' : 'rose'}>{row.status}</Badge></td>
                    <td className="px-4 py-3 text-zinc-500">{relativeTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'devices' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[11px]">
              <thead className="border-b border-white/[0.06] text-[9px] uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Device</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Runtime</th>
                  <th className="px-4 py-2.5 font-medium">Resources</th>
                  <th className="px-4 py-2.5 font-medium">AVD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {devices.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1.5 font-medium text-zinc-200">{row.name} {row.isDemo && <Badge tone="amber">Demo</Badge>}</p>
                      <p className="text-[9px] text-zinc-500">Android {row.androidVersion} · {row.profileName}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{row.ownerEmail}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} isDemo={row.isDemo} /></td>
                    <td className="px-4 py-3 capitalize text-zinc-400">{row.provider}</td>
                    <td className="px-4 py-3 text-zinc-500">{formatGbFromMb(row.ramMb)} · {row.vcpu} vCPU · {row.storageGb} GB</td>
                    <td className="max-w-[160px] truncate px-4 py-3 font-mono text-[9px] text-zinc-600">{row.avdName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'audit' && (
          <div className="divide-y divide-white/[0.04]">
            {audit.map((event) => (
              <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.02] text-zinc-500"><Database className="h-3 w-3" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-zinc-300"><span className="font-mono text-[10px] text-iris-300">{event.action}</span> {event.target && <span className="text-zinc-500">· {event.target}</span>}</p>
                  <p className="mt-0.5 text-[9px] text-zinc-600">{event.actor || 'system'} · {event.ip || 'no ip'} · {relativeTime(event.createdAt)}</p>
                </div>
              </div>
            ))}
            {!audit.length && <p className="py-10 text-center text-[11px] text-zinc-600">No audit events.</p>}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5"><Cpu className="h-3 w-3" /> Node provider: {runtime?.provider}</span>
        <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> GMS: {runtime?.gmsAvailable ? 'licensed' : 'not licensed (AOSP only)'}</span>
        <span className="flex items-center gap-1.5"><Server className="h-3 w-3" /> Transport: {runtime?.streamingTransport}</span>
      </div>
    </div>
  )
}
