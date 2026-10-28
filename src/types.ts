export type ViewId = 'numbers' | 'inbox' | 'history' | 'settings'

export type CountryCode =
  | 'US'
  | 'GB'
  | 'CA'
  | 'DE'
  | 'FR'
  | 'NL'
  | 'SE'
  | 'PL'
  | 'ES'
  | 'BR'
  | 'IN'
  | 'ID'

export interface Country {
  code: CountryCode
  name: string
  dial: string
  flag: string
  region: string
  price: number
  availability: 'high' | 'medium' | 'low'
}

export interface Service {
  id: string
  name: string
  short: string
  color: string
}

export type DurationId = '10m' | '1h' | '1d'

export interface DurationOption {
  id: DurationId
  label: string
  minutes: number
  multiplier: number
}

export interface SmsMessage {
  id: string
  from: string
  body: string
  receivedAt: number
  code: string | null
}

export type RentalStatus = 'active' | 'expired' | 'released'

export interface Rental {
  id: string
  providerId: string
  country: CountryCode
  serviceId: string
  phoneNumber: string
  createdAt: number
  expiresAt: number
  duration: DurationId
  cost: number
  status: RentalStatus
  messages: SmsMessage[]
}

export type ProviderMode = 'demo' | 'custom'

export interface Settings {
  provider: ProviderMode
  baseUrl: string
  token: string
  notifications: boolean
  defaultDuration: DurationId
}

export interface AppState {
  version: 1
  rentals: Rental[]
  settings: Settings
  selectedCountry: CountryCode
  selectedService: string
  selectedDuration: DurationId
}

export interface AcquireRequest {
  country: CountryCode
  serviceId: string
  duration: DurationId
}

export interface Provider {
  id: string
  label: string
  acquire(request: AcquireRequest): Promise<Rental>
  sync(rental: Rental, now: number): Promise<Rental>
  release(rental: Rental): Promise<void>
}
