import { useState, type ReactNode } from 'react'

interface Props {
  markdown: string
  publicMode?: boolean
}

function safeHref(value: string): string | undefined {
  const href = value.trim()
  if (/^(https?:\/\/|mailto:|#|\/)/i.test(href)) return href
  return undefined
}

function safeImageSrc(value: string, publicMode: boolean): string | undefined {
  let src = value.trim()
  if (publicMode) {
    src = src.replace(
      /^\/api\/attachments\/([^/]+)\/content$/,
      '/api/attachments/$1/public-content',
    )
  }
  if (/^(https?:\/\/|\/api\/attachments\/)/i.test(src)) return src
  return undefined
}

function detectCodeLanguage(value: string): string {
  const code = value.trim()
  if (!code) return 'text'
  if (/^\s*[{[]/.test(code)) {
    try {
      JSON.parse(code)
      return 'json'
    } catch {
      // Continue with heuristics.
    }
  }
  if (/\b(interface|type\s+\w+\s*=|enum\s+\w+|implements\s+\w+|:\s*(string|number|boolean)\b)/.test(code)) return 'typescript'
  if (/\b(const|let|var|function)\b|=>|console\.log\(|import\s+.+\s+from\s+['"]/.test(code)) return 'javascript'
  if (/\b(def|from\s+\w+\s+import|import\s+\w+|print\(|elif\b|None\b|True\b|False\b)/.test(code)) return 'python'
  if (/\b(public\s+static\s+void\s+main|System\.out\.println|public\s+class)\b/.test(code)) return 'java'
  if (/\b(package\s+main|func\s+main\(|fmt\.(Print|Printf|Println))/.test(code)) return 'go'
  if (/\b(fn\s+main\(|let\s+mut\b|println!\(|use\s+std::)/.test(code)) return 'rust'
  if (/^#!\/.*\b(bash|sh)\b/m.test(code) || /\b(echo|sudo|apt-get|chmod|curl)\b/.test(code)) return 'bash'
  if (/\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(code)) return 'sql'
  if (/<(!doctype|html|head|body|div|span|section|main|script|style|p|a)\b/i.test(code)) return 'html'
  if (/(^|\})\s*[.#]?[a-zA-Z][\w-]*(?:\s+[.#]?[\w-]+)*\s*\{[^}]*:[^}]*\}/s.test(code)) return 'css'
  return 'text'
}

function inlineText(text: string, publicMode: boolean): ReactNode[] {
  const token = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*.+?\*\*|_.+?_|`.+?`|<span style="(?:color:#[0-9a-fA-F]{6}|font-size:\d{1,2}px)">.*?<\/span>)/g
  const parts = text.split(token)
  return parts.filter(Boolean).map((part, index) => {
    const image = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (image) {
      const src = safeImageSrc(image[2], publicMode)
      if (!src) return <span key={index}>{image[1] || '图片'}</span>
      return (
        <span className="md-inline-image" key={index}>
          <img src={src} alt={image[1]} loading="lazy" />
        </span>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{inlineText(part.slice(2, -2), publicMode)}</strong>
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={index}>{inlineText(part.slice(1, -1), publicMode)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>

    const styled = part.match(/^<span style="(color:#[0-9a-fA-F]{6}|font-size:(\d{1,2})px)">(.*?)<\/span>$/s)
    if (styled) {
      const [property, value] = styled[1].split(':')
      const style = property === 'color'
        ? { color: value }
        : { fontSize: `${Math.min(48, Math.max(10, Number(styled[2])))}px` }
      return <span key={index} style={style}>{inlineText(styled[3], publicMode)}</span>
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = safeHref(link[2])
      return href
        ? <a key={index} href={href} target="_blank" rel="noopener noreferrer">{inlineText(link[1], publicMode)}</a>
        : <span key={index}>{link[1]}</span>
    }
    return part
  })
}

function headingNode(level: number, content: string, key: number, publicMode: boolean) {
  const children = inlineText(content, publicMode)
  if (level === 1) return <h1 key={key}>{children}</h1>
  if (level === 2) return <h2 key={key}>{children}</h2>
  if (level === 3) return <h3 key={key}>{children}</h3>
  if (level === 4) return <h4 key={key}>{children}</h4>
  if (level === 5) return <h5 key={key}>{children}</h5>
  return <h6 key={key}>{children}</h6>
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const resolvedLanguage = !language || language === 'auto' ? detectCodeLanguage(value) : language.toLowerCase()
  const codeLines = value.split('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="md-code-block" data-language={resolvedLanguage}>
      <div className="md-code-head">
        <span>{resolvedLanguage.toUpperCase()}</span>
        <button type="button" onClick={() => void copy()}>{copied ? '已复制' : '复制'}</button>
      </div>
      <div className="md-code-lines">
        {codeLines.map((line, index) => (
          <div className="md-code-line" key={`${index}-${line}`}>
            <span className="md-code-number" aria-hidden="true">{index + 1}</span>
            <code>{line || '\u00a0'}</code>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MarkdownPreview({ markdown, publicMode = false }: Props) {
  const lines = markdown.split('\n')
  const nodes: ReactNode[] = []
  let index = 0

  if (lines[0]?.trim() === '---') {
    const end = lines.slice(1).findIndex((line) => line.trim() === '---')
    if (end >= 0) {
      const frontmatter = lines.slice(1, end + 1)
      nodes.push(
        <div className="frontmatter" key="frontmatter">
          {frontmatter.map((line, i) => <div key={`${line}-${i}`}>{line}</div>)}
        </div>,
      )
      index = end + 2
    }
  }

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      if (lang === 'mermaid') {
        const labels = [...code.join('\n').matchAll(/\[(.*?)\]/g)].map((match) => match[1]).slice(0, 12)
        nodes.push(
          <div className="mermaid" key={`mermaid-${index}`}>
            <div className="flow">
              {labels.map((label, flowIndex) => (
                <span className="flow-pair" key={`${label}-${flowIndex}`}>
                  {flowIndex > 0 && <b>→</b>}<span>{label}</span>
                </span>
              ))}
            </div>
          </div>,
        )
      } else {
        nodes.push(<CodeBlock key={`code-${index}`} language={lang} value={code.join('\n')} />)
      }
      continue
    }

    const standaloneImage = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (standaloneImage) {
      const src = safeImageSrc(standaloneImage[2], publicMode)
      nodes.push(src ? (
        <figure className="md-image" key={index}>
          <img src={src} alt={standaloneImage[1]} loading="lazy" />
          {standaloneImage[1] && <figcaption>{standaloneImage[1]}</figcaption>}
        </figure>
      ) : <p key={index}>{standaloneImage[1] || '图片地址不可用'}</p>)
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      nodes.push(headingNode(heading[1].length, heading[2], index, publicMode))
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      nodes.push(<blockquote key={index}>{inlineText(line.slice(2), publicMode)}</blockquote>)
      index += 1
      continue
    }

    if (/^- /.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^- /.test(lines[index])) {
        items.push(lines[index].slice(2))
        index += 1
      }
      nodes.push(
        <ul key={`ul-${index}`}>{items.map((item, i) => {
          const checked = /^\[x\]/i.test(item)
          const unchecked = /^\[ \]/.test(item)
          const clean = item.replace(/^\[(x| )\]\s*/i, '')
          return (
            <li className={checked || unchecked ? 'task-item' : ''} key={`${item}-${i}`}>
              {(checked || unchecked) && <span className={`task-check${checked ? ' checked' : ''}`}>{checked ? '✓' : ''}</span>}
              {inlineText(clean, publicMode)}
            </li>
          )
        })}</ul>,
      )
      continue
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\. /.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\. /, ''))
        index += 1
      }
      nodes.push(<ol key={`ol-${index}`}>{items.map((item, i) => <li key={`${item}-${i}`}>{inlineText(item, publicMode)}</li>)}</ol>)
      continue
    }

    nodes.push(<p key={index}>{inlineText(line, publicMode)}</p>)
    index += 1
  }

  return <>{nodes}</>
}