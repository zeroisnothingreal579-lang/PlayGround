import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import SetupPanel from './components/SetupPanel'
import MetricCards from './components/MetricCards'
import PlayerGrid from './components/PlayerGrid'
import Sidebar from './components/Sidebar'
import type {
  ActivityEntry,
  ActivityTone,
  PlayerPhase,
  Session,
  ViewerState,
  VideoMeta,
} from './types'
import {
  PLAYER_STATE,
  fetchVideoMeta,
  fallbackMeta,
  parseYouTubeUrl,
  playerErrorMessage,
} from './lib/youtube'

const DEFAULT_VIDEO_ID = 'aqz-KE-bpKQ'
const DEFAULT_URL = `https://www.youtube.com/watch?v=${DEFAULT_VIDEO_ID}`
const DEFAULT_META: VideoMeta = {
  videoId: DEFAULT_VIDEO_ID,
  kind: 'video',
  title: 'Big Buck Bunny 60fps 4K — Official Blender Foundation Short Film',
  author: 'Blender',
  thumbnail: `https://i.ytimg.com/vi/${DEFAULT_VIDEO_ID}/maxresdefault.jpg`,
}

function createViewers(count: number): ViewerState[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    phase: 'loading' as PlayerPhase,
    ready: false,
    muted: true,
    started: false,
    currentTime: 0,
    duration: 0,
    watchTime: 0,
  }))
}

function createActivity(now: number, meta: VideoMeta, count: number): ActivityEntry[] {
  return [
    {
      id: `boot-1-${now}`,
      at: now,
      message: 'Player grid initialized',
      detail: `${count} independent iframe nodes attached`,
      tone: 'success',
    },
    {
      id: `boot-2-${now}`,
      at: now - 1000,
      message: 'Source locked',
      detail: meta.title,
      tone: 'neutral',
    },
    {
      id: `boot-3-${now}`,
      at: now - 2000,
      message: 'Awaiting playback command',
      detail: 'Players are muted by default',
      tone: 'info',
    },
  ]
}

function initialSession(): Session {
  const startedAt = Date.now()
  return {
    key: `session-${startedAt}`,
    videoId: DEFAULT_VIDEO_ID,
    count: 5,
    startedAt,
    meta: DEFAULT_META,
  }
}

