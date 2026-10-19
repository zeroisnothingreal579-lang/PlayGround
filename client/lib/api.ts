export class ApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code = 'request_failed') {
    super(message)
    this.status = status
    this.code = code
  }
}

function apiUrl(path: string) {
  if (path.startsWith('/api/')) return path
  return `/api/v1${path.startsWith('/') ? path : `/${path}`}`
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const contentType = response.headers.get('content-type') || ''
  let payload: any = null
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null)
  }
  if (!response.ok) {
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status, payload?.code)
  }
  return payload as T
}

export function get<T>(path: string) {
  return api<T>(path)
}

export function post<T>(path: string, body?: unknown) {
  return api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

export function patch<T>(path: string, body: unknown) {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export function del<T>(path: string, body?: unknown) {
  return api<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) })
}

export function uploadFile(
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ file: any; message: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl(path))
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      let payload: any = {}
      try { payload = JSON.parse(xhr.responseText) } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload)
      else reject(new ApiError(payload.error || `Upload failed (${xhr.status})`, xhr.status, payload.code))
    }
    xhr.onerror = () => reject(new ApiError('Upload failed. Check your connection.', 0))
    xhr.send(form)
  })
}
