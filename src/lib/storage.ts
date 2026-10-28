import { COUNTRIES, DURATIONS, SERVICES } from '../data'
import type { AppState, CountryCode, DurationId, ProviderMode, Rental, Settings } from '../types'

const STORAGE_KEY = 'hush.state.v1'

export function defaultSettings(): Settings {
  return {
    provider: 'demo',
    baseUrl: '',
    token: '',
    notifications: false,
    defaultDuration: '10m',
  }
}

export function defaultState(): AppState {
  return {
    version: 1,
    rentals: [],
    settings: defaultSettings(),
    selectedCountry: 'US',
    selectedService: 'whatsapp',
    selectedDuration: '10m',
  }
}

function asCountry(value: unknown): CountryCode {
  return COUNTRIES.some((country) => country.code === value) ? (value as CountryCode) : 'US'
}

function asService(value: unknown): string {
  return typeof value === 'string' && SERVICES.some((service) => service.id === value)
    ? value
    : 'whatsapp'
}

function asDuration(value: unknown): DurationId {
  return DURATIONS.some((duration) => duration.id === value) ? (value as DurationId) : '10m'
}

function asProvider(value: unknown): ProviderMode {
  return value === 'custom' ? 'custom' : 'demo'
}

function asRental(value: unknown): Rental | null {
  if (!value || typeof value !== 'object') return null
  const rental = value as Partial<Rental>
  if (typeof rental.id !== 'string' || typeof rental.phoneNumber !== 'string') return null
  if (typeof rental.createdAt !== 'number' || typeof rental.expiresAt !== 'number') return null
  return {
    id: rental.id,
    providerId: typeof rental.providerId === 'string' ? rental.providerId : 'demo',
    country: asCountry(rental.country),
    serviceId: asService(rental.serviceId),
    phoneNumber: rental.phoneNumber,
    createdAt: rental.createdAt,
    expiresAt: rental.expiresAt,
    duration: asDuration(rental.duration),
    cost: typeof rental.cost === 'number' ? rental.cost : 0,
    status:
      rental.status === 'expired' || rental.status === 'released' ? rental.status : 'active',
    messages: Array.isArray(rental.messages)
      ? rental.messages.filter(
          (message) =>
            message &&
            typeof message.id === 'string' &&
            typeof message.body === 'string' &&
            typeof message.receivedAt === 'number',
        )
      : [],
  }
}

export function loadState(): AppState {
  const base = defaultState()
  if (typeof window === 'undefined') return base
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<AppState>
    const settings = (parsed.settings ?? {}) as Partial<Settings>
    const rentals = Array.isArray(parsed.rentals)
      ? parsed.rentals.map(asRental).filter((rental): rental is Rental => rental !== null)
      : []
    return {
      version: 1,
      rentals: rentals.slice(0, 100),
      settings: {
        provider: asProvider(settings.provider),
        baseUrl: typeof settings.baseUrl === 'string' ? settings.baseUrl : '',
        token: typeof settings.token === 'string' ? settings.token : '',
        notifications: settings.notifications === true,
        defaultDuration: asDuration(settings.defaultDuration ?? base.settings.defaultDuration),
      },
      selectedCountry: asCountry(parsed.selectedCountry),
      selectedService: asService(parsed.selectedService),
      selectedDuration: asDuration(parsed.selectedDuration),
    }
  } catch {
    return base
  }
}

export function saveState(state: AppState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    return
  }
}

export function clearState(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}
