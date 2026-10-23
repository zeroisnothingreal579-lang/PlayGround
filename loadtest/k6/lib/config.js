import { fail } from 'k6';

function env(name, fallback = '') {
  const value = __ENV[name];
  return value === undefined || value === '' ? fallback : value;
}

export function num(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`${name} must be a number, got "${raw}"`);
  return value;
}

export function bool(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') return fallback;
  const value = raw.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  fail(`${name} must be a boolean (true/false), got "${raw}"`);
}

function pct(name, fallback) {
  const value = num(name, fallback);
  if (value < 0 || value > 100) fail(`${name} must be between 0 and 100, got ${value}`);
  return value / 100;
}

const required = env('BASE_URL');
if (!required) {
  fail('BASE_URL is required, e.g. BASE_URL=https://short.example.com');
}

export const BASE_URL = required.replace(/\/+$/, '');
export const REGION = env('REGION', 'local');
export const PROFILE = env('PROFILE', 'smoke');

export const HEALTH_PATH = env('HEALTH_PATH', '');
export const REDIRECT_PATH = env('REDIRECT_PATH', '/{{code}}');
export const STATS_PATH = env('STATS_PATH', '');
export const CREATE_PATH = env('CREATE_PATH', '');
export const CREATE_METHOD = env('CREATE_METHOD', 'POST').toUpperCase();
export const CREATE_BODY = env('CREATE_BODY', '{"url":"{{url}}"}');
export const CREATE_CODE_PATH = env('CREATE_CODE_PATH', 'code');
export const CREATE_CONTENT_TYPE = env('CREATE_CONTENT_TYPE', 'application/json');

export const SETUP_LINKS = num('SETUP_LINKS', 50);
export const THINK_TIME_MS = num('THINK_TIME_MS', 0);

export const STATS_PCT = pct('STATS_PCT', STATS_PATH ? 5 : 0);
export const CREATE_PCT = pct('CREATE_PCT', CREATE_PATH ? 5 : 0);

export const MAX_FAIL_RATE = num('MAX_FAIL_RATE', 0.01);
export const P95_MS = num('P95_MS', 400);
export const P99_MS = num('P99_MS', 1000);
export const REDIRECT_P95_MS = num('REDIRECT_P95_MS', 300);

if (!(MAX_FAIL_RATE > 0) || MAX_FAIL_RATE > 1) {
  fail(`MAX_FAIL_RATE must be greater than 0 and at most 1, got ${MAX_FAIL_RATE}`);
}
if (P95_MS <= 0 || P99_MS <= 0 || REDIRECT_P95_MS <= 0) {
  fail('P95_MS, P99_MS, and REDIRECT_P95_MS must all be positive');
}
if (SETUP_LINKS < 0 || SETUP_LINKS > 10000) {
  fail(`SETUP_LINKS must be between 0 and 10000, got ${SETUP_LINKS}`);
}
if (THINK_TIME_MS < 0) fail('THINK_TIME_MS must be zero or positive');

export const HTTP_TIMEOUT = env('HTTP_TIMEOUT', '30s');
export const INSECURE_SKIP_TLS_VERIFY = bool('INSECURE_SKIP_TLS_VERIFY', false);
export const OUT_DIR = env('OUT_DIR', '');

export const AUTH_HEADER_NAME = env('AUTH_HEADER_NAME', '');
export const AUTH_HEADER_VALUE = env('AUTH_HEADER_VALUE', '');
export const COOKIE = env('COOKIE', '');
export const USER_AGENT = env('USER_AGENT', `k6-loadtest/1.0 (authorized; ${REGION})`);

export const EXTRA_HEADERS = parseHeaders(env('EXTRA_HEADERS', '{}'));

function parseHeaders(raw) {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('EXTRA_HEADERS must be a JSON object, e.g. {"X-Api-Key":"..."}');
    }
    return parsed;
  } catch (error) {
    fail(`EXTRA_HEADERS is not valid JSON: ${error.message}`);
  }
}

export function parseCodes(raw) {
  const seen = new Set();
  const codes = [];
  for (const line of raw.split(/\r?\n/)) {
    const item = line.trim();
    if (!item || item.startsWith('#')) continue;
    const code = item.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!code || code === 'code') continue;
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
    if (codes.length >= 50000) break;
  }
  return codes;
}
