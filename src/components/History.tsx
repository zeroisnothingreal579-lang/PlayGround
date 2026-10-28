import { useMemo, useState } from 'react'
import {
  Download,
  Eye,
  History as HistoryIcon,
  MessageSquare,
  Search,
  Trash2,
} from 'lucide-react'
import { countryByCode, serviceById } from '../data'
import { formatDateTime, formatMoney } from '../lib/format'
import type { AppController } from '../hooks/useApp'
import type { Rental, RentalStatus } from '../types'
import { CopyButton, EmptyState, MessageCard, Modal, ServiceMark } from './ui'

type Filter = 'all' | 'expired' | 'released'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'released', label: 'Released' },
  { id: 'expired', label: 'Expired' },
]

const STATUS_LABEL: Record<Exclude<RentalStatus, 'active'>, string> = {
  released: 'Released',
  expired: 'Expired',
}

export function History({ app }: { app: AppController }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<Rental | null>(null)

  const entries = useMemo(
    () =>
      app.state.rentals
        .filter((rental) => rental.status !== 'active')
        .sort((left, right) => right.createdAt - left.createdAt),
    [app.state.rentals],
  )

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return entries.filter((rental) => {
      if (filter !== 'all' && rental.status !== filter) return false
      if (!term) return true
      const service = serviceById(rental.serviceId)
      const country = countryByCode(rental.country)
      const haystack = [
        rental.phoneNumber,
        service.name,
        country.name,
        ...rental.messages.map((message) => `${message.body} ${message.code ?? ''}`),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [entries, filter, query])

  const messageCount = entries.reduce((total, rental) => total + rental.messages.length, 0)
  const estimatedSpend = entries.reduce((total, rental) => total + rental.cost, 0)
  const counts: Record<Filter, number> = {
    all: entries.length,
    released: entries.filter((rental) => rental.status === 'released').length,
    expired: entries.filter((rental) => rental.status === 'expired').length,
  }

  return (
    <div className="page history-page">
      <header className="page-head slim-head">
        <div className="eyebrow">
          <span className="pulse-dot" /> Archive
        </div>
        <h1>History</h1>
        <p className="lede">
          Every number you have let go of, with its messages and detected codes. Only you can see this.
        </p>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <span>Numbers claimed</span>
          <strong>{entries.length}</strong>
          <small>Released or expired</small>
        </div>
        <div className="stat-card">
          <span>Messages received</span>
          <strong>{messageCount}</strong>
          <small>Across all lines</small>
        </div>
        <div className="stat-card">
          <span>Estimated spend</span>
          <strong>{formatMoney(estimatedSpend)}</strong>
          <small>{app.state.settings.provider === 'demo' ? 'Demo rates · not billed' : 'Provider rates'}</small>
        </div>
      </div>

      <section className="panel history-panel">
        <div className="history-toolbar">
          <label className="search-field compact">
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search numbers, services, codes"
              aria-label="Search history"
            />
          </label>

          <div className="filter-tabs" role="tablist" aria-label="Filter history">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={`filter-tab ${filter === item.id ? 'is-selected' : ''}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                <span>{counts[item.id]}</span>
              </button>
            ))}
          </div>

          <div className="toolbar-actions">
            <button
              type="button"
              className="button ghost small"
              onClick={app.exportHistory}
              disabled={entries.length === 0}
            >
              <Download size={14} /> Export
            </button>
            <button
              type="button"
              className="button ghost small"
              onClick={app.clearHistory}
              disabled={entries.length === 0}
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="history-list">
            {filtered.map((rental) => {
              const country = countryByCode(rental.country)
              const service = serviceById(rental.serviceId)
              const lastCode = [...rental.messages].reverse().find((message) => message.code)?.code
              return (
                <article key={rental.id} className="history-row">
                  <div className="history-main">
                    <span className="history-flag" aria-hidden="true">
                      {country.flag}
                    </span>
                    <div className="history-id">
                      <strong className="mono">{rental.phoneNumber}</strong>
                      <span>
                        {service.name} · {country.name} · {formatDateTime(rental.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="history-mid">
                    <span className="history-messages">
                      <MessageSquare size={13} />
                      {rental.messages.length}
                    </span>
                    {lastCode ? <span className="history-code mono">{lastCode}</span> : null}
                  </div>

                  <div className="history-right">
                    <span className={`status-pill status-${rental.status}`}>
                      {STATUS_LABEL[rental.status as Exclude<RentalStatus, 'active'>]}
                    </span>
                    <CopyButton
                      value={rental.phoneNumber}
                      onCopy={app.copy}
                      label="Copy number"
                      compact
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setDetail(rental)}
                      aria-label={`View messages for ${rental.phoneNumber}`}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-danger"
                      onClick={() => app.removeRental(rental.id)}
                      aria-label={`Delete ${rental.phoneNumber}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={<HistoryIcon size={26} />}
            title={entries.length === 0 ? 'No history yet' : 'No matching entries'}
            body={
              entries.length === 0
                ? 'Released and expired numbers are archived here automatically.'
                : 'Try a different search term or filter.'
            }
            action={
              entries.length === 0 ? (
                <button type="button" className="button primary" onClick={() => app.setView('numbers')}>
                  Get your first number
                </button>
              ) : undefined
            }
          />
        )}
      </section>

      <Modal
        open={detail !== null}
        title={detail?.phoneNumber ?? 'Number details'}
        description={
          detail
            ? `${serviceById(detail.serviceId).name} · ${countryByCode(detail.country).name} · opened ${formatDateTime(detail.createdAt)}`
            : undefined
        }
        onClose={() => setDetail(null)}
        footer={
          detail ? (
            <>
              <button type="button" className="button ghost" onClick={() => setDetail(null)}>
                Close
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  app.removeRental(detail.id)
                  setDetail(null)
                }}
              >
                <Trash2 size={14} /> Delete entry
              </button>
            </>
          ) : undefined
        }
      >
        {detail ? (
          detail.messages.length > 0 ? (
            <div className="detail-messages">
              {[...detail.messages].reverse().map((message) => (
                <MessageCard key={message.id} message={message} onCopy={app.copy} />
              ))}
            </div>
          ) : (
            <p className="detail-empty">
              <ServiceMark service={serviceById(detail.serviceId)} size="sm" />
              No messages were received on this number.
            </p>
          )
        ) : null}
      </Modal>
    </div>
  )
}
