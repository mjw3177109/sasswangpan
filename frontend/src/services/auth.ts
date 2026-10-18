import { apiRequest } from './api'

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar_url?: string | null
  plan?: string
  storage_quota_bytes?: number
  is_site_admin?: boolean
}

export interface AuthWorkspace {
  id: string
  name: string
  kind: string
  unfiled_name?: string
}

export interface AuthData {
  user: AuthUser
  workspace: AuthWorkspace
}

export type EmailCodePurpose = 'register' | 'login' | 'reset'

export interface EmailCodeData {
  sent: boolean
  expires_in: number
  debug_code?: string
}

export function requestEmailCode(payload: { email: string; purpose: EmailCodePurpose }) {
  return apiRequest<EmailCodeData>('/auth/email-code', { method: 'POST', body: JSON.stringify(payload) })
}

export function registerAccount(payload: { email: string; password: string; name: string; code: string }) {
  return apiRequest<AuthData>('/auth/register', { method: 'POST', body: JSON.stringify(payload) })
}

export function loginAccount(payload: { email: string; password: string }) {
  return apiRequest<AuthData>('/auth/login', { method: 'POST', body: JSON.stringify(payload) })
}

export function loginWithEmailCode(payload: { email: string; code: string }) {
  return apiRequest<AuthData>('/auth/login/code', { method: 'POST', body: JSON.stringify(payload) })
}

export function resetPassword(payload: { email: string; code: string; new_password: string }) {
  return apiRequest<{ reset: boolean }>('/auth/password/reset', { method: 'POST', body: JSON.stringify(payload) })
}

export function logoutAccount() {
  return apiRequest<{ logged_out: boolean }>('/auth/logout', { method: 'POST' })
}

export function getCurrentAccount() {
  return apiRequest<AuthData>('/auth/me')
}