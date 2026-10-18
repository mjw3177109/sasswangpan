import { apiRequest } from './api'

export interface BillingStatus {
  payments_enabled: boolean
  plan: string
  subscription: null | { provider: string; plan: string; status: string }
}

export interface StorageExpansionPlanItem {
  id: string
  code: string
  name: string
  quota_bytes: number
  quota_mb: number
  price_cents: number
  currency: string
  description?: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface StoragePaymentRecordItem {
  id: string
  request_id: string
  order_no?: string | null
  event_type: string
  amount_cents?: number | null
  currency: string
  payment_reference?: string | null
  note?: string | null
  actor_user_id?: string | null
  created_at: string
}

export interface StorageExpansionRequestItem {
  id: string
  order_no: string
  user_id: string
  plan_id?: string | null
  plan_name?: string | null
  plan_quota_bytes?: number | null
  plan_price_cents?: number | null
  current_quota_bytes: number
  requested_quota_bytes: number
  status: 'pending' | 'quoted' | 'approved' | 'rejected' | string
  note?: string | null
  quoted_price_cents?: number | null
  currency: string
  payment_status: 'unpaid' | 'submitted' | 'confirmed' | string
  payment_reference?: string | null
  payment_instructions?: string | null
  payment_records?: StoragePaymentRecordItem[]
  admin_note?: string | null
  quoted_at?: string | null
  payment_submitted_at?: string | null
  payment_confirmed_at?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at: string
  message?: string
  user?: { id: string; email: string; name: string; storage_quota_bytes: number }
}

export interface StorageAdminUserItem {
  id: string
  email: string
  name: string
  plan: string
  is_active: boolean
  storage_quota_bytes: number
  storage_used_bytes: number
  created_at: string
}

export interface StorageQuotaAdjustmentItem {
  id: string
  user_id: string
  admin_user_id?: string | null
  old_quota_bytes: number
  new_quota_bytes: number
  reason?: string | null
  created_at: string
}

export function getBillingStatus() {
  return apiRequest<BillingStatus>('/billing/status')
}

export function createCheckout(plan: 'pro' | 'team') {
  return apiRequest<{ checkout_url: string }>('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  })
}

export function listStoragePlans() {
  return apiRequest<StorageExpansionPlanItem[]>('/billing/storage-plans')
}

export function listStorageExpansionRequests() {
  return apiRequest<StorageExpansionRequestItem[]>('/billing/storage-expansion-requests')
}

export function requestStorageExpansion(requestedQuotaMb: number, note?: string) {
  return apiRequest<StorageExpansionRequestItem>('/billing/storage-expansion-requests', {
    method: 'POST',
    body: JSON.stringify({ requested_quota_mb: requestedQuotaMb, note: note || null }),
  })
}

export function orderStoragePlan(planId: string, note?: string) {
  return apiRequest<StorageExpansionRequestItem>('/billing/storage-expansion-requests', {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId, note: note || null }),
  })
}

export function submitStorageExpansionPayment(requestId: string, paymentReference?: string) {
  return apiRequest<StorageExpansionRequestItem>(`/billing/storage-expansion-requests/${requestId}/payment-submitted`, {
    method: 'POST',
    body: JSON.stringify({ payment_reference: paymentReference || null }),
  })
}

export function adminListStoragePlans() {
  return apiRequest<StorageExpansionPlanItem[]>('/billing/admin/storage-plans')
}

export function adminCreateStoragePlan(payload: {
  name: string
  quota_mb: number
  price_cents: number
  currency?: string
  description?: string
  is_active?: boolean
  sort_order?: number
}) {
  return apiRequest<StorageExpansionPlanItem>('/billing/admin/storage-plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function adminUpdateStoragePlan(planId: string, payload: Partial<{
  name: string
  quota_mb: number
  price_cents: number
  currency: string
  description: string | null
  is_active: boolean
  sort_order: number
}>) {
  return apiRequest<StorageExpansionPlanItem>(`/billing/admin/storage-plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function adminListStorageExpansionRequests(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiRequest<StorageExpansionRequestItem[]>(`/billing/admin/storage-expansion-requests${query}`)
}

export function adminQuoteStorageExpansion(requestId: string, priceCents: number, currency = 'CNY', adminNote?: string) {
  return apiRequest<StorageExpansionRequestItem>(`/billing/admin/storage-expansion-requests/${requestId}/quote`, {
    method: 'POST',
    body: JSON.stringify({ price_cents: priceCents, currency, admin_note: adminNote || null }),
  })
}

export function adminConfirmStoragePayment(requestId: string, adminNote?: string) {
  return apiRequest<StorageExpansionRequestItem>(`/billing/admin/storage-expansion-requests/${requestId}/confirm-payment`, {
    method: 'POST',
    body: JSON.stringify({ admin_note: adminNote || null }),
  })
}

export function adminApproveStorageExpansion(requestId: string, adminNote?: string) {
  return apiRequest<StorageExpansionRequestItem>(`/billing/admin/storage-expansion-requests/${requestId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ admin_note: adminNote || null }),
  })
}

export function adminRejectStorageExpansion(requestId: string, reason?: string) {
  return apiRequest<StorageExpansionRequestItem>(`/billing/admin/storage-expansion-requests/${requestId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  })
}

export function adminListStorageUsers(q?: string) {
  const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  return apiRequest<StorageAdminUserItem[]>(`/billing/admin/storage-users${query}`)
}

export function adminSetStorageUserQuota(userId: string, quotaMb: number, reason: string) {
  return apiRequest<StorageAdminUserItem & { message: string }>(`/billing/admin/storage-users/${userId}/quota`, {
    method: 'POST',
    body: JSON.stringify({ quota_mb: quotaMb, reason }),
  })
}

export function adminListStoragePaymentRecords(requestId?: string) {
  const query = requestId ? `?request_id=${encodeURIComponent(requestId)}` : ''
  return apiRequest<StoragePaymentRecordItem[]>(`/billing/admin/storage-payment-records${query}`)
}

export function adminListStorageQuotaAdjustments(userId?: string) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
  return apiRequest<StorageQuotaAdjustmentItem[]>(`/billing/admin/storage-quota-adjustments${query}`)
}
