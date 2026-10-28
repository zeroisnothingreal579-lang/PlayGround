import { describe, expect, it } from 'vitest'
import { extractCode } from './otp'

describe('extractCode', () => {
  it('finds a plain code after a keyword', () => {
    expect(extractCode('Your WhatsApp code is 482913. Do not share it.')).toBe('482913')
  })

  it('joins codes split by a dash', () => {
    expect(extractCode('Your verification code is 482-193')).toBe('482193')
  })

  it('strips the Google confirmation prefix', () => {
    expect(extractCode('G-482913 is your Google verification code.')).toBe('482913')
  })

  it('finds a code before the keyword', () => {
    expect(extractCode('918273 is your Uber code')).toBe('918273')
  })

  it('keeps alphanumeric codes', () => {
    expect(extractCode('Steam Guard code: K7F2Q9')).toBe('K7F2Q9')
  })

  it('ignores a phone number when a code is present', () => {
    expect(
      extractCode('Your code is 482913. Call +1 415 555 0134 for help.'),
    ).toBe('482913')
  })

  it('ignores marketing copy without a code', () => {
    expect(extractCode('Your ride is on the way. Reply STOP to opt out.')).toBeNull()
  })

  it('returns null for empty messages', () => {
    expect(extractCode('')).toBeNull()
  })

  it('handles codes with spaces', () => {
    expect(extractCode('Use 482 193 to confirm your login.')).toBe('482193')
  })
})
