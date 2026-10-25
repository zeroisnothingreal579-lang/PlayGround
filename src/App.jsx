import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ServerPane from './ServerPane.jsx'

const PAGE_LABELS = {
  home: 'Home',
  explore: 'Explore',
  deals: 'Deals',
  profile: 'Profile'
}

const REGIONS = {
  'us-east': { label: 'US East', city: 'Ashburn, VA', asn: 'AS14618', latency: 17 },
  'us-west': { label: 'US West', city: 'San Jose, CA', asn: 'AS13335', latency: 41 },
  'us-central': { label: 'US Central', city: 'Dallas, TX', asn: 'AS16509', latency: 28 },
  'us-south': { label: 'US South', city: 'Miami, FL', asn: 'AS15169', latency: 34 }
}

const IP_POOLS = {
  'us-east': ['34.212.84.17', '34.212.84.92', '34.212.85.6', '34.212.85.148', '3.214.19.77', '3.214.19.203', '18.209.44.12', '18.209.44.88'],
  'us-west': ['52.8.211.94', '52.8.212.11', '54.193.17.203', '54.193.18.40', '13.52.88.19', '13.52.88.144', '35.165.71.23', '35.165.71.190'],
  'us-central': ['3.130.44.18', '3.130.44.109', '18.222.90.33', '18.222.90.201', '52.14.112.7', '52.14.112.176', '34.227.61.59', '34.227.61.122'],
  'us-south': ['44.201.19.132', '44.201.19.208', '3.211.7.44', '3.211.7.190', '54.87.126.11', '54.87.126.87', '18.234.34.70', '18.234.34.155']
}

const demoUrl = (page, id) => `demo/northwind.html?page=${encodeURIComponent(page)}&win=${encodeURIComponent(id)}`
const demoDisplay = page => `northwind.demo/${page}`

const bridge = typeof window !== 'undefined' ? window.stackview : null
const partitionFor = id => `persist:${id}`

const hostAllowed = (rawUrl, hosts = []) => {
  if (!hosts.length) return true
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true
    const host = url.hostname.toLowerCase()
    return hosts.some(allowed => host === allowed.toLowerCase() || host.endsWith(`.${allowed.toLowerCase()}`))
  } catch {
    return false
  }
}

const proxyFor = (region, ip) => ({
  region,
  ip,
  ...REGIONS[region],
  verified: true,
  lastCheck: 'just now',
  sessionSeq: 0
})

const readStoredGateway = () => {
  try {
    return window.localStorage.getItem('stackview-gateway') || bridge?.proxyTemplate || ''
  } catch {
    return bridge?.proxyTemplate || ''
  }
}

const initialWindows = () => {
  const start = bridge?.startUrl
  if (!start) return INITIAL_WINDOWS
  return INITIAL_WINDOWS.map(win => ({
    ...win,
    mode: 'external',
    page: null,
    url: start,
    frameSrc: start,
    proxy: { ...win.proxy, ip: 'unverified', verified: false, lastCheck: 'not checked' }
  }))
}

const INITIAL_WINDOWS = [
  {
    id: 'w1',
    name: 'Main window',
    mode: 'demo',
    page: 'home',
    url: demoDisplay('home'),
    frameSrc: demoUrl('home', 'w1'),
    frameKey: 0,
    sync: true,
    proxy: proxyFor('us-east', '34.212.84.17')
  },
  {
    id: 'w2',
    name: 'Window 2',
    mode: 'demo',
    page: 'home',
    url: demoDisplay('home'),
    frameSrc: demoUrl('home', 'w2'),
    frameKey: 0,
    sync: true,
    proxy: proxyFor('us-west', '52.8.211.94')
  },
  {
    id: 'w3',
    name: 'Window 3',
    mode: 'demo',
    page: 'home',
    url: demoDisplay('home'),
    frameSrc: demoUrl('home', 'w3'),
    frameKey: 0,
    sync: true,
    proxy: proxyFor('us-south', '44.201.19.132')
  }
]

const INITIAL_EVENTS = [
  { id: 'seed-1', time: 'now', text: 'Main window loaded · northwind/home', detail: '2 windows attached', tone: 'nav' },
  { id: 'seed-2', time: '4s', text: 'Scroll mirrored to 2 windows', detail: 'position 46%', tone: 'scroll' },
  { id: 'seed-3', time: '9s', text: 'Typing mirrored · search field', detail: '"trail pack"', tone: 'input' },
  { id: 'seed-4', time: '14s', text: 'US session pool verified', detail: '3 unique addresses', tone: 'proxy' }
]

function Icon({ name, size = 16, strokeWidth = 1.8 }) {
  const paths = {
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
    play: <path d="m9 7 8 5-8 5V7Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.7 3 8.5 7 10 4-1.5 7-5.3 7-10V6l-7-3Z" /><path d="m9.5 12 1.8 1.8 3.5-3.8" /></>,
    radio: <><circle cx="12" cy="12" r="2.5" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15" /></>,
    activity: <path d="M3 12h4l2.5-6 4.5 12 2.5-6h4" />,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 6" /><path d="M20 4v7h-7" /></>,
    maximize: <><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></>,
    minimize: <><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></>,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    signal: <><path d="M5 18v-3M10 18v-6M15 18v-9M20 18V5" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    up: <><path d="M7 17 17 7M9 7h8v8" /></>,
    sparkles: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" /><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" /><path d="m5 13 .7 1.8L7.5 15l-1.8.7L5 17.5l-.7-1.8L2.5 15l1.8-.2L5 13Z" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    check: <path d="m5 12 4.2 4.2L19 6" />,
    trash: <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    crown: <path d="m4 8 4 3 4-6 4 6 4-3-2 10H6L4 8Z" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3M18 5l3 3" /></>,
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.globe}
    </svg>
  )
}

function normalizeTarget(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  const lowered = value.toLowerCase()
  if (lowered.startsWith('demo:')) {
    const page = lowered.slice(5)
    return PAGE_LABELS[page] ? { mode: 'demo', page } : null
  }
  if (lowered.includes('northwind.demo')) {
    const page = lowered.split('/').filter(Boolean).pop()
    return PAGE_LABELS[page] ? { mode: 'demo', page } : { mode: 'demo', page: 'home' }
  }
  if (lowered.includes('/demo/northwind.html')) {
    const page = new URL(value, 'https://local.invalid').searchParams.get('page') || 'home'
    return PAGE_LABELS[page] ? { mode: 'demo', page } : { mode: 'demo', page: 'home' }
  }
  if (PAGE_LABELS[lowered]) return { mode: 'demo', page: lowered }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if (!/^https?:$/.test(url.protocol)) return null
    return { mode: 'external', url: url.href }
  } catch {
    return null
  }
}

function applyTarget(win, target) {
  if (target.mode === 'demo') {
    if (win.mode === 'demo') return { ...win, page: target.page, url: demoDisplay(target.page) }
    return {
      ...win,
      mode: 'demo',
      page: target.page,
      url: demoDisplay(target.page),
      frameSrc: demoUrl(target.page, win.id),
      frameKey: win.frameKey + 1
    }
  }
  return {
    ...win,
    mode: 'external',
    page: null,
    url: target.url,
    frameSrc: target.url,
    frameKey: win.frameKey + 1
  }
}

