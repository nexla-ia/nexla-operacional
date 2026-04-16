import { useState, useRef, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, FolderKanban, Calendar, DollarSign, User, Hash, ChevronDown } from 'lucide-react'

interface Project {
  id: string
  nome_projeto: string
  tipo_projeto: string
  nome_cliente: string
  numero_cliente: string
  valor: string
  data_termino: string
  descricao: string
}

const TIPOS = [
  { value: 'web',         label: 'Web' },
  { value: 'mobile',      label: 'Mobile' },
  { value: 'desktop',     label: 'Desktop' },
  { value: 'api',         label: 'API / Backend' },
  { value: 'consultoria', label: 'Consultoria' },
  { value: 'design',      label: 'Design' },
  { value: 'outro',       label: 'Outro' },
]

const TIPO_BADGE: Record<string, string> = {
  web:         'bg-blue-500/15 text-blue-300 ring-blue-500/20',
  mobile:      'bg-violet-500/15 text-violet-300 ring-violet-500/20',
  desktop:     'bg-indigo-500/15 text-indigo-300 ring-indigo-500/20',
  api:         'bg-cyan-500/15 text-cyan-300 ring-cyan-500/20',
  consultoria: 'bg-amber-500/15 text-amber-300 ring-amber-500/20',
  design:      'bg-pink-500/15 text-pink-300 ring-pink-500/20',
  outro:       'bg-slate-500/15 text-slate-300 ring-slate-500/20',
}

const EMPTY: Omit<Project, 'id'> = {
  nome_projeto:   '',
  tipo_projeto:   'web',
  nome_cliente:   '',
  numero_cliente: '',
  valor:          '',
  data_termino:   '',
  descricao:      '',
}

// ── ComboSelect ───────────────────────────────────────────────────────────────
// Dropdown totalmente customizado: digita livremente ou escolhe da lista.

interface ComboSelectProps {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
}

