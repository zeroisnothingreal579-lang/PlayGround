import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  Globe,
  Loader2,
  Lock,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import {
  COUNTRIES,
  DURATIONS,
  SERVICES,
  countryByCode,
  durationById,
  priceFor,
  serviceById,
} from '../data'
import type { Country, CountryCode } from '../types'
import type { AppController } from '../hooks/useApp'
import { formatMoney } from '../lib/format'
import { ServiceMark } from './ui'

const AVAILABILITY_LABEL: Record<Country['availability'], string> = {
  high: 'Good stock',
  medium: 'Limited',
  low: 'Rare',
}

export function Market({ app }: { app: AppController }) {
  const [query, setQuery] = useState('')
  const { selectedCountry, selectedService, selectedDuration, settings } = app.state
  const country = countryByCode(selectedCountry)
  const service = serviceById(selectedService)
  const duration = durationById(selectedDuration)
  const price = priceFor(selectedCountry, selectedDuration)
  const hasActive = app.activeRental !== null
  const needsSetup = settings.provider === 'custom' && settings.baseUrl.trim().length === 0

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return COUNTRIES
    return COUNTRIES.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term) ||
        item.dial.includes(term),
    )
  }, [query])

  const selectCountry = (code: CountryCode) => app.selectCountry(code)

  return (
    <div className="page market-page">
      <header className="page-head market-head">
        <div className="eyebrow">
          <span className="pulse-dot" />
          Private by default
        </div>
        <h1>
          Your number.
          <br />
          <span className="accent">Not your identity.</span>
        </h1>
        <p className="lede">
          Claim a temporary line, receive the code you need, then let it disappear.
          No account, no long-term footprint.
        </p>
        <div className="hero-chips">
          <span>
            <Globe size={13} /> {COUNTRIES.length} countries
          </span>
          <span>
            <Radio size={13} /> Live delivery
          </span>
          <span>
            <Lock size={13} /> Auto-expiry
          </span>
        </div>
      </header>

      <div className="market-grid">
        <section className="panel config-panel">
          <div className="config-step">
            <div className="step-head">
              <span className="step-num">01</span>
              <div>
                <h2>Choose a country</h2>
                <p>Local numbers, wherever you need them.</p>
              </div>
              <span className="step-meta">{filtered.length} shown</span>
            </div>

            <label className="search-field">
              <Search size={16} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search countries or dial codes"
                aria-label="Search countries"
              />
            </label>

            <div className="country-grid" role="radiogroup" aria-label="Country">
              {filtered.map((item) => {
                const active = item.code === selectedCountry
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`country-option ${active ? 'is-selected' : ''}`}
                    onClick={() => selectCountry(item.code)}
                  >
                    <span className="country-flag" aria-hidden="true">
                      {item.flag}
                    </span>
                    <span className="country-text">
                      <strong>{item.name}</strong>
                      <small>
                        <span className={`stock stock-${item.availability}`} />
                        {item.dial} · {AVAILABILITY_LABEL[item.availability]}
                      </small>
                    </span>
                    <span className="country-price">{formatMoney(item.price)}</span>
                    {active ? (
                      <span className="option-check">
                        <Check size={12} />
                      </span>
                    ) : null}
                  </button>
                )
              })}
              {filtered.length === 0 ? (
                <p className="country-empty">No countries match “{query}”.</p>
              ) : null}
            </div>
          </div>

          <div className="config-step">
            <div className="step-head">
              <span className="step-num">02</span>
              <div>
                <h2>Choose a service</h2>
                <p>We tailor the code detection to it.</p>
              </div>
            </div>
            <div className="service-grid" role="radiogroup" aria-label="Service">
              {SERVICES.map((item) => {
                const active = item.id === selectedService
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`service-option ${active ? 'is-selected' : ''}`}
                    onClick={() => app.selectService(item.id)}
                  >
                    <ServiceMark service={item} size="sm" />
                    <span>{item.name}</span>
                    {active ? <Check size={13} className="service-check" /> : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="config-step">
            <div className="step-head">
              <span className="step-num">03</span>
              <div>
                <h2>Choose how long</h2>
                <p>Every line releases itself when time is up.</p>
              </div>
            </div>
            <div className="duration-row" role="radiogroup" aria-label="Duration">
              {DURATIONS.map((item) => {
                const active = item.id === selectedDuration
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`duration-option ${active ? 'is-selected' : ''}`}
                    onClick={() => app.selectDuration(item.id)}
                  >
                    <span>{item.label}</span>
                    <strong>{formatMoney(priceFor(selectedCountry, item.id))}</strong>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <aside className="order-card">
          <div className="order-glow" aria-hidden="true" />
          <div className="order-top">
            <span className="order-eyebrow">Your number</span>
            <span className={`mini-badge ${settings.provider === 'demo' ? 'mini-badge-demo' : 'mini-badge-live'}`}>
              {settings.provider === 'demo' ? 'Demo' : 'Live'}
            </span>
          </div>

          <div className="order-preview">
            <span className="preview-signal" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <div className="preview-number">{country.dial} ••• ••• ••••</div>
            <span className="preview-region">
              {country.flag} {country.name}
            </span>
          </div>

          <div className="order-lines">
            <div>
              <span>Service</span>
              <strong className="order-service">
                <ServiceMark service={service} size="sm" />
                {service.name}
              </strong>
            </div>
            <div>
              <span>Lifetime</span>
              <strong>{duration.label}</strong>
            </div>
            <div>
              <span>Detection</span>
              <strong className="order-detect">
                <Sparkles size={13} /> Automatic
              </strong>
            </div>
          </div>

          <div className="order-total">
            <span>Total</span>
            <div>
              <strong>{formatMoney(price)}</strong>
              <small>{settings.provider === 'demo' ? 'no charge in demo' : 'provider rate'}</small>
            </div>
          </div>

          <button
            type="button"
            className="cta"
            onClick={() => void app.acquire()}
            disabled={app.busy}
          >
            {app.busy ? (
              <>
                <Loader2 size={17} className="spin" /> Getting your number
              </>
            ) : hasActive ? (
              <>
                Open active number <ArrowRight size={17} />
              </>
            ) : (
              <>
                Get this number <ArrowRight size={17} />
              </>
            )}
          </button>

          <p className="order-hint">
            {hasActive
              ? 'A line is already live. Release it to pick a new one.'
              : needsSetup
                ? 'Add a provider base URL in Settings before claiming a real number.'
                : settings.provider === 'demo'
                  ? 'Demo lines are simulated locally. Add a provider in Settings for real SMS.'
                  : 'Your provider will be billed directly for this number.'}
          </p>

          <ul className="order-perks">
            <li>
              <ShieldCheck size={14} /> Expires automatically
            </li>
            <li>
              <Zap size={14} /> Codes detected instantly
            </li>
            <li>
              <Lock size={14} /> Nothing tied to your identity
            </li>
          </ul>
        </aside>
      </div>

      <div className="mobile-buybar">
        <div className="mobile-buybar-info">
          <span>
            {country.flag} {country.name} · {duration.label}
          </span>
          <strong>{formatMoney(price)}</strong>
        </div>
        <button
          type="button"
          className="cta"
          onClick={() => void app.acquire()}
          disabled={app.busy}
        >
          {app.busy ? <Loader2 size={16} className="spin" /> : null}
          {hasActive ? 'Open number' : 'Get number'}
          {app.busy ? null : <ArrowRight size={16} />}
        </button>
      </div>

      <footer className="market-footer">
        <span>
          <ShieldCheck size={14} /> Hush never asks for your real number.
        </span>
        <span>Use temporary numbers only where the service allows it.</span>
      </footer>
    </div>
  )
}
