export type DeviceStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error'
export type ProviderKind = 'demo' | 'external' | 'emulator'
export type RuntimeMode = 'live' | 'demo' | 'degraded'

export interface User {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  planId: string
  createdAt: string
}

export interface Plan {
  id: string
  name: string
  tagline: string
  priceCents: number
  maxDevices: number
  maxConcurrent: number
  storageMb: number
  vcpu: number
  ramMb: number
  monthlyHours: number
  features: string[]
  highlighted?: boolean
}

export interface Device {
  id: string
  userId: string
  name: string
  androidVersion: string
  apiLevel: number
  profileId: string
  profileName: string
  resolution: string
  ramMb: number
  vcpu: number
  storageGb: number
  region: string
  gms: boolean
  status: DeviceStatus
  provider: ProviderKind
  isDemo: boolean
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  lastStartedAt: string | null
  streamCapable: boolean
}

export interface DeviceFile {
  id: string
  deviceId: string
  name: string
  size: number
  mime: string
  kind: 'apk' | 'image' | 'video' | 'document' | 'archive' | 'other'
  createdAt: string
  pushed: boolean
}

export interface ActivityEvent {
  id: string
  action: string
  detail: string
  deviceId: string | null
  deviceName: string | null
  createdAt: string
  demo: boolean
}

export interface UsageSummary {
  period: string
  minutes: number
  storageMb: number
  deviceCount: number
  runningCount: number
  limits: {
    maxDevices: number
    maxConcurrent: number
    storageMb: number
    monthlyHours: number
    vcpu: number
    ramMb: number
  }
}

export interface RuntimeInfo {
  mode: RuntimeMode
  provider: ProviderKind
  label: string
  detail: string
  androidHome: string | null
  adbAvailable: boolean
  externalSerial: string | null
  gmsAvailable: boolean
  bootedDevices: number
  streamingTransport: 'websocket-frames' | 'webrtc' | 'none'
  demoSeed: boolean
  maxRunning: number
  serverTime: string
}

export interface SessionInfo {
  id: string
  createdAt: string
  expiresAt: string
  userAgent: string | null
  ip: string | null
  current: boolean
}

export interface AdminOverview {
  users: number
  devices: number
  running: number
  demoDevices: number
  storageMb: number
  runtime: RuntimeInfo
  recentAudit: { id: string; action: string; target: string | null; actor: string | null; createdAt: string }[]
}

export interface Catalog {
  runtime: RuntimeInfo
  versions: { id: string; label: string; apiLevel: number; gms: boolean }[]
  profiles: { id: string; name: string; resolution: string; width: number; height: number; density: number; ramMb: number; vcpu: number }[]
  regions: { id: string; label: string; available: boolean }[]
  gms: { available: boolean; reason: string }
  storageOptions: number[]
  plan: Plan
  provisionable: boolean
}

export interface StreamTicket {
  ticket: string
  wsPath: string
  expiresAt: string
  transport: string
}

export interface AuthResponse {
  user: User
  plan: Plan
}
