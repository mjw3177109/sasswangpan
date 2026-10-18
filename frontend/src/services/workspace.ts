import { apiRequest } from './api'

export interface WorkspaceStorage {
  plan: string
  used_bytes: number
  quota_bytes: number
  remaining_bytes: number
  free_pool_cap_bytes: number
}

export interface WorkspacePreferences {
  id: string
  name: string
  kind: string
  unfiled_name: string
  storage: WorkspaceStorage
}

export function getWorkspacePreferences() {
  return apiRequest<WorkspacePreferences>('/workspace')
}

export function updateWorkspacePreferences(unfiledName: string) {
  return apiRequest<WorkspacePreferences>('/workspace', {
    method: 'PATCH',
    body: JSON.stringify({ unfiled_name: unfiledName }),
  })
}
