import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_VIEWPORT = { width: 1280, height: 720 }

const modifiersFor = event =>
  (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0)

export default function ServerPane({
  win,
  proxy,
  registerServerPane,
  onReady,
  onGuestNav,
  onInput,
  onError,
  onReload
}) {
  const wrapRef = useRef(null)
  const imgRef = useRef(null)
  const wsRef = useRef(null)
  const handlersRef = useRef({})
  const pendingRef = useRef(new Map())
  const moveRef = useRef({ at: 0, x: 0, y: 0 })
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState('connecting')
  const [message, setMessage] = useState('')
  const [hasFrame, setHasFrame] = useState(false)
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT)

  handlersRef.current = { onReady, onGuestNav, onInput, onError }

  const point = useCallback(event => {
    const element = wrapRef.current
    if (!element) return { x: 0, y: 0 }
    const rect = element.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * viewport.width
    const y = ((event.clientY - rect.top) / rect.height) * viewport.height
    return {
      x: Math.max(0, Math.min(viewport.width, Math.round(x))),
      y: Math.max(0, Math.min(viewport.height, Math.round(y)))
    }
  }, [viewport])

  const emit = useCallback(event => {
    handlersRef.current.onInput?.(win.id, event)
  }, [win.id])

  const send = useCallback(payload => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(payload))
    return true
  }, [])

  useEffect(() => {
    let closed = false
    const secure = window.location.protocol === 'https:'
    const token = new URLSearchParams(window.location.search).get('token')
    const endpoint = `${secure ? 'wss' : 'ws'}://${window.location.host}/live${token ? `?token=${encodeURIComponent(token)}` : ''}`
    const ws = new WebSocket(endpoint)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      if (closed) return
      setConnected(true)
      setStatus('starting')
    }

    ws.onmessage = raw => {
      let data
      try {
        data = JSON.parse(raw.data)
      } catch {
        return
      }
      if (data.type === 'hello') {
        if (data.viewport) setViewport(data.viewport)
        return
      }
      if (data.paneId && data.paneId !== win.id) return

      if (data.type === 'state') {
        if (data.viewport) setViewport(data.viewport)
        if (data.state === 'live') {
          setStatus('live')
          setMessage('')
          handlersRef.current.onReady?.(win.id)
        } else if (data.state === 'error') {
          setStatus('error')
          setMessage(data.message || 'Live pane failed')
          handlersRef.current.onError?.(win.id, data.message || 'Live pane failed')
        } else {
          setStatus(data.state || 'starting')
          if (data.message) setMessage(data.message)
        }
        return
      }

      if (data.type === 'frame') {
        const image = imgRef.current
        if (!image) return
        image.src = `data:image/jpeg;base64,${data.data}`
        if (!hasFrame) setHasFrame(true)
        return
      }

      if (data.type === 'nav' && data.url) {
        handlersRef.current.onGuestNav?.(win.id, data.url)
        return
      }

      if (data.type === 'verify' && data.requestId) {
        const pending = pendingRef.current.get(data.requestId)
        if (!pending) return
        pendingRef.current.delete(data.requestId)
        pending.resolve(data)
      }
    }

    ws.onerror = () => {
      if (closed) return
      setStatus('error')
      setMessage('Live backend is unreachable')
    }

    ws.onclose = () => {
      if (closed) return
      setConnected(false)
      setStatus(previous => (previous === 'error' ? previous : 'closed'))
    }

    return () => {
      closed = true
      wsRef.current = null
      setConnected(false)
      try { ws.close() } catch {}
      for (const pending of pendingRef.current.values()) {
        pending.reject(new Error('Live pane closed'))
      }
      pendingRef.current.clear()
    }
  }, [win.id])

  useEffect(() => {
    if (!connected || !send({ type: 'start', paneId: win.id, url: win.url, proxy, sessionSeq: win.proxy.sessionSeq || 0, frameKey: win.frameKey })) return
    setStatus(current => (current === 'live' ? current : 'starting'))
  }, [connected, send, win.id, win.url, win.proxy.sessionSeq, win.frameKey, proxy])

  const verify = useCallback(() => new Promise((resolve, reject) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Live pane is not connected'))
      return
    }
    const requestId = `${win.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const timer = setTimeout(() => {
      pendingRef.current.delete(requestId)
      reject(new Error('IP check timed out'))
    }, 35000)
    pendingRef.current.set(requestId, {
      resolve: result => {
        clearTimeout(timer)
        resolve(result)
      },
      reject: error => {
        clearTimeout(timer)
        reject(error)
      }
    })
    ws.send(JSON.stringify({ type: 'verify', paneId: win.id, requestId }))
  }), [win.id])

  useEffect(() => {
    if (!registerServerPane) return undefined
    registerServerPane(win.id, {
      sendInput: event => send({ type: 'input', paneId: win.id, event }),
      verify
    })
    return () => registerServerPane(win.id, null)
  }, [registerServerPane, send, verify, win.id])

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return undefined
    function onWheel(event) {
      event.preventDefault()
      const { x, y } = point(event)
      emit({ kind: 'wheel', x, y, deltaX: event.deltaX, deltaY: event.deltaY })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [emit, point])

  return (
    <div
      ref={wrapRef}
      className={`server-pane status-${status}`}
      tabIndex={0}
      role="application"
      aria-label={`${win.name} live pane`}
      onMouseDown={event => {
        if (event.button !== 0) return
        event.preventDefault()
        wrapRef.current?.focus()
        const { x, y } = point(event)
        emit({ kind: 'mouse', action: 'down', x, y })
      }}
      onMouseUp={event => {
        if (event.button !== 0) return
        event.preventDefault()
        const { x, y } = point(event)
        emit({ kind: 'mouse', action: 'up', x, y })
      }}
      onMouseMove={event => {
        const now = performance.now()
        if (now - moveRef.current.at < 55) return
        moveRef.current.at = now
        const { x, y } = point(event)
        emit({ kind: 'mouse', action: 'move', x, y })
      }}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        const key = event.key
        if (key === 'F5' || ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'r')) {
          event.preventDefault()
          handlersRef.current.onReload?.()
          return
        }
        event.preventDefault()
        const printable = key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
        emit({
          kind: 'key',
          action: 'down',
          key,
          code: event.code,
          modifiers: modifiersFor(event),
          text: printable ? key : undefined
        })
      }}
      onKeyUp={event => {
        event.preventDefault()
        emit({
          kind: 'key',
          action: 'up',
          key: event.key,
          code: event.code,
          modifiers: modifiersFor(event)
        })
      }}
    >
      <img ref={imgRef} alt="" draggable={false} onLoad={() => setHasFrame(true)} />
      {(!hasFrame || status === 'connecting' || status === 'starting') && (
        <div className="server-overlay">
          {status === 'error' ? (
            <div className="server-error">
              <strong>Live pane failed</strong>
              <span>{message || 'The streaming browser could not load this page.'}</span>
            </div>
          ) : (
            <div className="server-wait">
              <span className="spinner" />
              <span className="loading-copy">
                <strong>{connected ? 'Starting live browser' : 'Reaching live backend'}</strong>
                <small>1280 × 720 · server-side Chromium</small>
              </span>
            </div>
          )}
        </div>
      )}
      {status === 'error' && hasFrame && (
        <div className="server-error-bar">{message || 'Live pane failed'}</div>
      )}
      {status === 'live' && (
        <span className="server-live-pin"><span className="live-pin" />LIVE</span>
      )}
    </div>
  )
}
