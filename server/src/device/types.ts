export interface DeviceRow {
  id: string
  user_id: string
  name: string
  android_version: string
  api_level: number
  profile_id: string
  profile_name: string
  resolution: string
  ram_mb: number
  vcpu: number
  storage_gb: number
  region: string
  gms: number
  status: string
  provider: string
  provider_ref: string | null
  avd_name: string | null
  is_demo: number
  error_message: string | null
  created_at: string
  updated_at: string
  last_started_at: string | null
}

export interface ProviderStartResult {
  serial: string
  detail: string
}

export interface DeviceProvider {
  kind: 'emulator' | 'external' | 'demo'
  available(): Promise<boolean>
  start(device: DeviceRow): Promise<ProviderStartResult>
  stop(device: DeviceRow): Promise<void>
  status(device: DeviceRow): Promise<{ running: boolean; serial: string | null }>
  remove(device: DeviceRow): Promise<void>
}
