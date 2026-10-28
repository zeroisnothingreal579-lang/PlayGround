import {
  ArrowLeft,
  Ban,
  Inbox as InboxIcon,
  Lock,
  MessageSquare,
  Plus,
  Radio,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { countryByCode, durationById, serviceById } from '../data'
import { formatClockTime, formatCountdown, formatDateTime, formatMoney } from '../lib/format'
import type { AppController } from '../hooks/useApp'
import { CopyButton, CountdownRing, EmptyState, MessageCard, ServiceMark } from './ui'

export function Inbox({ app }: { app: AppController }) {
  const rental = app.activeRental ?? app.state.rentals[0] ?? null

  if (!rental) {
    return (
      <div className="page">
        <div className="page-head slim-head">
          <div className="eyebrow">
            <span className="pulse-dot" /> Active number
          </div>
          <h1>Nothing live right now.</h1>
          <p className="lede">Pick a country and a service, and your first line is a few seconds away.</p>
        </div>
        <div className="panel empty-panel">
          <EmptyState
            icon={<Smartphone size={26} />}
            title="No active number"
            body="Temporary lines show up here with their inbox, countdown, and detected codes."
            action={
              <button type="button" className="button primary" onClick={() => app.setView('numbers')}>
                Get a number
              </button>
            }
          />
        </div>
      </div>
    )
  }

  const country = countryByCode(rental.country)
  const service = serviceById(rental.serviceId)
  const duration = durationById(rental.duration)
  const isActive = rental.status === 'active'
  const remaining = Math.max(0, rental.expiresAt - app.now)
  const total = duration.minutes * 60_000
  const progress = Math.min(100, Math.max(0, (remaining / total) * 100))
  const messages = [...rental.messages].reverse()
  const isDemo = app.state.settings.provider === 'demo'

  return (
    <div className="page inbox-page">
      <div className="inbox-topbar">
        <button type="button" className="back-link" onClick={() => app.setView('numbers')}>
          <ArrowLeft size={15} /> Get a number
        </button>
        <span className={`status-pill ${isActive ? 'status-live' : 'status-ended'}`}>
          <span className="live-dot" />
          {isActive ? 'Live line' : rental.status === 'released' ? 'Released' : 'Expired'}
        </span>
      </div>

      <header className="page-head slim-head">
        <h1>{isActive ? 'Your line is live.' : 'This line has ended.'}</h1>
        <p className="lede">
          {isActive
            ? `Messages for ${service.name} land below. The number releases itself when the timer ends.`
            : 'The messages are kept in your history, but the number can no longer receive anything.'}
        </p>
      </header>

      <div className="rental-grid">
        <section className="panel number-card">
          <div className="number-card-head">
            <span className="country-tag">
              <span aria-hidden="true">{country.flag}</span> {country.name}
            </span>
            <span className="service-tag">
              <ServiceMark service={service} size="sm" /> {service.name}
            </span>
          </div>

          <div className="number-value">
            <span className="mono">{rental.phoneNumber}</span>
            <CopyButton value={rental.phoneNumber} onCopy={app.copy} label="Copy" />
          </div>

          {isActive ? (
            <>
              <div className="countdown-block">
                <CountdownRing remaining={remaining} total={total} />
                <div className="countdown-text">
                  <span className="meta-label">Time remaining</span>
                  <strong>{formatCountdown(remaining)}</strong>
                  <small>Releases at {formatClockTime(rental.expiresAt)}</small>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
            </>
          ) : (
            <div className="ended-banner">
              <Lock size={16} />
              <div>
                <strong>This number is offline</strong>
                <span>It stopped accepting messages at {formatDateTime(rental.expiresAt)}.</span>
              </div>
            </div>
          )}

          <dl className="number-meta">
            <div>
              <dt>Opened</dt>
              <dd>{formatDateTime(rental.createdAt)}</dd>
            </div>
            <div>
              <dt>Lifetime</dt>
              <dd>{duration.label}</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>{isDemo ? 'Demo · free' : formatMoney(rental.cost)}</dd>
            </div>
          </dl>

          <div className="number-actions">
            {isActive && isDemo ? (
              <button
                type="button"
                className="button ghost"
                onClick={() => app.extend(rental.id)}
              >
                <Plus size={15} /> Add 10 minutes
              </button>
            ) : null}
            {isActive ? (
              <button
                type="button"
                className="button danger"
                onClick={() => app.requestRelease(rental.id)}
              >
                <Ban size={15} /> Release now
              </button>
            ) : (
              <button
                type="button"
                className="button primary"
                onClick={() => app.setView('numbers')}
              >
                Get a new number
              </button>
            )}
          </div>

          {isDemo ? (
            <p className="card-note">
              <ShieldCheck size={13} /> Demo numbers are fictional and messages are generated locally.
            </p>
          ) : null}
        </section>

        <section className="panel inbox-panel" aria-live="polite">
          <div className="inbox-panel-head">
            <div>
              <h2>
                <InboxIcon size={17} /> Inbox
              </h2>
              <span>
                {rental.messages.length === 0
                  ? 'No messages yet'
                  : `${rental.messages.length} message${rental.messages.length === 1 ? '' : 's'}`}
              </span>
            </div>
            <span className={`mini-badge ${isDemo ? 'mini-badge-demo' : 'mini-badge-live'}`}>
              {isDemo ? 'Simulated' : 'Live'}
            </span>
          </div>

          {isActive ? (
            <div className="listening">
              <span className="equalizer" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>
                <strong>Listening for messages</strong>
                <small>Keep this page open. Codes are detected automatically.</small>
              </span>
              <Radio size={15} className="listening-icon" />
            </div>
          ) : null}

          {messages.length > 0 ? (
            <div className="message-list">
              {messages.map((message) => (
                <MessageCard key={message.id} message={message} onCopy={app.copy} />
              ))}
            </div>
          ) : (
            <div className="waiting">
              <div className="radar" aria-hidden="true">
                <span className="radar-ring radar-ring-1" />
                <span className="radar-ring radar-ring-2" />
                <span className="radar-ring radar-ring-3" />
                <span className="radar-core">
                  <MessageSquare size={19} />
                </span>
              </div>
              <h3>{isActive ? 'Nothing in the inbox yet' : 'No messages were received'}</h3>
              <p>
                {isActive
                  ? isDemo
                    ? 'A simulated code usually arrives 5–10 seconds after the number is claimed.'
                    : 'New SMS will appear here as soon as your provider delivers it.'
                  : 'This number expired before any messages arrived.'}
              </p>
              {isActive ? (
                <div className="waiting-skeleton" aria-hidden="true">
                  <span className="skeleton-line skeleton-line-long" />
                  <span className="skeleton-line" />
                </div>
              ) : null}
            </div>
          )}

          {isDemo ? (
            <p className="inbox-footnote">
              <Lock size={12} /> Demo inbox — nothing leaves this browser.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}
