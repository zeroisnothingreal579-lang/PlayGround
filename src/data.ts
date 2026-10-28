import type { Country, CountryCode, DurationId, DurationOption, Service } from './types'

export const COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸', region: 'North America', price: 0.45, availability: 'high' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧', region: 'Europe', price: 0.55, availability: 'high' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦', region: 'North America', price: 0.5, availability: 'high' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪', region: 'Europe', price: 0.6, availability: 'medium' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷', region: 'Europe', price: 0.62, availability: 'medium' },
  { code: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱', region: 'Europe', price: 0.58, availability: 'high' },
  { code: 'SE', name: 'Sweden', dial: '+46', flag: '🇸🇪', region: 'Europe', price: 0.65, availability: 'low' },
  { code: 'PL', name: 'Poland', dial: '+48', flag: '🇵🇱', region: 'Europe', price: 0.48, availability: 'high' },
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸', region: 'Europe', price: 0.52, availability: 'medium' },
  { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷', region: 'South America', price: 0.4, availability: 'high' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳', region: 'Asia', price: 0.35, availability: 'medium' },
  { code: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩', region: 'Asia', price: 0.38, availability: 'medium' },
]

export const SERVICES: Service[] = [
  { id: 'whatsapp', name: 'WhatsApp', short: 'WA', color: '#25d366' },
  { id: 'telegram', name: 'Telegram', short: 'TG', color: '#2aabee' },
  { id: 'google', name: 'Google', short: 'G', color: '#4285f4' },
  { id: 'discord', name: 'Discord', short: 'D', color: '#5865f2' },
  { id: 'instagram', name: 'Instagram', short: 'IG', color: '#e1306c' },
  { id: 'tiktok', name: 'TikTok', short: 'TT', color: '#f2f2f2' },
  { id: 'x', name: 'X', short: 'X', color: '#e7e9ea' },
  { id: 'signal', name: 'Signal', short: 'S', color: '#3a76f0' },
  { id: 'uber', name: 'Uber', short: 'U', color: '#e2e2e2' },
  { id: 'amazon', name: 'Amazon', short: 'A', color: '#ff9900' },
  { id: 'steam', name: 'Steam', short: 'ST', color: '#66c0f4' },
  { id: 'other', name: 'Something else', short: '+', color: '#7cf2c0' },
]

export const DURATIONS: DurationOption[] = [
  { id: '10m', label: '10 minutes', minutes: 10, multiplier: 1 },
  { id: '1h', label: '1 hour', minutes: 60, multiplier: 1.8 },
  { id: '1d', label: '24 hours', minutes: 1440, multiplier: 3.5 },
]

export function countryByCode(code: CountryCode): Country {
  return COUNTRIES.find((country) => country.code === code) ?? COUNTRIES[0]
}

export function serviceById(id: string): Service {
  return SERVICES.find((service) => service.id === id) ?? SERVICES[SERVICES.length - 1]
}

export function durationById(id: DurationId): DurationOption {
  return DURATIONS.find((duration) => duration.id === id) ?? DURATIONS[0]
}

export function priceFor(country: CountryCode, duration: DurationId): number {
  const base = countryByCode(country).price
  const multiplier = durationById(duration).multiplier
  return Math.round(base * multiplier * 100) / 100
}
