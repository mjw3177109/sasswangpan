import { Check, Palette, Plus } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

interface Props {
  onSelect: (color: string) => void
}

const rows = [
  ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#ffffff'],
  ['#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d', '#16a34a', '#0d9488', '#0891b2'],
  ['#e11d48', '#f97316', '#f59e0b', '#facc15', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4'],
  ['#f43f5e', '#fb923c', '#fbbf24', '#fde047', '#a3e635', '#4ade80', '#2dd4bf', '#22d3ee'],
  ['#be123c', '#c2410c', '#b45309', '#a16207', '#4d7c0f', '#15803d', '#0f766e', '#0e7490'],
  ['#2563eb', '#4f46e5', '#6d28d9', '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#be185d'],
  ['#60a5fa', '#818cf8', '#a78bfa', '#c4b5fd', '#d8b4fe', '#e879f9', '#f472b6', '#fb7185'],
]
const gradients = ['#06b6d4', '#6c5ce7', '#ec4899', '#f97316']

export function ColorPalettePopover({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [custom, setCustom] = useState('#6c5ce7')
  const [recent, setRecent] = useState<string[]>([])
  const [position, setPosition] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const validCustom = useMemo(() => /^#[0-9a-fA-F]{6}$/.test(custom), [custom])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({ position: 'fixed', left: rect.left, top: rect.bottom + 7 })
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (color: string) => {
    setActive(color)
    setRecent((current) => [color, ...current.filter((item) => item !== color)].slice(0, 6))
    onSelect(color)
    setOpen(false)
  }

  const popover = open && typeof document !== 'undefined'
    ? createPortal(
        <div ref={popoverRef} className="color-palette-popover portal" role="dialog" aria-label="字体颜色面板" style={position}>
          <button className="color-default" type="button" onClick={() => choose('#17171c')}>
            <span style={{ background: '#17171c' }} />默认
          </button>
          <div className="color-swatches">
            {rows.flat().map((color) => (
              <button
                type="button"
                className={active?.toLowerCase() === color.toLowerCase() ? 'active' : ''}
                aria-label={`颜色 ${color}`}
                title={color}
                key={color}
                style={{ background: color }}
                onClick={() => choose(color)}
              >
                {active?.toLowerCase() === color.toLowerCase() && <Check />}
              </button>
            ))}
          </div>
          <div className="color-section-label">渐变色</div>
          <div className="color-gradient-row">
            {gradients.map((color, index) => (
              <button key={color} type="button" aria-label={`渐变推荐 ${index + 1}`} style={{ background: `linear-gradient(135deg, ${color}, ${rows[5][index + 1]})` }} onClick={() => choose(color)} />
            ))}
          </div>
          <div className="color-section-label">最近使用</div>
          {recent.length ? (
            <div className="color-recent-row">
              {recent.map((color) => <button type="button" key={color} aria-label={`最近颜色 ${color}`} style={{ background: color }} onClick={() => choose(color)} />)}
            </div>
          ) : <div className="color-empty">暂无</div>}
          <div className="color-custom-row">
            <Plus />
            <input aria-label="自定义十六进制颜色" value={custom} onChange={(event) => setCustom(event.target.value)} maxLength={7} />
            <button type="button" disabled={!validCustom} onClick={() => choose(custom)}>应用</button>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div className={`color-palette-control${open ? ' open' : ''}${active ? ' has-selection' : ''}`} ref={rootRef}>
      <button type="button" className="color-palette-trigger" aria-label="字体颜色" aria-expanded={open} title="字体颜色" onClick={() => setOpen((current) => !current)}>
        <Palette />
        <i className={active ? 'has-color' : ''} style={active ? { background: active } : undefined} />
      </button>
      {popover}
    </div>
  )
}