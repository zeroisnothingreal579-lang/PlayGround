import { DURATIONS, priceFor } from '../data'
import { extractCode } from '../lib/otp'
import type { AcquireRequest, Provider, Rental, Settings, SmsMessage } from '../types'

interface CustomSettings {
  baseUrl: string
  token: string
}

interface RawMessage {
  id?: string
  from?: string
  sender?: string
  body?: string
  text?: string
  message?: string
  receivedAt?: number | string
  received_at?: number | string
  timestamp?: number | string
  code?: string
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

function baseFor(settings: CustomSettings): string {
  const base = settings.baseUrl.trim().replace(/\/+$/, '')
  if (!base) throw new ProviderError('Add your provider base URL in Settings first.')
  if (!/^https?:\/\//i.test(base)) {
    throw new ProviderError('The provider URL must start with http:// or https://.')
  }
  return base
}

function headersFor(settings: CustomSettings): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (settings.token.trim()) headers.Authorization = `Bearer ${settings.token.trim()}`
  return headers
}

async function apiRequest<T>(settings: CustomSettings, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseFor(settings)}${path}`, {
    ...init,
    headers: { ...headersFor(settings), ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  }).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ProviderError('The provider took too long to respond.')
    }
    throw new ProviderError('Could not reach the provider. Check the URL and network.')
  })

  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.text()).slice(0, 160)
    } catch {
      detail = ''
    }
    throw new ProviderError(
      detail ? `Provider returned ${response.status}: ${detail}` : `Provider returned ${response.status}.`,
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function timestamp(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

function normalizeMessage(raw: RawMessage, index: number, rentalId: string): SmsMessage | null {
  const body = raw.body ?? raw.text ?? raw.message
  if (typeof body !== 'string' || body.trim().length === 0) return null
  return {
    id: raw.id ?? `${rentalId}:remote:${index}`,
    from: raw.from ?? raw.sender ?? 'Provider',
    body,
    receivedAt: timestamp(raw.receivedAt ?? raw.received_at ?? raw.timestamp, Date.now()),
    code: raw.code ?? extractCode(body),
  }
}

function normalizeRental(payload: unknown, request: AcquireRequest): Rental {
  const root = payload as Record<string, unknown> | null
  const data = (root && typeof root === 'object' && 'data' in root ? root.data : root) as
    | Record<string, unknown>
    | null
  if (!data || typeof data !== 'object') {
    throw new ProviderError('The provider returned an unexpected response.')
  }

  const now = Date.now()
  const phone = data.phoneNumber ?? data.number ?? data.phone
  if (typeof phone !== 'string' || phone.trim().length === 0) {
    throw new ProviderError('The provider response did not include a phone number.')
  }

  const duration = DURATIONS.find((option) => option.id === request.duration) ?? DURATIONS[0]
  return {
    id: typeof data.id === 'string' ? data.id : `remote_${now.toString(36)}`,
    providerId: 'custom',
    country: request.country,
    serviceId: request.serviceId,
    phoneNumber: phone.trim(),
    createdAt: now,
    expiresAt: timestamp(
      (data.expiresAt ?? data.expires_at) as number | string | undefined,
      now + duration.minutes * 60_000,
    ),
    duration: request.duration,
    cost:
      typeof data.cost === 'number' ? data.cost : priceFor(request.country, request.duration),
    status: 'active',
    messages: [],
  }
}

export function createCustomProvider(settings: Settings): Provider {
  return {
    id: 'custom',
    label: 'Custom provider',
    async acquire(request) {
      const payload = await apiRequest<unknown>(settings, '/numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: request.country,
          service: request.serviceId,
          duration: request.duration,
          durationMinutes:
            (DURATIONS.find((option) => option.id === request.duration) ?? DURATIONS[0]).minutes,
        }),
      })
      return normalizeRental(payload, request)
    },
    async sync(rental, now) {
      if (rental.status !== 'active') return rental
      const payload = await apiRequest<unknown>(
        settings,
        `/numbers/${encodeURIComponent(rental.id)}/messages`,
      )
      const root = payload as Record<string, unknown>
      const list = Array.isArray(payload)
        ? (payload as RawMessage[])
        : Array.isArray(root?.messages)
          ? (root.messages as RawMessage[])
          : []
      const incoming = list
        .map((raw, index) => normalizeMessage(raw, index, rental.id))
        .filter((message): message is SmsMessage => message !== null)

      const byId = new Map(rental.messages.map((message) => [message.id, message]))
      for (const message of incoming) byId.set(message.id, message)
      const messages = [...byId.values()].sort((left, right) => left.receivedAt - right.receivedAt)

      const status =
        typeof root?.status === 'string' && root.status === 'expired' ? 'expired' : rental.status
      const expired = status === 'active' && now >= rental.expiresAt
      if (
        messages.length === rental.messages.length &&
        !expired &&
        status === rental.status
      ) {
        return rental
      }
      return { ...rental, messages, status: expired ? 'expired' : status }
    },
    async release(rental) {
      try {
        await apiRequest<unknown>(settings, `/numbers/${encodeURIComponent(rental.id)}`, {
          method: 'DELETE',
        })
      } catch (error) {
        if (error instanceof ProviderError && error.message.includes('404')) return
        throw error
      }
    },
  }
}

export async function testCustomConnection(
  settings: Settings,
): Promise<{ ok: boolean; message: string }> {
  try {
    await apiRequest<unknown>(settings, '/health')
    return { ok: true, message: 'Connected. The provider answered /health.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not reach the provider.',
    }
  }
}
