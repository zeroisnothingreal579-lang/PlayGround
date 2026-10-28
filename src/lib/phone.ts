import type { CountryCode } from '../types'
import { hashString, mulberry32 } from './hash'

const US_AREA = ['415', '212', '305', '650', '206', '512', '617', '702', '404', '312']
const CA_AREA = ['416', '604', '514', '403', '902', '613', '780']

export function demoPhoneNumber(country: CountryCode, seed: string): string {
  const random = mulberry32(hashString(seed))
  const digits = (length: number) =>
    Array.from({ length }, () => Math.floor(random() * 10)).join('')
  const pick = <T,>(values: T[]): T => values[Math.floor(random() * values.length)]

  switch (country) {
    case 'US':
      return `+1 (${pick(US_AREA)}) 555-01${digits(2)}`
    case 'CA':
      return `+1 (${pick(CA_AREA)}) 555-01${digits(2)}`
    case 'GB':
      return `+44 7700 900${digits(3)}`
    case 'DE':
      return `+49 1512 ${digits(7)}`
    case 'FR':
      return `+33 6 ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}`
    case 'NL':
      return `+31 6 ${digits(4)} ${digits(4)}`
    case 'SE':
      return `+46 70 ${digits(3)} ${digits(2)} ${digits(2)}`
    case 'PL':
      return `+48 5${digits(2)} ${digits(3)} ${digits(3)}`
    case 'ES':
      return `+34 6${digits(2)} ${digits(3)} ${digits(3)}`
    case 'BR':
      return `+55 (${digits(2)}) 9${digits(4)}-${digits(4)}`
    case 'IN':
      return `+91 9${digits(4)} ${digits(5)}`
    case 'ID':
      return `+62 812-${digits(4)}-${digits(4)}`
    default:
      return `+1 (415) 555-01${digits(2)}`
  }
}

