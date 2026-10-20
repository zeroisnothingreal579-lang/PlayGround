import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, BatteryCharging, ChevronLeft, ChevronRight, CircleDot, Clipboard, Expand, Home,
  Info, Keyboard, Loader2, Maximize2, Minimize2, MoreVertical, Power, RefreshCw, RotateCw,
  Smartphone, Square, TriangleAlert, Volume1, Volume2, Wifi, WifiOff, X, Zap,
} from 'lucide-react'
import type { Device, StreamTicket } from '@shared/contracts'
import { get, post } from '../lib/api'
import { useToast } from '../lib/toast'
import { Badge, Button, Card, Modal, StatusBadge, Textarea } from '../components/ui'
import { cn, formatGbFromMb, relativeTime } from '../lib/utils'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

interface DeviceResponse {
  device: Device
  runtime: { provider: string; live: boolean; transport: string }
}

export default function WorkspacePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const deviceQuery = useQuery<DeviceResponse>({
    queryKey: ['device', id],
    queryFn: () => get(`/devices/${id}`),
    refetchInterval: 2500,
    enabled: Boolean(id),
  })
  const device = deviceQuery.data?.device

  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const pendingMeta = useRef<{ width: number; height: number; ts: number; seq: number } | null>(null)
  const decoding = useRef(false)
  const intentionalClose = useRef(false)
  const frameTimes = useRef<number[]>([])
  const gesture = useRef<{ x: number; y: number; time: number } | null>(null)
  const wheelLock = useRef(0)
  const [connectState, setConnectState] = useState<ConnectionState>('idle')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [streamSize, setStreamSize] = useState({ width: 1080, height: 2400 })
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [latency, setLatency] = useState<number | null>(null)
  const [fps, setFps] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [textOpen, setTextOpen] = useState(false)
  const [textValue, setTextValue] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setStageSize({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const send = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
  }, [])

  const deviceRef = useRef(device)
  useEffect(() => { deviceRef.current = device }, [device])

  const connect = useCallback(async () => {
    const current = deviceRef.current
    if (!id || !current || current.isDemo || current.status !== 'running') return
    intentionalClose.current = true
    socketRef.current?.close()
    intentionalClose.current = false
    setConnectState('connecting')
    setConnectionError(null)
    try {
      const ticket = await post<StreamTicket>(`/devices/${id}/stream-ticket`)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${window.location.host}${ticket.wsPath}`)
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket

      socket.onopen = () => {
        setConnectState('connected')
        setConnectionError(null)
      }

      socket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          let message: any
          try { message = JSON.parse(event.data) } catch { return }
          if (message.type === 'ready') {
            setConnectState('connected')
          } else if (message.type === 'frame') {
            pendingMeta.current = message
          } else if (message.type === 'error') {
            setConnectionError(message.message || 'Streaming error')
            setConnectState('error')
          } else if (message.type === 'stats') {
            /* stats are measured client-side as well */
          }
          return
        }

        const meta = pendingMeta.current
        pendingMeta.current = null
        if (!meta || decoding.current) return
        decoding.current = true
        try {
          const blob = new Blob([event.data], { type: 'image/png' })
          const bitmap = await createImageBitmap(blob)
          const canvas = canvasRef.current
          if (canvas) {
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
              canvas.width = bitmap.width
              canvas.height = bitmap.height
              setStreamSize({ width: bitmap.width, height: bitmap.height })
            }
            const context = canvas.getContext('2d')
            context?.drawImage(bitmap, 0, 0)
          }
          bitmap.close()
          const now = Date.now()
          frameTimes.current.push(now)
          if (frameTimes.current.length > 60) frameTimes.current.shift()
          setLatency(Math.max(0, now - Number(meta.ts || now)))
        } catch {
          /* drop malformed frame */
        } finally {
          decoding.current = false
        }
      }

      socket.onclose = (event) => {
        if (intentionalClose.current) return
        setConnectState('closed')
        if (event.code !== 1000) {
          setConnectionError(event.reason || 'The stream closed. Reconnect to continue.')
        }
      }

      socket.onerror = () => {
        setConnectState('error')
        setConnectionError('WebSocket connection failed. The runtime may be restarting.')
      }
    } catch (error: any) {
      setConnectState('error')
      setConnectionError(error?.message || 'Could not authorize the stream.')
    }
  }, [id])

  useEffect(() => {
    if (device?.status === 'running' && !device.isDemo) {
      void connect()
    }
    return () => {
      intentionalClose.current = true
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [connect, device?.id, device?.status, device?.isDemo])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 2000
      frameTimes.current = frameTimes.current.filter((time) => time > cutoff)
      setFps(frameTimes.current.length / 2)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [])

  const keyDown = useCallback((event: KeyboardEvent) => {
    if (connectState !== 'connected') return
    const target = event.target as HTMLElement | null
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const map: Record<string, string> = {
      Enter: 'enter', Backspace: 'del', Tab: 'tab', ArrowUp: 'arrowup', ArrowDown: 'arrowdown',
      ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
    }
    if (map[event.key]) {
      event.preventDefault()
      send({ type: 'key', key: map[event.key] })
      return
    }
    if (event.key === 'Escape') {
      if (document.fullscreenElement) {
        void document.exitFullscreen()
      } else {
        send({ type: 'key', key: 'back' })
      }
      return
    }
    if (event.key.length === 1) {
      event.preventDefault()
      send({ type: 'text', text: event.key })
    }
  }, [connectState, send])

  useEffect(() => {
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [keyDown])

  const connected = connectState === 'connected'
  const displayWidth = streamSize.width && stageSize.width
    ? Math.min(stageSize.width, stageSize.height * (streamSize.width / streamSize.height))
    : 0
  const displayHeight = streamSize.height ? displayWidth * (streamSize.height / streamSize.width) : 0

  function pointerNorm(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!connected) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerNorm(event)
    gesture.current = { ...point, time: Date.now() }
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!connected || !gesture.current) return
    const point = pointerNorm(event)
    const start = gesture.current
    gesture.current = null
    const dx = point.x - start.x
    const dy = point.y - start.y
    const distance = Math.hypot(dx, dy)
    const duration = Date.now() - start.time
    if (distance < 0.014 && duration < 380) {
      send({ type: 'gesture', kind: 'tap', x1: start.x, y1: start.y })
    } else if (distance < 0.014 && duration >= 380) {
      send({ type: 'gesture', kind: 'longpress', x1: start.x, y1: start.y })
    } else {
      send({ type: 'gesture', kind: 'swipe', x1: start.x, y1: start.y, x2: point.x, y2: point.y, duration: Math.min(900, Math.max(150, duration)) })
    }
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    if (!connected) return
    const now = Date.now()
    if (now - wheelLock.current < 140) return
    wheelLock.current = now
    const direction = event.deltaY > 0 ? 1 : -1
    send({ type: 'gesture', kind: 'swipe', x1: 0.5, y1: 0.64, x2: 0.5, y2: 0.64 - direction * 0.32, duration: 220 })
  }

  async function startPhone() {
    if (!device) return
    setActionBusy('start')
    try {
      await post(`/devices/${device.id}/start`)
      await queryClient.invalidateQueries({ queryKey: ['device', device.id] })
      toast(device.isDemo ? 'Demo phone started (not a live device)' : 'Android boot requested', { kind: 'info' })
    } catch (error: any) {
      toast('Could not start phone', { kind: 'error', description: error?.message })
    } finally {
      setActionBusy(null)
    }
  }

  async function stopPhone() {
    if (!device) return
    setActionBusy('stop')
    try {
      await post(`/devices/${device.id}/stop`)
      intentionalClose.current = true
      socketRef.current?.close()
      await queryClient.invalidateQueries({ queryKey: ['device', device.id] })
      toast('Phone stopped', { kind: 'success', description: 'Persistent storage is retained.' })
    } catch (error: any) {
      toast('Could not stop phone', { kind: 'error', description: error?.message })
    } finally {
      setActionBusy(null)
    }
  }

  async function restartPhone() {
    if (!device) return
    setActionBusy('restart')
    try {
      await post(`/devices/${device.id}/restart`)
      setConnectState('connecting')
      await queryClient.invalidateQueries({ queryKey: ['device', device.id] })
      toast('Restart requested', { kind: 'info' })
    } catch (error: any) {
      toast('Could not restart phone', { kind: 'error', description: error?.message })
    } finally {
      setActionBusy(null)
    }
  }

  async function takeScreenshot() {
    if (!device) return
    try {
      const response = await fetch(`/api/v1/devices/${device.id}/screenshot`, { credentials: 'include' })
      if (!response.ok) throw new Error('Screenshot capture failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${device.name.replace(/[^\w-]+/g, '_')}-${Date.now()}.png`
      link.click()
      URL.revokeObjectURL(url)
      toast('Screenshot saved', { kind: 'success' })
    } catch (error: any) {
      toast('Screenshot failed', { kind: 'error', description: error?.message })
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) void stageRef.current?.requestFullscreen()
    else void document.exitFullscreen()
  }

  function sendText() {
    if (!textValue) return
    send({ type: 'text', text: textValue })
    setTextValue('')
    setTextOpen(false)
    toast('Text sent to Android', { kind: 'success' })
  }

  const quality = connected
    ? fps >= 2.2 && (latency === null || latency < 220) ? 'Excellent' : fps >= 1 ? 'Stable' : 'Slow'
    : connectState === 'connecting' ? 'Connecting' : 'Offline'
  const qualityTone = quality === 'Excellent' ? 'green' : quality === 'Stable' ? 'amber' : quality === 'Slow' ? 'rose' : 'default'

  if (deviceQuery.isLoading) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-ink-950">
        <Loader2 className="h-6 w-6 animate-spin text-iris-400" />
      </div>
    )
  }

  if (!device) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-ink-950 px-6">
        <div className="text-center">
          <TriangleAlert className="mx-auto h-8 w-8 text-amber-400" />
          <h1 className="mt-4 font-display text-xl font-semibold text-white">Phone not found</h1>
          <p className="mt-1 text-sm text-zinc-500">It may have been deleted or belongs to another account.</p>
          <Button variant="secondary" className="mt-5" onClick={() => navigate('/app')}><ArrowLeft className="h-4 w-4" /> Back to dashboard</Button>
        </div>
      </div>
    )
  }

  const showOverlay = !connected && !device.isDemo

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-ink-950">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-ink-900/70 px-3 backdrop-blur-xl sm:px-4">
        <Link to="/app" className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-sm font-semibold text-white">{device.name}</h1>
            {device.isDemo && <Badge tone="amber">Demo</Badge>}
            <StatusBadge status={device.status} isDemo={device.isDemo} className="hidden sm:inline-flex" />
          </div>
          <p className="hidden text-[10px] text-zinc-500 sm:block">Android {device.androidVersion} · {device.profileName} · {device.resolution}</p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className={cn('hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] sm:inline-flex', connected ? 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300' : 'border-white/10 bg-white/[0.03] text-zinc-500')}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {quality}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setInfoOpen(true)} title="Session details" className="xl:hidden">
            <Info className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} title="Fullscreen">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => connect()} title="Reconnect stream" disabled={device.status !== 'running' || device.isDemo}>
            <RefreshCw className={cn('h-4 w-4', connectState === 'connecting' && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="icon" title="More" className="hidden" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={stageRef}
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(30,30,45,.8),#06060a_70%)] p-3 sm:p-6"
          >
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />
            <canvas
              ref={canvasRef}
              width={1080}
              height={2400}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onWheel={onWheel}
              onContextMenu={(event) => event.preventDefault()}
              className={cn(
                'relative z-10 max-h-full max-w-full touch-none rounded-xl border border-white/10 bg-black shadow-[0_30px_100px_-20px_rgba(0,0,0,.9)]',
                connected ? 'opacity-100' : 'opacity-0',
              )}
              style={{ width: displayWidth || undefined, height: displayHeight || undefined, cursor: connected ? 'default' : 'not-allowed' }}
            />

            {showOverlay && (
              <div className="absolute inset-0 z-20 flex items-center justify-center p-5">
                {device.status === 'starting' ? (
                  <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-850/90 p-6 text-center shadow-2xl backdrop-blur-xl">
                    <div className="relative mx-auto grid h-16 w-16 place-items-center">
                      <span className="absolute inset-0 rounded-full border border-amber-400/30 animate-ping" />
                      <span className="grid h-12 w-12 place-items-center rounded-full border border-amber-400/25 bg-amber-400/10 text-amber-300"><Loader2 className="h-5 w-5 animate-spin" /></span>
                    </div>
                    <h2 className="mt-5 font-display text-lg font-semibold text-white">Booting Android {device.androidVersion}</h2>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
                      Waiting for <span className="mono">sys.boot_completed</span>. This can take a few minutes on first boot.
                    </p>
                    <div className="mt-5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-1 w-1/2 animate-shimmer rounded-full bg-gradient-to-r from-iris-500 to-electric-400" /></div>
                    <p className="mt-3 font-mono text-[10px] text-zinc-600">provider · {device.provider}</p>
                  </div>
                ) : device.isDemo ? (
                  <div className="w-full max-w-md rounded-2xl border border-amber-400/20 bg-ink-850/95 p-6 text-center shadow-2xl backdrop-blur-xl">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-300">
                      <Smartphone className="h-6 w-6" />
                    </div>
                    <Badge tone="amber" className="mt-4">Demo device · no Android runtime</Badge>
                    <h2 className="mt-3 font-display text-lg font-semibold text-white">This phone is demo data</h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                      {device.name} is not attached to an Android instance. CloudDroid will not show a fabricated screen.
                      Create or start a phone on the live runtime to stream a real device.
                    </p>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <Button variant="secondary" onClick={startPhone} loading={actionBusy === 'start'}>
                        {device.status === 'running' ? 'Demo running' : 'Toggle demo state'}
                      </Button>
                      <Button variant="primary" onClick={() => navigate('/app/create')}>Create live phone</Button>
                    </div>
                    <p className="mt-3 text-[10px] text-zinc-600">Runtime provider: {device.provider}</p>
                  </div>
                ) : device.status === 'error' ? (
                  <div className="w-full max-w-md rounded-2xl border border-rose-400/20 bg-ink-850/95 p-6 text-center shadow-2xl backdrop-blur-xl">
                    <TriangleAlert className="mx-auto h-8 w-8 text-rose-400" />
                    <h2 className="mt-3 font-display text-lg font-semibold text-white">Android failed to start</h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{device.errorMessage || 'The runtime reported an error.'}</p>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <Button variant="secondary" onClick={stopPhone} loading={actionBusy === 'stop'}>Reset state</Button>
                      <Button variant="primary" onClick={startPhone} loading={actionBusy === 'start'}>Try again</Button>
                    </div>
                  </div>
                ) : connectionError ? (
                  <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-850/95 p-6 text-center shadow-2xl backdrop-blur-xl">
                    <WifiOff className="mx-auto h-8 w-8 text-amber-400" />
                    <h2 className="mt-3 font-display text-lg font-semibold text-white">Stream disconnected</h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{connectionError}</p>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <Button variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ['device', device.id] })}>Refresh status</Button>
                      <Button variant="primary" onClick={() => connect()} disabled={device.status !== 'running'}>Reconnect</Button>
                    </div>
                  </div>
                ) : device.status === 'running' ? (
                  <div className="rounded-2xl border border-white/10 bg-ink-850/90 px-6 py-5 text-center backdrop-blur-xl">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-iris-400" />
                    <p className="mt-3 text-sm text-zinc-300">Authorizing secure stream…</p>
                    <p className="mt-1 text-[11px] text-zinc-600">One-time ticket · expires in 60 seconds</p>
                  </div>
                ) : (
                  <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-850/95 p-6 text-center shadow-2xl backdrop-blur-xl">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-400">
                      <Power className="h-6 w-6" />
                    </div>
                    <h2 className="mt-4 font-display text-lg font-semibold text-white">Phone is stopped</h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                      Start {device.name} to boot Android {device.androidVersion}. Installed apps, settings and files are retained.
                    </p>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <Button variant="secondary" onClick={() => navigate('/app')}>Back to dashboard</Button>
                      <Button variant="primary" onClick={startPhone} loading={actionBusy === 'start'}><Power className="h-4 w-4" /> Start phone</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {connected && (
              <div className="absolute right-4 top-4 z-20 hidden items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 backdrop-blur sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[10px] text-zinc-300">{Math.round(fps)} fps</span>
                <span className="text-zinc-700">·</span>
                <span className="font-mono text-[10px] text-zinc-300">{latency ?? '—'} ms</span>
                <span className="text-zinc-700">·</span>
                <span className="font-mono text-[10px] text-zinc-400">{streamSize.width}×{streamSize.height}</span>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-white/[0.07] bg-ink-900/80 px-3 py-2.5 backdrop-blur-xl sm:px-5" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-ink-850 p-1">
                <ToolButton label="Back" onClick={() => send({ type: 'key', key: 'back' })} disabled={!connected}><TriangleAlert className="h-4 w-4 rotate-180" /></ToolButton>
                <ToolButton label="Home" onClick={() => send({ type: 'key', key: 'home' })} disabled={!connected}><Home className="h-4 w-4" /></ToolButton>
                <ToolButton label="Recent apps" onClick={() => send({ type: 'key', key: 'recents' })} disabled={!connected}><Square className="h-3.5 w-3.5" /></ToolButton>
              </div>
              <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-ink-850 p-1">
                <ToolButton label="Volume down" onClick={() => send({ type: 'key', key: 'volumedown' })} disabled={!connected}><Volume1 className="h-4 w-4" /></ToolButton>
                <ToolButton label="Volume up" onClick={() => send({ type: 'key', key: 'volumeup' })} disabled={!connected}><Volume2 className="h-4 w-4" /></ToolButton>
                <ToolButton label="Rotate screen" onClick={() => send({ type: 'rotate' })} disabled={!connected}><RotateCw className="h-4 w-4" /></ToolButton>
              </div>
              <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-ink-850 p-1">
                <ToolButton label="Send text" onClick={() => setTextOpen(true)} disabled={!connected}><Keyboard className="h-4 w-4" /></ToolButton>
                <ToolButton label="Screenshot" onClick={takeScreenshot} disabled={!connected}><CircleDot className="h-4 w-4" /></ToolButton>
                <ToolButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}><Expand className="h-4 w-4" /></ToolButton>
              </div>
              <div className="hidden items-center gap-0.5 rounded-xl border border-white/10 bg-ink-850 p-1 sm:flex">
                {device.status === 'running' ? (
                  <ToolButton label="Stop phone" onClick={stopPhone} disabled={Boolean(actionBusy)} className="text-rose-300 hover:text-rose-200"><Power className="h-4 w-4" /></ToolButton>
                ) : (
                  <ToolButton label="Start phone" onClick={startPhone} disabled={Boolean(actionBusy)} className="text-emerald-300 hover:text-emerald-200"><Power className="h-4 w-4" /></ToolButton>
                )}
                <ToolButton label="Restart phone" onClick={restartPhone} disabled={Boolean(actionBusy) || device.isDemo}><RefreshCw className={cn('h-4 w-4', actionBusy === 'restart' && 'animate-spin')} /></ToolButton>
              </div>
            </div>
            <p className="mt-2 hidden text-center text-[9px] text-zinc-600 sm:block">
              Click to tap · Drag to swipe · Scroll wheel to scroll · Type to send keyboard input · Paste supported
            </p>
          </div>
        </div>

        <aside className="hidden w-[306px] shrink-0 overflow-y-auto border-l border-white/[0.07] bg-ink-900/50 p-4 xl:block">
          <SessionPanel
            device={device}
            connected={connected}
            fps={fps}
            latency={latency}
            quality={quality}
            qualityTone={qualityTone as any}
            connectState={connectState}
            onReconnect={() => connect()}
            onStop={stopPhone}
            onRestart={restartPhone}
            actionBusy={actionBusy}
          />
        </aside>
      </div>

      <Modal
        open={textOpen}
        onClose={() => setTextOpen(false)}
        title="Send text to Android"
        description="Text is injected as Android input events into the focused field. Unicode support depends on the device IME."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTextOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={sendText} disabled={!textValue}>Send text</Button>
          </>
        }
      >
        <Textarea rows={4} value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Type text to send…" autoFocus />
      </Modal>

      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Session details"
        description="Live connection and runtime information."
      >
        <SessionPanel
          device={device}
          connected={connected}
          fps={fps}
          latency={latency}
          quality={quality}
          qualityTone={qualityTone as any}
          connectState={connectState}
          onReconnect={() => connect()}
          onStop={stopPhone}
          onRestart={restartPhone}
          actionBusy={actionBusy}
          embedded
        />
      </Modal>
    </div>
  )
}

function ToolButton({ children, label, onClick, disabled, className }: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.07] hover:text-white disabled:pointer-events-none disabled:opacity-30',
        className,
      )}
    >
      {children}
    </button>
  )
}

