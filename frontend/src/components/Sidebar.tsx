import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import type { DocumentItem, DocumentScope, FolderItem } from '../types'
import type { WorkspaceStorage } from '../services/workspace'

interface Props {
  documents: DocumentItem[]
  folders: FolderItem[]
  unfiledName: string
  storage: WorkspaceStorage | null
  activeId: string | null
  scope: DocumentScope
  hidden: boolean
  mobileOpen: boolean
  onSearch: () => void
  onScopeChange: (scope: DocumentScope) => void
  onSelect: (id: string) => void
  onNewDocument: (folderId?: string | null) => void
  onNewFolder: () => void
  onRenameFolder: (folder: FolderItem) => void
  onRenameUnfiled: () => void
  onImportMarkdown: () => void
  onToggleFavorite: (document: DocumentItem) => void
  onDelete: (document: DocumentItem) => void
  onRequestExpansion: () => void
}

const formatStorage = (bytes: number) => {
  const gib = bytes / (1024 ** 3)
  if (gib >= 1) return `${gib.toFixed(gib >= 100 ? 0 : 1)} GB`
  const mib = bytes / (1024 ** 2)
  return `${Math.max(0, mib).toFixed(1)} MB`
}

export function Sidebar({
  documents,
  folders,
  unfiledName,
  storage,
  activeId,
  scope,
  hidden,
  mobileOpen,
  onSearch,
  onScopeChange,
  onSelect,
  onNewDocument,
  onNewFolder,
  onRenameFolder,
  onRenameUnfiled,
  onImportMarkdown,
  onToggleFavorite,
  onDelete,
  onRequestExpansion,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [unfiledCollapsed, setUnfiledCollapsed] = useState(false)

  const toggleFolder = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderDocument = (doc: DocumentItem) => (
    <div className={`doc-row${doc.id === activeId ? ' active' : ''}`} key={doc.id}>
      <button className="doc doc-main" onClick={() => onSelect(doc.id)}>
        <FileText /><span>{doc.title}</span>
      </button>
      <div className="doc-actions">
        <button className={doc.favorite ? 'active' : ''} title={doc.favorite ? '取消收藏' : '收藏'} onClick={() => onToggleFavorite(doc)}><Star /></button>
        <button title="移到回收站" onClick={() => onDelete(doc)}><Trash2 /></button>
      </div>
    </div>
  )

  const unfiled = documents.filter((doc) => !doc.folderId)

  return (
    <aside className={`sidebar${hidden ? ' hidden' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="space-switch">
        <b>M</b><div><strong>墨帆工作室</strong><small>个人空间</small></div><ChevronDown size={15} />
      </div>
      <button className="search" onClick={onSearch}><Search /><span>搜索文档</span><kbd>Ctrl K</kbd></button>
      <div className="quick">
        <button className={scope === 'all' ? 'active' : ''} onClick={() => onScopeChange('all')}><FileText /><span>全部文档</span></button>
        <button className={scope === 'favorites' ? 'active' : ''} onClick={() => onScopeChange('favorites')}><Star /><span>我的收藏</span></button>
        <button className={scope === 'recent' ? 'active' : ''} onClick={() => onScopeChange('recent')}><Clock3 /><span>最近编辑</span></button>
      </div>
      <div className="tree-title">
        <span>空间文档</span>
        <div className="tree-actions">
          <button title="导入 Markdown" onClick={onImportMarkdown}><Upload /></button>
          <button title="新建文件夹" onClick={onNewFolder}><FolderPlus /></button>
          <button title="新建文档" onClick={() => onNewDocument(null)}><Plus /></button>
        </div>
      </div>
      <div className="tree">
        {folders.map((folder) => {
          const items = documents.filter((doc) => doc.folderId === folder.id)
          const isCollapsed = collapsed.has(folder.id)
          return (
            <div className="folder-group" key={folder.id}>
              <div className="folder-row">
                <button className="folder folder-toggle" onClick={() => toggleFolder(folder.id)}>
                  {isCollapsed ? <ChevronRight /> : <ChevronDown />}<i className="amber" /><span>{folder.name}</span><em>{items.length}</em>
                </button>
                <button className="folder-action" title={`重命名“${folder.name}”`} onClick={() => onRenameFolder(folder)}><Pencil /></button>
                <button className="folder-action" title="在此文件夹新建文档" onClick={() => onNewDocument(folder.id)}><Plus /></button>
              </div>
              {!isCollapsed && <div className="children">{items.map(renderDocument)}</div>}
            </div>
          )
        })}
        <div className="folder-group">
          <div className="folder-row">
            <button className="folder folder-toggle" onClick={() => setUnfiledCollapsed((value) => !value)}>
              {unfiledCollapsed ? <ChevronRight /> : <ChevronDown />}<i className="violet" /><span>{unfiledName}</span><em>{unfiled.length}</em>
            </button>
            <button className="folder-action" title={`重命名“${unfiledName}”`} onClick={onRenameUnfiled}><Pencil /></button>
            <button className="folder-action" title={`在“${unfiledName}”中新建文档`} onClick={() => onNewDocument(null)}><Plus /></button>
          </div>
          {!unfiledCollapsed && <div className="children">{unfiled.map(renderDocument)}</div>}
        </div>
        {!documents.length && scope === 'all' && <div className="sidebar-empty">这里还没有文档</div>}
      </div>
      <div className="upgrade storage-card">
        <div className="up-icon"><Sparkles /></div>
        <div><strong>{storage?.plan === 'free' ? '免费个人空间' : `${storage?.plan ?? 'free'} 空间`}</strong><small>新用户免费 20MB，超出后申请付费扩容</small></div>
        <div className="storage-meter" aria-label="存储空间使用情况">
          <i style={{ width: `${Math.min(100, storage ? (storage.used_bytes / Math.max(1, storage.quota_bytes)) * 100 : 0)}%` }} />
        </div>
        <small className="storage-copy">{storage ? `${formatStorage(storage.used_bytes)} / ${formatStorage(storage.quota_bytes)}` : '正在读取空间…'}</small>
        <button type="button" onClick={onRequestExpansion}>{storage && storage.remaining_bytes <= Math.max(1024 * 1024, storage.quota_bytes * 0.15) ? '申请付费扩容' : '空间管理 / 扩容'}</button>
      </div>
      <button className={`trash${scope === 'trash' ? ' active' : ''}`} onClick={() => onScopeChange('trash')}><Trash2 /><span>回收站</span></button>
    </aside>
  )
}
