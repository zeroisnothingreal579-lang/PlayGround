export type PlayerPhase =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'ended'
  | 'error'

export interface ViewerState {
  id: number
  phase: PlayerPhase
  ready: boolean
  muted: boolean
  started: boolean
  currentTime: number
  duration: number
  watchTime: number
  error?: string
}

export interface VideoMeta {
  videoId: string
  title: string
  author: string
  thumbnail: string
  kind: 'video' | 'short'
}

export interface Session {
  key: string
  videoId: string
  count: number
  startedAt: number
  meta: VideoMeta
}

export type ActivityTone = 'neutral' | 'success' | 'info' | 'warning'

export interface ActivityEntry {
  id: string
  at: number
  message: string
  detail: string
  tone: ActivityTone
}

export interface ParsedVideo {
  videoId: string
  kind: 'video' | 'short'
}
