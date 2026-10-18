import { apiRequest } from './api'

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface Team {
  id: string
  name: string
  kind: 'team'
  role: TeamRole
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  user_id: string
  email: string
  name: string
  avatar_url: string | null
  role: TeamRole
  joined_at: string
}

export interface TeamFolder {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface TeamDocument {
  id: string
  workspace_id: string
  folder_id: string | null
  author_id: string
  title: string
  content?: string
  version: number
  is_favorite: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface TeamComment {
  id: string
  document_id: string
  author: { id: string; name: string; email: string }
  parent_id: string | null
  body: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface NotificationItem {
  id: string
  kind: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface ActivityItem {
  id: string
  actor_id: string
  action: string
  entity_type: string
  entity_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

export const listTeams = () => apiRequest<Team[]>('/teams')
export const createTeam = (name: string) => apiRequest<Team>('/teams', {
  method: 'POST',
  body: JSON.stringify({ name }),
})
export const acceptInvitation = (token: string) => apiRequest<Team>(
  `/teams/invitations/${encodeURIComponent(token)}/accept`,
  { method: 'POST' },
)

export const listMembers = (teamId: string) => apiRequest<TeamMember[]>(`/teams/${teamId}/members`)
export const inviteMember = (
  teamId: string,
  email: string,
  role: Exclude<TeamRole, 'owner'>,
) => apiRequest<{ id: string; email: string; role: string; token: string; expires_at: string }>(
  `/teams/${teamId}/invitations`,
  { method: 'POST', body: JSON.stringify({ email, role }) },
)
export const changeMemberRole = (
  teamId: string,
  memberId: string,
  role: Exclude<TeamRole, 'owner'>,
) => apiRequest<{ id: string; user_id: string; role: string }>(
  `/teams/${teamId}/members/${memberId}`,
  { method: 'PATCH', body: JSON.stringify({ role }) },
)
export const removeMember = (teamId: string, memberId: string) => apiRequest<{ removed: boolean }>(
  `/teams/${teamId}/members/${memberId}`,
  { method: 'DELETE' },
)

export const listTeamFolders = (teamId: string) => apiRequest<TeamFolder[]>(`/teams/${teamId}/folders`)
export const createTeamFolder = (
  teamId: string,
  name: string,
  parent_id: string | null = null,
) => apiRequest<TeamFolder>(`/teams/${teamId}/folders`, {
  method: 'POST',
  body: JSON.stringify({ name, parent_id }),
})

export const listTeamDocuments = (teamId: string) => apiRequest<TeamDocument[]>(`/teams/${teamId}/documents`)
export const getTeamDocument = (teamId: string, docId: string) => apiRequest<TeamDocument>(
  `/teams/${teamId}/documents/${docId}`,
)
export const createTeamDocument = (
  teamId: string,
  title = '未命名团队文档',
  folder_id: string | null = null,
) => apiRequest<TeamDocument>(`/teams/${teamId}/documents`, {
  method: 'POST',
  body: JSON.stringify({ title, content: '', folder_id }),
})
export const updateTeamDocument = (
  teamId: string,
  docId: string,
  payload: { version: number; title?: string; content?: string; folder_id?: string | null },
) => apiRequest<TeamDocument>(`/teams/${teamId}/documents/${docId}`, {
  method: 'PATCH',
  body: JSON.stringify(payload),
})

export const listComments = (teamId: string, docId: string) => apiRequest<TeamComment[]>(
  `/teams/${teamId}/documents/${docId}/comments`,
)
export const createComment = (
  teamId: string,
  docId: string,
  body: string,
  parent_id: string | null = null,
) => apiRequest<TeamComment>(`/teams/${teamId}/documents/${docId}/comments`, {
  method: 'POST',
  body: JSON.stringify({ body, parent_id }),
})
export const resolveComment = (
  teamId: string,
  docId: string,
  commentId: string,
  resolved: boolean,
) => apiRequest<TeamComment>(`/teams/${teamId}/documents/${docId}/comments/${commentId}`, {
  method: 'PATCH',
  body: JSON.stringify({ resolved }),
})

export const listNotifications = (unreadOnly = false) => apiRequest<NotificationItem[]>(
  `/notifications?unread_only=${unreadOnly}`,
)
export const markNotificationRead = (id: string) => apiRequest<NotificationItem>(
  `/notifications/${id}/read`,
  { method: 'POST' },
)
export const listActivity = (teamId: string) => apiRequest<ActivityItem[]>(`/teams/${teamId}/activity`)

export function collaborationUrl(teamId: string, docId: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws/teams/${teamId}/documents/${docId}`
}