function ComboSelect({ value, onChange, options, placeholder, className = '' }: ComboSelectProps) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref               = useRef<HTMLDivElement>(null)

  const currentLabel = options.find(o => o.value === value)?.label ?? value

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(val: string) {
    onChange(val)
    setOpen(false)
    setQuery('')
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    if (e.key === 'Enter' && query.trim()) {
      // Se digitou algo que não bate com nenhuma opção, usa como valor livre
      const match = filtered[0]
      if (match) select(match.value)
      else { onChange(query.trim()); setOpen(false); setQuery('') }
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl
                   bg-white/5 border border-white/10 text-white text-sm text-left
                   hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                   focus:border-indigo-500/40 transition-all duration-200"
      >
        <span className={currentLabel ? 'text-white' : 'text-slate-500'}>
          {currentLabel || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl bg-slate-800 border border-white/[0.10]
                        shadow-2xl shadow-black/60 overflow-hidden">
          {/* Input de busca */}
          <div className="p-2 border-b border-white/[0.07]">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Buscar ou digitar…"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm
                         placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>

          {/* Lista */}
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-2.5 text-slate-500 text-sm">Nenhum resultado</li>
            ) : (
              filtered.map(opt => (
                <li
                  key={opt.value}
                  onClick={() => select(opt.value)}
                  className={`px-4 py-2.5 text-sm cursor-pointer transition-colors
                    ${value === opt.value
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function formatCurrency(raw: string) {
  const n = parseFloat(raw.replace(',', '.'))
  if (isNaN(n)) return raw
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ── Modal ──────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial: Omit<Project, 'id'>
  onSave: (data: Omit<Project, 'id'>) => void
  onClose: () => void
  editing: boolean
}

function ProjectModal({ initial, onSave, onClose, editing }: ModalProps) {
  const [form, setForm] = useState<Omit<Project, 'id'>>(initial)

  function set(field: keyof Omit<Project, 'id'>, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome_projeto.trim()) return
    onSave(form)
  }

  const inputCls = `
    w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
    placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
    focus:border-indigo-500/40 transition-all duration-200 hover:border-white/20
  `
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in-up">

        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
              <FolderKanban className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-white font-semibold text-base">
              {editing ? 'Editar Projeto' : 'Novo Projeto'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.07] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Nome projeto | Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nome do Projeto *</label>
              <input
                className={inputCls}
                placeholder="Ex: Site institucional"
                value={form.nome_projeto}
                onChange={e => set('nome_projeto', e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Tipo de Projeto</label>
              <ComboSelect
                value={form.tipo_projeto}
                onChange={v => set('tipo_projeto', v)}
                options={TIPOS}
                placeholder="Selecione ou digite…"
              />
            </div>
          </div>

          {/* Nome cliente | Número cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nome do Cliente</label>
              <input
                className={inputCls}
                placeholder="Ex: João Silva"
                value={form.nome_cliente}
                onChange={e => set('nome_cliente', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Número do Cliente</label>
              <input
                className={inputCls}
                placeholder="Ex: 00123"
                value={form.numero_cliente}
                onChange={e => set('numero_cliente', e.target.value)}
              />
            </div>
          </div>

          {/* Valor | Data terminar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Valor (R$)</label>
              <input
                className={inputCls}
                placeholder="Ex: 5000,00"
                value={form.valor}
                onChange={e => set('valor', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Data para Terminar</label>
              <input
                type="date"
                className={inputCls + ' cursor-pointer'}
                value={form.data_termino}
                onChange={e => set('data_termino', e.target.value)}
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className={labelCls}>Descrição do Projeto</label>
            <textarea
              rows={3}
              className={inputCls + ' resize-none'}
              placeholder="Descreva o escopo e objetivos do projeto…"
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
            />
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold
                         btn-shimmer shadow-lg shadow-indigo-500/25
                         hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0
                         transition-all duration-300 focus:outline-none"
            >
              {editing ? 'Salvar alterações' : 'Criar Projeto'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-slate-400 text-sm font-medium
                         bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07]
                         transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────

interface CardProps {
  project: Project
  onEdit: () => void
  onDelete: () => void
}

function ProjectCard({ project, onEdit, onDelete }: CardProps) {
  const badge = TIPO_BADGE[project.tipo_projeto] ?? TIPO_BADGE.outro
  const tipoLabel = TIPOS.find(t => t.value === project.tipo_projeto)?.label ?? project.tipo_projeto

  return (
    <div className="group flex flex-col gap-4 p-5 rounded-2xl bg-slate-900/70 border border-white/[0.07]
                    hover:border-white/[0.13] backdrop-blur-sm transition-all duration-200">

      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{project.nome_projeto}</h3>
          {project.nome_cliente && (
            <p className="text-slate-500 text-xs mt-0.5 truncate">{project.nome_cliente}</p>
          )}
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ${badge}`}>
          {tipoLabel}
        </span>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {project.numero_cliente && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <Hash className="w-3 h-3 shrink-0 text-slate-600" />
            <span className="truncate">{project.numero_cliente}</span>
          </div>
        )}
        {project.valor && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <DollarSign className="w-3 h-3 shrink-0 text-slate-600" />
            <span className="truncate">{formatCurrency(project.valor)}</span>
          </div>
        )}
        {project.data_termino && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <Calendar className="w-3 h-3 shrink-0 text-slate-600" />
            <span>{formatDate(project.data_termino)}</span>
          </div>
        )}
        {project.nome_cliente && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <User className="w-3 h-3 shrink-0 text-slate-600" />
            <span className="truncate">{project.nome_cliente}</span>
          </div>
        )}
      </div>

      {/* Descrição */}
      {project.descricao && (
        <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">
          {project.descricao}
        </p>
      )}

      {/* Ações — visíveis no hover */}
      <div className="flex gap-2 pt-1 border-t border-white/[0.05] opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400
                     hover:text-indigo-300 hover:bg-indigo-500/10 text-xs font-medium transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Editar
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400
                     hover:text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Excluir
        </button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Projects() {
  const [projects, setProjects]     = useState<Project[]>([])
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [formInitial, setFormInitial] = useState<Omit<Project, 'id'>>(EMPTY)

  function openNew() {
    setFormInitial(EMPTY)
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(p: Project) {
    const { id, ...rest } = p
    setFormInitial(rest)
    setEditingId(id)
    setModalOpen(true)
  }

  function handleSave(data: Omit<Project, 'id'>) {
    if (editingId) {
      setProjects(ps => ps.map(p => p.id === editingId ? { ...data, id: editingId } : p))
    } else {
      setProjects(ps => [...ps, { ...data, id: uid() }])
    }
    setModalOpen(false)
  }

  function handleDelete(id: string) {
    setProjects(ps => ps.filter(p => p.id !== id))
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">Projetos</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold
                     btn-shimmer shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35
                     hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
        >
          <Plus className="w-4 h-4" />
          Novo Projeto
        </button>
      </div>

      {/* Grid */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-900/80 ring-1 ring-white/10 flex items-center justify-center mb-4">
            <FolderKanban className="w-6 h-6 text-slate-600" />
          </div>
          <p className="text-slate-400 font-medium text-sm">Nenhum projeto ainda</p>
          <p className="text-slate-600 text-xs mt-1">Clique em "Novo Projeto" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <ProjectModal
          initial={formInitial}
          editing={!!editingId}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
