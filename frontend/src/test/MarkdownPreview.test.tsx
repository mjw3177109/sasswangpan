import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownPreview } from '../lib/MarkdownPreview'

describe('MarkdownPreview', () => {
  it('renders headings, inline emphasis and task lists', () => {
    render(<MarkdownPreview markdown={'# 标题\n\n**加粗** 与 `代码`\n\n- 第一项\n- [x] 已完成'} />)
    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument()
    expect(screen.getByText('加粗').tagName).toBe('STRONG')
    expect(screen.getByText('代码').tagName).toBe('CODE')
    expect(screen.getByText(/已完成/)).toBeInTheDocument()
  })

  it('does not create clickable javascript links', () => {
    render(<MarkdownPreview markdown={'[危险](javascript:alert(1))\n\n[安全](https://example.com)'} />)
    expect(screen.getByText('危险').tagName).toBe('SPAN')
    const safe = screen.getByRole('link', { name: '安全' })
    expect(safe).toHaveAttribute('href', 'https://example.com')
    expect(safe).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders mermaid source as a safe flow preview', () => {
    render(<MarkdownPreview markdown={'```mermaid\nflowchart LR\nA[想法] --> B[作品]\n```'} />)
    expect(screen.getByText('想法')).toBeInTheDocument()
    expect(screen.getByText('作品')).toBeInTheDocument()
  })

  it('renders fenced code as a real code block', () => {
    render(<MarkdownPreview markdown={'```python\nprint("hello")\n```'} />)
    expect(screen.getByText('PYTHON')).toBeInTheDocument()
    expect(screen.getByText('print("hello")')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()
  })

  it('renders safe font size and font color spans', () => {
    render(<MarkdownPreview markdown={'<span style="font-size:20px">大字</span>\n\n<span style="color:#ff0000">红字</span>'} />)
    expect(screen.getByText('大字')).toHaveStyle({ fontSize: '20px' })
    expect(screen.getByText('红字')).toHaveStyle({ color: '#ff0000' })
  })

  it('renders uploaded images and rewrites them to public URLs on published pages', () => {
    const { rerender } = render(<MarkdownPreview markdown={'![截图](/api/attachments/demo-id/content)'} />)
    expect(screen.getByRole('img', { name: '截图' })).toHaveAttribute('src', '/api/attachments/demo-id/content')

    rerender(<MarkdownPreview markdown={'![截图](/api/attachments/demo-id/content)'} publicMode />)
    expect(screen.getByRole('img', { name: '截图' })).toHaveAttribute('src', '/api/attachments/demo-id/public-content')
  })

  it('renders heading levels 1 through 6', () => {
    render(<MarkdownPreview markdown={'# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6'} />)
    for (let level = 1; level <= 6; level += 1) {
      expect(screen.getByRole('heading', { level, name: `H${level}` })).toBeInTheDocument()
    }
  })

  it('auto detects code language and renders line numbers', () => {
    const { container } = render(<MarkdownPreview markdown={'```\nprint("hello")\nprint("world")\n```'} />)
    expect(container.querySelector('.md-code-block')).toHaveAttribute('data-language', 'python')
    expect([...container.querySelectorAll('.md-code-number')].map((node) => node.textContent)).toEqual(['1', '2'])
    expect(screen.getByText('PYTHON')).toBeInTheDocument()
  })

  it('keeps an explicitly selected code language', () => {
    const { container } = render(<MarkdownPreview markdown={'```typescript\ninterface User { name: string }\n```'} />)
    expect(container.querySelector('.md-code-block')).toHaveAttribute('data-language', 'typescript')
    expect(screen.getByText('TYPESCRIPT')).toBeInTheDocument()
  })

})