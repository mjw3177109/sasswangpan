import { FileText, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { searchDocuments } from '../services/search'
import type { DocumentItem } from '../types'

interface Props { open: boolean; documents: DocumentItem[]; onClose: () => void; onSelect: (id: string) => void }
interface Result { id: string; title: string; label: string }

export function CommandPalette({ open, documents, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState<Result[]>([])
  const normalized = query.trim()

  useEffect(() => {
    if (!open || !normalized) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      searchDocuments(normalized).then((response) => {
        if (!cancelled) setRemoteResults(response.data.map((doc) => ({ id: doc.id, title: doc.title, label: new Date(doc.updated_at).toLocaleString() })))
      }).catch(() => { if (!cancelled) setRemoteResults([]) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, normalized])

  const localResults = useMemo<Result[]>(() => documents.slice(0, 6).map((doc) => ({ id: doc.id, title: doc.title, label: doc.updatedLabel })), [documents])
  const results = normalized ? remoteResults : localResults

  return (
    <div className={`palette${open ? ' open' : ''}`} aria-hidden={!open}>
      <button className="backdrop" aria-label="关闭搜索" onClick={onClose} />
      <div className="palette-card">
        <div className="palette-input"><Search /><input autoFocus={open} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题和正文…" /><kbd>ESC</kbd></div>
        <div className="results">
          <small>{normalized ? '云端搜索结果' : '快速前往'}</small>
          {results.map((doc, index) => <button key={doc.id} onClick={() => { onSelect(doc.id); onClose() }}><i className={index % 2 ? 'gold' : 'purple'}><FileText /></i><div><strong>{doc.title}</strong><span>{doc.label}</span></div></button>)}
          {!normalized && <button type="button"><i className="mint"><Sparkles /></i><div><strong>AI 写作助手</strong><span>个人版增强阶段接入</span></div></button>}
          {normalized && results.length === 0 && <div className="empty-result">没有找到匹配文档</div>}
        </div>
      </div>
    </div>
  )
}
