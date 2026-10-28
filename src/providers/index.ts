import { createCustomProvider } from './custom'
import { demoProvider } from './demo'
import type { Provider, Settings } from '../types'

export { ProviderError, testCustomConnection } from './custom'
export { demoProvider } from './demo'

export function createProvider(settings: Settings): Provider {
  return settings.provider === 'custom' ? createCustomProvider(settings) : demoProvider
}