function allocateIp(region, windows, exceptId) {
  const used = new Set(
    windows.filter(win => win.id !== exceptId).map(win => win.proxy.ip)
  )
  return IP_POOLS[region].find(ip => !used.has(ip)) || IP_POOLS[region][0]
}

export default function App() {
  const [windows, setWindows] = useState(initialWindows)
  const [masterSync, setMasterSync] = useState(true)
  const [urlDraft, setUrlDraft] = useState('')
  const [events, setEvents] = useState(INITIAL_EVENTS)
  const [ready, setReady] = useState({})
  const [toast, setToast] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [verifying, setVerifying] = useState({})
  const [gateway, setGateway] = useState(() => readStoredGateway())
  const [proxyTemplate, setProxyTemplate] = useState(() => readStoredGateway())
  const [liveServer, setLiveServer] = useState(false)

  const windowsRef = useRef(windows)
  const masterRef = useRef(masterSync)
  const nextIdRef = useRef(4)
  const eventIdRef = useRef(1)
  const scrollLogRef = useRef(0)
  const inputLogRef = useRef(0)
  const toastTimerRef = useRef(null)
  const paneRefs = useRef({})
  const serverPaneApis = useRef({})

  useEffect(() => { windowsRef.current = windows }, [windows])
  useEffect(() => { masterRef.current = masterSync }, [masterSync])
  useEffect(() => () => clearTimeout(toastTimerRef.current), [])

  const main = windows[0]
  const uniqueIps = useMemo(() => new Set(windows.map(win => win.proxy.ip)).size, [windows])
  const syncedCount = windows.filter(win => win.sync).length
  const allUnique = uniqueIps === windows.length
  const allVerified = windows.every(win => win.proxy.verified)

  const proxyForWindow = useCallback((win, index) => {
    const list = bridge?.proxyList || []
    if (!list.length) return proxyTemplate
    const slot = (index + (win.proxy.sessionSeq || 0)) % list.length
    return list[slot]
  }, [proxyTemplate])

  const notify = useCallback((message, tone = 'ok') => {
    clearTimeout(toastTimerRef.current)
    setToast({ message, tone, id: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), 3400)
  }, [])

  const pushEvent = useCallback((text, tone = 'sync', detail = '') => {
    const event = {
      id: `event-${eventIdRef.current++}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      text,
      detail,
      tone
    }
    setEvents(prev => [event, ...prev].slice(0, 7))
  }, [])

  const sendToFrame = useCallback((id, action) => {
    const frame = document.getElementById(`frame-${id}`)
    frame?.contentWindow?.postMessage({ source: 'stackview-host', target: id, action }, '*')
  }, [])

  const broadcast = useCallback((action, sourceId) => {
    const targets = windowsRef.current.filter(win => win.id !== sourceId && win.sync)
    targets.forEach(win => sendToFrame(win.id, action))
    return targets.length
  }, [sendToFrame])

  const markReady = useCallback(id => {
    setReady(prev => (prev[id] ? prev : { ...prev, [id]: true }))
  }, [])

  const onBlockedNav = useCallback((id, url) => {
    const win = windowsRef.current.find(item => item.id === id)
    pushEvent(`${win?.name || 'Pane'} · navigation blocked`, 'nav', `${url} is not in STACKVIEW_ALLOWED_HOSTS`)
    notify(`Blocked ${url} — add its host to STACKVIEW_ALLOWED_HOSTS to allow it.`, 'warn')
  }, [notify, pushEvent])

  const onPaneError = useCallback((id, message) => {
    const win = windowsRef.current.find(item => item.id === id)
    notify(`${win?.name || 'Pane'}: ${message}`, 'warn')
  }, [notify])

  const registerPane = useCallback((id, element) => {
    if (element) paneRefs.current[id] = element
    else delete paneRefs.current[id]
  }, [])

  const registerServerPane = useCallback((id, api) => {
    if (api) serverPaneApis.current[id] = api
    else delete serverPaneApis.current[id]
  }, [])

  const onServerInput = useCallback((id, payload) => {
    if (!payload) return
    const current = windowsRef.current
    const source = current.find(win => win.id === id)
    if (!source) return

    serverPaneApis.current[id]?.sendInput(payload)

    const isMain = current[0]?.id === id
    const canDrive = isMain && masterRef.current
    const targets = canDrive
      ? current.filter(win => win.id !== id && win.sync && win.mode === 'external')
      : []
    targets.forEach(target => serverPaneApis.current[target.id]?.sendInput(payload))

    const applied = targets.length
    if (!canDrive) return
    if (payload.kind === 'mouse' && payload.action === 'up' && Date.now() - scrollLogRef.current > 900) {
      scrollLogRef.current = Date.now()
      pushEvent(`Main → ${applied} ${applied === 1 ? 'window' : 'windows'} · click mirrored`, 'click', 'pointer event')
    } else if (payload.kind === 'key' && payload.action === 'down' && payload.text && Date.now() - inputLogRef.current > 850) {
      inputLogRef.current = Date.now()
      pushEvent(`Main → ${applied} ${applied === 1 ? 'window' : 'windows'} · typing mirrored`, 'input', `"${String(payload.text).slice(0, 24)}"`)
    } else if (payload.kind === 'wheel' && Date.now() - scrollLogRef.current > 1200) {
      scrollLogRef.current = Date.now()
      pushEvent(`Main → ${applied} ${applied === 1 ? 'window' : 'windows'} · scroll mirrored`, 'scroll', 'wheel event')
    }
  }, [pushEvent])

  const onGuestEvent = useCallback((id, payload) => {
    if (!payload) return
    const current = windowsRef.current
    const source = current.find(win => win.id === id)
    if (!source) return
    const isMain = current[0]?.id === id
    if (!isMain || !masterRef.current) return

    const targets = current.filter(win => win.id !== id && win.sync && win.mode === 'external')
    let applied = 0

    targets.forEach(target => {
      const element = paneRefs.current[target.id]
      if (!element) return
      applied += 1

      if (payload.type === 'scroll') {
        const ratio = Math.max(0, Math.min(1, Number(payload.ratio) || 0))
        element.executeJavaScript(`(function(){const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);window.scrollTo(0,${ratio}*max)})()`).catch(() => {})
      } else if (payload.type === 'click') {
        try {
          element.focus()
          element.sendInputEvent({ type: 'mouseDown', x: payload.x, y: payload.y, button: 'left', clickCount: 1 })
          element.sendInputEvent({ type: 'mouseUp', x: payload.x, y: payload.y, button: 'left', clickCount: 1 })
        } catch {}
      } else if (payload.type === 'input' && payload.selector) {
        const selector = JSON.stringify(payload.selector)
        const value = JSON.stringify(payload.value)
        const assign = payload.editable ? `node.textContent=${value};` : `node.value=${value};`
        element.executeJavaScript(`(function(){const node=document.querySelector(${selector});if(!node)return;${assign}node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}))})()`).catch(() => {})
      }
    })

    if (!applied) return
    if (payload.type === 'scroll' && Date.now() - scrollLogRef.current > 1200) {
      scrollLogRef.current = Date.now()
      pushEvent(`Main → ${applied} ${applied === 1 ? 'window' : 'windows'} · scroll mirrored`, 'scroll', `position ${Math.round((Number(payload.ratio) || 0) * 100)}%`)
    } else if (payload.type === 'click') {
      pushEvent(`Main → ${applied} ${applied === 1 ? 'window' : 'windows'} · click mirrored`, 'click', 'pointer event')
    } else if (payload.type === 'input' && Date.now() - inputLogRef.current > 850) {
      inputLogRef.current = Date.now()
      pushEvent(`Main → ${applied} ${applied === 1 ? 'window' : 'windows'} · typing mirrored`, 'input', `"${String(payload.value).slice(0, 24)}"`)
    }
  }, [pushEvent])

  const onGuestNav = useCallback((id, url) => {
    if (!url || !/^https?:/i.test(url)) return
    const current = windowsRef.current
    const source = current.find(win => win.id === id)
    if (!source) return
    const isMain = current[0]?.id === id
    const targets = isMain && masterRef.current
      ? current.filter(win => win.id !== id && win.sync)
      : []

    setWindows(prev => prev.map(win => {
      if (win.id === id) {
        if (win.url === url && win.mode === 'external') return win
        return { ...win, mode: 'external', page: null, url, frameSrc: url }
      }
      if (!targets.some(target => target.id === win.id)) return win
      if (win.url === url) return win
      return { ...win, mode: 'external', page: null, url, frameSrc: url, frameKey: win.frameKey + 1 }
    }))

    if (isMain && targets.length) {
      pushEvent(`Main → ${targets.length} ${targets.length === 1 ? 'window' : 'windows'} · navigated`, 'nav', url)
    }
  }, [pushEvent])

  useEffect(() => {
    function onMessage(event) {
      const data = event.data
      if (!data || data.source !== 'stackview-demo') return
      const current = windowsRef.current
      const source = current.find(win => win.id === data.winId)
      if (!source) return
      const isMain = current[0]?.id === source.id
      const canDrive = isMain && masterRef.current

      if (data.type === 'ready') {
        markReady(source.id)
        return
      }

      if (data.type === 'navigate' && PAGE_LABELS[data.page]) {
        const targets = canDrive ? current.filter(win => win.id !== source.id && win.sync) : []
        setWindows(prev => prev.map(win => {
          if (win.id === source.id) return { ...win, mode: 'demo', page: data.page, url: demoDisplay(data.page) }
          if (!targets.some(target => target.id === win.id)) return win
          if (win.mode === 'demo') return { ...win, page: data.page, url: demoDisplay(data.page) }
          return {
            ...win,
            mode: 'demo',
            page: data.page,
            url: demoDisplay(data.page),
            frameSrc: demoUrl(data.page, win.id),
            frameKey: win.frameKey + 1
          }
        }))
        if (canDrive) {
          targets.forEach(win => {
            if (win.mode === 'demo') sendToFrame(win.id, { type: 'navigate', page: data.page })
          })
          pushEvent(
            `Main → ${targets.length} ${targets.length === 1 ? 'window' : 'windows'} · navigated to ${PAGE_LABELS[data.page]}`,
            'nav',
            'navigation mirror'
          )
        } else {
          pushEvent(`${source.name} · opened ${PAGE_LABELS[data.page]} independently`, 'nav', 'independent mode')
        }
        return
      }

      if (data.type === 'input') {
        const count = canDrive ? broadcast({ type: 'input', selector: data.selector, value: data.value }, source.id) : 0
        if (canDrive && Date.now() - inputLogRef.current > 850) {
          inputLogRef.current = Date.now()
          pushEvent(`Main → ${count} ${count === 1 ? 'window' : 'windows'} · typing mirrored`, 'input', `"${String(data.value).slice(0, 24)}"`)
        }
        return
      }

      if (data.type === 'click') {
        const count = canDrive ? broadcast({ type: 'click', selector: data.selector }, source.id) : 0
        if (canDrive) pushEvent(`Main → ${count} ${count === 1 ? 'window' : 'windows'} · click mirrored`, 'click', 'pointer event')
        return
      }

      if (data.type === 'scroll') {
        const ratio = Number(data.ratio) || 0
        const count = canDrive ? broadcast({ type: 'scroll', ratio }, source.id) : 0
        if (canDrive && Date.now() - scrollLogRef.current > 1300) {
          scrollLogRef.current = Date.now()
          pushEvent(
            `Main → ${count} ${count === 1 ? 'window' : 'windows'} · scroll mirrored`,
            'scroll',
            `position ${Math.round(ratio * 100)}%`
          )
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [broadcast, markReady, pushEvent, sendToFrame])

  const navigateWindow = useCallback((id, raw, sourceLabel) => {
    const target = normalizeTarget(raw)
    if (!target) {
      notify('Enter a valid http(s) link, or a demo route like demo:explore.', 'warn')
      return false
    }
    const current = windowsRef.current
    const source = current.find(win => win.id === id)
    if (!source) return false
    const isMain = current[0]?.id === id
    const targets = isMain && masterRef.current ? current.filter(win => win.id !== id && win.sync) : []

    setWindows(prev => prev.map(win => {
      if (win.id === id) return applyTarget(win, target)
      if (!targets.some(item => item.id === win.id)) return win
      return applyTarget(win, target)
    }))

    if (isMain && masterRef.current) {
      if (target.mode === 'demo') {
        targets.forEach(win => {
          if (win.mode === 'demo') sendToFrame(win.id, { type: 'navigate', page: target.page })
        })
      }
      pushEvent(
        `Main → ${targets.length} ${targets.length === 1 ? 'window' : 'windows'} · ${target.mode === 'demo' ? `opened ${PAGE_LABELS[target.page]}` : 'URL mirrored'}`,
        'nav',
        target.mode === 'demo' ? 'navigation mirror' : target.url
      )
      notify(targets.length ? `Link opened in main and mirrored to ${targets.length} window${targets.length === 1 ? '' : 's'}.` : 'Link opened in main window.', 'ok')
    } else {
      pushEvent(`${sourceLabel || source.name} · navigation updated`, 'nav', 'independent mode')
      notify('Window navigation updated.', 'ok')
    }
    return true
  }, [notify, pushEvent, sendToFrame])

  function submitMain(event) {
    event.preventDefault()
    const value = urlDraft.trim() || (main.mode === 'demo' ? `demo:${main.page}` : main.url)
    if (navigateWindow(main.id, value, 'Main window')) setUrlDraft('')
  }

  function addWindow() {
    const current = windowsRef.current
    const host = current[0]
    const id = `w${nextIdRef.current++}`
    const region = Object.keys(REGIONS)[(current.length + 1) % Object.keys(REGIONS).length]
    const ip = allocateIp(region, current)
    const next = {
      id,
      name: `Window ${current.length + 1}`,
      mode: host.mode,
      page: host.page,
      url: host.mode === 'demo' ? demoDisplay(host.page) : host.url,
      frameSrc: host.mode === 'demo' ? demoUrl(host.page, id) : host.url,
      frameKey: 0,
      sync: true,
      proxy: proxyFor(region, ip)
    }
    setWindows([...current, next])
    pushEvent(`Window ${current.length + 1} added · ${REGIONS[region].label} proxy`, 'proxy', ip)
    notify(`Window added with a fresh ${REGIONS[region].label} session (${ip}).`, 'ok')
  }

  function duplicateWindow(id) {
    const current = windowsRef.current
    const source = current.find(win => win.id === id)
    if (!source) return
    const newId = `w${nextIdRef.current++}`
    const ip = allocateIp(source.proxy.region, current)
    const clone = {
      ...source,
      id: newId,
      name: `Window ${current.length + 1}`,
      frameSrc: source.mode === 'demo' ? demoUrl(source.page, newId) : source.url,
      frameKey: 0,
      proxy: proxyFor(source.proxy.region, ip)
    }
    const index = current.findIndex(win => win.id === id)
    const next = [...current.slice(0, index + 1), clone, ...current.slice(index + 1)]
    setWindows(next)
    pushEvent(`Window duplicated · ${REGIONS[source.proxy.region].label} session`, 'proxy', ip)
    notify(`Duplicate created with a unique IP (${ip}).`, 'ok')
  }

  function removeWindow(id) {
    if (windowsRef.current[0]?.id === id) {
      notify('The main window stays pinned. Remove follower windows instead.', 'warn')
      return
    }
    const source = windowsRef.current.find(win => win.id === id)
    setWindows(prev => prev.filter(win => win.id !== id))
    if (expandedId === id) setExpandedId(null)
    if (source) {
      pushEvent(`${source.name} removed · proxy released`, 'proxy', source.proxy.ip)
      notify(`${source.name} removed.`, 'ok')
    }
  }

  function toggleWindowSync(id) {
    setWindows(prev => prev.map(win => {
      if (win.id !== id) return win
      const next = { ...win, sync: !win.sync }
      pushEvent(`${win.name} · ${next.sync ? 'mirroring resumed' : 'independent mode on'}`, 'sync', next.sync ? 'receives main events' : 'events isolated')
      return next
    }))
  }

  function setRegion(id, region) {
    const current = windowsRef.current
    const win = current.find(item => item.id === id)
    if (!win) return
    if (bridge && win.mode === 'external') {
      setWindows(prev => prev.map(item => item.id === id ? {
        ...item,
        proxy: { ...item.proxy, region, label: REGIONS[region].label, city: REGIONS[region].city, verified: false, lastCheck: 'not checked', ip: 'unverified' }
      } : item))
      pushEvent(`${win.name} · switched to ${REGIONS[region].label}`, 'proxy', 're-applying proxy')
      notify(`${win.name} moved to ${REGIONS[region].label}. Verifying to confirm egress.`, 'ok')
      return
    }
    const ip = allocateIp(region, current, id)
    setWindows(prev => prev.map(item => item.id === id ? {
      ...item,
      proxy: { ...proxyFor(region, ip), verified: false, lastCheck: 'not checked' }
    } : item))
    pushEvent(`${win.name} · switched to ${REGIONS[region].label}`, 'proxy', ip)
    notify(`${win.name} moved to ${REGIONS[region].label} (${ip}). Verify to confirm.`, 'ok')
  }

  function rotateIp(id) {
    const current = windowsRef.current
    const win = current.find(item => item.id === id)
    if (!win) return
    if (bridge && win.mode === 'external') {
      const sessionSeq = (win.proxy.sessionSeq || 0) + 1
      setWindows(prev => prev.map(item => item.id === id ? {
        ...item,
        proxy: { ...item.proxy, sessionSeq, verified: false, lastCheck: 'not checked', ip: 'unverified' }
      } : item))
      pushEvent(`${win.name} · new sticky session`, 'proxy', `session ${sessionSeq}`)
      notify(`${win.name}: new proxy session requested. Verify to read the new egress IP.`, 'ok')
      return
    }
    const usedElsewhere = new Set(current.filter(item => item.id !== id).map(item => item.proxy.ip))
    const pool = IP_POOLS[win.proxy.region]
    const currentIndex = pool.indexOf(win.proxy.ip)
    const ip = pool.find((candidate, index) => index > currentIndex && !usedElsewhere.has(candidate)) ||
      pool.find(candidate => !usedElsewhere.has(candidate)) ||
      pool[(currentIndex + 1) % pool.length]
    setWindows(prev => prev.map(item => item.id === id ? {
      ...item,
      proxy: { ...item.proxy, ip, verified: false, lastCheck: 'not checked' }
    } : item))
    pushEvent(`${win.name} · IP rotated`, 'proxy', `${win.proxy.ip} → ${ip}`)
    notify(`${win.name}: new ${REGIONS[win.proxy.region].label} IP ${ip}.`, 'ok')
  }

  function applyLiveResult(id, result) {
    const win = windowsRef.current.find(item => item.id === id)
    if (!win) return
    const duplicate = windowsRef.current.find(item =>
      item.id !== id && item.proxy.verified && item.proxy.ip === result.ip
    )
    const ipType = result.isProxy ? 'proxy' : result.isVpn ? 'VPN' : result.isHosting ? 'datacenter' : 'residential/ISP'
    const latency = Number(result.ms) || 0

    setWindows(prev => prev.map(item => item.id === id ? {
      ...item,
      proxy: {
        ...item.proxy,
        ip: result.ip,
        verified: true,
        latency,
        lastCheck: 'just now',
        city: result.city || item.proxy.city,
        country: result.country || 'US',
        org: result.org || '',
        ipType
      }
    } : item))

    pushEvent(`${win.name} · live IP verified`, 'proxy', `${result.ip} · ${result.city || result.region}, ${result.country} · ${ipType} · ${latency} ms`)

    if (duplicate) {
      notify(`${win.name} shares IP ${result.ip} with ${duplicate.name}. Rotate this window's session.`, 'warn')
    } else if (result.country && String(result.country).toUpperCase() !== 'US') {
      notify(`${win.name} egress is ${result.country} (${result.ip}), not US. Press New IP to try the next proxy.`, 'warn')
    } else if (result.isHosting && !result.isProxy && !result.isVpn) {
      notify(`${win.name} is on ${result.ip} — datacenter IP, not residential. Many sites may block it.`, 'warn')
    } else if (liveServer && !proxyTemplate.trim()) {
      notify(`${win.name}: no proxy set — this is the server's direct IP ${result.ip} (${ipType}).`, 'warn')
    } else {
      notify(`${win.name} confirmed on ${result.ip} (${result.city || result.region}, ${result.country} · ${ipType}).`, 'ok')
    }
  }

  async function verifyIp(id) {
    const win = windowsRef.current.find(item => item.id === id)
    if (!win || verifying[id]) return
    setVerifying(prev => ({ ...prev, [id]: true }))

    if (!bridge && !liveServer) {
      setTimeout(() => {
        const latency = REGIONS[win.proxy.region].latency + Math.floor(Math.random() * 9)
        setWindows(prev => prev.map(item => item.id === id ? {
          ...item,
          proxy: { ...item.proxy, verified: true, latency, lastCheck: 'just now' }
        } : item))
        setVerifying(prev => ({ ...prev, [id]: false }))
        pushEvent(`${win.name} · demo IP verified`, 'proxy', `${win.proxy.ip} · simulated`)
        notify(`${win.name} confirmed on ${win.proxy.ip} (simulated demo session).`, 'ok')
      }, 850)
      return
    }

    if (win.mode !== 'external') {
      setTimeout(() => {
        const latency = REGIONS[win.proxy.region].latency + Math.floor(Math.random() * 9)
        setWindows(prev => prev.map(item => item.id === id ? {
          ...item,
          proxy: { ...item.proxy, verified: true, latency, lastCheck: 'just now' }
        } : item))
        setVerifying(prev => ({ ...prev, [id]: false }))
        pushEvent(`${win.name} · demo IP verified`, 'proxy', `${win.proxy.ip} · simulated`)
        notify(`${win.name} confirmed on ${win.proxy.ip} (simulated demo session).`, 'ok')
      }, 850)
      return
    }

    try {
      let result
      if (bridge) {
        result = await bridge.verifyProxy(partitionFor(win.id))
      } else {
        const api = serverPaneApis.current[id]
        if (!api) throw new Error('live pane is still starting')
        result = await api.verify()
      }

      if (!result?.ok) {
        notify(`${win.name}: IP check failed — ${result?.error || 'unknown error'}. Check the proxy settings.`, 'warn')
        pushEvent(`${win.name} · IP check failed`, 'proxy', result?.error || 'unknown error')
        return
      }

      applyLiveResult(id, result)
    } catch (error) {
      notify(`${win.name}: IP check failed — ${error.message}`, 'warn')
    } finally {
      setVerifying(prev => ({ ...prev, [id]: false }))
    }
  }

  function verifyAll() {
    windowsRef.current.forEach((win, index) => {
      setTimeout(() => verifyIp(win.id), index * 160)
    })
    notify('Checking every US proxy session...', 'ok')
  }

  function openStandalone(id) {
    const win = windowsRef.current.find(item => item.id === id)
    if (!win) return
    if (bridge && win.mode === 'external') {
      bridge.openStandalone({ url: win.url, partition: partitionFor(win.id) })
        .then(result => {
          if (result?.ok) notify('Standalone window opened with this pane\'s proxy session.', 'ok')
          else notify(result?.error || 'Could not open standalone window.', 'warn')
        })
        .catch(error => notify(error.message, 'warn'))
      return
    }
    if (liveServer && win.mode === 'external') {
      notify('Standalone tabs would bypass the live pane proxy. Use the stacked pane instead.', 'warn')
      return
    }
    const target = win.mode === 'demo' ? demoUrl(win.page, win.id) : win.url
    window.open(target, `stackview-${id}`, 'popup=yes,width=1180,height=820')
    notify('Standalone copy opened. Mirroring applies to the stacked panes.', 'ok')
  }

  function reloadWindow(id) {
    setWindows(prev => prev.map(win => {
      if (win.id !== id) return win
      return {
        ...win,
        frameSrc: win.mode === 'demo' ? demoUrl(win.page, win.id) : win.url,
        frameKey: win.frameKey + 1
      }
    }))
    pushEvent(`${windowsRef.current.find(win => win.id === id)?.name || 'Window'} · reloaded`, 'nav', 'fresh render')
  }

  function reloadAll() {
    setWindows(prev => prev.map(win => ({
      ...win,
      frameSrc: win.mode === 'demo' ? demoUrl(win.page, win.id) : win.url,
      frameKey: win.frameKey + 1
    })))
    pushEvent('All windows reloaded', 'nav', `${windowsRef.current.length} frames`)
    notify('Every window reloaded.', 'ok')
  }

  function toggleMaster() {
    setMasterSync(prev => {
      const next = !prev
      pushEvent(next ? 'Master sync resumed' : 'Master sync paused', 'sync', next ? 'main drives all mirrored windows' : 'all windows independent')
      notify(next ? 'Master sync on — main window drives the stack.' : 'Master sync paused. Each window is independent.', 'ok')
      return next
    })
  }

  function demoScroll() {
    const frame = document.getElementById(`frame-${main.id}`)?.contentWindow
    frame?.postMessage({ source: 'stackview-host', target: main.id, action: { type: 'demo-scroll' } }, '*')
    pushEvent('Demo pulse sent to main window', 'scroll', 'scroll + click + typing')
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('stackview-gateway')
      if (saved) {
        setGateway(saved)
        setProxyTemplate(saved)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (bridge) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      fetch('live/health', { cache: 'no-store' })
        .then(response => (response.ok ? response.json() : null))
        .then(data => {
          if (!cancelled && data?.ok && data.browser) setLiveServer(true)
        })
        .catch(() => {})
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  function saveGateway(event) {
    event.preventDefault()
    if (!gateway.trim()) {
      notify('Paste a proxy URL template first.', 'warn')
      return
    }
    const template = gateway.trim()
    try { window.localStorage.setItem('stackview-gateway', template) } catch {}
    setProxyTemplate(template)
    pushEvent('Proxy template saved', 'proxy', template)
    notify('Proxy template saved. Each pane now uses its own session id.', 'ok')
    setGuideOpen(false)
  }

  return (
    <div className="app">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="grid-glow" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="layers" size={22} strokeWidth={1.6} />
          </div>
          <div className="brand-copy">
            <strong>StackView</strong>
            <span>multi-window sync browser</span>
          </div>
          <span className="version">v1.0</span>
        </div>
        <div className="top-actions">
          <span className="status-pill"><span className="pulse" />Sync engine live</span>
          <span className="count-pill"><Icon name="monitor" size={14} />{windows.length} windows</span>
          <button className="ghost-button" type="button" onClick={() => setGuideOpen(true)}>
            <Icon name="book" size={15} />
            <span>Setup guide</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="primary-column">
          <div className="command-card">
            <div className="command-head">
              <div>
                <span className="eyebrow">Control deck</span>
                <h1>Open once. <span>Mirror everywhere.</span></h1>
              </div>
              <div className="head-note">
                <Icon name="bolt" size={14} />
                <span>One main window drives the stack</span>
              </div>
            </div>

            <form className="command-row" onSubmit={submitMain}>
              <div className="url-field">
                <span className="url-icon"><Icon name="globe" size={18} /></span>
                <input
                  value={urlDraft}
                  onChange={event => setUrlDraft(event.target.value)}
                  placeholder="Paste any link — https://example.com"
                  aria-label="Link to open in the main window"
                  spellCheck="false"
                />
                <kbd>↵</kbd>
              </div>
              <button className="primary-button" type="submit">
                <Icon name="play" size={16} />
                Open main
              </button>
              <button className="secondary-button" type="button" onClick={addWindow}>
                <Icon name="plus" size={16} />
                Add window
              </button>
            </form>

            <div className="command-foot">
              <div className="master-toggle">
                <button
                  type="button"
                  role="switch"
                  aria-checked={masterSync}
                  aria-label="Master sync"
                  className={`switch ${masterSync ? 'is-on' : ''}`}
                  onClick={toggleMaster}
                >
                  <span className="switch-knob" />
                </button>
                <div className="master-copy">
                  <strong>Master sync {masterSync ? 'on' : 'paused'}</strong>
                  <span>{masterSync ? 'Scroll, click, typing and navigation mirror live' : 'Every window is operating independently'}</span>
                </div>
              </div>
              <div className="stat-chips">
                <span className="stat-chip"><Icon name="layers" size={13} />{windows.length} stacked</span>
                <span className={`stat-chip ${allUnique ? 'is-good' : 'is-warn'}`}>
                  <Icon name="shield" size={13} />{uniqueIps} unique US IPs
                </span>
                <span className="stat-chip"><Icon name="radio" size={13} />{syncedCount} mirroring</span>
              </div>
            </div>
          </div>

          <div className="stack-heading">
            <div>
              <h2>Window stack</h2>
              <p>Main window pinned at the top · followers below</p>
            </div>
            <div className="stack-tools">
              <button type="button" className="text-button" onClick={demoScroll}>
                <Icon name="sparkles" size={14} />
                Test sync
              </button>
              <button type="button" className="text-button" onClick={reloadAll}>
                <Icon name="refresh" size={14} />
                Reload all
              </button>
            </div>
          </div>

          <div className="window-stack">
            {windows.map((win, index) => (
              <WindowCard
                key={win.id}
                win={win}
                index={index}
                isMain={index === 0}
                masterSync={masterSync}
                ready={Boolean(ready[win.id])}
                verifying={Boolean(verifying[win.id])}
                expanded={expandedId === win.id}
                onReady={markReady}
                onNavigate={navigateWindow}
                onToggleSync={toggleWindowSync}
                onRemove={removeWindow}
                onDuplicate={duplicateWindow}
                onStandalone={openStandalone}
                onReload={reloadWindow}
                onExpand={id => setExpandedId(prev => prev === id ? null : id)}
                onRegion={setRegion}
                onRotate={rotateIp}
                onVerify={verifyIp}
                bridge={bridge}
                liveServer={liveServer}
                proxyTemplate={proxyForWindow(win, index)}
                registerPane={registerPane}
                registerServerPane={registerServerPane}
                onGuestEvent={onGuestEvent}
                onServerInput={onServerInput}
                onGuestNav={onGuestNav}
                onBlocked={onBlockedNav}
                onError={onPaneError}
              />
            ))}
            <button type="button" className="add-window-card" onClick={addWindow}>
              <span className="add-icon"><Icon name="plus" size={18} /></span>
              <span>
                <strong>Add another synchronized window</strong>
                <small>A fresh US proxy session is assigned automatically</small>
              </span>
              <Icon name="arrow" size={18} />
            </button>
          </div>

          <div className="bottom-note">
            <Icon name="lock" size={14} />
            <span>
              {bridge
                ? 'Live Chromium panes · mirrored input stays local · each pane has its own proxy session.'
                : liveServer
                  ? 'Live server-streamed panes · 1280×720 frames over WebSocket · input relayed to each synced pane.'
                  : 'Demo mode · for live sites with real proxies, run the Electron build (npm run electron:start).'}
            </span>
            <button type="button" onClick={() => setGuideOpen(true)}>Why?</button>
          </div>
        </section>

        <aside className="sidebar">
          <section className="side-card feed-card">
            <header className="side-head">
              <span className="side-icon"><Icon name="activity" size={17} /></span>
              <div>
                <h3>Live sync feed</h3>
                <p>Main window event bus</p>
              </div>
              <span className={`live-beacon ${masterSync ? '' : 'paused'}`} />
            </header>
            <ul className="event-list">
              {events.map(event => (
                <li key={event.id} className={`event tone-${event.tone}`}>
                  <span className="event-node" />
                  <div className="event-copy">
                    <p>{event.text}</p>
                    <span>{event.detail || 'sync bus'}</span>
                  </div>
                  <time>{event.time}</time>
                </li>
              ))}
            </ul>
            <div className="engine-meter">
              <div>
                <span>Engine latency</span>
                <strong>{masterSync ? '12 ms' : 'paused'}</strong>
              </div>
              <div className="meter-track"><span style={{ width: masterSync ? '78%' : '8%' }} /></div>
              <div className="engine-legend">
                <span><i className="dot cyan" />{syncedCount} receiving</span>
                <span><i className="dot violet" />{windows.length - syncedCount} isolated</span>
              </div>
            </div>
          </section>

          <section className="side-card">
            <header className="side-head">
              <span className="side-icon violet"><Icon name="shield" size={17} /></span>
              <div>
                <h3>US proxy sessions</h3>
                <p>One dedicated address per window</p>
              </div>
              <span className={`pool-badge ${allVerified ? 'verified' : ''}`}>
                {allVerified ? <><Icon name="check" size={11} />verified</> : 'pending'}
              </span>
            </header>
            <div className="ip-list">
              {windows.map((win, index) => (
                <div className="ip-row" key={win.id}>
                  <span className="ip-flag">US</span>
                  <div className="ip-copy">
                    <strong>{index === 0 ? 'Main' : `W${index + 1}`} · {win.proxy.ip}</strong>
                    <span>{win.proxy.label || REGIONS[win.proxy.region].label} · {win.proxy.city}</span>
                  </div>
                  <span className={`ip-state ${win.proxy.verified ? 'ok' : ''}`}>{win.proxy.verified ? win.proxy.latency + 'ms' : 'check'}</span>
                </div>
              ))}
            </div>
            <div className="pool-foot">
              <span><Icon name="check" size={12} />{allUnique ? 'All addresses unique' : 'Address conflict detected'}</span>
              <button type="button" onClick={verifyAll}>
                Verify all <Icon name="up" size={12} />
              </button>
            </div>
          </section>

          <section className="side-card quick-card">
            <header className="side-head">
              <span className="side-icon amber"><Icon name="sparkles" size={17} /></span>
              <div>
                <h3>Quick start</h3>
                <p>Three steps to a synced stack</p>
              </div>
            </header>
            <ol className="steps">
              <li><span>01</span><div><strong>Paste a link</strong><p>Open it in the pinned main window.</p></div></li>
              <li><span>02</span><div><strong>Add windows</strong><p>Each new pane gets its own US session.</p></div></li>
              <li><span>03</span><div><strong>Drive the stack</strong><p>Scroll, type and click in main — or toggle a pane to independent.</p></div></li>
            </ol>
          </section>

          <div className="reality-card">
            <span className="reality-icon"><Icon name="sparkles" size={18} /></span>
            <div>
              <strong>Built for the real web</strong>
              <p>
                {bridge
                  ? 'Live Chromium panes bypass frame blocking. Each pane keeps an isolated session and its own proxy, verified against ipinfo.io.'
                  : liveServer
                    ? 'Server-streamed Chromium bypasses frame blocking. Each pane runs in its own browser process and can egress through its own proxy.'
                    : 'In the browser build, third-party sites block iframes. Run the Electron build for live pages with per-pane proxies.'}
              </p>
              <button type="button" onClick={() => setGuideOpen(true)}>Read the setup notes <Icon name="arrow" size={12} /></button>
            </div>
          </div>
        </aside>
      </main>

      <footer className="footer">
        <span><Icon name="layers" size={13} />StackView control plane</span>
        <span className="footer-sep" />
        <span>Stacked panes · synchronized events · US proxy sessions</span>
        <span className="footer-right"><span className="footer-dot" />All systems operational</span>
      </footer>

      {toast && (
        <div className={`toast tone-${toast.tone}`} role="status">
          <span className="toast-icon">{toast.tone === 'warn' ? '!' : <Icon name="check" size={15} />}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {guideOpen && (
        <GuideModal
          gateway={gateway}
          setGateway={setGateway}
          onClose={() => setGuideOpen(false)}
          onSave={saveGateway}
          allUnique={allUnique}
          windows={windows}
        />
      )}
    </div>
  )
}

function BrowserPane({ win, proxyTemplate, onReady, onGuestEvent, onGuestNav, onBlocked, onError, registerPane }) {
  const ref = useRef(null)
  const loadedRef = useRef('')
  const keyRef = useRef(-1)
  const proxyKeyRef = useRef('')

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined

    registerPane(win.id, element)

    const handleReady = () => onReady(win.id)
    const handleNavigate = event => onGuestNav(win.id, event.url)
    const handleInPage = event => onGuestNav(win.id, event.url)
    const handleIpc = event => {
      if (event.channel === 'sv:event') onGuestEvent(win.id, event.args?.[0])
    }

    element.addEventListener('dom-ready', handleReady)
    element.addEventListener('did-navigate', handleNavigate)
    element.addEventListener('did-navigate-in-page', handleInPage)
    element.addEventListener('ipc-message', handleIpc)

    return () => {
      element.removeEventListener('dom-ready', handleReady)
      element.removeEventListener('did-navigate', handleNavigate)
      element.removeEventListener('did-navigate-in-page', handleInPage)
      element.removeEventListener('ipc-message', handleIpc)
      registerPane(win.id, null)
    }
  }, [win.id, onReady, onGuestEvent, onGuestNav, registerPane])

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    let cancelled = false
    const target = win.frameSrc
    if (!target) return undefined

    const sessionId = `${win.id}-${win.proxy.sessionSeq || 0}`
    const proxyKey = `${proxyTemplate}|${win.proxy.region}|${win.proxy.sessionSeq || 0}`
    const proxyChanged = proxyKeyRef.current !== '' && proxyKeyRef.current !== proxyKey
    proxyKeyRef.current = proxyKey
    const force = keyRef.current !== win.frameKey
    keyRef.current = win.frameKey
    const allowed = hostAllowed(target, bridge.allowedHosts)
    const shouldLoad = allowed && (force || proxyChanged || loadedRef.current !== target)

    if (!allowed) {
      loadedRef.current = ''
      onBlocked?.(win.id, target)
    }

    async function run() {
      try {
        const applied = await bridge.setProxy({
          partition: partitionFor(win.id),
          template: proxyTemplate,
          sessionId,
          region: win.proxy.region,
          country: 'us'
        })
        if (applied && applied.ok === false) onError?.(win.id, applied.error || 'proxy could not be applied')
      } catch (error) {
        onError?.(win.id, error.message)
      }

      if (!shouldLoad || cancelled) return

      for (let attempt = 0; attempt < 25 && !cancelled; attempt += 1) {
        try {
          element.loadURL(target)
          loadedRef.current = target
          return
        } catch {
          await new Promise(resolve => setTimeout(resolve, 120))
        }
      }
    }

    run()

    return () => { cancelled = true }
  }, [win.frameSrc, win.frameKey, win.proxy.region, win.proxy.sessionSeq, proxyTemplate, onBlocked, onError])

  return (
    <webview
      ref={ref}
      className="pane-webview"
      src="about:blank"
      partition={partitionFor(win.id)}
      preload={bridge.guestPreload}
      webpreferences="contextIsolation=yes, nodeIntegration=no"
    />
  )
}

