import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, Cpu, Globe2, HardDrive, Info, Layers,
  Loader2, MapPin, MemoryStick, Monitor, ShieldCheck, Smartphone, Sparkles, TriangleAlert,
} from 'lucide-react'
import type { Catalog, Device } from '@shared/contracts'
import { get, post } from '../lib/api'
import { useToast } from '../lib/toast'
import { Badge, Button, Card, Field, Input, Progress, Select, Toggle } from '../components/ui'
import { cn, formatGbFromMb } from '../lib/utils'

const steps = [
  { title: 'Basics', subtitle: 'Name & region' },
  { title: 'Hardware', subtitle: 'Memory & storage' },
  { title: 'Android', subtitle: 'Image & services' },
  { title: 'Review', subtitle: 'Confirm & boot' },
]

export default function CreatePhonePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const catalogQuery = useQuery<Catalog>({
    queryKey: ['catalog'],
    queryFn: () => get('/catalog'),
  })
  const catalog = catalogQuery.data
  const plan = catalog?.plan

  const [step, setStep] = useState(0)
  const [name, setName] = useState('My Cloud Phone')
  const [region, setRegion] = useState('local')
  const [profileId, setProfileId] = useState('pixel_6')
  const [versionId, setVersionId] = useState('')
  const [ramMb, setRamMb] = useState(4096)
  const [vcpu, setVcpu] = useState(2)
  const [storageGb, setStorageGb] = useState(32)
  const [gms, setGms] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const profile = catalog?.profiles.find((item) => item.id === profileId) || catalog?.profiles[1]
  const version = catalog?.versions.find((item) => item.id === versionId) || catalog?.versions[0]

  useEffect(() => {
    if (!catalog) return
    if (!profileId) setProfileId(catalog.profiles[1]?.id || catalog.profiles[0].id)
    if (!versionId && catalog.versions[0]) setVersionId(catalog.versions[0].id)
    const nextProfile = catalog.profiles.find((item) => item.id === profileId)
    if (nextProfile) setRamMb(Math.min(nextProfile.ramMb, catalog.plan.ramMb))
  }, [catalog, profileId, versionId])

  useEffect(() => {
    if (!catalog) return
    if (storageGb * 1024 > catalog.plan.storageMb) {
      const allowed = [...catalog.storageOptions].reverse().find((value) => value * 1024 <= catalog.plan.storageMb)
      if (allowed) setStorageGb(allowed)
    }
  }, [catalog, storageGb])

  const ramOptions = useMemo(() => {
    const values = [3072, 4096, 6144, 8192].filter((value) => value <= (plan?.ramMb || 4096))
    if (profile?.ramMb && profile.ramMb <= (plan?.ramMb || 4096) && !values.includes(profile.ramMb)) values.push(profile.ramMb)
    return [...new Set(values)].sort((a, b) => a - b)
  }, [plan, profile])

  const vcpuOptions = useMemo(() => [1, 2, 4, 8].filter((value) => value <= (plan?.vcpu || 2)), [plan])
  const storageOptions = useMemo(
    () => (catalog?.storageOptions || [16, 32, 64]).filter((value) => value * 1024 <= (plan?.storageMb || 1024 * 32)),
    [catalog, plan],
  )

  function chooseProfile(id: string) {
    setProfileId(id)
    const next = catalog?.profiles.find((item) => item.id === id)
    if (next) setRamMb(Math.min(next.ramMb, plan?.ramMb || next.ramMb))
  }

  async function createPhone() {
    if (!catalog || !version) return
    setSubmitting(true)
    try {
      const result = await post<{ device: Device }>('/devices', {
        name: name.trim(),
        androidVersion: version.label,
        apiLevel: version.apiLevel,
        profileId: profileId,
        ramMb,
        vcpu,
        storageGb,
        region,
        gms,
      })
      await queryClient.invalidateQueries({ queryKey: ['devices'] })
      toast('Phone created', { kind: 'success', description: 'Requesting Android boot. The workspace will show live status.' })
      try {
        await post(`/devices/${result.device.id}/start`)
      } catch (error: any) {
        toast('Phone created, boot deferred', { kind: 'info', description: error?.message })
      }
      navigate(`/app/phones/${result.device.id}`)
    } catch (error: any) {
      toast('Could not create phone', { kind: 'error', description: error?.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (catalogQuery.isLoading || !catalog || !plan) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="h-8 w-56 shimmer rounded-lg" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr,340px]">
          <div className="h-[480px] shimmer rounded-2xl" />
          <div className="h-[320px] shimmer rounded-2xl" />
        </div>
      </div>
    )
  }

  const demoRuntime = catalog.runtime.mode === 'demo'
  const capacityWarning = !catalog.provisionable && demoRuntime

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/app" className="mb-5 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-200">
        <ChevronLeft className="h-3.5 w-3.5" /> Back to dashboard
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-iris-300/80">Provisioning wizard</p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">Create a cloud phone</h1>
          <p className="mt-1.5 text-sm text-zinc-400">Only configurations the backend can provision are shown.</p>
        </div>
        <Badge tone={demoRuntime ? 'amber' : 'green'}>
          <span className={cn('h-1.5 w-1.5 rounded-full', demoRuntime ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse')} />
          {demoRuntime ? 'Demo provisioning' : 'Live provisioning'}
        </Badge>
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-[1fr,330px]">
        <div>
          <div className="mb-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-ink-900 p-1.5 no-scrollbar">
            {steps.map((item, index) => (
              <button
                key={item.title}
                onClick={() => index < step && setStep(index)}
                className={cn(
                  'flex flex-1 min-w-[100px] items-center gap-2 rounded-lg px-2.5 py-2 text-left transition',
                  index === step ? 'bg-white/[0.07]' : index < step ? 'hover:bg-white/[0.04]' : 'opacity-50',
                )}
              >
                <span className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold',
                  index < step ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                    : index === step ? 'border-iris-400/40 bg-iris-500/20 text-iris-200'
                      : 'border-white/10 bg-white/[0.03] text-zinc-600',
                )}>
                  {index < step ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="hidden sm:block">
                  <span className={cn('block text-[11px] font-medium', index === step ? 'text-white' : 'text-zinc-400')}>{item.title}</span>
                  <span className="block text-[9px] text-zinc-600">{item.subtitle}</span>
                </span>
              </button>
            ))}
          </div>

          <Card className="min-h-[420px] p-5 sm:p-6">
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">Name your device</h2>
                  <p className="mt-1 text-[12px] text-zinc-500">This label is only visible in your workspace.</p>
                </div>
                <Field label="Phone name" hint={`${name.length}/40`}>
                  <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="My Cloud Phone" autoFocus />
                </Field>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Device profile</span>
                    <span className="text-[10px] text-zinc-500">Resolution · default RAM</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {catalog.profiles.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => chooseProfile(item.id)}
                        className={cn(
                          'group flex items-center gap-3 rounded-xl border p-3 text-left transition',
                          profileId === item.id ? 'border-iris-400/50 bg-iris-500/[0.08]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]',
                        )}
                      >
                        <div className={cn('grid h-10 w-8 shrink-0 place-items-center rounded-lg border', profileId === item.id ? 'border-iris-400/30 bg-iris-500/10 text-iris-300' : 'border-white/10 bg-white/[0.03] text-zinc-500')}>
                          <Monitor className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white">{item.name}</p>
                          <p className="mt-0.5 text-[10px] text-zinc-500">{item.resolution} · {formatGbFromMb(item.ramMb)}</p>
                        </div>
                        {profileId === item.id && <Check className="h-4 w-4 shrink-0 text-iris-300" />}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Region" hint="Only provisionable regions are listed">
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <MapPin className="h-4 w-4 text-electric-300" />
                    <div className="flex-1">
                      <p className="text-xs text-zinc-200">{catalog.regions[0]?.label || 'Local runtime'}</p>
                      <p className="text-[10px] text-zinc-500">Same node as the Android gateway · lowest latency</p>
                    </div>
                    <Badge tone="green">Available</Badge>
                  </div>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">Allocate resources</h2>
                  <p className="mt-1 text-[12px] text-zinc-500">Your {plan.name} plan caps these values at {formatGbFromMb(plan.ramMb)} RAM, {plan.vcpu} vCPU and {formatGbFromMb(plan.storageMb)} storage.</p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Memory</span>
                    <span className="font-mono text-[10px] text-zinc-500">{formatGbFromMb(ramMb)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {ramOptions.map((value) => (
                      <button key={value} onClick={() => setRamMb(value)} className={cn(
                        'rounded-lg border py-2.5 text-center text-xs transition',
                        ramMb === value ? 'border-iris-400/50 bg-iris-500/[0.1] text-white' : 'border-white/[0.07] text-zinc-400 hover:border-white/20',
                      )}>
                        {value / 1024} GB
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Virtual CPU</span>
                    <span className="font-mono text-[10px] text-zinc-500">{vcpu} vCPU</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {vcpuOptions.map((value) => (
                      <button key={value} onClick={() => setVcpu(value)} className={cn(
                        'rounded-lg border py-2.5 text-center text-xs transition',
                        vcpu === value ? 'border-iris-400/50 bg-iris-500/[0.1] text-white' : 'border-white/[0.07] text-zinc-400 hover:border-white/20',
                      )}>
                        {value} vCPU
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">Persistent storage</span>
                    <span className="font-mono text-[10px] text-zinc-500">{storageGb} GB</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {storageOptions.map((value) => (
                      <button key={value} onClick={() => setStorageGb(value)} className={cn(
                        'rounded-lg border py-2.5 text-center text-xs transition',
                        storageGb === value ? 'border-iris-400/50 bg-iris-500/[0.1] text-white' : 'border-white/[0.07] text-zinc-400 hover:border-white/20',
                      )}>
                        {value} GB
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-zinc-600">Android userdata is retained when the phone stops; deleting the phone destroys it.</p>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">Plan storage remaining</span>
                    <span className="font-mono text-zinc-300">{formatGbFromMb(Math.max(0, plan.storageMb - storageGb * 1024))}</span>
                  </div>
                  <Progress className="mt-2" value={(storageGb * 1024 / plan.storageMb) * 100} tone="cyan" />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">Android image</h2>
                  <p className="mt-1 text-[12px] text-zinc-500">Images listed here are installed or provisionable on this runtime node.</p>
                </div>
                <div className="space-y-2">
                  {catalog.versions.map((item) => (
                    <button key={item.id} onClick={() => setVersionId(item.id)} className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition',
                      versionId === item.id ? 'border-iris-400/50 bg-iris-500/[0.08]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]',
                    )}>
                      <div className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                        <Smartphone className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-white">{item.label}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-500">API {item.apiLevel} · {item.gms ? 'Certified Google services' : 'AOSP · no Play Store or Play Services'}</p>
                      </div>
                      {versionId === item.id && <Check className="h-4 w-4 text-iris-300" />}
                    </button>
                  ))}
                </div>

                <div className={cn('rounded-xl border p-4', catalog.gms.available ? 'border-emerald-400/20 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-white/[0.02]')}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg border', catalog.gms.available ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-zinc-500')}>
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white">Google Play Services</p>
                        <p className="mt-1 max-w-sm text-[10px] leading-relaxed text-zinc-500">{catalog.gms.reason}</p>
                      </div>
                    </div>
                    <Toggle checked={gms} onChange={setGms} disabled={!catalog.gms.available} label="Google Play Services" />
                  </div>
                  {!catalog.gms.available && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-500/[0.04] p-2.5 text-[10px] leading-relaxed text-amber-200/80">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" />
                      This device will be labelled <strong className="font-semibold">AOSP Android {version?.apiLevel === 35 ? '15' : ''}</strong>. Play Store and Google sign-in are not installed, and we never emulate them.
                    </div>
                  )}
                </div>

                <Field label="Region">
                  <Select value={region} onChange={(event) => setRegion(event.target.value)}>
                    {catalog.regions.filter((item) => item.available).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </Select>
                </Field>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-white">Review & provision</h2>
                  <p className="mt-1 text-[12px] text-zinc-500">The backend will create the device record, then ask the Android provider to boot it.</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl border border-iris-400/25 bg-iris-500/10 text-iris-300"><Smartphone className="h-5 w-5" /></div>
                    <div>
                      <p className="font-display text-sm font-semibold text-white">{name || 'Untitled phone'}</p>
                      <p className="text-[11px] text-zinc-500">{version?.label} · {profile?.name}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                    {[
                      ['Display', profile?.resolution],
                      ['Memory', `${formatGbFromMb(ramMb)} · ${vcpu} vCPU`],
                      ['Storage', `${storageGb} GB`],
                      ['Region', 'Local runtime'],
                      ['Google', gms ? 'Certified GMS' : 'AOSP · no GMS'],
                      ['Provider', catalog.runtime.provider],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-white/[0.06] bg-ink-900/60 p-2.5">
                        <p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
                        <p className="mt-0.5 text-zinc-300">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={cn('rounded-xl border p-3.5', demoRuntime ? 'border-amber-400/20 bg-amber-500/[0.05]' : 'border-emerald-400/15 bg-emerald-500/[0.04]')}>
                  <p className="flex items-center gap-2 text-[11px] font-medium text-zinc-200">
                    {demoRuntime ? <TriangleAlert className="h-3.5 w-3.5 text-amber-300" /> : <Sparkles className="h-3.5 w-3.5 text-emerald-300" />}
                    {demoRuntime ? 'Created as clearly-labelled demo data' : 'Ready to boot on a real AOSP runtime'}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                    {demoRuntime
                      ? 'No Android runtime is available on this node, so the new phone will be marked DEMO and cannot stream.'
                      : `Booting may take up to ${Math.round((catalog.runtime.mode === 'live' ? 180 : 300) / 60)} minutes. The dashboard reports Running only after adb confirms sys.boot_completed.`}
                  </p>
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[10px] leading-relaxed text-zinc-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  Resource allocation: {formatGbFromMb(ramMb)} RAM, {vcpu} vCPU, {storageGb} GB storage. Preview billing will not charge you, and failed provisioning is never billed.
                </div>
              </div>
            )}
          </Card>

          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || submitting}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 3 ? (
              <Button variant="primary" onClick={() => setStep((value) => value + 1)} disabled={!name.trim()}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={createPhone} loading={submitting} disabled={!name.trim()}>
                {submitting ? 'Provisioning…' : 'Provision cloud phone'} {!submitting && <ArrowRight className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Card className="sticky top-20 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">Configuration</h3>
              {demoRuntime ? <Badge tone="amber">Demo</Badge> : <Badge tone="green">Live</Badge>}
            </div>
            <div className="mt-4 space-y-3 text-[11px]">
              {[
                ['Name', name || '—'],
                ['Android', version?.label || '—'],
                ['Profile', profile?.name || '—'],
                ['Display', profile?.resolution || '—'],
                ['Memory', `${formatGbFromMb(ramMb)} RAM`],
                ['CPU', `${vcpu} vCPU`],
                ['Storage', `${storageGb} GB`],
                ['Google services', gms ? 'GMS' : 'AOSP'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <span className="text-zinc-500">{label}</span>
                  <span className="text-right font-medium text-zinc-200">{value}</span>
                </div>
              ))}
            </div>
            <div className="my-4 h-px bg-white/[0.07]" />
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Plan</span>
              <span className="text-zinc-200">{plan.name}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Concurrent limit</span>
              <span className="font-mono text-zinc-200">{plan.maxConcurrent}</span>
            </div>
            <div className="mt-4 rounded-lg border border-iris-400/15 bg-iris-500/[0.06] p-2.5 text-[10px] leading-relaxed text-iris-200/80">
              <div className="flex items-center gap-1.5 font-medium"><Loader2 className="h-3 w-3 animate-spin hidden" /> <Sparkles className="h-3 w-3" /> Bootstrap sequence</div>
              <p className="mt-1 text-zinc-400">Create record → allocate AVD → boot kernel → verify Android → issue stream ticket.</p>
            </div>
          </Card>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-[10px] leading-relaxed text-zinc-500">
            <p className="flex items-center gap-1.5 font-medium text-zinc-400"><HardDrive className="h-3 w-3" /> Capacity is real</p>
            <p className="mt-1.5">The {catalog.runtime.provider} provider is currently configured. If the runtime is at capacity, the boot request is rejected instead of claiming a false Running state.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
