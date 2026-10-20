import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

export interface DeviceProfile {
  id: string
  name: string
  resolution: string
  width: number
  height: number
  density: number
  ramMb: number
  vcpu: number
}

export const PROFILES: DeviceProfile[] = [
  { id: 'pixel_5', name: 'Pixel 5', resolution: '1080 × 2340', width: 1080, height: 2340, density: 440, ramMb: 3072, vcpu: 2 },
  { id: 'pixel_6', name: 'Pixel 6', resolution: '1080 × 2400', width: 1080, height: 2400, density: 420, ramMb: 4096, vcpu: 2 },
  { id: 'pixel_7', name: 'Pixel 7 Pro', resolution: '1080 × 2400', width: 1080, height: 2400, density: 420, ramMb: 6144, vcpu: 4 },
  { id: 'tablet_11', name: 'Tablet 11"', resolution: '1600 × 2560', width: 1600, height: 2560, density: 320, ramMb: 6144, vcpu: 4 },
]

export const STORAGE_OPTIONS = [16, 32, 64, 128]

export function profileById(id: string): DeviceProfile {
  return PROFILES.find((profile) => profile.id === id) || PROFILES[1]
}

export function androidHomePaths() {
  const home = config.androidHome
  if (!home) return null
  return {
    home,
    adb: path.join(home, 'platform-tools', 'adb'),
    emulator: path.join(home, 'emulator', 'emulator'),
    avdmanager: path.join(home, 'cmdline-tools', 'latest', 'bin', 'avdmanager'),
    sdkmanager: path.join(home, 'cmdline-tools', 'latest', 'bin', 'sdkmanager'),
  }
}

export function sdkAvailable() {
  const paths = androidHomePaths()
  if (!paths) return false
  return fs.existsSync(paths.adb) && fs.existsSync(paths.emulator) && fs.existsSync(paths.avdmanager)
}

export function systemImageAvailable() {
  const home = config.androidHome
  if (!home) return false
  const relative = config.avdImage.split(';')
  if (relative.length < 4) return false
  const imagePath = path.join(home, 'system-images', relative[1], relative[2], relative[3])
  return fs.existsSync(imagePath)
}

export function catalogFor(hasGms: boolean) {
  return {
    versions: hasGms
      ? [{ id: 'android-15-gms', label: 'Android 15 · Google Play', apiLevel: 35, gms: true }]
      : [{ id: 'android-15-aosp', label: 'Android 15 · AOSP', apiLevel: 35, gms: false }],
    profiles: PROFILES,
    regions: [{ id: 'local', label: 'Local runtime · low latency', available: true }],
    gms: {
      available: hasGms,
      reason: hasGms
        ? 'Official Google Play system image detected. Play Store, Google Play Services and Google sign-in are available on the device.'
        : 'No Google Play system image is installed on this node. AOSP builds do not include Play Store or Play Services.',
    },
    storageOptions: STORAGE_OPTIONS,
  }
}
