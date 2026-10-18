import { Check, ExternalLink, X } from 'lucide-react'

interface Props {
  open: boolean
  slug: string
  published: boolean
  busy: boolean
  error: string
  onSlugChange: (slug: string) => void
  onClose: () => void
  onConfirm: () => void
  onRevoke: () => void
}

export function PublishModal({ open, slug, published, busy, error, onSlugChange, onClose, onConfirm, onRevoke }: Props) {
  const publicPath = `/p/${slug}`
  return (
    <div className={`modal${open ? ' open' : ''}`} aria-hidden={!open}>
      <button className="backdrop" aria-label="关闭发布弹窗" onClick={onClose} />
      <div className="modal-card">
        <button className="close" aria-label="关闭发布窗口" title="关闭" onClick={onClose}><X /></button>
        <div className="publish-icon"><Check /></div>
        <h2>{published ? '更新公开版本' : '发布这篇文档'}</h2>
        <p>发布会保存当前内容的公开快照。之后继续编辑草稿不会影响公开页面，只有再次发布才会更新。</p>
        <label>公开地址</label>
        <div className="slug"><span>/p/</span><input value={slug} onChange={(event) => onSlugChange(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} /></div>
        {published && <a className="public-link" href={publicPath} target="_blank" rel="noreferrer"><ExternalLink /> 打开当前公开页</a>}
        {error && <div className="auth-error">{error}</div>}
        <button className="confirm" disabled={busy || slug.length < 3} onClick={onConfirm}><i />{busy ? '处理中…' : published ? '更新发布' : '立即发布'}</button>
        {published && <button className="revoke" disabled={busy} onClick={onRevoke}>撤回公开页面</button>}
      </div>
    </div>
  )
}

export function PublishToast({ show, text = '发布成功，公开页面已更新' }: { show: boolean; text?: string }) {
  return <div className={`toast${show ? ' show' : ''}`}><b>✓</b><div><strong>操作成功</strong><span>{text}</span></div></div>
}

