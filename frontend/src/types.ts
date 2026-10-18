export type ViewMode = 'edit' | 'split' | 'preview'
export type DocumentScope = 'all' | 'favorites' | 'recent' | 'trash'
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

export interface FolderItem {
  id: string
  parentId: string | null
  name: string
  sortOrder: number
}

export interface DocumentItem {
  id: string
  title: string
  content: string
  folderId: string | null
  favorite: boolean
  version: number
  updatedAt: string
  updatedLabel: string
  deletedAt: string | null
  loaded: boolean
}
