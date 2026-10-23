import type { ParsedVideo, VideoMeta } from '../types'

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/

export function parseYouTubeUrl(raw: string): ParsedVideo | null {
  const input = raw.trim()
  if (!input) return null
  if (VIDEO_ID.test(input)) return { videoId: input, kind: 'video' }

  let url: URL
  try {
    url = new URL(input.match(/^[a-z]+:\/\//i) ? input : `https://${input}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '').toLowerCase()
  let videoId = ''

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? ''
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'watch') videoId = url.searchParams.get('v') ?? ''
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) videoId = parts[1] ?? ''
  }

  if (!VIDEO_ID.test(videoId)) return null
  return {
    videoId,
    kind: url.pathname.includes('/shorts/') ? 'short' : 'video',
  }
}

export function fallbackMeta(parsed: ParsedVideo, rawUrl: string): VideoMeta {
  return {
    videoId: parsed.videoId,
    kind: parsed.kind,
    title: parsed.kind === 'short' ? 'YouTube Short' : 'YouTube video',
    author: (() => {
      try {
        return new URL(rawUrl.match(/^[a-z]+:\/\//i) ? rawUrl : `https://${rawUrl}`).hostname.replace(/^www\./, '')
      } catch {
        return 'YouTube'
      }
    })(),
    thumbnail: `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`,
  }
}

export async function fetchVideoMeta(parsed: ParsedVideo): Promise<VideoMeta> {
  const canonical = `https://www.youtube.com/watch?v=${parsed.videoId}`
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`,
    )
    if (!response.ok) throw new Error('Metadata unavailable')
    const data = (await response.json()) as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }
    return {
      videoId: parsed.videoId,
      kind: parsed.kind,
      title: data.title || (parsed.kind === 'short' ? 'YouTube Short' : 'YouTube video'),
      author: data.author_name || 'YouTube',
      thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`,
    }
  } catch {
    return fallbackMeta(parsed, canonical)
  }
}

let apiPromise: Promise<typeof YT> | null = null

export function loadYouTubeApi(): Promise<typeof YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise<typeof YT>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('YouTube player API timed out')), 15000)
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      window.clearTimeout(timeout)
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube player API unavailable'))
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('Unable to load YouTube player API'))
      }
      document.head.appendChild(script)
    }
  }).catch((error) => {
    apiPromise = null
    throw error
  })

  return apiPromise
}

export const PLAYER_STATE: Record<number, 'ready' | 'playing' | 'paused' | 'buffering' | 'ended'> = {
  [-1]: 'ready',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'ready',
}

export function playerErrorMessage(code: number): string {
  if (code === 2) return 'Invalid video reference'
  if (code === 5) return 'HTML5 playback unavailable'
  if (code === 100) return 'Video not found or private'
  if (code === 101 || code === 150) return 'Embedding disabled by owner'
  return 'Player could not load'
}
