import { Check, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export interface SelectMenuOption {
  value: string
  label: string
  description?: string
}

interface Props {
  value: string
  options: SelectMenuOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  leadingIcon?: ReactNode
  disabled?: boolean
  menuAlign?: 'left' | 'right'
}

export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  leadingIcon,
  disabled = false,
  menuAlign = 'left',
}: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({
        position: 'fixed',
        top: rect.bottom + 6,
        left: menuAlign === 'right' ? rect.right : rect.left,
        minWidth: Math.max(rect.width, 150),
      })
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
  }, [open, menuAlign])

  const popover = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={popoverRef}
          className={`select-menu-popover portal ${menuAlign}`}
          role="listbox"
          aria-label={`${ariaLabel}选项`}
          style={position}
        >
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'selected' : ''}
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span>
                <strong>{option.label}</strong>
                {option.description && <small>{option.description}</small>}
              </span>
              {option.value === value && <Check />}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={rootRef} className={`select-menu ${className}${open ? ' open' : ''}`}>
      <button
        type="button"
        className="select-menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {leadingIcon && <span className="select-menu-leading">{leadingIcon}</span>}
        <span className="select-menu-label">{selected?.label ?? '请选择'}</span>
        <ChevronDown className="select-menu-chevron" />
      </button>
      {popover}
    </div>
  )
}