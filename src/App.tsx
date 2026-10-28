import { useEffect } from 'react'
import { useApp } from './hooks/useApp'
import { Sidebar, MobileHeader, BottomNav } from './components/Sidebar'
import { Market } from './components/Market'
import { Inbox } from './components/Inbox'
import { History } from './components/History'
import { Settings } from './components/Settings'
import { Modal, Toasts } from './components/ui'

const TITLES: Record<string, string> = {
  numbers: 'Hush — numbers for the moment',
  inbox: 'Active number · Hush',
  history: 'History · Hush',
  settings: 'Settings · Hush',
}

export default function App() {
  const app = useApp()
  const { view, setView, confirm } = app

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.title = TITLES[view] ?? 'Hush'
  }, [view])

  return (
    <div className="app-shell">
      <div className="aurora" aria-hidden="true" />
      <Sidebar
        view={view}
        onNavigate={setView}
        activeRental={app.activeRental}
        historyCount={app.historyCount}
        providerMode={app.state.settings.provider}
        providerReady={app.state.settings.baseUrl.trim().length > 0}
      />

      <MobileHeader
        providerMode={app.state.settings.provider}
        providerReady={app.state.settings.baseUrl.trim().length > 0}
        onSettings={() => setView('settings')}
      />

      <main className="main">
        {view === 'numbers' ? <Market app={app} /> : null}
        {view === 'inbox' ? <Inbox app={app} /> : null}
        {view === 'history' ? <History app={app} /> : null}
        {view === 'settings' ? <Settings app={app} /> : null}
      </main>

      <BottomNav view={view} onNavigate={setView} activeRental={app.activeRental} />

      <Modal
        open={confirm !== null}
        title={confirm?.title ?? ''}
        description={confirm?.body}
        tone={confirm?.tone === 'danger' ? 'danger' : 'default'}
        onClose={app.cancelConfirm}
        footer={
          <>
            <button type="button" className="button ghost" onClick={app.cancelConfirm}>
              Cancel
            </button>
            <button
              type="button"
              className={`button ${confirm?.tone === 'danger' ? 'danger' : 'primary'}`}
              onClick={() => void app.resolveConfirm()}
            >
              {confirm?.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      />

      <Toasts items={app.toasts} onDismiss={app.dismissToast} />
    </div>
  )
}