function SessionPanel({ device, connected, fps, latency, quality, qualityTone, connectState, onReconnect, onStop, onRestart, actionBusy, embedded }: {
  device: Device
  connected: boolean
  fps: number
  latency: number | null
  quality: string
  qualityTone: 'green' | 'amber' | 'rose' | 'default'
  connectState: ConnectionState
  onReconnect: () => void
  onStop: () => void
  onRestart: () => void
  actionBusy: string | null
  embedded?: boolean
}) {
  const content = (
    <div className="space-y-3">
      <Card className={cn('p-4', embedded && 'bg-ink-900/60')}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-zinc-400">Connection</h3>
          <Badge tone={qualityTone}>{quality}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            ['Transport', 'WebSocket'],
            ['Frame codec', 'PNG'],
            ['Latency', latency === null ? '—' : `${latency} ms`],
            ['Frame rate', connected ? `${Math.round(fps)} fps` : '0 fps'],
            ['Resolution', `${device.isDemo ? device.resolution : 'Live frame'}`],
            ['Tickets', 'Single-use'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
              <p className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-300">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600')} />
            {connected ? 'Streaming live' : connectState === 'connecting' ? 'Authorizing…' : 'Not connected'}
          </span>
          <button onClick={onReconnect} className="text-[10px] text-iris-300 hover:text-iris-200">Reconnect</button>
        </div>
      </Card>

      <Card className={cn('p-4', embedded && 'bg-ink-900/60')}>
        <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-zinc-400">Device</h3>
        <div className="mt-3 space-y-2 text-[11px]">
          {[
            ['Name', device.name],
            ['Android', `${device.androidVersion} · API ${device.apiLevel}`],
            ['Profile', device.profileName],
            ['Memory', `${formatGbFromMb(device.ramMb)} · ${device.vcpu} vCPU`],
            ['Storage', `${device.storageGb} GB`],
            ['Google services', device.gms ? 'Google Play · GMS' : 'AOSP · no GMS'],
            ['Provider', device.isDemo ? 'demo (not live)' : device.provider],
            ['Created', relativeTime(device.createdAt)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="text-zinc-500">{label}</span>
              <span className={cn('truncate text-right', device.isDemo && label === 'Provider' ? 'text-amber-300' : 'text-zinc-300')}>{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] text-zinc-400"><Zap className="h-3 w-3 text-electric-300" /> Android input bridge</p>
          <p className="mt-1 text-[9px] leading-relaxed text-zinc-600">Touch, keys and text are validated then dispatched via adb to the live instance.</p>
        </div>
      </Card>

      <Card className={cn('p-4', embedded && 'bg-ink-900/60')}>
        <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-zinc-400">Power</h3>
        <div className="mt-3 space-y-2">
          <Button variant="secondary" className="w-full justify-start" size="sm" onClick={onRestart} disabled={Boolean(actionBusy) || !connected}>
            <RefreshCw className="h-3.5 w-3.5" /> Restart Android
          </Button>
          <Button variant="danger" className="w-full justify-start" size="sm" onClick={onStop} disabled={Boolean(actionBusy) || device.status !== 'running'}>
            <Power className="h-3.5 w-3.5" /> Stop phone
          </Button>
        </div>
        <p className="mt-2.5 text-[9px] leading-relaxed text-zinc-600">Stopping keeps the Android userdata volume. Deleting from the dashboard destroys it.</p>
      </Card>

      <div className="rounded-xl border border-amber-400/10 bg-amber-400/[0.025] p-3 text-[9px] leading-relaxed text-zinc-500">
        <p className="flex items-center gap-1.5 font-medium text-amber-200/70"><BatteryCharging className="h-3 w-3" /> Runtime note</p>
        <p className="mt-1">{device.gms
          ? 'This device runs the official Google Play system image. Open Play Store inside the phone to sign in and install apps.'
          : 'This device runs an AOSP image without Google Play Store or Play Services.'}</p>
      </div>
    </div>
  )
  if (embedded) return content
  return content
}
