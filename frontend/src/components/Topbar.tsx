import { Download, FileCode2, LogOut, Maximize2, Menu, Minimize2, Printer, ShieldCheck, Users } from 'lucide-react'
import { SelectMenu } from './ui/SelectMenu'
import type { FolderItem, SaveState } from '../types'

interface Props {
  title: string
  folderId: string | null
  folders: FolderItem[]
  unfiledName: string
  fullscreen: boolean
  backendReady: boolean | null
  saveState: SaveState
  onTitleChange: (title: string) => void
  onTitleBlur: () => void
  onFolderChange: (folderId: string | null) => void
  onToggleFullscreen: () => void
  onToggleMobile: () => void
  onExportMarkdown: () => void
  onExportHtml: () => void
  onPrintPdf: () => void
  onPublish: () => void
  onOpenTeams: () => void
  isSiteAdmin?: boolean
  onOpenStorageAdmin?: () => void
  onLogout: () => void
}

const saveLabels: Record<SaveState, string> = {
  saved: '已保存',
  dirty: '等待保存',
  saving: '保存中…',
  error: '保存失败',
  conflict: '版本冲突',
}

export function Topbar({
  title,
  folderId,
  folders,
  unfiledName,
  fullscreen,
  backendReady,
  saveState,
  onTitleChange,
  onTitleBlur,
  onFolderChange,
  onToggleFullscreen,
  onToggleMobile,
  onExportMarkdown,
  onExportHtml,
  onPrintPdf,
  onPublish,
  onOpenTeams,
  isSiteAdmin = false,
  onOpenStorageAdmin,
  onLogout,
}: Props) {
  const connection = backendReady === null ? '连接中' : backendReady ? '云端' : '离线'
  return (
    <header className="topbar">
      <div className="identity">
        <button className="mobile-menu" onClick={onToggleMobile} aria-label="打开侧栏"><Menu /></button>
        <div className="crumb">
          <SelectMenu
            ariaLabel="文档文件夹"
            className="topbar-folder-select"
            value={folderId ?? ''}
            options={[
              { value: '', label: unfiledName },
              ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
            ]}
            onChange={(value) => onFolderChange(value || null)}
          />
          <i>/</i>
          <input aria-label="文档标题" value={title} onChange={(event) => onTitleChange(event.target.value)} onBlur={onTitleBlur} />
        </div>
        <small className={`saved ${saveState}${backendReady === false ? ' offline' : ''}`}>
          {saveState === 'saved' ? '✓' : saveState === 'error' || saveState === 'conflict' ? '!' : '•'} {saveLabels[saveState]} · {connection}
        </small>
      </div>
      <div className="actions">
        <div className="people" aria-label="当前用户"><span>YOU</span></div>
        <button className="icon" aria-label="团队空间" title="团队空间" onClick={onOpenTeams}><Users /></button>
        {isSiteAdmin && <button className="icon" aria-label="扩容管理" title="扩容管理" onClick={onOpenStorageAdmin}><ShieldCheck /></button>}
        <button className="sub action-labeled" aria-label={fullscreen ? '退出全屏' : '进入全屏'} title={fullscreen ? '退出全屏' : '全屏写作'} onClick={onToggleFullscreen}>
          {fullscreen ? <Minimize2 /> : <Maximize2 />}{fullscreen ? '退出全屏' : '全屏'}
        </button>
        <button className="sub" onClick={onExportMarkdown}><Download /> MD</button>
        <button className="icon" title="导出 HTML" onClick={onExportHtml}><FileCode2 /></button>
        <button className="icon" title="打印 / 保存为 PDF" onClick={onPrintPdf}><Printer /></button>
        <button className="primary" onClick={onPublish}><i />发布</button>
        <button className="icon logout-button" aria-label="退出登录" title="退出登录" onClick={onLogout}><LogOut /></button>
      </div>
    </header>
  )
}