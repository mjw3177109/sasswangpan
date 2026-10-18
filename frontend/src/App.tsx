import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, getHealth } from './services/api'
import { getCurrentAccount, logoutAccount, type AuthData } from './services/auth'
import {
  createDocument as createCloudDocument,
  createFolder as createCloudFolder,
  updateFolder as updateCloudFolder,
  deleteDocument as deleteCloudDocument,
  getDocument,
  listDocuments,
  listFolders,
  permanentlyDeleteDocument,
  restoreDocument as restoreCloudDocument,
  updateDocument as updateCloudDocument,
  type DocumentData,
  type DocumentSummary,
} from './services/documents'
import { Rail } from './components/Rail'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Toolbar, type FormatAction } from './components/Toolbar'
import { EditorStage } from './components/EditorStage'
import { CommandPalette } from './components/CommandPalette'
import { PublishModal, PublishToast } from './components/PublishModal'
import { ToolsPanel } from './components/ToolsPanel'
import { FolderDialog } from './components/FolderDialog'
import { CollectionPage } from './components/CollectionPage'
import { AuthPage } from './pages/AuthPage'
import { PublicPage } from './pages/PublicPage'
import { TeamPage } from './pages/TeamPage'
import { exportDocument, getPublicationStatus, publishDocument, revokePublication } from './services/publishing'
import { uploadAttachment, type AttachmentData } from './services/attachments'
import type { TemplateData } from './services/tools'
import { getWorkspacePreferences, updateWorkspacePreferences, type WorkspaceStorage } from './services/workspace'
import { StorageExpansionModal } from './components/StorageExpansionModal'
import { AdminStoragePage } from './pages/AdminStoragePage'
import type { DocumentItem, DocumentScope, FolderItem, SaveState, ViewMode } from './types'

function slugify(title: string) {
  const latin = title.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return latin || `mofan-${Date.now().toString(36)}`
}

function updatedLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '最近编辑'
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚编辑'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleDateString()
}

function fromSummary(item: DocumentSummary, existing?: DocumentItem): DocumentItem {
  return {
    id: item.id,
    title: item.title,
    content: existing?.loaded ? existing.content : '',
    folderId: item.folder_id,
    favorite: item.is_favorite,
    version: item.version,
    updatedAt: item.updated_at,
    updatedLabel: updatedLabel(item.updated_at),
    deletedAt: item.deleted_at,
    loaded: existing?.loaded ?? false,
  }
}

function fromData(item: DocumentData): DocumentItem {
  return {
    ...fromSummary(item),
    content: item.content,
    loaded: true,
  }
}

