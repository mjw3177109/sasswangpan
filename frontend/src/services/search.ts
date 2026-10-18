import { apiRequest } from './api'
import type { DocumentSummary } from './documents'

export function searchDocuments(query: string) {
  return apiRequest<DocumentSummary[]>(`/search?q=${encodeURIComponent(query)}`)
}
