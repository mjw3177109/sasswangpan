import { useEffect, useState } from 'react'
import { FileClock, Paperclip, Sparkles, X, LayoutTemplate, Trash2, RotateCcw, Upload } from 'lucide-react'
import { deleteAttachment, listAttachments, uploadAttachment, type AttachmentData } from '../services/attachments'
import { listVersions, restoreVersion, type VersionSummary } from '../services/history'
import { listTemplates, runAiAction, type AiAction, type TemplateData } from '../services/tools'
import type { DocumentData } from '../services/documents'
import type { DocumentItem } from '../types'

type Tab = 'history' | 'attachments' | 'templates' | 'ai'

interface Props {
  open: boolean
  document: DocumentItem | undefined
  onClose: () => void
  onRestored: (document: DocumentData) => void
  onCreateFromTemplate: (template: TemplateData) => void
  onInsertAttachment: (attachment: AttachmentData) => void
  onApplyAi: (result: string, replace: boolean) => void
}

export function ToolsPanel({ open, document, onClose, onRestored, onCreateFromTemplate, onInsertAttachment, onApplyAi }: Props) {
  const [tab, setTab] = useState<Tab>('history')
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [attachments, setAttachments] = useState<AttachmentData[]>([])
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aiAction, setAiAction] = useState<AiAction>('summary')
  const [aiResult, setAiResult] = useState('')

  useEffect(() => {
    if (!open || !document) return
    let cancelled = false
    Promise.all([listVersions(document.id), listAttachments(document.id), listTemplates()])
      .then(([versionResponse, attachmentResponse, templateResponse]) => {
        if (cancelled) return
        setVersions(versionResponse.data)
        setAttachments(attachmentResponse.data)
        setTemplates(templateResponse.data)
      })
      .catch(() => { if (!cancelled) setError('创作工具数据加载失败。') })
    return () => { cancelled = true }
  }, [document, open])

  if (!open || !document) return null

  const doRestore = async (versionId: string) => {
    if (!window.confirm('恢复这个历史版本？当前内容会先自动保存为新的历史版本。')) return
    setBusy(true); setError('')
    try {
      const response = await restoreVersion(document.id, versionId)
      onRestored(response.data)
      const versionResponse = await listVersions(document.id)
      setVersions(versionResponse.data)
    } catch { setError('恢复历史版本失败。') } finally { setBusy(false) }
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError('')
    try {
      const response = await uploadAttachment(document.id, file)
      setAttachments((current) => [response.data, ...current])
      onInsertAttachment(response.data)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '附件上传失败，请检查剩余空间。') } finally { setBusy(false) }
  }

  const removeAttachment = async (attachment: AttachmentData) => {
    if (!window.confirm(`删除附件“${attachment.file_name}”？`)) return
    setBusy(true)
    try { await deleteAttachment(attachment.id); setAttachments((current) => current.filter((item) => item.id !== attachment.id)) }
    catch { setError('删除附件失败。') } finally { setBusy(false) }
  }

  const runAi = async () => {
    setBusy(true); setError('')
    try { const response = await runAiAction(aiAction, document.content); setAiResult(response.data.result) }
    catch { setError('AI 辅助处理失败。') } finally { setBusy(false) }
  }

  return (
    <div className="tools-layer">
      <button className="backdrop" aria-label="关闭创作工具" onClick={onClose} />
      <aside className="tools-panel">
        <header><div><small>PERSONAL TOOLS</small><strong>创作工具</strong></div><button onClick={onClose}><X /></button></header>
        <nav>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><FileClock />历史</button>
          <button className={tab === 'attachments' ? 'active' : ''} onClick={() => setTab('attachments')}><Paperclip />附件</button>
          <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}><LayoutTemplate />模板</button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}><Sparkles />AI</button>
        </nav>
        {error && <div className="tool-error">{error}</div>}
        <div className="tools-content">
          {tab === 'history' && <div className="tool-list">
            <div className="tool-section-title">最近 100 个历史版本</div>
            {!versions.length && <div className="tool-empty">继续编辑后，这里会出现历史版本。</div>}
            {versions.map((version) => <div className="version-row" key={version.id}><div><strong>v{version.version} · {version.title}</strong><span>{new Date(version.created_at).toLocaleString()}</span></div><button disabled={busy} onClick={() => void doRestore(version.id)}><RotateCcw />恢复</button></div>)}
          </div>}
          {tab === 'attachments' && <div className="tool-list">
            <label className="upload-box"><Upload /><strong>上传附件</strong><span>生产环境直传对象存储，上传后会自动插入当前文档</span><input type="file" onChange={(event) => void upload(event.target.files?.[0])} /></label>
            {attachments.map((attachment) => <div className="attachment-row" key={attachment.id}><a href={attachment.url} target="_blank" rel="noreferrer"><strong>{attachment.file_name}</strong><span>{Math.max(1, Math.round(attachment.size_bytes / 1024))} KB</span></a><button onClick={() => void removeAttachment(attachment)}><Trash2 /></button></div>)}
          </div>}
          {tab === 'templates' && <div className="template-grid">{templates.map((template) => <button key={template.id} onClick={() => onCreateFromTemplate(template)}><LayoutTemplate /><strong>{template.name}</strong><span>{template.description}</span></button>)}</div>}
          {tab === 'ai' && <div className="ai-tool">
            <div className="ai-actions">{(['summary','outline','polish','continue'] as AiAction[]).map((action) => <button key={action} className={aiAction === action ? 'active' : ''} onClick={() => setAiAction(action)}>{({summary:'摘要',outline:'大纲',polish:'整理',continue:'续写框架'} as Record<AiAction,string>)[action]}</button>)}</div>
            <button className="ai-run" disabled={busy} onClick={() => void runAi()}><Sparkles />{busy ? '处理中…' : '生成结果'}</button>
            {aiResult && <><textarea className="ai-result" value={aiResult} onChange={(event) => setAiResult(event.target.value)} /><div className="ai-apply"><button onClick={() => onApplyAi(aiResult, false)}>追加到文档</button><button onClick={() => onApplyAi(aiResult, true)}>替换正文</button></div></>}
            <p className="ai-note">当前使用本地辅助规则完成摘要/大纲/整理/续写框架，不会把文档发送给第三方模型。后续可无缝切换外部大模型提供商。</p>
          </div>}
        </div>
      </aside>
    </div>
  )
}
