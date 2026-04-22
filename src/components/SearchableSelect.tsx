import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  sublabel?: string
}

interface Props {
  options:      SelectOption[]
  value:        string
  onChange:     (value: string) => void
  placeholder?: string
  required?:    boolean
  className?:   string
  accentColor?: string
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecione…',
  required,
  className = '',
  accentColor = 'indigo',
}: Props) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const containerRef        = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)

  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : options

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(val: string) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  const ringColor = accentColor === 'violet'
    ? 'focus-within:ring-violet-500/60 focus-within:border-violet-500/40'
    : 'focus-within:ring-indigo-500/60 focus-within:border-indigo-500/40'

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Hidden native input for form validation */}
      {required && (
        <input
          type="text"
          required
          value={value}
          onChange={() => {}}
          tabIndex={-1}
          className="absolute inset-0 opacity-0 pointer-events-none w-full"
        />
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl
          bg-white/5 border border-white/10 text-sm transition-all duration-200
          hover:border-white/20 focus:outline-none focus:ring-2
          ${open ? 'ring-2 border-indigo-500/40 ring-indigo-500/60' : ''}
          ${ringColor}`}
      >
        <span className={selected ? 'text-white' : 'text-slate-500'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50
          bg-slate-900 border border-white/[0.10] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">

          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-4">Nenhum resultado</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => select(o.value)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2
                    ${o.value === value
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'text-slate-200 hover:bg-white/[0.05]'}`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.sublabel && (
                    <span className="text-slate-500 text-xs shrink-0">{o.sublabel}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
