import { FolderPlus, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

interface Props {
  open: boolean
  mode: 'create' | 'rename'
  initialName?: string
  titleOverride?: string
  descriptionOverride?: string
  busy?: boolean
  error?: string
  onClose: () => void
  onSubmit: (name: string) => void
}

export function FolderDialog({
  open,
  mode,
  initialName = '',
  titleOverride,
  descriptionOverride,
  busy = false,
  error = '',
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  if (!open) return null

  const title = titleOverride ?? (mode === 'create' ? '新建文件夹' : '重命名文件夹')
  const description = descriptionOverride ?? (mode === 'create'
    ? '给这组文档起一个清晰的名字，稍后可以随时修改。'
    : '修改后会立即保存到云端。')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const clean = name.trim()
    if (clean && !busy) onSubmit(clean)
  }

  return (
    <div className="folder-dialog-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="backdrop" aria-label="关闭文件夹弹窗" onClick={onClose} />
      <form className="folder-dialog-card" onSubmit={submit}>
        <button type="button" className="close" aria-label="关闭" onClick={onClose}><X /></button>
        <div className="folder-dialog-icon">{mode === 'create' ? <FolderPlus /> : <Pencil />}</div>
        <h2>{title}</h2>
        <p>{description}</p>
        <label htmlFor="folderName">名称</label>
        <input ref={inputRef} id="folderName" aria-label="文件夹名称" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：项目资料" />
        {error && <div className="auth-error">{error}</div>}
        <div className="folder-dialog-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? '保存中…' : mode === 'create' ? '创建文件夹' : '保存名称'}</button>
        </div>
      </form>
    </div>
  )
}
