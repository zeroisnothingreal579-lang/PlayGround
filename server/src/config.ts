import 'dotenv/config'
import path from 'node:path'

function bool(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function num(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const provider = (process.env.CLOUDDROID_PROVIDER || 'auto') as 'auto' | 'demo' | 'external' | 'emulator'

export const config = {
  port: num(process.env.PORT, 3000),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${num(process.env.PORT, 3000)}`,
  jwtSecret: process.env.JWT_SECRET || 'clouddroid-development-secret-change-before-production',
  jwtSecretIsDefault: !process.env.JWT_SECRET,
  cookieSecure: process.env.COOKIE_SECURE === 'auto' ? 'auto' : bool(process.env.COOKIE_SECURE),
  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: path.resolve(process.env.SQLITE_PATH || 'var/clouddroid.db'),
  redisUrl: process.env.REDIS_URL || '',
  provider,
  androidHome: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '',
  androidSerial: process.env.ANDROID_SERIAL || '',
  // Official Google Play image gives a fully functional Android with Play Store
  // and Google Play Services. Set ANDROID_AVD_IMAGE to a `default` image for AOSP.
  avdImage: process.env.ANDROID_AVD_IMAGE || 'system-images;android-35;google_apis_playstore;x86_64',
  avdName: process.env.ANDROID_AVD_NAME || 'clouddroid_play',
  avdDevice: process.env.ANDROID_AVD_DEVICE || 'pixel_6',
  bootTimeoutMs: num(process.env.ANDROID_BOOT_TIMEOUT_MS, 300_000),
  maxRunning: num(process.env.ANDROID_MAX_RUNNING, 2),
  gmsAvailable: bool(process.env.GMS_AVAILABLE),
  autostartExternal: bool(process.env.AUTOSTART_EXTERNAL, true),
  storageDir: path.resolve(process.env.STORAGE_DIR || 'var/storage'),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 200),
  seedDemo: bool(process.env.SEED_DEMO, true),
  // Allow the app to be embedded (e.g. in the OpenCode preview iframe). When
  // unset it stays permissive outside production and locked to same-origin in
  // production. Override with ALLOW_IFRAME=0/1.
  allowIframe: process.env.ALLOW_IFRAME === undefined
    ? process.env.NODE_ENV !== 'production'
    : bool(process.env.ALLOW_IFRAME),
  rootDir: process.env.CLOUDDROID_ROOT || process.cwd(),
  isProduction: process.env.NODE_ENV === 'production',
}

export const DATA_PATHS = {
  storage: config.storageDir,
  logs: path.resolve('var/logs'),
  run: path.resolve('var/run'),
  uploads: path.resolve('var/uploads'),
}
