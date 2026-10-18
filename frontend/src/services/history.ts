import { apiRequest } from './api'
import type { DocumentData } from './documents'

export interface VersionSummary {
  id: string
  document_id: string
  version: number
  title: string
  created_by: string
  created_at: string
}

export interface VersionData extends VersionSummary { content: string }

export function listVersions(documentId: string) { return apiRequest<VersionSummary[]>(`/documents/${documentId}/versions`) }
export function getVersion(documentId: string, versionId: string) { return apiRequest<VersionData>(`/documents/${documentId}/versions/${versionId}`) }
export function restoreVersion(documentId: string, versionId: string) { return apiRequest<DocumentData>(`/documents/${documentId}/versions/${versionId}/restore`, { method: 'POST' }) }
