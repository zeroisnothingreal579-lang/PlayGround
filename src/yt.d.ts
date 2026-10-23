declare namespace YT {
  interface Player {
    playVideo(): void
    pauseVideo(): void
    mute(): void
    unMute(): void
    isMuted(): boolean
    setVolume(volume: number): void
    getVolume(): number
    seekTo(seconds: number, allowSeekAhead: boolean): void
    getCurrentTime(): number
    getDuration(): number
    getPlayerState(): number
    destroy(): void
  }

  interface PlayerEvent {
    target: Player
    data: number
  }

  interface PlayerOptions {
    videoId: string
    host?: string
    playerVars?: Record<string, string | number>
    events?: {
      onReady?: (event: PlayerEvent) => void
      onStateChange?: (event: PlayerEvent) => void
      onError?: (event: PlayerEvent) => void
    }
  }

  const Player: new (element: HTMLElement | string, options: PlayerOptions) => Player
}

interface Window {
  YT?: typeof YT
  onYouTubeIframeAPIReady?: () => void
}
