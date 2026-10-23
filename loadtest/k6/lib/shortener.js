import http from 'k6/http';
import {
  BASE_URL,
  REGION,
  USER_AGENT,
  AUTH_HEADER_NAME,
  AUTH_HEADER_VALUE,
  COOKIE,
  EXTRA_HEADERS,
  CREATE_PATH,
  CREATE_METHOD,
  CREATE_BODY,
  CREATE_CODE_PATH,
  CREATE_CONTENT_TYPE,
  HTTP_TIMEOUT,
} from './config.js';

function baseHeaders() {
  const headers = {
    'User-Agent': USER_AGENT,
    'X-Load-Test': 'k6',
    'X-Load-Test-Region': REGION,
    Accept: '*/*',
    ...EXTRA_HEADERS,
  };
  if (AUTH_HEADER_VALUE) headers[AUTH_HEADER_NAME || 'Authorization'] = AUTH_HEADER_VALUE;
  if (COOKIE) headers.Cookie = COOKIE;
  return headers;
}

export const HEADERS = baseHeaders();
export const JSON_HEADERS = { ...HEADERS, 'Content-Type': 'application/json' };
export const CREATE_HEADERS = { ...HEADERS, 'Content-Type': CREATE_CONTENT_TYPE };

export function render(path, vars = {}) {
  return path.replace(/\{\{(\w+)\}\}/g, (_, key) => encodeURIComponent(String(vars[key] ?? '')));
}

export function url(path, vars = {}) {
  const rendered = render(path, vars);
  return `${BASE_URL}${rendered.startsWith('/') ? '' : '/'}${rendered}`;
}

function jsonEscape(value) {
  return JSON.stringify(value).slice(1, -1);
}

export function createLink(target) {
  if (!CREATE_PATH) return { code: '', status: 0 };

  const body = CREATE_BODY.split('{{url_encoded}}')
    .join(encodeURIComponent(target))
    .split('{{url}}')
    .join(jsonEscape(target));
  const res = http.request(CREATE_METHOD, url(CREATE_PATH), body, {
    headers: CREATE_HEADERS,
    timeout: HTTP_TIMEOUT,
    tags: { region: REGION, op: 'create' },
    responseType: 'text',
  });

  if (res.status < 200 || res.status >= 300) return { code: '', status: res.status };

  let payload;
  try {
    payload = res.json();
  } catch {
    return { code: '', status: res.status };
  }

  let value = payload;
  for (const key of CREATE_CODE_PATH.split('.')) {
    if (value === null || value === undefined) break;
    value = value[key];
  }

  return {
    code: typeof value === 'string' || typeof value === 'number' ? String(value) : '',
    status: res.status,
  };
}

export function header(res, name) {
  if (!res || !res.headers) return '';
  const wanted = name.toLowerCase();
  for (const key of Object.keys(res.headers)) {
    if (key.toLowerCase() === wanted) return res.headers[key];
  }
  return '';
}
