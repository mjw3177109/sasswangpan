import { Bold, Image, Italic, Link, List, ListOrdered, Quote, Table2, Code2 } from 'lucide-react'
import { useState } from 'react'
import type { ViewMode } from '../types'
import { ColorPalettePopover } from './ui/ColorPalettePopover'
import { SelectMenu, type SelectMenuOption } from './ui/SelectMenu'

export type FormatAction =
  | { type: 'wrap'; before: string; after: string; fallback?: string }
  | { type: 'prefix'; prefix: string; fallback?: string }
  | { type: 'insert'; text: string }
  | { type: 'heading'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'fontSize'; size: number }
  | { type: 'color'; color: string }
  | { type: 'codeBlock'; language: string }

interface Props {
  viewMode: ViewMode
  onFormat: (action: FormatAction) => void
  onImageUpload: () => void
  onViewChange: (mode: ViewMode) => void
}

const headingOptions: SelectMenuOption[] = [
  { value: '0', label: '正文' },
  { value: '1', label: '标题 1' },
  { value: '2', label: '标题 2' },
  { value: '3', label: '标题 3' },
  { value: '4', label: '标题 4' },
  { value: '5', label: '标题 5' },
  { value: '6', label: '标题 6' },
]

const sizeOptions: SelectMenuOption[] = [12, 14, 15, 16, 18, 20, 24, 28, 32].map((size) => ({
  value: String(size),
  label: `${size}px`,
}))

const codeLanguageOptions: SelectMenuOption[] = [
  { value: 'auto', label: '自动识别', description: '根据代码内容判断语言' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'text', label: 'Text' },
]

export function Toolbar({ viewMode, onFormat, onImageUpload, onViewChange }: Props) {
  const [heading, setHeading] = useState('0')
  const [fontSize, setFontSize] = useState('15')
  const [codeLanguage, setCodeLanguage] = useState('auto')

  return (
    <div className="toolbar">
      <div className="formats">
        <SelectMenu
          ariaLabel="正文和标题"
          className="toolbar-select heading-menu"
          value={heading}
          options={headingOptions}
          onChange={(value) => {
            setHeading(value)
            onFormat({ type: 'heading', level: Number(value) as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
          }}
        />
        <SelectMenu
          ariaLabel="字号"
          className="toolbar-select size-menu"
          value={fontSize}
          options={sizeOptions}
          onChange={(value) => {
            setFontSize(value)
            onFormat({ type: 'fontSize', size: Number(value) })
          }}
        />
        <span />
        <button title="粗体" aria-label="粗体" onClick={() => onFormat({ type: 'wrap', before: '**', after: '**', fallback: '文字' })}><Bold /></button>
        <button title="斜体" aria-label="斜体" onClick={() => onFormat({ type: 'wrap', before: '_', after: '_', fallback: '文字' })}><Italic /></button>
        <button title="引用" aria-label="引用" onClick={() => onFormat({ type: 'prefix', prefix: '> ', fallback: '引用内容' })}><Quote /></button>
        <span />
        <ColorPalettePopover onSelect={(color) => onFormat({ type: 'color', color })} />
        <SelectMenu
          ariaLabel="代码块语言"
          className="toolbar-select code-language-menu"
          value={codeLanguage}
          options={codeLanguageOptions}
          leadingIcon={<Code2 />}
          onChange={(value) => {
            setCodeLanguage(value)
            onFormat({ type: 'codeBlock', language: value })
          }}
        />
        <button title="无序列表" aria-label="无序列表" onClick={() => onFormat({ type: 'prefix', prefix: '- ', fallback: '列表项' })}><List /></button>
        <button title="有序列表" aria-label="有序列表" onClick={() => onFormat({ type: 'prefix', prefix: '1. ', fallback: '列表项' })}><ListOrdered /></button>
        <button title="链接" aria-label="链接" onClick={() => onFormat({ type: 'insert', text: '[链接文字](https://)' })}><Link /></button>
        <button className="image-upload-button" title="上传本地图片并插入文档" aria-label="上传本地图片" onClick={onImageUpload}><Image /></button>
        <span />
        <button className="wide" title="Mermaid 图表" onClick={() => onFormat({ type: 'insert', text: '```mermaid\nflowchart LR\n  A[想法] --> B[创作]\n  B --> C[发布]\n```' })}><b>M</b> 图表</button>
        <button title="表格" aria-label="表格" onClick={() => onFormat({ type: 'insert', text: '| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |' })}><Table2 /></button>
      </div>
      <div className="views" aria-label="编辑视图">
        <button className={viewMode === 'edit' ? 'active' : ''} onClick={() => onViewChange('edit')}>编辑</button>
        <button className={viewMode === 'split' ? 'active' : ''} onClick={() => onViewChange('split')}>分屏</button>
        <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => onViewChange('preview')}>预览</button>
      </div>
    </div>
  )
}