import { db } from './db.js'
import { hashPassword, id, nowIso, currentPeriod } from './util.js'

const PLANS = [
  {
    id: 'free', name: 'Free trial', tagline: 'Try a real cloud phone', priceCents: 0,
    maxDevices: 1, maxConcurrent: 1, storageMb: 5120, vcpu: 2, ramMb: 4096, monthlyHours: 10,
    features: ['1 cloud phone', '10 hours / month', '5 GB storage', 'AOSP Android 15', 'File transfer'],
  },
  {
    id: 'basic', name: 'Basic', tagline: 'For personal projects', priceCents: 1200,
    maxDevices: 2, maxConcurrent: 1, storageMb: 25600, vcpu: 4, ramMb: 6144, monthlyHours: 60,
    features: ['2 cloud phones', '60 hours / month', '25 GB storage', 'Screenshot + clipboard', 'APK sideloading'],
  },
  {
    id: 'pro', name: 'Pro', tagline: 'For power users & QA', priceCents: 2900,
    maxDevices: 5, maxConcurrent: 2, storageMb: 102400, vcpu: 8, ramMb: 12288, monthlyHours: 200,
    features: ['5 cloud phones', '200 hours / month', '100 GB storage', '2 concurrent sessions', 'Priority streaming nodes'],
  },
  {
    id: 'business', name: 'Business', tagline: 'For teams and fleets', priceCents: 7900,
    maxDevices: 20, maxConcurrent: 6, storageMb: 512000, vcpu: 16, ramMb: 32768, monthlyHours: 600,
    features: ['20 cloud phones', '600 hours / month', '500 GB storage', '6 concurrent sessions', 'Audit log export', 'Priority support'],
  },
]

async function seedPlans() {
  for (const [index, plan] of PLANS.entries()) {
    await db.run(
      `INSERT INTO plans (id, name, tagline, price_cents, max_devices, max_concurrent, storage_mb, vcpu, ram_mb, monthly_hours, features, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = ?, tagline = ?, price_cents = ?, max_devices = ?, max_concurrent = ?,
       storage_mb = ?, vcpu = ?, ram_mb = ?, monthly_hours = ?, features = ?, sort_order = ?`,
      [
        plan.id, plan.name, plan.tagline, plan.priceCents, plan.maxDevices, plan.maxConcurrent,
        plan.storageMb, plan.vcpu, plan.ramMb, plan.monthlyHours, JSON.stringify(plan.features), index,
        plan.name, plan.tagline, plan.priceCents, plan.maxDevices, plan.maxConcurrent,
        plan.storageMb, plan.vcpu, plan.ramMb, plan.monthlyHours, JSON.stringify(plan.features), index,
      ],
    )
  }
}

async function upsertUser(user: { id: string; email: string; name: string; password: string; role: 'user' | 'admin'; plan: string }) {
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [user.email])
  if (existing) return false
  const timestamp = nowIso()
  await db.run(
    `INSERT INTO users (id, email, name, password_hash, role, plan_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [user.id, user.email, user.name, hashPassword(user.password), user.role, user.plan, timestamp, timestamp],
  )
  return true
}

async function seedDevices(userId: string) {
  const existing = await db.get('SELECT id FROM devices WHERE user_id = ? LIMIT 1', [userId])
  if (existing) return
  const timestamp = nowIso()
  const devices = [
    {
      id: 'd_aurora_live', name: 'Aurora One', android: '15', api: 35, profile: 'pixel_6', profileName: 'Pixel 6',
      resolution: '1080 × 2400', ram: 4096, vcpu: 2, storage: 32, region: 'local', gms: 0,
      provider: 'emulator', demo: 0, avd: 'clouddroid_demo',
    },
    {
      id: 'd_nebula_demo', name: 'Nebula Mini', android: '15', api: 35, profile: 'pixel_5', profileName: 'Pixel 5',
      resolution: '1080 × 2340', ram: 3072, vcpu: 2, storage: 24, region: 'local', gms: 0,
      provider: 'demo', demo: 1, avd: null,
    },
    {
      id: 'd_orbit_demo', name: 'Orbit Pro', android: '14', api: 34, profile: 'pixel_7', profileName: 'Pixel 7',
      resolution: '1080 × 2400', ram: 6144, vcpu: 4, storage: 64, region: 'local', gms: 0,
      provider: 'demo', demo: 1, avd: null,
    },
  ]
  for (const device of devices) {
    await db.run(
      `INSERT INTO devices (id, user_id, name, android_version, api_level, profile_id, profile_name, resolution,
        ram_mb, vcpu, storage_gb, region, gms, status, provider, is_demo, avd_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, ?, ?, ?, ?)`,
      [
        device.id, userId, device.name, device.android, device.api, device.profile, device.profileName,
        device.resolution, device.ram, device.vcpu, device.storage, device.region, device.gms,
        device.provider, device.demo, device.avd, timestamp, timestamp,
      ],
    )
  }

  const events = [
    ['account.created', 'Welcome to CloudDroid. Your workspace is ready.', 'd_aurora_live', 'Aurora One', 0],
    ['phone.provisioned', 'Aurora One was attached to the local Android runtime.', 'd_aurora_live', 'Aurora One', 0],
    ['phone.created', 'Demo device Nebula Mini added to the workspace.', 'd_nebula_demo', 'Nebula Mini', 1],
    ['phone.created', 'Demo device Orbit Pro added to the workspace.', 'd_orbit_demo', 'Orbit Pro', 1],
  ]
  for (const [action, detail, deviceId, deviceName, demo] of events) {
    await db.run(
      'INSERT INTO activity (id, user_id, device_id, device_name, action, detail, demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id('ev'), userId, deviceId, deviceName, action, detail, demo, timestamp],
    )
  }

  const period = currentPeriod()
  await db.run(
    `INSERT INTO usage (id, user_id, device_id, period, minutes, storage_mb, updated_at)
     VALUES (?, ?, NULL, ?, 0, 0, ?)`,
    [id('use'), userId, period, timestamp],
  )
  await db.run(
    `INSERT INTO invoices (id, user_id, number, amount_cents, status, period_start, period_end, created_at, demo)
     VALUES (?, ?, ?, 0, 'preview', ?, ?, ?, 1)`,
    [id('inv'), userId, 'CD-DEMO-0001', `${period}-01`, `${period}-28`, timestamp],
  )
}

export async function seed() {
  await seedPlans()
  if (!(process.env.SEED_DEMO === undefined ? true : ['1', 'true', 'yes'].includes((process.env.SEED_DEMO || '').toLowerCase()))) return

  const createdDemo = await upsertUser({
    id: 'u_demo', email: 'demo@clouddroid.app', name: 'Alex Rivera', password: 'CloudDroid123!', role: 'user', plan: 'pro',
  })
  await upsertUser({
    id: 'u_admin', email: 'admin@clouddroid.app', name: 'CloudDroid Admin', password: 'CloudDroid123!', role: 'admin', plan: 'business',
  })
  if (createdDemo) await seedDevices('u_demo')
  if (createdDemo) console.log('[seed] demo workspace created (demo@clouddroid.app / CloudDroid123!)')
}
