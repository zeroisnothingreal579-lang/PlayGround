import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';
import {
  BASE_URL,
  REGION,
  PROFILE,
  HEALTH_PATH,
  REDIRECT_PATH,
  STATS_PATH,
  CREATE_PATH,
  CREATE_CODE_PATH,
  SETUP_LINKS,
  THINK_TIME_MS,
  STATS_PCT,
  CREATE_PCT,
  MAX_FAIL_RATE,
  P95_MS,
  P99_MS,
  REDIRECT_P95_MS,
  HTTP_TIMEOUT,
  INSECURE_SKIP_TLS_VERIFY,
  OUT_DIR,
  parseCodes,
} from './lib/config.js';
import { HEADERS, url, createLink, header } from './lib/shortener.js';

function loadCodes() {
  const inline = (__ENV.CODES || '').trim();
  const file = (__ENV.CODES_FILE || '').trim();
  if (!inline && !file) return [];
  if (inline) return parseCodes(inline.replace(/,/g, '\n'));
  try {
    return parseCodes(open(file));
  } catch (error) {
    fail(`Cannot read CODES_FILE "${file}" (resolved relative to loadtest/k6/): ${error.message}`);
  }
}

const codes = new SharedArray('codes', loadCodes);

const redirectMs = new Trend('shortener_redirect_ms', true);
const apiMs = new Trend('shortener_api_ms', true);
const views = new Counter('shortener_views');
const misses = new Counter('shortener_misses');

const PROFILES = {
  smoke: { vus: 5, ramp: '10s', hold: '20s', down: '10s' },
  load: { vus: 1000, ramp: '2m', hold: '5m', down: '1m' },
  stress: { vus: 2000, ramp: '3m', hold: '5m', down: '1m' },
  spike: { vus: 1500, ramp: '20s', hold: '2m', down: '1m' },
  soak: { vus: 500, ramp: '2m', hold: '1h', down: '1m' },
};

function scenario() {
  const profile = PROFILES[PROFILE];
  if (!profile) {
    fail(`Unknown PROFILE "${PROFILE}". Use one of: ${Object.keys(PROFILES).join(', ')}`);
  }

  const vus = Number(__ENV.VUS || profile.vus);
  if (!Number.isFinite(vus) || vus < 1) fail(`Invalid VUS "${__ENV.VUS}"`);

  if (__ENV.DURATION) {
    return {
      executor: 'constant-vus',
      vus,
      duration: __ENV.DURATION,
      gracefulStop: '30s',
    };
  }

  return {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: __ENV.RAMP || profile.ramp, target: vus },
      { duration: __ENV.HOLD || profile.hold, target: vus },
      { duration: __ENV.DOWN || profile.down, target: 0 },
    ],
    gracefulRampDown: '30s',
  };
}

export const options = {
  discardResponseBodies: true,
  maxRedirects: 0,
  insecureSkipTLSVerify: INSECURE_SKIP_TLS_VERIFY,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    shortener: { exec: 'hit', ...scenario() },
  },
  thresholds: {
    http_req_failed: [
      { threshold: `rate<${MAX_FAIL_RATE}`, abortOnFail: true, delayAbortEval: '30s' },
    ],
    checks: [{ threshold: 'rate>0.99', abortOnFail: true, delayAbortEval: '30s' }],
    http_req_duration: [`p(95)<${P95_MS}`, `p(99)<${P99_MS}`],
    shortener_redirect_ms: [`p(95)<${REDIRECT_P95_MS}`],
  },
};

function redirectOk(res) {
  return res.status >= 300 && res.status < 400 && Boolean(header(res, 'location'));
}

export function setup() {
  if (HEALTH_PATH) {
    const res = http.get(url(HEALTH_PATH), {
      headers: HEADERS,
      timeout: HTTP_TIMEOUT,
      tags: { region: REGION, op: 'health' },
    });
    if (res.status < 200 || res.status >= 300) {
      fail(`Health check GET ${url(HEALTH_PATH)} returned ${res.status}. Fix HEALTH_PATH or authentication.`);
    }
  }

  const pool = codes.slice(0);

  if (pool.length) {
    const probe = http.get(url(REDIRECT_PATH, { code: pool[0] }), {
      headers: HEADERS,
      redirects: 0,
      timeout: HTTP_TIMEOUT,
      tags: { region: REGION, op: 'probe' },
    });
    if (!redirectOk(probe)) {
      fail(
        `Probe GET ${url(REDIRECT_PATH, { code: pool[0] })} returned ${probe.status} ` +
          `with Location "${header(probe, 'location')}". Check REDIRECT_PATH, code sample, and auth.`,
      );
    }
    return { codes: [], fromFile: true };
  }

  if (!CREATE_PATH) {
    fail('No codes available. Set CODES=a,b,c or CODES_FILE=../codes.txt, or configure CREATE_PATH.');
  }

  for (let i = 0; i < SETUP_LINKS; i += 1) {
    const created = createLink(`${BASE_URL}/__loadtest/${i}`);
    if (created.code) {
      pool.push(created.code);
    } else if (i === 0) {
      fail(
        `CREATE_PATH ${CREATE_PATH} returned ${created.status || 'no response'} without a code ` +
          `at "${CREATE_CODE_PATH}". Check CREATE_METHOD, CREATE_BODY, and CREATE_CODE_PATH.`,
      );
    }
  }

  if (!pool.length) fail(`Could not create any links via ${CREATE_PATH}. Check SETUP_LINKS and auth.`);
  return { codes: pool, fromFile: false };
}

