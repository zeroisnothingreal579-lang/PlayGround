import { lazy, Suspense, useEffect, useState } from 'react'
import { BootScreen, Login } from './components/Login'
import { Layout } from './components/Layout'
import { useApp } from './lib/AppContext'
import { AdsPage } from './pages/AdsPage'
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
import { InspectorPage } from './pages/InspectorPage'
import { OverviewPage } from './pages/OverviewPage'
import { ServersPage } from './pages/ServersPage'
import { SessionsPage } from './pages/SessionsPage'
import { SettingsPage } from './pages/SettingsPage'
import { Loader2 } from 'lucide-react'
import type { ViewId } from './types'

const views: ViewId[] = ['overview', 'inspector', 'sessions', 'ads', 'servers', 'analytics', 'settings']
const titles: Record<ViewId, string> = {
  overview: 'Command center',
  inspector: 'URL Inspector',
  sessions: 'Browser sessions',
  ads: 'Advertising analysis',
  servers: 'Workers & network',
  analytics: 'Analytics',
  settings: 'Settings',
}

function readView(): ViewId {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return views.includes(raw as ViewId) ? raw as ViewId : 'overview'
}

export default function App() {
  const { bootstrapping, authenticated } = useApp()
  const [view, setView] = useState<ViewId>(readView)

  useEffect(() => {
    const sync = () => setView(readView())
    window.addEventListener('hashchange', sync)
    if (!window.location.hash) window.history.replaceState(null, '', '#/overview')
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    document.title = `${titles[view]} · LinkPilot AI`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [view])

  const navigate = (next: ViewId) => {
    if (next === view) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (window.location.hash === `#/${next}`) setView(next)
    else window.location.hash = `#/${next}`
  }

  if (bootstrapping) return <BootScreen />
  if (!authenticated) return <Login />

  return (
    <Layout view={view} onNavigate={navigate}>
      {view === 'overview' && <OverviewPage onNavigate={navigate} />}
      {view === 'inspector' && <InspectorPage onNavigate={navigate} />}
      {view === 'sessions' && <SessionsPage onNavigate={navigate} />}
      {view === 'ads' && <AdsPage />}
      {view === 'servers' && <ServersPage onNavigate={navigate} />}
      {view === 'analytics' && (
        <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center gap-2 text-xs text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-violet-400" /> Loading analytics</div>}>
          <AnalyticsPage />
        </Suspense>
      )}
      {view === 'settings' && <SettingsPage />}
    </Layout>
  )
}
