import { DURATIONS, countryByCode, priceFor, serviceById } from '../data'
import { extractCode } from '../lib/otp'
import { hashString, mulberry32 } from '../lib/hash'
import { demoPhoneNumber } from '../lib/phone'
import type { AcquireRequest, Provider, Rental, SmsMessage } from '../types'

const SCHEDULE = [0, 1]

function offsetFor(rentalId: string, index: number): number {
  const base = index === 0 ? 6_000 : 58_000
  const spread = index === 0 ? 5_000 : 30_000
  return base + (hashString(`${rentalId}:${index}:offset`) % spread)
}

function codeFor(rentalId: string, index: number, serviceId: string): string {
  const random = mulberry32(hashString(`${rentalId}:${index}`))
  if (serviceId === 'steam') {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return Array.from({ length: 6 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
  }
  const first = 1 + Math.floor(random() * 9)
  const rest = Math.floor(random() * 100000)
  return `${first}${String(rest).padStart(5, '0')}`
}

function bodyFor(serviceId: string, code: string, followUp: boolean): string {
  const service = serviceById(serviceId)
  if (followUp) {
    return `Still waiting? ${code} is your ${service.name} code. It expires shortly.`
  }
  switch (serviceId) {
    case 'whatsapp':
      return `Your WhatsApp code is ${code}. Don't share this code with others.`
    case 'telegram':
      return `${code} is your Telegram code. Never share it.`
    case 'google':
      return `G-${code} is your Google verification code.`
    case 'discord':
      return `Your Discord verification code is ${code}. It expires in 10 minutes.`
    case 'instagram':
      return `${code} is your Instagram code. Don't share it.`
    case 'tiktok':
      return `[TikTok] ${code} is your verification code. Valid for 5 minutes.`
    case 'x':
      return `Your X confirmation code is ${code}.`;
    case 'signal':
      return `${code} is your Signal verification code.`
    case 'uber':
      return `Your Uber code is ${code}. Never share it with anyone.`
    case 'amazon':
      return `${code} is your Amazon OTP. Do not share it with anyone.`
    case 'steam':
      return `Steam Guard code: ${code}`
    default:
      return `Your verification code is ${code}. It expires in 10 minutes.`
  }
}

export function demoMessages(rental: Rental, now: number): SmsMessage[] {
  const messages: SmsMessage[] = []
  const service = serviceById(rental.serviceId)
  SCHEDULE.forEach((index) => {
    const receivedAt = rental.createdAt + offsetFor(rental.id, index)
    if (now < receivedAt) return
    const code = codeFor(rental.id, index, rental.serviceId)
    messages.push({
      id: `${rental.id}:${index}`,
      from: service.name,
      body: bodyFor(rental.serviceId, code, index > 0),
      receivedAt,
      code: extractCode(bodyFor(rental.serviceId, code, index > 0)),
    })
  })
  return messages
}

export const demoProvider: Provider = {
  id: 'demo',
  label: 'Hush demo',
  async acquire(request: AcquireRequest): Promise<Rental> {
    const now = Date.now()
    const id = `demo_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    const duration = DURATIONS.find((option) => option.id === request.duration) ?? DURATIONS[0]
    const country = countryByCode(request.country)
    return {
      id,
      providerId: 'demo',
      country: request.country,
      serviceId: request.serviceId,
      phoneNumber: demoPhoneNumber(country.code, id),
      createdAt: now,
      expiresAt: now + duration.minutes * 60_000,
      duration: request.duration,
      cost: priceFor(request.country, request.duration),
      status: 'active',
      messages: [],
    }
  },
  async sync(rental: Rental, now: number): Promise<Rental> {
    if (rental.providerId !== 'demo') return rental
    const messages = demoMessages(rental, now)
    const expired = rental.status === 'active' && now >= rental.expiresAt
    if (messages.length === rental.messages.length && !expired) return rental
    return {
      ...rental,
      messages,
      status: expired ? 'expired' : rental.status,
    }
  },
  async release(): Promise<void> {
    return Promise.resolve()
  },
}
