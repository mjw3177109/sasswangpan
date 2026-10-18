import { apiRequest } from './api'
import type { DocumentScope } from '../types'

export interface FolderData {
  id: string
  parent_id: string | null
  name: string
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DocumentSummary {
  id: string
  folder_id: string | null
  title: string
  is_favorite: boolean
  version: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DocumentData extends DocumentSummary {
  content: string
}

export function listFolders() {
  return apiRequest<FolderData[]>('/folders')
}

export function createFolder(name: string, parentId: string | null = null) {
  return apiRequest<FolderData>('/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parent_id: parentId }),
  })
}

export function updateFolder(id: string, payload: { name?: string; parent_id?: string | null }) {
  return apiRequest<FolderData>(`/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function listDocuments(scope: DocumentScope = 'all') {
  return apiRequest<DocumentSummary[]>(`/documents?scope=${scope}`)
}

export function getDocument(id: string) {
  return apiRequest<DocumentData>(`/documents/${id}`)
}

export function createDocument(payload: { title?: string; content?: string; folder_id?: string | null }) {
  return apiRequest<DocumentData>('/documents', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateDocument(
  id: string,
  payload: { version: number; title?: string; content?: string; folder_id?: string | null; is_favorite?: boolean },
) {
  return apiRequest<DocumentData>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function deleteDocument(id: string) {
  return apiRequest<{ deleted: boolean }>(`/documents/${id}`, { method: 'DELETE' })
}

export function restoreDocument(id: string) {
  return apiRequest<DocumentData>(`/documents/${id}/restore`, { method: 'POST' })
}

export function permanentlyDeleteDocument(id: string) {
  return apiRequest<{ deleted: boolean; permanent: boolean }>(`/documents/${id}/permanent`, { method: 'DELETE' })
}
