import type { DeviceProvider, DeviceRow, ProviderStartResult } from './types.js'

export class DemoProvider implements DeviceProvider {
  kind = 'demo' as const

  async available() {
    return true
  }

  async start(_device: DeviceRow): Promise<ProviderStartResult> {
    await new Promise((resolve) => setTimeout(resolve, 600))
    return { serial: '', detail: 'Demo state only — no Android runtime is attached' }
  }

  async stop() {
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  async status() {
    return { running: false, serial: null }
  }

  async remove() {
    /* demo devices have no runtime to clean up */
  }
}
