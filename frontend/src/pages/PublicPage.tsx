import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MarkdownPreview } from '../lib/MarkdownPreview'
import { getPublicDocument, type PublicationData } from '../services/publishing'

export function PublicPage() {
  const { slug = '' } = useParams()
  const [publication, setPublication] = useState<PublicationData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getPublicDocument(slug)
      .then((response) => {
        if (!cancelled) {
          setPublication(response.data)
          document.title = `${response.data.title} · 墨帆`
        }
      })
      .catch(() => { if (!cancelled) setError('页面不存在，或已经被作者撤回。') })
    return () => { cancelled = true; document.title = '墨帆 Mofan' }
  }, [slug])

  if (error) return <div className="public-state"><strong>无法访问这篇文档</strong><span>{error}</span><Link to="/">返回墨帆</Link></div>
  if (!publication) return <div className="public-state">正在加载公开文档…</div>

  return (
    <div className="public-shell">
      <header className="public-nav">
        <Link to="/" className="public-brand"><b>墨</b><span>墨帆 Mofan</span></Link>
        <small>公开阅读页</small>
      </header>
      <main className="public-paper">
        <div className="public-meta">发布于 {new Date(publication.published_at).toLocaleString()}</div>
        <MarkdownPreview markdown={publication.content} publicMode />
      </main>
    </div>
  )
}
