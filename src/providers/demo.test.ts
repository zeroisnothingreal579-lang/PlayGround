import { describe, expect, it } from 'vitest'
import { demoProvider } from './demo'
import { extractCode } from '../lib/otp'
import type { Rental } from '../types'

async function claim(serviceId = 'whatsapp'): Promise<Rental> {
  return demoProvider.acquire({ country: 'US', serviceId, duration: '10m' })
}

describe('demoProvider', () => {
  it('starts with an empty inbox', async () => {
    const rental = await claim()
    const synced = await demoProvider.sync(rental, rental.createdAt + 1000)
    expect(synced.messages).toHaveLength(0)
    expect(synced.status).toBe('active')
  })

  it('delivers a message with a detectable code', async () => {
    const rental = await claim()
    const synced = await demoProvider.sync(rental, rental.createdAt + 11_000)
    expect(synced.messages).toHaveLength(1)
    const [message] = synced.messages
    expect(message.code).toBeTruthy()
    expect(message.body).toContain(message.code as string)
    expect(extractCode(message.body)).toBe(message.code)
  })

  it('delivers a follow-up message', async () => {
    const rental = await claim()
    const synced = await demoProvider.sync(rental, rental.createdAt + 100_000)
    expect(synced.messages).toHaveLength(2)
  })

  it('expires the rental when the timer runs out', async () => {
    const rental = await claim()
    const synced = await demoProvider.sync(rental, rental.expiresAt + 1)
    expect(synced.status).toBe('expired')
  })

  it('produces alphanumeric Steam Guard codes', async () => {
    const rental = await claim('steam')
    const synced = await demoProvider.sync(rental, rental.createdAt + 11_000)
    const [message] = synced.messages
    expect(message.code).toMatch(/^[A-Z0-9]{6}$/)
  })

  it('uses a fictional US number range', async () => {
    const rental = await claim()
    expect(rental.phoneNumber).toMatch(/^\+1 \(\d{3}\) 555-01\d{2}$/)
  })
})