function WorkspacePage({ onLogout, isSiteAdmin }: { onLogout: () => void; isSiteAdmin: boolean }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialScopeValue = searchParams.get('scope')
  const initialScope: DocumentScope = initialScopeValue === 'favorites' || initialScopeValue === 'recent' || initialScopeValue === 'trash' ? initialScopeValue : 'all'
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [collectionDocuments, setCollectionDocuments] = useState<DocumentItem[]>([])
  const documentsRef = useRef<DocumentItem[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [unfiledName, setUnfiledName] = useState('未归档')
  const [storage, setStorage] = useState<WorkspaceStorage | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [scope, setScope] = useState<DocumentScope>(initialScope)
  const [loadingDocuments, setLoadingDocuments] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [dark, setDark] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastText, setToastText] = useState('发布成功，公开页面已更新')
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [published, setPublished] = useState(false)
  const [slug, setSlug] = useState('mofan-document')
  const [backendReady, setBackendReady] = useState<boolean | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [storageModalOpen, setStorageModalOpen] = useState(false)
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; mode: 'create' | 'rename'; folder?: FolderItem; target?: 'folder' | 'unfiled' }>({ open: false, mode: 'create' })
  const [folderDialogBusy, setFolderDialogBusy] = useState(false)
  const [folderDialogError, setFolderDialogError] = useState('')
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const preferredDocumentRef = useRef<string | null>(null)
  const pendingMutationRef = useRef<Promise<void> | null>(null)

  const replaceDocuments = (updater: (current: DocumentItem[]) => DocumentItem[]) => {
    setDocuments((current) => {
      const next = updater(current)
      documentsRef.current = next
      return next
    })
  }

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeId),
    [activeId, documents],
  )

  useEffect(() => {
    document.body.classList.toggle('dark', dark)
    return () => document.body.classList.remove('dark')
  }, [dark])

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then((response) => { if (!cancelled) setBackendReady(response.data.status === 'ok') })
      .catch(() => { if (!cancelled) setBackendReady(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        setPublishOpen(false)
        setToolsOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([listDocuments('all'), listFolders(), getWorkspacePreferences()])
      .then(async ([documentResponse, folderResponse, workspaceResponse]) => {
        if (cancelled) return
        setUnfiledName(workspaceResponse.data.unfiled_name || '未归档')
        setStorage(workspaceResponse.data.storage)
        setFolders(folderResponse.data.map((folder) => ({
          id: folder.id,
          parentId: folder.parent_id,
          name: folder.name,
          sortOrder: folder.sort_order,
        })))
        const summaries = documentResponse.data.map((item) => {
          const existing = documentsRef.current.find((doc) => doc.id === item.id)
          return fromSummary(item, existing)
        })
        replaceDocuments(() => summaries)
        if (!summaries.length) {
          setActiveId(null)
          return
        }
        const preferred = summaries.find((item) => item.id === preferredDocumentRef.current) ?? summaries[0]
        preferredDocumentRef.current = null
        setActiveId(preferred.id)
        if (!preferred.loaded) {
          const detail = await getDocument(preferred.id)
          if (!cancelled) replaceDocuments((current) => current.map((doc) => doc.id === preferred.id ? fromData(detail.data) : doc))
        }
      })
      .catch(() => setBackendReady(false))
      .finally(() => { if (!cancelled) setLoadingDocuments(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (scope === 'all') return
    let cancelled = false
    void listDocuments(scope)
      .then((response) => {
        if (cancelled) return
        setCollectionDocuments(response.data.map((item) => {
          const existing = documentsRef.current.find((doc) => doc.id === item.id)
          return fromSummary(item, existing)
        }))
      })
      .catch(() => { if (!cancelled) setBackendReady(false) })
    return () => { cancelled = true }
  }, [scope])

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
  }, [])

  const persistDocument = async (id: string) => {
    const sent = documentsRef.current.find((doc) => doc.id === id)
    if (!sent || !sent.loaded || sent.deletedAt) return
    setSaveState('saving')
    try {
      const response = await updateCloudDocument(id, {
        version: sent.version,
        title: sent.title,
        content: sent.content,
        folder_id: sent.folderId,
        is_favorite: sent.favorite,
      })
      const saved = fromData(response.data)
      const latest = documentsRef.current.find((doc) => doc.id === id)
      const changedWhileSaving = Boolean(latest && (
        latest.title !== sent.title ||
        latest.content !== sent.content ||
        latest.folderId !== sent.folderId ||
        latest.favorite !== sent.favorite
      ))
      replaceDocuments((current) => current.map((doc) => {
        if (doc.id !== id) return doc
        return changedWhileSaving ? { ...doc, version: saved.version, updatedAt: saved.updatedAt, updatedLabel: saved.updatedLabel } : saved
      }))
      if (changedWhileSaving) {
        saveTimerRef.current = window.setTimeout(() => void persistDocument(id), 0)
      } else {
        setSaveState('saved')
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'VERSION_CONFLICT') setSaveState('conflict')
      else setSaveState('error')
    }
  }

  const scheduleSave = (document: DocumentItem) => {
    setSaveState('dirty')
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => void persistDocument(document.id), 800)
  }

  const updateActive = (patch: Partial<DocumentItem>) => {
    if (!activeId) return
    const currentDocument = documentsRef.current.find((document) => document.id === activeId)
    if (!currentDocument) return
    const nextDocument = { ...currentDocument, ...patch }
    const nextDocuments = documentsRef.current.map((document) => document.id === activeId ? nextDocument : document)
    documentsRef.current = nextDocuments
    setDocuments(nextDocuments)
    scheduleSave(nextDocument)
  }

  const selectDocument = async (id: string) => {
    setActiveId(id)
    setMobileOpen(false)
    setSaveState('saved')
    const existing = documentsRef.current.find((doc) => doc.id === id)
    if (existing?.loaded) {
      setSlug(slugify(existing.title))
      return
    }
    try {
      const response = await getDocument(id)
      replaceDocuments((current) => current.map((doc) => doc.id === id ? fromData(response.data) : doc))
      setSlug(slugify(response.data.title))
    } catch {
      setBackendReady(false)
    }
  }

  const createDocument = async (folderId: string | null = null) => {
    try {
      const response = await createCloudDocument({ title: '未命名文档', content: '', folder_id: folderId })
      const created = fromData(response.data)
      setScope('all')
      setSearchParams({}, { replace: true })
      replaceDocuments((current) => [created, ...current.filter((doc) => doc.id !== created.id)])
      setActiveId(created.id)
      setSlug(slugify(created.title))
      setSaveState('saved')
      setMobileOpen(false)
      requestAnimationFrame(() => editorRef.current?.focus())
    } catch {
      setSaveState('error')
    }
  }

  const openCreateFolderDialog = () => {
    setFolderDialogError('')
    setFolderDialog({ open: true, mode: 'create' })
  }

  const openRenameFolderDialog = (folder: FolderItem) => {
    setFolderDialogError('')
    setFolderDialog({ open: true, mode: 'rename', folder })
  }

  const openRenameUnfiledDialog = () => {
    setFolderDialogError('')
    setFolderDialog({ open: true, mode: 'rename', target: 'unfiled' })
  }

  const submitFolderDialog = async (name: string) => {
    setFolderDialogBusy(true)
    setFolderDialogError('')
    try {
      if (folderDialog.mode === 'rename' && folderDialog.target === 'unfiled') {
        const response = await updateWorkspacePreferences(name)
        setUnfiledName(response.data.unfiled_name)
        setStorage(response.data.storage)
      } else if (folderDialog.mode === 'rename' && folderDialog.folder) {
        const response = await updateCloudFolder(folderDialog.folder.id, { name })
        setFolders((current) => current.map((folder) => folder.id === response.data.id ? {
          id: response.data.id,
          parentId: response.data.parent_id,
          name: response.data.name,
          sortOrder: response.data.sort_order,
        } : folder))
      } else {
        const response = await createCloudFolder(name)
        setFolders((current) => [...current, {
          id: response.data.id,
          parentId: response.data.parent_id,
          name: response.data.name,
          sortOrder: response.data.sort_order,
        }])
      }
      setFolderDialog({ open: false, mode: 'create' })
    } catch (reason) {
      setFolderDialogError(reason instanceof ApiError ? reason.message : '文件夹保存失败，请稍后重试。')
    } finally {
      setFolderDialogBusy(false)
    }
  }

  const flushActiveSave = async () => {
    if (!activeDocument) return
    const hasPendingTimer = saveTimerRef.current !== null
    if (!hasPendingTimer && saveState === 'saved') return
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await persistDocument(activeDocument.id)
  }

  const waitForPendingMutation = async () => {
    if (pendingMutationRef.current) await pendingMutationRef.current
  }

  const changeScope = async (nextScope: DocumentScope) => {
    if (nextScope === scope) return
    await flushActiveSave()
    await waitForPendingMutation()
    setScope(nextScope)
    setSearchParams(nextScope === 'all' ? {} : { scope: nextScope }, { replace: true })
  }

  const toggleFavorite = (document: DocumentItem) => {
    const operation = (async () => {
      try {
        if (document.id === activeId && saveState !== 'saved') await flushActiveSave()
        const current = documentsRef.current.find((doc) => doc.id === document.id) ?? document
        const response = await updateCloudDocument(current.id, {
          version: current.version,
          is_favorite: !current.favorite,
        })
        const saved = fromData(response.data)
        replaceDocuments((items) => items.map((item) => item.id === saved.id ? saved : item))
        setCollectionDocuments((items) => {
          if (scope === 'favorites' && !saved.favorite) return items.filter((item) => item.id !== saved.id)
          return items.map((item) => item.id === saved.id ? saved : item)
        })
        setSaveState('saved')
      } catch (reason) {
        if (reason instanceof ApiError && reason.code === 'VERSION_CONFLICT') setSaveState('conflict')
        else setSaveState('error')
      }
    })()
    pendingMutationRef.current = operation.finally(() => {
      if (pendingMutationRef.current === operation) pendingMutationRef.current = null
    })
  }

  const deleteDocument = (document: DocumentItem) => {
    const operation = (async () => {
      try {
        await deleteCloudDocument(document.id)
        const remaining = documentsRef.current.filter((doc) => doc.id !== document.id)
        replaceDocuments(() => remaining)
        setCollectionDocuments((current) => current.filter((doc) => doc.id !== document.id))
        if (activeId === document.id) {
          const next = remaining[0]
          setActiveId(next?.id ?? null)
          if (next && !next.loaded) void selectDocument(next.id)
        }
      } catch {
        setSaveState('error')
      }
    })()
    pendingMutationRef.current = operation.finally(() => {
      if (pendingMutationRef.current === operation) pendingMutationRef.current = null
    })
  }

  const restoreDocument = (document: DocumentItem) => {
    const operation = (async () => {
      try {
        const response = await restoreCloudDocument(document.id)
        const restored = fromData(response.data)
        replaceDocuments((current) => [restored, ...current.filter((doc) => doc.id !== restored.id)])
        setCollectionDocuments((current) => current.filter((doc) => doc.id !== document.id))
        if (activeId === document.id) setActiveId(restored.id)
      } catch {
        setSaveState('error')
      }
    })()
    pendingMutationRef.current = operation.finally(() => {
      if (pendingMutationRef.current === operation) pendingMutationRef.current = null
    })
  }

  const permanentDelete = async (document: DocumentItem) => {
    if (!window.confirm(`永久删除“${document.title}”？此操作无法撤销。`)) return
    try {
      await permanentlyDeleteDocument(document.id)
      replaceDocuments((current) => current.filter((doc) => doc.id !== document.id))
      setCollectionDocuments((current) => current.filter((doc) => doc.id !== document.id))
      if (activeId === document.id) setActiveId(null)
    } catch {
      setSaveState('error')
    }
  }

  const insertFormat = (action: FormatAction) => {
    const textarea = editorRef.current
    if (!textarea || !activeDocument) return
    const content = activeDocument.content
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    let replaceStart = start
    let replaceEnd = end
    let value = content.slice(start, end)

    if (action.type === 'wrap') {
      value = `${action.before}${value || action.fallback || '文字'}${action.after}`
    } else if (action.type === 'prefix') {
      value = `${action.prefix}${value || action.fallback || '内容'}`
    } else if (action.type === 'insert') {
      value = action.text
    } else if (action.type === 'codeBlock') {
      const codeLanguage = action.language === 'auto' ? '' : action.language
      value = `\`\`\`${codeLanguage}\n${value || '代码'}\n\`\`\``
    } else if (action.type === 'fontSize') {
      value = `<span style="font-size:${action.size}px">${value || '文字'}</span>`
    } else if (action.type === 'color') {
      value = `<span style="color:${action.color}">${value || '文字'}</span>`
    } else if (action.type === 'heading') {
      replaceStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const nextBreak = content.indexOf('\n', end)
      replaceEnd = nextBreak === -1 ? content.length : nextBreak
      const selectedLines = content.slice(replaceStart, replaceEnd).split('\n')
      const prefix = action.level === 0 ? '' : `${'#'.repeat(action.level)} `
      value = selectedLines
        .map((line) => `${prefix}${line.replace(/^#{1,6}\s+/, '')}`)
        .join('\n')
    }

    const next = `${content.slice(0, replaceStart)}${value}${content.slice(replaceEnd)}`
    updateActive({ content: next })
    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = replaceStart + value.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  const downloadContent = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const exportCloudDocument = async (format: 'markdown' | 'html') => {
    if (!activeDocument) return
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (saveState !== 'saved') await persistDocument(activeDocument.id)
    try {
      const response = await exportDocument(activeDocument.id, format)
      downloadContent(response.data.content, response.data.filename, response.data.mime_type)
    } catch {
      setSaveState('error')
    }
  }

  const importMarkdown = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,text/markdown,text/plain'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.size > 2 * 1024 * 1024) {
        window.alert('当前个人版单个 Markdown 导入上限为 2MB。')
        return
      }
      try {
        const content = await file.text()
        const title = file.name.replace(/\.(md|markdown)$/i, '') || '导入文档'
        const response = await createCloudDocument({ title, content })
        const created = fromData(response.data)
        setScope('all')
        setSearchParams({}, { replace: true })
        replaceDocuments((current) => [created, ...current.filter((doc) => doc.id !== created.id)])
        setActiveId(created.id)
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }
    input.click()
  }

  const openPublish = async () => {
    if (!activeDocument) return
    setPublishError('')
    setSlug(slugify(activeDocument.title))
    setPublished(false)
    setPublishOpen(true)
    try {
      const response = await getPublicationStatus(activeDocument.id)
      setPublished(response.data.published)
      if (response.data.publication?.slug) setSlug(response.data.publication.slug)
    } catch {
      setPublishError('无法读取当前发布状态。')
    }
  }

  const confirmPublish = async () => {
    if (!activeDocument) return
    setPublishBusy(true)
    setPublishError('')
    try {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (saveState !== 'saved') await persistDocument(activeDocument.id)
      await publishDocument(activeDocument.id, slug)
      setPublished(true)
      setToastText('发布成功，公开页面已更新')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3200)
    } catch (reason) {
      setPublishError(reason instanceof ApiError ? reason.message : '发布失败，请稍后重试。')
    } finally {
      setPublishBusy(false)
    }
  }

  const revokeCurrentPublication = async () => {
    if (!activeDocument) return
    setPublishBusy(true)
    setPublishError('')
    try {
      await revokePublication(activeDocument.id)
      setPublished(false)
      setToastText('公开页面已撤回')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3200)
    } catch (reason) {
      setPublishError(reason instanceof ApiError ? reason.message : '撤回失败，请稍后重试。')
    } finally {
      setPublishBusy(false)
    }
  }


  const applyRestoredDocument = (data: DocumentData) => {
    const restored = fromData(data)
    replaceDocuments((current) => current.map((doc) => doc.id === restored.id ? restored : doc))
    setActiveId(restored.id)
    setSaveState('saved')
  }

  const createFromTemplate = async (template: TemplateData) => {
    try {
      const response = await createCloudDocument({ title: template.name, content: template.content })
      const created = fromData(response.data)
      setScope('all')
      replaceDocuments((current) => [created, ...current.filter((doc) => doc.id !== created.id)])
      setActiveId(created.id)
      setSaveState('saved')
      setToolsOpen(false)
    } catch {
      setSaveState('error')
    }
  }

  const insertAttachment = (attachment: AttachmentData) => {
    if (!activeDocument) return
    const markup = attachment.mime_type.startsWith('image/')
      ? `\n\n![${attachment.file_name}](${attachment.url})\n`
      : `\n\n[${attachment.file_name}](${attachment.url})\n`
    updateActive({ content: `${activeDocument.content}${markup}` })
  }

  const uploadImageFromToolbar = () => {
    if (!activeDocument) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const response = await uploadAttachment(activeDocument.id, file)
        insertAttachment(response.data)
        setToastText(`图片“${file.name}”已上传并插入文档`)
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 3200)
      } catch (reason) {
        setToastText(reason instanceof ApiError ? reason.message : '图片上传失败，请稍后重试')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 3200)
      }
    }
    input.click()
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      setToastText('浏览器未允许进入全屏，请检查浏览器权限')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 2600)
    }
  }

  const openFromCollection = (document: DocumentItem) => {
    preferredDocumentRef.current = document.id
    setActiveId(document.id)
    setScope('all')
    setSearchParams({}, { replace: true })
    void selectDocument(document.id)
  }

  const applyAiResult = (result: string, replace: boolean) => {
    if (!activeDocument) return
    updateActive({ content: replace ? result : `${activeDocument.content}\n\n${result}` })
  }


  const printPdf = () => {
    document.body.classList.add('print-document')
    window.setTimeout(() => {
      window.print()
      document.body.classList.remove('print-document')
    }, 30)
  }

  if (loadingDocuments) return <div className="route-loading">正在加载你的云端文档…</div>

  return (
    <>
      <div className="app">
        <Rail dark={dark} onSearch={() => setPaletteOpen(true)} onToggleTheme={() => setDark((value) => !value)} />
        <Sidebar
          documents={documents}
          folders={folders}
          unfiledName={unfiledName}
          storage={storage}
          activeId={activeId}
          scope={scope}
          hidden={false}
          mobileOpen={mobileOpen}
          onSearch={() => setPaletteOpen(true)}
          onScopeChange={(nextScope) => void changeScope(nextScope)}
          onSelect={(id) => {
            setScope('all')
            setSearchParams({}, { replace: true })
            void selectDocument(id)
          }}
          onNewDocument={(folderId) => void createDocument(folderId)}
          onNewFolder={openCreateFolderDialog}
          onRenameFolder={openRenameFolderDialog}
          onRenameUnfiled={openRenameUnfiledDialog}
          onImportMarkdown={importMarkdown}
          onToggleFavorite={toggleFavorite}
          onDelete={(document) => void deleteDocument(document)}
          onRequestExpansion={() => setStorageModalOpen(true)}
        />
        <main className={`workspace${scope !== 'all' ? ' collection-workspace' : ''}`}>
          {scope !== 'all' ? (
            <CollectionPage
              scope={scope}
              documents={collectionDocuments}
              onOpen={openFromCollection}
              onToggleFavorite={(document) => void toggleFavorite(document)}
              onRestore={(document) => void restoreDocument(document)}
              onPermanentDelete={(document) => void permanentDelete(document)}
            />
          ) : activeDocument ? (
            <>
              <Topbar
                title={activeDocument.title}
                folderId={activeDocument.folderId}
                folders={folders}
                unfiledName={unfiledName}
                backendReady={backendReady}
                saveState={saveState}
                fullscreen={fullscreen}
                onTitleChange={(title) => updateActive({ title })}
                onTitleBlur={() => void flushActiveSave()}
                onFolderChange={(folderId) => updateActive({ folderId })}
                onToggleFullscreen={() => void toggleFullscreen()}
                onToggleMobile={() => setMobileOpen((value) => !value)}
                onExportMarkdown={() => void exportCloudDocument('markdown')}
                onExportHtml={() => void exportCloudDocument('html')}
                onPrintPdf={printPdf}
                onPublish={() => void openPublish()}
                onOpenTeams={() => navigate('/teams')}
                isSiteAdmin={isSiteAdmin}
                onOpenStorageAdmin={() => navigate('/admin/storage')}
                onLogout={onLogout}
              />
              <Toolbar viewMode={viewMode} onFormat={insertFormat} onImageUpload={uploadImageFromToolbar} onViewChange={setViewMode} />
              <EditorStage
                markdown={activeDocument.content}
                viewMode={viewMode}
                editorRef={editorRef}
                onChange={(content) => updateActive({ content })}
              />
            </>
          ) : (
            <div className="empty-workspace">
              <strong>这里还没有文档</strong>
              <button onClick={() => void createDocument(null)}>新建第一篇文档</button>
            </div>
          )}
        </main>
      </div>
      <CommandPalette open={paletteOpen} documents={documents} onClose={() => setPaletteOpen(false)} onSelect={(id) => void selectDocument(id)} />
      <ToolsPanel
        open={toolsOpen}
        document={activeDocument}
        onClose={() => setToolsOpen(false)}
        onRestored={applyRestoredDocument}
        onCreateFromTemplate={(template) => void createFromTemplate(template)}
        onInsertAttachment={insertAttachment}
        onApplyAi={applyAiResult}
      />
      <FolderDialog
        key={`${folderDialog.open ? 'open' : 'closed'}-${folderDialog.mode}-${folderDialog.target ?? folderDialog.folder?.id ?? 'new'}`}
        open={folderDialog.open}
        mode={folderDialog.mode}
        initialName={folderDialog.target === 'unfiled' ? unfiledName : folderDialog.folder?.name ?? ''}
        titleOverride={folderDialog.target === 'unfiled' ? `重命名“${unfiledName}”` : undefined}
        descriptionOverride={folderDialog.target === 'unfiled' ? '这是未分配到真实文件夹的系统分组名称。修改后会保存到云端工作区设置。' : undefined}
        busy={folderDialogBusy}
        error={folderDialogError}
        onClose={() => setFolderDialog({ open: false, mode: 'create' })}
        onSubmit={(name) => void submitFolderDialog(name)}
      />
      <PublishModal open={publishOpen} slug={slug} published={published} busy={publishBusy} error={publishError} onSlugChange={setSlug} onClose={() => setPublishOpen(false)} onConfirm={() => void confirmPublish()} onRevoke={() => void revokeCurrentPublication()} />
      <StorageExpansionModal
        open={storageModalOpen}
        storage={storage}
        onClose={() => setStorageModalOpen(false)}
        onNotice={(message) => {
          setToastText(message)
          setToastVisible(true)
          window.setTimeout(() => setToastVisible(false), 3600)
        }}
      />
      <PublishToast show={toastVisible} text={toastText} />
    </>
  )
}