function WindowCard({
  win,
  index,
  isMain,
  masterSync,
  ready,
  verifying,
  expanded,
  onReady,
  onNavigate,
  onToggleSync,
  onRemove,
  onDuplicate,
  onStandalone,
  onReload,
  onExpand,
  onRegion,
  onRotate,
  onVerify,
  bridge,
  liveServer,
  proxyTemplate,
  registerPane,
  registerServerPane,
  onGuestEvent,
  onServerInput,
  onGuestNav,
  onBlocked,
  onError
}) {
  const [draft, setDraft] = useState(win.mode === 'demo' ? `demo:${win.page}` : win.url)
  const [draftFocused, setDraftFocused] = useState(false)

  useEffect(() => {
    if (!draftFocused) setDraft(win.mode === 'demo' ? `demo:${win.page}` : win.url)
  }, [win.mode, win.page, win.url, draftFocused])

  const display = win.mode === 'demo' ? demoDisplay(win.page) : win.url
  const region = REGIONS[win.proxy.region]

  function submit(event) {
    event.preventDefault()
    onNavigate(win.id, draft, isMain ? 'Main window' : win.name)
    setDraftFocused(false)
  }

  return (
    <article className={`window-card ${isMain ? 'is-main' : ''} ${win.sync ? 'is-synced' : 'is-isolated'} ${expanded ? 'is-expanded' : ''}`}>
      <div className="window-top">
        <div className="window-ident">
          <span className={`window-index ${isMain ? 'main' : ''}`}>
            {isMain ? <Icon name="crown" size={15} /> : String(index + 1).padStart(2, '0')}
          </span>
          <div className="window-title">
            <div className="title-line">
              <strong>{isMain ? 'Main window' : win.name}</strong>
              {isMain && <span className="tag main-tag">MAIN</span>}
              {win.mode === 'external' && <span className="tag external-tag">EXTERNAL</span>}
              {!win.sync && <span className="tag isolated-tag">INDEPENDENT</span>}
            </div>
            <span className="window-url">{display}</span>
          </div>
        </div>
        <div className="window-actions">
          <span className={`mirror-state ${win.sync ? 'on' : ''}`}>
            <span className="mirror-dot" />
            {win.sync ? (isMain ? 'Source' : 'Mirrored') : 'Independent'}
          </span>
          <button type="button" className={`icon-button ${win.sync ? 'active' : ''}`} title={win.sync ? 'Pause mirroring for this window' : 'Resume mirroring'} onClick={() => onToggleSync(win.id)}>
            <Icon name="radio" size={15} />
          </button>
          <button type="button" className="icon-button" title="Reload this window" onClick={() => onReload(win.id)}>
            <Icon name="refresh" size={15} />
          </button>
          <button type="button" className="icon-button" title={expanded ? 'Collapse window' : 'Expand window'} onClick={() => onExpand(win.id)}>
            <Icon name={expanded ? 'minimize' : 'maximize'} size={15} />
          </button>
          <button type="button" className="icon-button" title="Open standalone browser window" onClick={() => onStandalone(win.id)}>
            <Icon name="external" size={15} />
          </button>
          {!isMain && (
            <button type="button" className="icon-button danger" title="Remove window" onClick={() => onRemove(win.id)}>
              <Icon name="trash" size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="address-row">
        <span className="secure-chip"><Icon name="lock" size={12} /></span>
        <form className="pane-address" onSubmit={submit}>
          <input
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onFocus={() => setDraftFocused(true)}
            onBlur={() => setDraftFocused(false)}
            aria-label={`Address for ${isMain ? 'main window' : win.name}`}
            spellCheck="false"
          />
        </form>
        <button type="button" className="go-button" onClick={() => { onNavigate(win.id, draft, isMain ? 'Main window' : win.name); setDraftFocused(false) }}>
          Go
        </button>
        <span className={`render-mode ${win.mode === 'demo' || bridge || liveServer ? 'live' : 'url'}`}>
          {win.mode === 'demo' ? 'LIVE MIRROR' : bridge ? 'LIVE CHROMIUM' : liveServer ? 'LIVE STREAM' : 'URL MIRROR'}
        </span>
      </div>

      {win.mode === 'external' && (
        <div className="external-strip">
          <Icon name="shield" size={13} />
          <span>
            {bridge
              ? 'Live Chromium pane · isolated session · scroll, click, typing and navigation mirror to synced panes.'
              : liveServer
                ? 'Server-streamed Chromium · 1280×720 · input is relayed to this pane and its synced peers.'
                : 'External origin · the browser build mirrors URLs only. Run the Electron build for live panes.'}
          </span>
          <button type="button" onClick={() => onNavigate(win.id, 'demo:home', win.name)}>Return to demo</button>
        </div>
      )}

      <div className={`frame-shell ${liveServer && win.mode === 'external' ? 'has-server' : ''}`}>
        {!ready && (
          <div className="frame-loading">
            <span className="spinner" />
            <span className="loading-copy"><strong>Connecting pane</strong><small>{region.label} · {win.proxy.ip}</small></span>
          </div>
        )}
        {bridge && win.mode === 'external' ? (
          <BrowserPane
            win={win}
            proxyTemplate={proxyTemplate}
            onReady={onReady}
            onGuestEvent={onGuestEvent}
            onGuestNav={onGuestNav}
            registerPane={registerPane}
            onBlocked={onBlocked}
            onError={onError}
          />
        ) : liveServer && win.mode === 'external' ? (
          <ServerPane
            win={win}
            proxy={proxyTemplate || ''}
            registerServerPane={registerServerPane}
            onReady={onReady}
            onInput={onServerInput}
            onGuestNav={onGuestNav}
            onReload={() => onReload(win.id)}
            onError={onError}
          />
        ) : win.mode === 'external' ? (
          <div className="web-live-blocked">
            <span className="web-live-icon"><Icon name="monitor" size={20} /></span>
            <strong>Live panes need the desktop app</strong>
            <p>Web browsers block embedding third-party sites, and this server has no Chromium backend. Run <code>npm run live</code> locally or <code>npm run electron:start</code> for real panes.</p>
            <button type="button" onClick={() => window.open(win.url, '_blank', 'noopener,noreferrer')}>Open in new tab</button>
          </div>
        ) : (
          <iframe
            id={`frame-${win.id}`}
            key={win.frameKey}
            src={win.frameSrc}
            title={`${win.name} browser pane`}
            onLoad={() => onReady(win.id)}
            referrerPolicy="no-referrer"
          />
        )}
        {win.mode === 'demo' && (
          <span className="frame-badge">
            <span className={`live-pin ${win.sync ? '' : 'off'}`} />
            {win.sync ? 'SYNCED' : 'ISOLATED'}
          </span>
        )}
      </div>

      <div className="window-foot">
        <div className="proxy-block">
          <span className="proxy-flag">US</span>
          <div className="proxy-copy">
            <strong>{region.label} · {win.proxy.ip}</strong>
            <span>
              {win.proxy.verified
                ? `${win.proxy.city || region.city}${win.proxy.ipType ? ` · ${win.proxy.ipType}` : ''}${win.proxy.org ? ` · ${win.proxy.org}` : ''} · verified ${win.proxy.lastCheck}`
                : `${region.city} · ${region.asn} · awaiting check`}
            </span>
          </div>
          <span className={`verify-state ${win.proxy.verified ? 'ok' : ''}`}>
            <span className="verify-dot" />
            {win.proxy.verified ? `${win.proxy.latency} ms` : 'unchecked'}
          </span>
        </div>
        <div className="proxy-tools">
          <label className="region-select">
            <span>Region</span>
            <select value={win.proxy.region} onChange={event => onRegion(win.id, event.target.value)} aria-label={`Proxy region for ${win.name}`}>
              {Object.entries(REGIONS).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
            <Icon name="chevron" size={12} />
          </label>
          <button type="button" className="small-button" onClick={() => onVerify(win.id)} disabled={verifying}>
            {verifying ? <span className="mini-spinner" /> : <Icon name="signal" size={13} />}
            {verifying ? 'Checking' : 'Verify IP'}
          </button>
          <button type="button" className="small-button" onClick={() => onRotate(win.id)}>
            <Icon name="refresh" size={13} />
            New IP
          </button>
          <button type="button" className="icon-button subtle" title="Duplicate window" onClick={() => onDuplicate(win.id)}>
            <Icon name="copy" size={14} />
          </button>
        </div>
      </div>
    </article>
  )
}

function GuideModal({ gateway, setGateway, onClose, onSave, allUnique, windows }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
        <header className="modal-head">
          <div>
            <span className="eyebrow">Operator guide</span>
            <h2 id="guide-title">Yes — this is the working control plane.</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close guide">
            <Icon name="x" size={17} />
          </button>
        </header>

        <div className="modal-body">
          <div className="guide-grid">
            <section className="guide-block">
              <span className="guide-num">01</span>
              <h3>Input a link</h3>
              <p>Paste any <code>https://</code> link into the control deck and press <kbd>Enter</kbd>. It opens in the pinned main window. Demo routes also work: <code>demo:home</code>, <code>demo:explore</code>, <code>demo:deals</code>, <code>demo:profile</code>.</p>
            </section>
            <section className="guide-block">
              <span className="guide-num">02</span>
              <h3>Add or remove windows</h3>
              <p>Use <strong>Add window</strong> under the command bar or the dashed card at the bottom of the stack. Each pane has reload, expand, duplicate, standalone and remove controls. The main window stays pinned at the top.</p>
            </section>
            <section className="guide-block">
              <span className="guide-num">03</span>
              <h3>Sync or isolate</h3>
              <p>With <strong>Master sync</strong> on, scroll, clicks, typing and navigation in main are replayed in every mirrored pane. Toggle the radio icon on any pane to make it independent without affecting the rest.</p>
            </section>
            <section className="guide-block">
              <span className="guide-num">04</span>
              <h3>Set and verify US IPs</h3>
              <p>Every window has its own US region and address. Use <strong>Region</strong> to move a pane, <strong>New IP</strong> to rotate to an unused address in that pool, then <strong>Verify IP</strong> to run a location + latency check.</p>
            </section>
          </div>

          <div className="guide-callout">
            <span className="callout-icon"><Icon name="shield" size={17} /></span>
            <div>
              <strong>Production wiring for real proxies</strong>
              <p>
                {bridge
                  ? 'Electron is active: every external pane gets the real Chromium engine and an isolated session. Paste a proxy URL template below — each pane substitutes its own sticky session id, then Verify IP checks the real egress through that pane. Set STACKVIEW_ALLOWED_HOSTS to keep panes on domains you own.'
                  : liveServer
                    ? 'Live server streaming is active: each pane is a separate server-side Chromium process. Paste a proxy URL template below to give every pane its own sticky session, then Verify IP reads the real egress from inside that pane. Use STACKVIEW_ALLOWED_HOSTS on the server to restrict targets.'
                    : 'This is the browser demo. Live pages with per-pane proxies require the live server (npm run live) or the Electron build: npm run electron:start.'}
              </p>
            </div>
          </div>

          <form className="gateway-form" onSubmit={onSave}>
            <label>
              <span>Proxy URL template <small>optional</small></span>
              <div className="gateway-input">
                <Icon name="key" size={15} />
                <input
                  value={gateway}
                  onChange={event => setGateway(event.target.value)}
                  placeholder="http://user:pass@proxy-host:port  ·  placeholders: {session} {region} {country}"
                />
              </div>
            </label>
            <button className="secondary-button" type="submit">Save gateway</button>
          </form>

          <div className="network-summary">
            <span className={allUnique ? 'summary-good' : 'summary-warn'}>
              <Icon name={allUnique ? 'check' : 'x'} size={14} />
              {allUnique ? 'All window addresses are unique' : 'Duplicate address detected'}
            </span>
            <span>{windows.length} active session{windows.length === 1 ? '' : 's'}</span>
            <span>US pools · 32 addresses</span>
          </div>
        </div>

        <footer className="modal-foot">
          <span><Icon name="lock" size={13} />Demo pages are served same-origin; external sites are never injected.</span>
          <button type="button" className="primary-button small" onClick={onClose}>Start using StackView</button>
        </footer>
      </div>
    </div>
  )
}
