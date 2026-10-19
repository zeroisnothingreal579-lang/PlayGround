import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ExternalLink, Loader2, MoreHorizontal, Pencil, Play, Power, RotateCw, Settings2,
  Smartphone, Trash2, Wifi,
} from 'lucide-react'
import type { Device } from '@shared/contracts'
import { Badge, Button, StatusBadge } from './ui'
import { cn, formatGbFromMb, relativeTime } from '../lib/utils'

interface PhoneCardProps {
  device: Device
  busy?: string | null
  onStart: (device: Device) => void
  onStop: (device: Device) => void
  onRestart: (device: Device) => void
  onSettings: (device: Device) => void
  onDelete: (device: Device) => void
}

function LivePreview({ device }: { device: Device }) {
  const [tick, setTick] = useState(() => Date.now())
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const lastUrl = useRef('')

  useEffect(() => {
    if (device.status !== 'running' || device.isDemo) return
    setFailed(false)
    setLoaded(false)
    const timer = window.setInterval(() => setTick(Date.now()), 9000)
    return () => window.clearInterval(timer)
  }, [device.status, device.isDemo])

  const url = `/api/v1/devices/${device.id}/snapshot?t=${tick}`
  useEffect(() => { lastUrl.current = url }, [url])

  if (device.isDemo || failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-ink-900 via-ink-850 to-ink-800">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-iris-500/10 blur-2xl" />
        <div className="relative flex flex-col items-center text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-600">
            <Smartphone className="h-5 w-5" />
          </div>
          <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-600">
            {device.isDemo ? 'Demo data · no runtime' : 'No live preview'}
          </p>
        </div>
        {device.isDemo && (
          <span className="absolute right-3 top-3 rounded border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-amber-300">DEMO</span>
        )}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 bg-ink-900">
      {!loaded && <div className="absolute inset-0 shimmer" />}
      <img
        key={url}
        src={url}
        alt={`${device.name} live screen`}
        className={cn('h-full w-full object-cover object-top transition duration-500', loaded ? 'opacity-100' : 'opacity-0')}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent" />
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-black/50 px-2 py-0.5 text-[9px] font-medium text-emerald-300 backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
      </div>
    </div>
  )
}

export function PhoneCard({ device, busy, onStart, onStop, onRestart, onSettings, onDelete }: PhoneCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const running = device.status === 'running'
  const starting = device.status === 'starting'
  const actionBusy = Boolean(busy)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-850 transition duration-300 hover:border-white/[0.14] hover:shadow-2xl">
      <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-white/[0.07]">
        <LivePreview device={device} />
        <div className="absolute right-3 top-3 z-10">
          <StatusBadge status={device.status} isDemo={device.isDemo} />
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-3">
          <div className="flex items-center gap-1.5 text-[9px] text-zinc-400">
            <Wifi className="h-3 w-3 text-zinc-500" />
            {device.isDemo ? 'Illustrative' : device.status === 'running' ? 'WebSocket stream' : 'Runtime idle'}
          </div>
          {device.status === 'running' && !device.isDemo && (
            <span className="rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[9px] text-zinc-300 backdrop-blur">1080p · PNG</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-[15px] font-semibold text-white">{device.name}</h3>
              {device.isDemo && <Badge tone="amber" className="shrink-0">Demo</Badge>}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              Android {device.androidVersion} · {device.profileName} · {device.gms ? 'GMS' : 'AOSP'}
            </p>
          </div>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-4 top-[calc(50%+2.5rem)] z-30 w-44 animate-rise overflow-hidden rounded-xl border border-white/10 bg-ink-800 p-1 shadow-2xl">
              <button onClick={() => { setMenuOpen(false); onSettings(device) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white">
                <Settings2 className="h-3.5 w-3.5" /> Phone settings
              </button>
              <button onClick={() => { setMenuOpen(false); onRestart(device) }} disabled={actionBusy || device.isDemo} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40">
                <RotateCw className="h-3.5 w-3.5" /> Restart Android
              </button>
              <div className="my-1 h-px bg-white/[0.06]" />
              <button onClick={() => { setMenuOpen(false); onDelete(device) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-300 transition hover:bg-rose-500/10">
                <Trash2 className="h-3.5 w-3.5" /> Delete phone
              </button>
            </div>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
          <span>{formatGbFromMb(device.ramMb)} RAM</span>
          <span className="h-2.5 w-px bg-white/10" />
          <span>{device.vcpu} vCPU</span>
          <span className="h-2.5 w-px bg-white/10" />
          <span>{device.storageGb} GB</span>
          <span className="h-2.5 w-px bg-white/10" />
          <span>{device.resolution}</span>
        </div>

        {device.status === 'error' && device.errorMessage && (
          <p className="mt-3 line-clamp-2 rounded-lg border border-rose-400/15 bg-rose-500/[0.06] px-2.5 py-2 text-[10px] leading-relaxed text-rose-300/90">
            {device.errorMessage}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {running ? (
            <Link to={`/app/phones/${device.id}`} className="flex-1">
              <Button variant="primary" size="sm" className="w-full">
                <ExternalLink className="h-3.5 w-3.5" /> Open phone
              </Button>
            </Link>
          ) : starting ? (
            <Button variant="secondary" size="sm" className="flex-1" disabled>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting…
            </Button>
          ) : (
            <Button variant="primary" size="sm" className="flex-1" onClick={() => onStart(device)} loading={busy === 'start'} disabled={actionBusy}>
              <Play className="h-3.5 w-3.5" /> {device.isDemo ? 'Start demo' : 'Start phone'}
            </Button>
          )}
          {running && !device.isDemo && (
            <Button variant="secondary" size="icon" onClick={() => onStop(device)} loading={busy === 'stop'} disabled={actionBusy} title="Stop phone">
              <Power className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="secondary" size="icon" onClick={() => onSettings(device)} title="Phone settings">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-2.5 truncate text-[9px] text-zinc-600">
          Created {relativeTime(device.createdAt)}{device.lastStartedAt ? ` · last boot ${relativeTime(device.lastStartedAt)}` : ''}
        </p>
      </div>
    </div>
  )
}