function ProtectedWorkspace() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [account, setAccount] = useState<AuthData | null>(null)

  useEffect(() => {
    let cancelled = false
    getCurrentAccount()
      .then((response) => { if (!cancelled) setAccount(response.data) })
      .catch(() => { if (!cancelled) setAccount(null) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])

  if (checking) return <div className="route-loading">正在连接你的空间…</div>
  if (!account) return <Navigate to="/login" replace />

  const handleLogout = async () => {
    try { await logoutAccount() } finally { navigate('/login', { replace: true }) }
  }
  return <WorkspacePage onLogout={handleLogout} isSiteAdmin={Boolean(account.user.is_site_admin)} />
}


function ProtectedTeam() {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  useEffect(() => {
    let cancelled = false
    getCurrentAccount()
      .then(() => { if (!cancelled) setAuthenticated(true) })
      .catch(() => { if (!cancelled) setAuthenticated(false) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])
  if (checking) return <div className="route-loading">正在连接团队空间…</div>
  if (!authenticated) return <Navigate to="/login" replace />
  return <TeamPage />
}

function ProtectedStorageAdmin() {
  const [checking, setChecking] = useState(true)
  const [account, setAccount] = useState<AuthData | null>(null)
  useEffect(() => {
    let cancelled = false
    getCurrentAccount()
      .then((response) => { if (!cancelled) setAccount(response.data) })
      .catch(() => { if (!cancelled) setAccount(null) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])
  if (checking) return <div className="route-loading">正在验证管理员权限…</div>
  if (!account) return <Navigate to="/login" replace />
  if (!account.user.is_site_admin) return <Navigate to="/app" replace />
  return <AdminStoragePage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/p/:slug" element={<PublicPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/app" element={<ProtectedWorkspace />} />
      <Route path="/teams" element={<ProtectedTeam />} />
      <Route path="/admin/storage" element={<ProtectedStorageAdmin />} />
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
