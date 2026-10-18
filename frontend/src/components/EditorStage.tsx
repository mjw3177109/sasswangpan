import { useMemo, useState, type RefObject } from 'react'
import { ImageIcon, Maximize2, RotateCcw } from 'lucide-react'
import { MarkdownPreview } from '../lib/MarkdownPreview'
import type { ViewMode } from '../types'

interface Props {
  markdown: string
  viewMode: ViewMode
  editorRef: RefObject<HTMLTextAreaElement | null>
  onChange: (markdown: string) => void
}

type ImageRef = { alt: string; src: string }

function extractImages(markdown: string): ImageRef[] {
  const images: ImageRef[] = []
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\((\/api\/attachments\/[^)]+|https?:\/\/[^)]+)\)/g)) {
    images.push({ alt: match[1] || '图片', src: match[2] })
  }
  return images
}

export function EditorStage({ markdown, viewMode, editorRef, onChange }: Props) {
  const [selectionStart, setSelectionStart] = useState(0)
  const wordCount = useMemo(() => markdown.replace(/\s/g, '').length, [markdown])
  const images = useMemo(() => extractImages(markdown), [markdown])
  const cursor = useMemo(() => {
    const before = markdown.slice(0, selectionStart).split('\n')
    return `第 ${before.length} 行，第 ${(before.at(-1)?.length ?? 0) + 1} 列`
  }, [markdown, selectionStart])
  const syncCursor = () => setSelectionStart(editorRef.current?.selectionStart ?? 0)

  return (
    <section className={`stage ${viewMode}`}>
      <div className={`editor${images.length ? ' has-media' : ''}`}>
        <div className="pane-label"><i />MARKDOWN</div>
        {images.length > 0 && (
          <div className="editor-media-strip" aria-label="文档图片预览">
            <span className="editor-media-label"><ImageIcon />文档图片</span>
            {images.map((image, index) => (
              <figure key={`${image.src}-${index}`}>
                <img src={image.src} alt={image.alt} />
                <figcaption>{image.alt}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <textarea
          ref={editorRef}
          id="markdownInput"
          spellCheck={false}
          value={markdown}
          onChange={(event) => { onChange(event.target.value); setSelectionStart(event.target.selectionStart) }}
          onClick={syncCursor}
          onKeyUp={syncCursor}
          onSelect={syncCursor}
        />
        <div className="status"><span>{cursor}</span><span><b>{wordCount}</b> 字 · Markdown</span></div>
      </div>
      <div className="handle"><i /></div>
      <article className="preview">
        <div className="preview-head"><span>实时预览</span><div><button title="刷新预览"><RotateCcw /></button><button title="全屏预览"><Maximize2 /></button></div></div>
        <div className="paper"><MarkdownPreview markdown={markdown} /></div>
      </article>
    </section>
  )
}
