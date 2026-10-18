import { apiRequest } from './api'

export interface PublicationData {
  id: string
  document_id: string
  slug: string
  title: string
  content: string
  published_at: string
  updated_at: string
  revoked_at: string | null
}

export interface PublicationStatus {
  published: boolean
  publication: PublicationData | null
}

export interface ExportData {
  content: string
  filename: string
  mime_type: string
}

export function getPublicationStatus(documentId: string) {
  return apiRequest<PublicationStatus>(`/documents/${documentId}/publish`)
}

export function publishDocument(documentId: string, slug: string) {
  return apiRequest<PublicationData>(`/documents/${documentId}/publish`, { method: 'POST', body: JSON.stringify({ slug }) })
}

export function revokePublication(documentId: string) {
  return apiRequest<{ revoked: boolean }>(`/documents/${documentId}/publish`, { method: 'DELETE' })
}

export function getPublicDocument(slug: string) {
  return apiRequest<PublicationData>(`/publications/${slug}`)
}

export function exportDocument(documentId: string, format: 'markdown' | 'html') {
  return apiRequest<ExportData>(`/documents/${documentId}/export?format=${format}`)
}
