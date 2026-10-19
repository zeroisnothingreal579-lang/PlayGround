import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Check, KeyRound, Laptop, LogOut, MonitorSmartphone, Save, ShieldCheck,
  Trash2, UserRound,
} from 'lucide-react'
import type { SessionInfo } from '@shared/contracts'
import { del, get, patch, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { Badge, Button, Card, Field, Input, Modal, PageHeader } from '../components/ui'
import { cn, formatDate, initials } from '../lib/utils'

export default function SettingsPage() {
  const { user, plan, refresh, logout } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setName(user?.name || '')
    setEmail(user?.email || '')
  }, [user?.id, user?.name, user?.email])

  const sessionsQuery = useQuery<{ sessions: SessionInfo[] }>({
    queryKey: ['sessions'],
    queryFn: () => get('/sessions'),
  })

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault()
    setSavingProfile(true)
    try {
      await patch('/auth/me', { name, email })
      await refresh()
      toast('Profile updated', { kind: 'success' })
    } catch (error: any) {
      toast('Could not update profile', { kind: 'error', description: error?.message })
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault()
    setSavingPassword(true)
    try {
      await post('/auth/me/password', { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      toast('Password changed', { kind: 'success', description: 'Other sessions were signed out.' })
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
    } catch (error: any) {
      toast('Could not change password', { kind: 'error', description: error?.message })
    } finally {
      setSavingPassword(false)
    }
  }

  async function revoke(session: SessionInfo) {
    try {
      await del(`/auth/sessions/${session.id}`)
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      if (session.current) {
        await logout()
        navigate('/login')
      } else {
        toast('Session revoked', { kind: 'success' })
      }
    } catch (error: any) {
      toast('Could not revoke session', { kind: 'error', description: error?.message })
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    try {
      await del('/auth/me', { password: deletePassword })
      await logout()
      navigate('/')
    } catch (error: any) {
      toast('Could not delete account', { kind: 'error', description: error?.message })
    } finally {
      setDeleting(false)
    }
  }

  const sessions = sessionsQuery.data?.sessions || []

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Account settings"
        description="Manage your identity, password, active sessions and workspace."
      />

      <div className="grid gap-3 lg:grid-cols-[1fr,300px]">
        <div className="space-y-3">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full border border-iris-400/25 bg-iris-500/15 font-display text-sm font-semibold text-iris-200">
                {user ? initials(user.name) : 'CD'}
              </div>
              <div>
                <h2 className="font-display text-sm font-semibold text-white">Profile</h2>
                <p className="text-[11px] text-zinc-500">Member since {formatDate(user?.createdAt)} · {plan?.name} plan</p>
              </div>
              <Badge tone={user?.role === 'admin' ? 'violet' : 'default'} className="ml-auto">{user?.role || 'user'}</Badge>
            </div>
            <form onSubmit={saveProfile} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <Input value={name} onChange={(event) => setName(event.target.value)} className="pl-10" required minLength={2} />
                  </div>
                </Field>
                <Field label="Email address">
                  <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" loading={savingProfile} disabled={!name || !email || (name === user?.name && email === user?.email)}>
                  <Save className="h-4 w-4" /> Save profile
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-iris-300" />
              <div>
                <h2 className="font-display text-sm font-semibold text-white">Password</h2>
                <p className="text-[11px] text-zinc-500">Changing your password revokes all other sessions.</p>
              </div>
            </div>
            <form onSubmit={savePassword} className="mt-5 space-y-4">
              <Field label="Current password">
                <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" />
              </Field>
              <Field label="New password" hint="8+ characters">
                <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" loading={savingPassword} disabled={!currentPassword || newPassword.length < 8}>
                  <Check className="h-4 w-4" /> Update password
                </Button>
              </div>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h2 className="font-display text-sm font-semibold text-white">Active sessions</h2>
                <p className="text-[11px] text-zinc-500">Devices currently signed in to your account.</p>
              </div>
              <Badge tone="green">{sessions.length} active</Badge>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400">
                    {(session.userAgent || '').includes('Android') ? <MonitorSmartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium text-zinc-200">{session.userAgent}</p>
                      {session.current && <Badge tone="green">This device</Badge>}
                    </div>
                    <p className="mt-0.5 text-[9px] text-zinc-500">{session.ip || 'IP hidden'} · expires {formatDate(session.expiresAt)}</p>
                  </div>
                  <button onClick={() => revoke(session)} className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] transition',
                    session.current ? 'text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300' : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200',
                  )}>
                    <LogOut className="h-3 w-3" /> {session.current ? 'Sign out' : 'Revoke'}
                  </button>
                </div>
              ))}
              {sessionsQuery.isLoading && <div className="px-5 py-6 text-center text-[11px] text-zinc-500">Loading sessions…</div>}
            </div>
          </Card>

          <Card className="border-rose-400/15 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-rose-400/20 bg-rose-400/10 text-rose-300"><AlertTriangle className="h-4 w-4" /></div>
              <div className="flex-1">
                <h2 className="font-display text-sm font-semibold text-white">Delete account</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  Permanently delete your account, every cloud phone, Android data volumes, uploaded files and sessions. This cannot be undone.
                </p>
                <Button variant="danger" size="sm" className="mt-3" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete my account
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Security posture</h3>
            <div className="mt-4 space-y-3 text-[10px]">
              {[
                ['Authentication', 'HTTP-only session', true],
                ['Password storage', 'scrypt + salt', true],
                ['Stream access', 'one-time tickets', true],
                ['API authorization', 'per-user ownership', true],
                ['Transport', 'TLS required in production', true],
                ['Rate limiting', 'enabled', true],
              ].map(([label, value, ok]) => (
                <div key={label as string} className="flex items-start justify-between gap-3">
                  <span className="text-zinc-500">{label}</span>
                  <span className="flex items-center gap-1 text-right text-zinc-300"><Check className="h-2.5 w-2.5 text-emerald-400" /> {value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-display text-sm font-semibold text-white">Workspace</h3>
            <div className="mt-3 space-y-2 text-[10px]">
              <div className="flex justify-between"><span className="text-zinc-500">Plan</span><span className="text-zinc-300">{plan?.name}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Phone limit</span><span className="text-zinc-300">{plan?.maxDevices}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Storage</span><span className="text-zinc-300">{plan ? `${Math.round(plan.storageMb / 1024)} GB` : '—'}</span></div>
            </div>
            <Link to="/app/billing"><Button variant="secondary" size="sm" className="mt-4 w-full">Manage plan</Button></Link>
          </Card>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-[9px] leading-relaxed text-zinc-600">
            CloudDroid never exposes runtime credentials, hypervisor paths or another user&apos;s files to the browser. Streaming tickets are scoped to one phone and expire after 60 seconds.
          </div>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeletePassword('') }}
        title="Delete account permanently"
        description="This destroys every phone, Android volume, file and session associated with your account."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={deleting} disabled={!deletePassword} onClick={deleteAccount}>Delete account</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.05] p-3 text-[11px] leading-relaxed text-rose-200/80">
            Type your password to confirm. There is no recovery. Any running Android instances are stopped and deleted.
          </div>
          <Field label="Account password">
            <Input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
