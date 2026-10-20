import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, Check, ChevronRight, Cpu, Fingerprint, FolderUp, Gamepad2, Globe2,
  Layers, Lock, MonitorSmartphone, MousePointerClick, Play, Radio, Server, ShieldCheck,
  Smartphone, Sparkles, Terminal, Wifi, Zap,
} from 'lucide-react'
import type { Plan } from '@shared/contracts'
import { get } from '../lib/api'
import { Logo } from '../components/Logo'
import { Badge, Button } from '../components/ui'
import { cn, money } from '../lib/utils'

interface PublicStatus {
  mode: 'live' | 'demo' | 'degraded'
  label: string
  transport: string
  gmsAvailable: boolean
  bootedDevices: number
  devices: number
  demoDevices: number
  users: number
}

function PhoneIllustration() {
  const apps = [
    { label: 'Browser', bg: 'from-sky-400 to-blue-600', icon: Globe2 },
    { label: 'Gallery', bg: 'from-fuchsia-400 to-purple-600', icon: Layers },
    { label: 'Settings', bg: 'from-zinc-400 to-zinc-600', icon: Cpu },
    { label: 'Files', bg: 'from-amber-300 to-orange-500', icon: FolderUp },
    { label: 'Music', bg: 'from-rose-400 to-red-600', icon: Radio },
    { label: 'Games', bg: 'from-emerald-400 to-teal-600', icon: Gamepad2 },
  ]
  return (
    <div className="relative mx-auto w-[278px] animate-float sm:w-[300px]">
      <div className="phone-glow relative">
        <div className="relative rounded-[2.9rem] border border-white/15 bg-gradient-to-b from-zinc-700 via-ink-800 to-black p-[3px] shadow-[0_50px_120px_-30px_rgba(0,0,0,.9)]">
          <div className="relative overflow-hidden rounded-[2.7rem] border border-black/60 bg-black">
            <div className="absolute left-1/2 top-2.5 z-20 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
            <div className="relative h-[600px] overflow-hidden bg-gradient-to-br from-[#1b1035] via-[#101425] to-[#06131a]">
              <div className="absolute -right-16 top-16 h-56 w-56 rounded-full bg-iris-500/30 blur-3xl" />
              <div className="absolute -left-16 top-56 h-52 w-52 rounded-full bg-electric-500/20 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 bg-dots opacity-20" />
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 pt-2.5 text-[10px] font-medium text-white/90">
                <span>9:41</span>
                <div className="flex items-center gap-1.5">
                  <Wifi className="h-3 w-3" />
                  <span className="text-[9px]">5G</span>
                  <span className="h-2 w-4 rounded-[3px] border border-white/70"><span className="block h-full w-3/4 rounded-[2px] bg-white/80" /></span>
                </div>
              </div>
              <div className="relative z-10 px-5 pt-12">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">CloudDroid</p>
                    <p className="mt-0.5 font-display text-[22px] font-semibold tracking-tight text-white">Good evening, Alex</p>
                  </div>
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[10px] font-semibold text-white backdrop-blur">AR</div>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.08] p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                      <span className="text-[10px] font-medium text-white/90">Aurora One</span>
                    </div>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-emerald-300">Live</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider text-white/40">Stream</p>
                      <p className="font-display text-lg font-semibold text-white">42 <span className="text-[10px] font-normal text-white/50">ms</span></p>
                    </div>
                    <div className="flex h-7 items-end gap-0.5">
                      {[5, 9, 6, 12, 8, 14, 10, 16, 12, 18, 14, 20].map((height, index) => (
                        <span key={index} className="w-1 rounded-sm bg-gradient-to-t from-electric-500 to-iris-300" style={{ height: `${height}px`, opacity: 0.4 + index / 24 }} />
                      ))}
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-wider text-white/40">Android</p>
                      <p className="text-[11px] font-medium text-white/90">15 · Android</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3.5">
                  {apps.map((app) => (
                    <div key={app.label} className="flex flex-col items-center gap-1.5">
                      <div className={cn('grid h-11 w-11 place-items-center rounded-[13px] bg-gradient-to-br shadow-lg shadow-black/30 ring-1 ring-white/10', app.bg)}>
                        <app.icon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-[8px] text-white/70">{app.label}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-2.5 backdrop-blur">
                  <p className="text-[8px] uppercase tracking-wider text-white/40">Quick actions</p>
                  <div className="mt-1.5 flex gap-1.5">
                    {[
                      { icon: MousePointerClick, label: 'Touch' },
                      { icon: Fingerprint, label: 'Secure' },
                      { icon: MonitorSmartphone, label: 'Rotate' },
                    ].map((action) => (
                      <div key={action.label} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/[0.06] px-1 py-1.5">
                        <action.icon className="h-2.5 w-2.5 text-iris-300" />
                        <span className="text-[8px] text-white/70">{action.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-around px-10 pb-3">
                <span className="h-1 w-6 rounded-full bg-white/30" />
                <span className="h-1 w-6 rounded-full bg-white/50" />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute -left-16 top-24 hidden rounded-xl border border-white/10 bg-ink-850/90 p-3 shadow-2xl backdrop-blur-xl sm:block">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300"><Zap className="h-3.5 w-3.5" /></div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">Input round-trip</p>
              <p className="font-mono text-xs font-medium text-white">38 ms</p>
            </div>
          </div>
        </div>
        <div className="absolute -right-10 bottom-40 hidden rounded-xl border border-white/10 bg-ink-850/90 p-3 shadow-2xl backdrop-blur-xl sm:block">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-iris-400/10 text-iris-300"><ShieldCheck className="h-3.5 w-3.5" /></div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">Boot verified</p>
              <p className="text-xs font-medium text-white">Android 15</p>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-[10px] text-zinc-600">Interface illustration · connect to see a real device</p>
    </div>
  )
}

const features = [
  { icon: Smartphone, title: 'Genuine Android', body: 'Android 15 boots on a KVM-backed virtual device. What you see is the real framebuffer, not a browser mockup.' },
  { icon: Zap, title: 'Low-latency streaming', body: 'Compressed frames stream over an authenticated WebSocket gateway. Input travels back through adb to the live instance.' },
  { icon: MousePointerClick, title: 'Complete control', body: 'Touch, drag, scroll, typing, navigation keys, volume, rotation and screenshots — all mapped to Android input events.' },
  { icon: FolderUp, title: 'Files & APKs', body: 'Upload from any tablet or laptop, copy into /sdcard/Download, and install signed APKs through Android’s package manager.' },
  { icon: Lock, title: 'Isolated by design', body: 'Each phone belongs to one account. Every API call and stream ticket is ownership-checked, short-lived, and rate limited.' },
  { icon: ShieldCheck, title: 'Real Google services', body: 'Official Google Play images include Play Store and Google Play Services. AOSP builds stay clearly labelled, and we never imitate Google sign-in.' },
]

const steps = [
  { number: '01', title: 'Create your phone', body: 'Choose a device profile, RAM, storage and Android image. We provision only what the runtime node can actually provide.' },
  { number: '02', title: 'Boot Android', body: 'CloudDroid starts the instance, waits for Android to report boot completion, then issues a one-time streaming ticket.' },
  { number: '03', title: 'Use it anywhere', body: 'Control your phone from a laptop, phone or Android tablet. Data persists between sessions until you reset or delete it.' },
]

export default function LandingPage() {
  const plansQuery = useQuery<{ plans: Plan[] }>({
    queryKey: ['plans'],
    queryFn: () => get('/plans'),
    staleTime: 60_000,
  })
  const statusQuery = useQuery<PublicStatus>({
    queryKey: ['public-status'],
    queryFn: () => get('/public/status'),
    staleTime: 30_000,
  })
  const plans = plansQuery.data?.plans || []
  const status = statusQuery.data
  const live = status?.mode === 'live'

  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-ink-950/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/"><Logo /></Link>
          <nav className="hidden items-center gap-7 text-[13px] text-zinc-400 md:flex">
            <a href="#product" className="transition hover:text-white">Product</a>
            <a href="#architecture" className="transition hover:text-white">Architecture</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <a href="#faq" className="transition hover:text-white">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</Button></Link>
            <Link to="/register"><Button variant="primary" size="sm">Get started <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden pb-20 pt-32 sm:pt-40">
        <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_70%)]" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-iris-600/[0.13] blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.1fr,.9fr] lg:gap-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-300 backdrop-blur">
              <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
              {live ? `Live runtime · ${status?.bootedDevices} Android instance${status?.bootedDevices === 1 ? '' : 's'} online` : 'Interactive demo workspace available'}
              <ChevronRight className="h-3 w-3 text-zinc-500" />
            </div>
            <h1 className="mt-6 max-w-2xl font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-white sm:text-6xl lg:text-[72px]">
              Real Android.<br />
              <span className="gradient-text">No hardware.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
              Create, boot and control genuine Android phones on remote infrastructure — directly from your browser.
              Persistent storage, full touch and keyboard control, and a live framebuffer you can actually use.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register">
                <Button variant="primary" size="lg">Create your cloud phone <ArrowRight className="h-4 w-4" /></Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" size="lg"><Play className="h-3.5 w-3.5" /> Open demo workspace</Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-400" /> No credit card</span>
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-400" /> {status?.gmsAvailable ? 'Android 15 · Google Play' : 'Android 15'}</span>
              <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-400" /> Data persists</span>
            </div>
          </div>
          <PhoneIllustration />
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-white/[0.06] px-5 sm:grid-cols-4 sm:divide-x sm:px-8">
          {[
            { value: status?.gmsAvailable ? 'Play · 15' : 'Android 15', label: 'Android image' },
            { value: 'KVM', label: 'Hardware isolation' },
            { value: 'WebSocket', label: 'Frame transport' },
            { value: '< 100 ms', label: 'Input path target' },
          ].map((item) => (
            <div key={item.label} className="px-3 py-7 text-center sm:py-8">
              <p className="font-display text-lg font-semibold text-white sm:text-xl">{item.value}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-zinc-500">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="product" className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-iris-300/80">Built for real work</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-[42px]">
              A cloud phone that behaves like a phone.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
              Not a skin over an emulator. CloudDroid manages the Android instance, verifies boot, and streams the actual display
              with input sent back to the operating system.
            </p>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850 p-6 transition duration-300 hover:border-white/[0.14] hover:bg-ink-800">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent text-iris-300">
                  <feature.icon className="h-[18px] w-[18px]" />
                </div>
                <h3 className="font-display text-[15px] font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{feature.body}</p>
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-iris-500/[0.06] blur-2xl transition group-hover:bg-iris-500/[0.14]" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="architecture" className="border-y border-white/[0.06] bg-ink-900/40 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[.9fr,1.1fr] lg:items-center">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-electric-300/80">Transparent architecture</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-[40px]">
                The website and the phone are separate systems.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
                The dashboard never talks directly to a hypervisor. Short-lived API sessions authorize every operation, and a
                device gateway translates browser input into Android events. The web client cannot reach another user&apos;s phone.
              </p>
              <ul className="mt-7 space-y-3 text-sm text-zinc-300">
                {[
                  ['Per-user ownership checks', 'on every device, file and ticket'],
                  ['One-time stream tickets', 'expire in 60 seconds'],
                  ['Rate limits + audit log', 'for sensitive actions'],
                  ['Encrypted transport', 'in production via TLS/WSS'],
                ].map(([title, detail]) => (
                  <li key={title} className="flex items-start gap-2.5">
                    <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="h-2.5 w-2.5" /></span>
                    <span><span className="font-medium text-white">{title}</span> <span className="text-zinc-500">{detail}</span></span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex items-center gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-[11px] leading-relaxed text-amber-200/80">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                {status?.gmsAvailable
                  ? 'This node runs the official Google Play system image, so Play Store and Google Play Services are available on the device.'
                  : 'AOSP builds do not include Google Play Store or Play Services. Those appear only on official Google Play images.'}
              </div>
            </div>

            <div className="relative rounded-2xl border border-white/[0.08] bg-ink-950/80 p-5 shadow-2xl sm:p-7">
              <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
              <div className="relative space-y-3">
                {[
                  { icon: MonitorSmartphone, title: 'Browser client', sub: 'React · responsive workspace', tone: 'text-iris-300 border-iris-400/25 bg-iris-500/10', tag: 'TLS' },
                  { icon: Terminal, title: 'CloudDroid API', sub: 'Auth · plans · ownership · audit', tone: 'text-electric-300 border-electric-400/25 bg-electric-500/10', tag: 'REST + WS' },
                  { icon: Radio, title: 'Device gateway', sub: 'One-time tickets · input mapping', tone: 'text-fuchsia-300 border-fuchsia-400/25 bg-fuchsia-500/10', tag: 'WSS' },
                  { icon: Server, title: 'Android runtime', sub: `KVM-backed Android 15${status?.gmsAvailable ? ' · Google Play' : ''} · persistent userdata`, tone: 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10', tag: 'ADB' },
                ].map((node, index) => (
                  <div key={node.title}>
                    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-ink-850/90 p-3.5 backdrop-blur">
                      <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg border', node.tone)}>
                        <node.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{node.title}</p>
                        <p className="truncate text-[11px] text-zinc-500">{node.sub}</p>
                      </div>
                      <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">{node.tag}</span>
                    </div>
                    {index < 3 && <div className="ml-[30px] h-3 w-px bg-gradient-to-b from-white/20 to-white/5" />}
                  </div>
                ))}
              </div>
              <div className="relative mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600">State</p>
                  <p className="mt-0.5 font-mono text-[11px] text-zinc-300">PostgreSQL / SQLite</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600">Objects</p>
                  <p className="mt-0.5 font-mono text-[11px] text-zinc-300">Local / S3-compatible</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-iris-300/80">From login to Android</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-[40px]">Three steps. One real device.</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className={cn('h-2 w-2 rounded-full', live ? 'bg-emerald-400' : 'bg-amber-400')} />
              {status?.label || 'Checking runtime'}
            </div>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="relative rounded-2xl border border-white/[0.07] bg-ink-850 p-6">
                <span className="font-mono text-[11px] text-iris-300/70">{step.number}</span>
                <h3 className="mt-5 font-display text-lg font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{step.body}</p>
                <div className="mt-6 h-px bg-gradient-to-r from-iris-500/40 to-transparent" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-y border-white/[0.06] bg-ink-900/40 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-iris-300/80">Plans that mirror real capacity</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-[40px]">Start small. Scale the fleet.</h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Limits reflect provisionable resources — concurrent phones, storage and runtime hours. Preview billing does not charge a card.
            </p>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const featured = plan.id === 'pro'
              return (
                <div key={plan.id} className={cn(
                  'relative flex flex-col rounded-2xl border p-6',
                  featured ? 'border-iris-400/40 bg-gradient-to-b from-iris-500/[0.12] to-ink-850 shadow-glow' : 'border-white/[0.07] bg-ink-850',
                )}>
                  {featured && <span className="absolute -top-2.5 left-6 rounded-full border border-iris-400/40 bg-iris-600 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">Most popular</span>}
                  <h3 className="font-display text-sm font-semibold text-white">{plan.name}</h3>
                  <p className="mt-1 text-[11px] text-zinc-500">{plan.tagline}</p>
                  <p className="mt-5 font-display text-3xl font-semibold text-white">
                    {plan.priceCents === 0 ? '$0' : money(plan.priceCents)}
                    <span className="text-xs font-normal text-zinc-500"> /mo</span>
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-[12px] text-zinc-400">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link to="/register" className="mt-6">
                    <Button variant={featured ? 'primary' : 'secondary'} className="w-full" size="md">
                      {plan.priceCents === 0 ? 'Start free' : 'Choose plan'}
                    </Button>
                  </Link>
                </div>
              )
            })}
          </div>
          <p className="mt-5 text-center text-[10px] text-zinc-600">
            Usage estimates are shown before launch. Devices that fail to provision are never billed.
          </p>
        </div>
      </section>

      <section id="faq" className="py-24 sm:py-28">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Questions, answered honestly.</h2>
          <div className="mt-8 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {[
              ['Is this a real Android device?', 'Yes, when the runtime is live. CloudDroid boots a real Android image on a KVM-backed emulator and streams its actual display. Devices marked DEMO are clearly labelled demo data and are not live.'],
              ['Can I use the Google Play Store?', status?.gmsAvailable
                ? 'Yes. This deployment runs the official Google Play system image, so Play Store, Google Play Services and Google sign-in are available inside the phone. You sign in directly with Google on the device.'
                : 'Only on a deployment running an official Google Play image. This node ships AOSP, so Play Store and Play Services are absent and labelled as such. We never imitate Google sign-in.'],
              ['What happens to my apps and files?', 'The Android userdata image persists between stop and start. Deleting a phone destroys the instance, its AVD data and its stored files.'],
              ['How is the stream secured?', 'Every stream requires an authenticated, single-use ticket scoped to your user and phone. Production deployments terminate TLS and use WSS. Input is validated and rate limited.'],
            ].map(([question, answer], index) => (
              <details key={question} className="group py-5" open={index === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-zinc-200">
                  {question}
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-90" />
                </summary>
                <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-zinc-400">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/[0.06] py-20">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[300px] w-[700px] -translate-x-1/2 rounded-full bg-iris-600/[0.15] blur-[100px]" />
        <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
          <Sparkles className="mx-auto h-5 w-5 text-iris-300" />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white sm:text-[40px]">Your Android is waiting.</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-400">
            Open the demo workspace with a real Android phone, or create an account and provision your own.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register"><Button variant="primary" size="lg">Create free account <ArrowRight className="h-4 w-4" /></Button></Link>
            <Link to="/login"><Button variant="secondary" size="lg">Sign in to workspace</Button></Link>
          </div>
          <p className="mt-4 text-[10px] text-zinc-600">Demo: demo@clouddroid.app · CloudDroid123!</p>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 text-[11px] text-zinc-600 sm:flex-row sm:px-8">
          <div className="flex items-center gap-3"><Logo /><span className="hidden text-zinc-700 sm:inline">·</span><span>Real Android infrastructure.</span></div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a href="#product" className="hover:text-zinc-300">Product</a>
            <a href="#architecture" className="hover:text-zinc-300">Architecture</a>
            <a href="#pricing" className="hover:text-zinc-300">Pricing</a>
            <span className="opacity-60">Android and Google Play are trademarks of Google LLC.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