function follow(code) {
  const res = http.get(url(REDIRECT_PATH, { code }), {
    headers: HEADERS,
    redirects: 0,
    timeout: HTTP_TIMEOUT,
    tags: { region: REGION, op: 'redirect' },
  });
  redirectMs.add(res.timings.duration);
  const ok = check(res, {
    'redirect is 3xx': (r) => r.status >= 300 && r.status < 400,
    'location header present': (r) => Boolean(header(r, 'location')),
  });
  if (ok) views.add(1);
  if (res.status === 404) misses.add(1);
}

function readStats(code) {
  const res = http.get(url(STATS_PATH, { code }), {
    headers: HEADERS,
    timeout: HTTP_TIMEOUT,
    tags: { region: REGION, op: 'stats' },
  });
  apiMs.add(res.timings.duration);
  check(res, { 'stats status is 2xx': (r) => r.status >= 200 && r.status < 300 });
}

function writeLink() {
  const created = createLink(`${BASE_URL}/__loadtest/${Date.now()}`);
  check(created, { 'link created': (c) => Boolean(c.code) });
  if (!created.code) {
    misses.add(1);
    return;
  }
  follow(created.code);
}

export function hit(data) {
  const pool = data.fromFile ? codes : data.codes;
  const roll = Math.random();

  if (STATS_PCT > 0 && roll < STATS_PCT) {
    readStats(pool[Math.floor(Math.random() * pool.length)]);
  } else if (CREATE_PCT > 0 && roll < STATS_PCT + CREATE_PCT) {
    writeLink();
  } else {
    follow(pool[Math.floor(Math.random() * pool.length)]);
  }

  if (THINK_TIME_MS > 0) sleep((THINK_TIME_MS / 1000) * (0.5 + Math.random()));
}

function valueOf(data, name, key) {
  const metric = data.metrics && data.metrics[name];
  if (!metric) return null;
  const values = metric.values || metric;
  return typeof values[key] === 'number' ? values[key] : null;
}

function round(value, digits = 3) {
  if (value === null || value === undefined) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function handleSummary(data) {
  const requests = valueOf(data, 'http_reqs', 'count');
  const rps = valueOf(data, 'http_reqs', 'rate');
  const failed = valueOf(data, 'http_req_failed', 'rate');
  const checksRate = valueOf(data, 'checks', 'rate');
  const p50 = valueOf(data, 'http_req_duration', 'med');
  const p95 = valueOf(data, 'http_req_duration', 'p(95)');
  const p99 = valueOf(data, 'http_req_duration', 'p(99)');
  const redirectP95 = valueOf(data, 'shortener_redirect_ms', 'p(95)');
  const viewCount = valueOf(data, 'shortener_views', 'count') ?? 0;
  const missCount = valueOf(data, 'shortener_misses', 'count') ?? 0;
  const maxVus = valueOf(data, 'vus_max', 'max');

  const thresholds = {};
  let passed = true;
  for (const [name, metric] of Object.entries(data.metrics || {})) {
    if (!metric.thresholds || !Object.keys(metric.thresholds).length) continue;
    thresholds[name] = {};
    for (const [expr, entry] of Object.entries(metric.thresholds)) {
      const ok = typeof entry === 'boolean' ? entry : Boolean(entry && entry.ok);
      thresholds[name][expr] = ok;
      if (!ok) passed = false;
    }
  }

  const summary = {
    target: BASE_URL,
    region: REGION,
    profile: PROFILE,
    generatedAt: new Date().toISOString(),
    passed,
    requests: round(requests, 0),
    rps: round(rps),
    failedRate: round(failed, 6),
    checksRate: round(checksRate, 6),
    latencyMs: { p50: round(p50), p95: round(p95), p99: round(p99) },
    redirectP95Ms: round(redirectP95),
    views: round(viewCount, 0),
    misses: round(missCount, 0),
    maxVus: round(maxVus, 0),
    thresholds,
  };

  const failedFailed = Object.entries(thresholds)
    .flatMap(([name, list]) => Object.entries(list).map(([expr, ok]) => `${name} ${expr}=${ok}`))
    .join('; ');

  const lines = [
    `target: ${BASE_URL}`,
    `region: ${REGION}   profile: ${PROFILE}   max VUs: ${maxVus}`,
    `requests: ${requests} (${rps ? rps.toFixed(1) : '?'}/s)   failed: ${
      failed === null ? '?' : (failed * 100).toFixed(2) + '%'
    }   checks: ${checksRate === null ? '?' : (checksRate * 100).toFixed(2) + '%'}`,
    `latency: p50=${p50 === null ? '?' : p50.toFixed(1)}ms p95=${
      p95 === null ? '?' : p95.toFixed(1)
    }ms p99=${p99 === null ? '?' : p99.toFixed(1)}ms   redirect p95=${
      redirectP95 === null ? '?' : redirectP95.toFixed(1)
    }ms`,
    `views: ${viewCount}   misses: ${missCount}`,
    `thresholds: ${passed ? 'PASS' : 'FAIL'}${failedFailed ? ` (${failedFailed})` : ''}`,
    '',
  ];

  const output = { stdout: lines.join('\n') };
  if (OUT_DIR) {
    const safeRegion = REGION.replace(/[^A-Za-z0-9._-]/g, '_');
    output[`${OUT_DIR}/summary-${safeRegion}.json`] = JSON.stringify(summary, null, 2);
  }
  return output;
}
