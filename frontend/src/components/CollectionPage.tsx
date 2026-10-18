import { Clock3, FileText, RotateCcw, Star, Trash2, X } from 'lucide-react'
import type { DocumentItem, DocumentScope } from '../types'

interface Props {
  scope: DocumentScope
  documents: DocumentItem[]
  onOpen: (document: DocumentItem) => void
  onToggleFavorite: (document: DocumentItem) => void
  onRestore: (document: DocumentItem) => void
  onPermanentDelete: (document: DocumentItem) => void
}

const labels = {
  favorites: { title: '我的收藏', desc: '你收藏的文档都会保存在这里。', icon: Star },
  recent: { title: '最近编辑', desc: '按最近更新时间查看你的云端文档。', icon: Clock3 },
  trash: { title: '回收站', desc: '删除的文档可以恢复，也可以永久删除。', icon: Trash2 },
} as const

export function CollectionPage({ scope, documents, onOpen, onToggleFavorite, onRestore, onPermanentDelete }: Props) {
  if (scope === 'all') return null
  const config = labels[scope]
  const Icon = config.icon
  return (
    <section className="collection-page">
      <header className="collection-header">
        <div className="collection-icon"><Icon /></div>
        <div><h1>{config.title}</h1><p>{config.desc}</p></div>
        <strong>{documents.length}</strong>
      </header>
      {!documents.length ? (
        <div className="collection-empty"><Icon /><strong>{scope === 'trash' ? '回收站是空的' : `还没有${config.title.replace('我的', '')}文档`}</strong><span>{scope === 'trash' ? '移到回收站的文档会显示在这里。' : '在文档列表点击星标即可收藏。'}</span></div>
      ) : (
        <div className="collection-list">
          {documents.map((document) => (
            <article key={document.id} className="collection-row">
              <button className="collection-open" onClick={() => onOpen(document)}>
                <FileText /><span><strong>{document.title}</strong><small>{document.updatedLabel} · v{document.version}</small></span>
              </button>
              <div className="collection-actions">
                {scope === 'trash' ? (
                  <><button title="恢复" onClick={() => onRestore(document)}><RotateCcw /></button><button title="永久删除" onClick={() => onPermanentDelete(document)}><X /></button></>
                ) : (
                  <button className={document.favorite ? 'active' : ''} title={document.favorite ? '取消收藏' : '收藏'} onClick={() => onToggleFavorite(document)}><Star /></button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