export default function App() {
  const [session, setSession] = useState<Session>(initialSession)
  const [viewers, setViewers] = useState<ViewerState[]>(() => createViewers(5))
  const [draftUrl, setDraftUrl] = useState(DEFAULT_URL)
  const [draftCount, setDraftCount] = useState(5)
  const [inputError, setInputError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [activity, setActivity] = useState<ActivityEntry[]>(() =>
    createActivity(session.startedAt, session.meta, session.count),
  )
  const [signalHistory, setSignalHistory] = useState<number[]>(() => Array(28).fill(0))
  const [busy, setBusy] = useState(false)

  const playersRef = useRef<Map<number, YT.Player>>(new Map())
  const viewersRef = useRef(viewers)
  const playIntentRef = useRef(false)

  viewersRef.current = viewers

  const logActivity = useCallback(
    (message: string, detail: string, tone: ActivityTone = 'neutral') => {
      const at = Date.now()
      setActivity((previous) =>
        [
          {
            id: `event-${at}-${Math.random().toString(36).slice(2, 7)}`,
            at,
            message,
            detail,
            tone,
          },
          ...previous,
        ].slice(0, 14),
      )
    },
    [],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now()
      setNow(tick)
      setViewers((previous) =>
        previous.map((viewer) => {
          if (viewer.phase === 'error') return viewer
          const player = playersRef.current.get(viewer.id)
          if (!player) return viewer
          try {
            const playerState = player.getPlayerState()
            const mapped = PLAYER_STATE[playerState]
            const currentTime = player.getCurrentTime()
            const duration = player.getDuration() || viewer.duration
            const isPlaying = playerState === 1
            return {
              ...viewer,
              phase: mapped ?? viewer.phase,
              currentTime,
              duration,
              muted: player.isMuted(),
              started: viewer.started || currentTime > 0.25 || isPlaying,
              watchTime: viewer.watchTime + (isPlaying ? 1 : 0),
            }
          } catch {
            return viewer
          }
        }),
      )
    }, 1000)
    return () => window.clearInterval(timer)
  }, [session.key])

  const playingCount = viewers.filter((viewer) => viewer.phase === 'playing').length

  useEffect(() => {
    setSignalHistory((previous) => [...previous.slice(1), playingCount])
  }, [now, playingCount])

  const handlePlayerReady = useCallback(
    (id: number, player: YT.Player) => {
      playersRef.current.set(id, player)
      try {
        player.mute()
        player.setVolume(65)
      } catch {
        // The player can reject commands before the iframe is fully painted.
      }
      setViewers((previous) =>
        previous.map((viewer) =>
          viewer.id === id
            ? {
                ...viewer,
                ready: true,
                muted: true,
                phase: 'ready',
                duration: player.getDuration() || viewer.duration,
                error: undefined,
              }
            : viewer,
        ),
      )
      if (playIntentRef.current) {
        window.setTimeout(() => {
          try {
            player.playVideo()
          } catch {
            // Readiness is reported again by the player state callback.
          }
        }, 80)
      }
    },
    [],
  )

  const handlePlayerState = useCallback((id: number, playerState: number) => {
    const phase = PLAYER_STATE[playerState]
    if (!phase) return
    setViewers((previous) =>
      previous.map((viewer) =>
        viewer.id === id && viewer.phase !== 'error'
          ? {
              ...viewer,
              phase,
              started: viewer.started || phase === 'playing' || phase === 'ended',
            }
          : viewer,
      ),
    )
  }, [])

  const handlePlayerError = useCallback(
    (id: number, code: number, fallbackMessage?: string) => {
      const message = code === -1 ? fallbackMessage || 'Player unavailable' : playerErrorMessage(code)
      setViewers((previous) =>
        previous.map((viewer) =>
          viewer.id === id
            ? { ...viewer, phase: 'error', ready: false, error: message }
            : viewer,
        ),
      )
      logActivity(`Viewer ${String(id).padStart(2, '0')} unavailable`, message, 'warning')
    },
    [logActivity],
  )

  const launchSession = useCallback(() => {
    const parsed = parseYouTubeUrl(draftUrl)
    if (!parsed) {
      setInputError('Paste a valid YouTube watch, youtu.be, Shorts, live, or embed link.')
      return
    }

    setInputError(null)
    setBusy(true)
    const startedAt = Date.now()
    const key = `session-${startedAt}`
    const meta = fallbackMeta(parsed, draftUrl)
    const count = draftCount

    playersRef.current.clear()
    playIntentRef.current = false
    setSession({ key, videoId: parsed.videoId, count, startedAt, meta })
    setViewers(createViewers(count))
    setNow(startedAt)
    setSignalHistory(Array(28).fill(0))
    setActivity(createActivity(startedAt, meta, count))

    window.setTimeout(() => setBusy(false), 450)

    void fetchVideoMeta(parsed).then((resolved) => {
      setSession((current) => (current.key === key ? { ...current, meta: resolved } : current))
    })
  }, [draftCount, draftUrl])

  const toggleViewer = useCallback((id: number) => {
    const player = playersRef.current.get(id)
    const viewer = viewersRef.current.find((item) => item.id === id)
    if (!player || !viewer || viewer.phase === 'error') return
    try {
      if (viewer.phase === 'playing') {
        player.pauseVideo()
      } else {
        if (viewer.phase === 'ended') player.seekTo(0, true)
        player.playVideo()
      }
    } catch {
      // The next polling tick reconciles the card with the iframe.
    }
  }, [])

  const toggleViewerMute = useCallback((id: number) => {
    const player = playersRef.current.get(id)
    if (!player) return
    try {
      if (player.isMuted()) player.unMute()
      else player.mute()
    } catch {
      // Ignore transient iframe command failures.
    }
  }, [])

  const seekViewer = useCallback((id: number, seconds: number) => {
    const player = playersRef.current.get(id)
    if (!player) return
    try {
      player.seekTo(seconds, true)
      setViewers((previous) =>
        previous.map((viewer) =>
          viewer.id === id ? { ...viewer, currentTime: seconds, started: true } : viewer,
        ),
      )
    } catch {
      // Ignore transient iframe command failures.
    }
  }, [])

  const playAll = useCallback(() => {
    playIntentRef.current = true
    let count = 0
    playersRef.current.forEach((player) => {
      try {
        player.playVideo()
        count += 1
      } catch {
        // The player will join once its ready callback fires.
      }
    })
    logActivity('Play command broadcast', `${count} player windows received playVideo()`, 'success')
  }, [logActivity])

  const pauseAll = useCallback(() => {
    playIntentRef.current = false
    playersRef.current.forEach((player) => {
      try {
        player.pauseVideo()
      } catch {
        // Ignore transient iframe command failures.
      }
    })
    logActivity('Playback paused', 'All active windows paused together', 'neutral')
  }, [logActivity])

  const resumeAll = useCallback(() => {
    playIntentRef.current = true
    const entries = [...playersRef.current.entries()].sort(([a], [b]) => a - b)
    const leader = entries.find(([, player]) => {
      try {
        return player.getPlayerState() === 1
      } catch {
        return false
      }
    }) ?? entries[0]
    if (!leader) return
    let target = 0
    try {
      target = leader[1].getCurrentTime()
    } catch {
      return
    }
    entries.forEach(([, player]) => {
      try {
        if (target > 0.25) player.seekTo(target, true)
        player.playVideo()
      } catch {
        // Ignore transient iframe command failures.
      }
    })
    logActivity(
      'Playback resumed',
      `All windows re-aligned to viewer ${String(leader[0]).padStart(2, '0')} · ${target.toFixed(1)}s`,
      'success',
    )
  }, [logActivity])

  const syncAll = useCallback(() => {
    const entries = [...playersRef.current.entries()].sort(([a], [b]) => a - b)
    if (entries.length === 0) return
    const leader = entries.find(([, player]) => {
      try {
        return player.getPlayerState() === 1
      } catch {
        return false
      }
    }) ?? entries[0]
    let target = 0
    try {
      target = leader[1].getCurrentTime()
    } catch {
      return
    }
    entries.forEach(([, player]) => {
      try {
        player.seekTo(target, true)
      } catch {
        // Ignore transient iframe command failures.
      }
    })
    logActivity(
      'Progress re-synced',
      `Viewer ${String(leader[0]).padStart(2, '0')} set as timing reference · ${target.toFixed(1)}s`,
      'info',
    )
  }, [logActivity])

  const allMuted = viewers.length > 0 && viewers.every((viewer) => viewer.muted)
  const toggleMuteAll = useCallback(() => {
    if (allMuted) {
      playersRef.current.forEach((player) => {
        try {
          player.unMute()
        } catch {
          // Ignore transient iframe command failures.
        }
      })
      logActivity('Grid unmuted', 'Audio enabled on every available window', 'info')
    } else {
      playersRef.current.forEach((player) => {
        try {
          player.mute()
        } catch {
          // Ignore transient iframe command failures.
        }
      })
      logActivity('Grid muted', 'All player windows muted together', 'neutral')
    }
  }, [allMuted, logActivity])

  const onlineCount = viewers.filter((viewer) => viewer.ready && viewer.phase !== 'error').length
  const playingTimes = viewers
    .filter((viewer) => viewer.phase === 'playing' && Number.isFinite(viewer.currentTime))
    .map((viewer) => viewer.currentTime)
  const drift =
    playingTimes.length > 1 ? Math.max(...playingTimes) - Math.min(...playingTimes) : 0
  const syncScore =
    onlineCount === 0 ? 0 : Math.max(0, Math.round(100 - Math.min(80, drift * 18)))
  const elapsedSeconds = Math.max(0, Math.floor((now - session.startedAt) / 1000))
  const duration = Math.max(0, ...viewers.map((viewer) => viewer.duration))
  const mutedCount = viewers.filter((viewer) => viewer.muted).length
  const bufferingCount = viewers.filter((viewer) => viewer.phase === 'buffering').length
  const totalWatchTime = viewers.reduce((total, viewer) => total + viewer.watchTime, 0)

  const setupMatchesSession = useMemo(() => {
    const parsed = parseYouTubeUrl(draftUrl)
    return parsed?.videoId === session.videoId && draftCount === session.count
  }, [draftCount, draftUrl, session.count, session.videoId])

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06070a] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-app-atmosphere" />
      <div className="pointer-events-none fixed inset-0 bg-grid-fade opacity-60" />

      <Header
        elapsedSeconds={elapsedSeconds}
        onlineCount={onlineCount}
        playerCount={session.count}
        onNewSession={() => {
          document.getElementById('session-console')?.scrollIntoView({ behavior: 'smooth' })
          document.getElementById('youtube-url')?.focus()
        }}
      />

      <main className="relative z-10 mx-auto w-full max-w-[1600px] px-4 pb-14 pt-5 sm:px-6 lg:px-8">
        <SetupPanel
          draftUrl={draftUrl}
          onUrlChange={(value) => {
            setDraftUrl(value)
            if (inputError) setInputError(null)
          }}
          draftCount={draftCount}
          onCountChange={setDraftCount}
          onLaunch={launchSession}
          inputError={inputError}
          busy={busy}
          isRelaunch={setupMatchesSession}
          videoTitle={session.meta.title}
          onlineCount={onlineCount}
          playerCount={session.count}
        />

        <MetricCards
          playerCount={session.count}
          onlineCount={onlineCount}
          playingCount={playingCount}
          syncScore={syncScore}
          drift={drift}
          elapsedSeconds={elapsedSeconds}
          mutedCount={mutedCount}
          bufferingCount={bufferingCount}
          totalWatchTime={totalWatchTime}
        />

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
          <PlayerGrid
            key={session.key}
            session={session}
            viewers={viewers}
            playingCount={playingCount}
            allMuted={allMuted}
            onPlayAll={playAll}
            onPauseAll={pauseAll}
            onResumeAll={resumeAll}
            onSyncAll={syncAll}
            onToggleMuteAll={toggleMuteAll}
            onToggleViewer={toggleViewer}
            onToggleViewerMute={toggleViewerMute}
            onSeekViewer={seekViewer}
            onPlayerReady={handlePlayerReady}
            onPlayerState={handlePlayerState}
            onPlayerError={handlePlayerError}
          />

          <Sidebar
            session={session}
            duration={duration}
            elapsedSeconds={elapsedSeconds}
            onlineCount={onlineCount}
            playingCount={playingCount}
            mutedCount={mutedCount}
            bufferingCount={bufferingCount}
            syncScore={syncScore}
            drift={drift}
            activity={activity}
            signalHistory={signalHistory}
            now={now}
          />
        </div>

        <footer className="mt-10 flex flex-col gap-3 border-t border-white/[0.06] pt-5 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            ViewMatrix is an embed QA console for legitimate multi-player testing, watch
            parties, and shared screens.
          </p>
          <p className="font-mono tracking-wide text-slate-600">
            NO PROXY ROTATION · NO VIEW SIMULATION · YOUTUBE RULES APPLY
          </p>
        </footer>
      </main>
    </div>
  )
}
