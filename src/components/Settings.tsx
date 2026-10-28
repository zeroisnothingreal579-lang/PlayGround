import { useState } from 'react'
import {
  Bell,
  BellOff,
  Check,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Loader2,
  Lock,
  Plug,
  RefreshCw,
  Server,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { DURATIONS } from '../data'
import { testCustomConnection } from '../providers'
import type { AppController } from '../hooks/useApp'
import type { DurationId, ProviderMode } from '../types'
import { Toggle } from './ui'

interface TestResult {
  ok: boolean
  message: string
}

export function Settings({ app }: { app: AppController }) {
  const { settings } = app.state
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const setProvider = (provider: ProviderMode) => {
    setTestResult(null)
    app.updateSettings({ provider })
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testCustomConnection(app.state.settings)
    setTestResult(result)
    setTesting(false)
  }

  const setDuration = (duration: DurationId) => {
    app.updateSettings({ defaultDuration: duration })
    app.selectDuration(duration)
  }

  return (
    <div className="page settings-page">
      <header className="page-head slim-head">
        <div className="eyebrow">
          <span className="pulse-dot" /> Preferences
        </div>
        <h1>Settings</h1>
        <p className="lede">
          Choose where numbers come from and how Hush should keep you posted.
        </p>
      </header>

      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-heading">
            <span className="panel-icon">
              <Plug size={17} />
            </span>
            <div>
              <h2>Delivery</h2>
              <p>Where real numbers and messages come from.</p>
            </div>
            <span className={`mini-badge ${settings.provider === 'demo' ? 'mini-badge-demo' : 'mini-badge-live'}`}>
              {settings.provider === 'demo' ? 'Sandbox' : 'Custom API'}
            </span>
          </div>

          <div className="segmented wide" role="radiogroup" aria-label="Provider mode">
            <button
              type="button"
              role="radio"
              aria-checked={settings.provider === 'demo'}
              className={settings.provider === 'demo' ? 'is-selected' : ''}
              onClick={() => setProvider('demo')}
            >
              <FlaskConical size={15} /> Demo inbox
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={settings.provider === 'custom'}
              className={settings.provider === 'custom' ? 'is-selected' : ''}
              onClick={() => setProvider('custom')}
            >
              <Server size={15} /> Custom provider
            </button>
          </div>

          {settings.provider === 'demo' ? (
            <div className="provider-info">
              <p>
                Demo mode works offline. Numbers are fictional, and incoming messages are
                generated in your browser so you can try the full flow.
              </p>
              <ul>
                <li>
                  <Check size={14} /> Full claim, inbox, and expiry flow
                </li>
                <li>
                  <Check size={14} /> Automatic one-time-code detection
                </li>
                <li>
                  <Check size={14} /> No provider credentials needed
                </li>
              </ul>
              <p className="provider-hint">
                To receive real SMS, switch to a custom provider below.
              </p>
            </div>
          ) : (
            <div className="provider-form">
              <label className="field">
                <span>Provider base URL</span>
                <input
                  type="url"
                  value={settings.baseUrl}
                  onChange={(event) => app.updateSettings({ baseUrl: event.target.value })}
                  placeholder="https://your-proxy.example.com/api"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span>
                  <KeyRound size={13} /> API token
                </span>
                <div className="token-field">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={settings.token}
                    onChange={(event) => app.updateSettings({ token: event.target.value })}
                    placeholder="Optional bearer token"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setShowToken((value) => !value)}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <div className="test-row">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => void runTest()}
                  disabled={testing || settings.baseUrl.trim().length === 0}
                >
                  {testing ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                  {testing ? 'Testing' : 'Test connection'}
                </button>
                {testResult ? (
                  <span className={`test-result ${testResult.ok ? 'is-ok' : 'is-error'}`}>
                    {testResult.ok ? <Wifi size={14} /> : <WifiOff size={14} />}
                    {testResult.message}
                  </span>
                ) : (
                  <span className="test-hint">
                    Calls <code>/health</code> on your base URL.
                  </span>
                )}
              </div>

              <div className="provider-warning">
                <ShieldAlert size={16} />
                <div>
                  <strong>Browser requests are subject to CORS</strong>
                  <span>
                    Most SMS providers block direct browser calls. Point the base URL at a small
                    proxy you control and use a short-lived, limited-scope token. The token is
                    stored in this browser only.
                  </span>
                </div>
              </div>

              <details className="contract">
                <summary>
                  API contract <ChevronDown size={15} />
                </summary>
                <div className="contract-body">
                  <p>Hush prefixes the base URL with these endpoints:</p>
                  <pre>{`POST /numbers
Authorization: Bearer <token>
Content-Type: application/json

{ "country": "US", "service": "whatsapp", "duration": "10m" }

200 OK
{ "id": "abc123",
  "phoneNumber": "+14155550123",
  "expiresAt": "2026-01-01T12:10:00Z",
  "cost": 0.45 }

GET /numbers/:id/messages
200 OK
[{ "id": "m1",
   "from": "WhatsApp",
   "body": "Your code is 482913",
   "receivedAt": 1767260000000 }]

DELETE /numbers/:id
GET /health`}</pre>
                  <p>
                    The messages endpoint may also return <code>{'{ "messages": [...] }'}</code>.
                    Timestamps accept ISO strings, seconds, or milliseconds. Missing codes are
                    detected locally.
                  </p>
                </div>
              </details>
            </div>
          )}
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading">
            <span className="panel-icon">
              <Bell size={17} />
            </span>
            <div>
              <h2>Notifications</h2>
              <p>Know the moment a code lands.</p>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <strong>Browser notifications</strong>
              <span>
                Show a desktop alert when a new message arrives, even if this tab is in the
                background.
              </span>
            </div>
            <Toggle
              checked={settings.notifications}
              onChange={(value) => void app.setNotifications(value)}
              label="Browser notifications"
            />
          </div>

          <div className="setting-row">
            <div>
              <strong>Starting duration</strong>
              <span>Pre-selected lifetime for every new number.</span>
            </div>
          </div>
          <div className="segmented wide">
            {DURATIONS.map((duration) => (
              <button
                key={duration.id}
                type="button"
                className={settings.defaultDuration === duration.id ? 'is-selected' : ''}
                onClick={() => setDuration(duration.id)}
              >
                {duration.label}
              </button>
            ))}
          </div>

          <div className="setting-note">
            {settings.notifications ? <Bell size={14} /> : <BellOff size={14} />}
            <span>
              {settings.notifications
                ? 'In-app toasts always stay on; browser alerts depend on your OS settings.'
                : 'In-app toasts still appear in the corner for every new message.'}
            </span>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading">
            <span className="panel-icon">
              <Lock size={17} />
            </span>
            <div>
              <h2>Your data</h2>
              <p>Everything lives in this browser.</p>
            </div>
          </div>

          <div className="data-actions">
            <button type="button" className="button ghost" onClick={app.exportHistory}>
              <Download size={15} /> Export history
            </button>
            <button type="button" className="button ghost" onClick={app.clearHistory}>
              <Trash2 size={15} /> Clear history
            </button>
            <button type="button" className="button danger-ghost" onClick={app.resetData}>
              <RefreshCw size={15} /> Reset Hush
            </button>
          </div>

          <p className="fine-print">
            Numbers, messages, connection settings, and preferences are saved in local storage.
            Nothing is uploaded by Hush. In custom mode, the requests go straight to the provider
            you configure.
          </p>
        </section>
      </div>

      <footer className="legal-note">
        <ShieldAlert size={16} />
        <p>
          <strong>Use responsibly.</strong> Hush is a client, not a carrier. Temporary numbers are
          meant for privacy and low-stakes signups; do not use them to bypass verification on
          services that prohibit it. Follow your provider&apos;s terms and the rules of every
          service you sign up for.
        </p>
      </footer>
    </div>
  )
}
