export interface ApiMeta {
  request_id?: string
  [key: string]: unknown
}

export interface ApiSuccess<T> {
  data: T
  meta: ApiMeta
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
  meta?: ApiMeta
}

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  requestId?: string

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.error.code
    this.details = body.error.details
    this.requestId = body.meta?.request_id
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiSuccess<T>> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
  const body = await response.json()
  if (!response.ok) {
    throw new ApiError(response.status, body as ApiErrorBody)
  }
  return body as ApiSuccess<T>
}

export interface HealthData {
  status: 'ok' | 'degraded'
  services: {
    supabase_postgres: boolean
    redis: boolean
  }
}

export function getHealth() {
  return apiRequest<HealthData>('/health')
}

