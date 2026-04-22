import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, FolderKanban, Calendar, DollarSign, User, Phone, Loader2, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { maskBRL, parseBRL, numToMask, formatDate } from '../lib/utils'
import type { Project, Client } from '../lib/types'

export type { Project }

const EMPTY: Omit<Project, 'id'> = {
  nome_projeto:   '',
  tipo_projeto:   '',
  nome_cliente:   '',
  numero_cliente: '',
  valor:          '',
  data_termino:   '',
  descricao:      '',
  client_id:      undefined,
}

// ── Mapeamento banco ↔ componente ─────────────────────────────────────────────

function fromDB(row: Record<string, unknown>): Project {
  return {
    id:             row.id as string,
    nome_projeto:   (row.nome_projeto as string) ?? '',
    tipo_projeto:   (row.tipo_projeto as string) ?? '',
    nome_cliente:   (row.nome_cliente as string) ?? '',
    numero_cliente: (row.numero_cliente as string) ?? '',
    valor:          numToMask(row.valor as number | null),
    data_termino:   (row.data_termino as string) ?? '',
    descricao:      (row.descricao as string) ?? '',
    client_id:      (row.client_id as string) || undefined,
  }
}

function toDB(data: Omit<Project, 'id'>) {
  return {
    nome_projeto:   data.nome_projeto,
    tipo_projeto:   data.tipo_projeto  || null,
    nome_cliente:   data.nome_cliente  || null,
    numero_cliente: data.numero_cliente || null,
    valor:          parseBRL(data.valor),
    data_termino:   data.data_termino  || null,
    descricao:      data.descricao     || null,
    client_id:      data.client_id     || null,
  }
}

// ── Modal ──────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial:  Omit<Project, 'id'>
  clients:  Client[]
  onSave:   (data: Omit<Project, 'id'>) => Promise<void>
  onClose:  () => void
  editing:  boolean
}

function ProjectModal({ initial, clients, onSave, onClose, editing }: ModalProps) {
  const [form, setForm]     = useState<Omit<Project, 'id'>>(initial)
  const [saving, setSaving] = useState(false)

  function set(field: keyof Omit<Project, 'id'>, value: string | undefined) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleClientSelect(clientId: string) {
    if (!clientId) {
      set('client_id', undefined)
      set('nome_cliente', '')
      set('numero_cliente', '')
      return
    }
    const c = clients.find(c => c.id === clientId)
    if (!c) return
    setForm(f => ({
      ...f,
      client_id:      c.id,
      nome_cliente:   c.nome,
      numero_cliente: c.telefone,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome_projeto.trim()) return
    if (!form.client_id) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const inputCls = `
    w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
    placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
    focus:border-indigo-500/40 transition-all duration-200 hover:border-white/20
  `
  const labelCls = 'block text-xs font-medium text-slate-300 mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

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
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-5 max-h-[70vh] overflow-y-auto">

          {/* Seletor de cliente — obrigatório */}
          <div>
            <label className={labelCls}>Cliente *</label>
            {clients.length === 0 ? (
              <div className="w-full px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex items-center gap-2">
                <span>Nenhum cliente cadastrado.</span>
                <span className="text-amber-300 text-xs">Cadastre um cliente primeiro.</span>
              </div>
            ) : (
              <div className="relative">
                <select
                  required
                  value={form.client_id ?? ''}
                  onChange={e => handleClientSelect(e.target.value)}
                  className={inputCls + ' appearance-none cursor-pointer pr-10'}
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="" disabled>Selecione um cliente…</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            )}
          </div>

          {/* Info do cliente (read-only após seleção) */}
          {form.client_id && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nome do Cliente</label>
                <input className={inputCls + ' opacity-60 cursor-not-allowed'} value={form.nome_cliente} readOnly />
              </div>
              <div>
                <label className={labelCls}>Telefone do Cliente</label>
                <input className={inputCls + ' opacity-60 cursor-not-allowed'} value={form.numero_cliente} readOnly />
              </div>
            </div>
          )}

          {/* Nome | Tipo */}
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
              <input
                className={inputCls}
                placeholder="Ex: Web, Mobile, Design…"
                value={form.tipo_projeto}
                onChange={e => set('tipo_projeto', e.target.value)}
              />
            </div>
          </div>

          {/* Valor | Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Valor (R$)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm select-none">R$</span>
                <input
                  className={inputCls + ' pl-9'}
                  placeholder="0,00"
                  value={form.valor}
                  onChange={e => set('valor', maskBRL(e.target.value))}
                  inputMode="numeric"
                />
              </div>
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
              disabled={saving || !form.client_id}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold
                         btn-shimmer shadow-lg shadow-indigo-500/25 disabled:opacity-60
                         disabled:cursor-not-allowed hover:shadow-indigo-500/40
                         hover:-translate-y-0.5 active:translate-y-0
                         transition-all duration-300 focus:outline-none"
            >
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</span>
                : editing ? 'Salvar alterações' : 'Criar Projeto'
              }
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-slate-300 text-sm font-medium
                         bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07]
                         transition-colors disabled:opacity-50"
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
  project:  Project
  onEdit:   () => void
  onDelete: () => void
}

function ProjectCard({ project, onEdit, onDelete }: CardProps) {
  return (
    <div className="group flex flex-col gap-4 p-5 rounded-2xl bg-slate-900/70 border border-white/[0.07]
                    hover:border-white/[0.13] backdrop-blur-sm transition-all duration-200">

      {/* Top */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{project.nome_projeto}</h3>
          {project.nome_cliente && (
            <p className="text-slate-300 text-xs mt-0.5 truncate">{project.nome_cliente}</p>
          )}
        </div>
        {project.tipo_projeto && (
          <span className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1
                           bg-indigo-500/15 text-indigo-300 ring-indigo-500/20">
            {project.tipo_projeto}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-2.5">
        {project.numero_cliente && (
          <div className="flex items-center gap-1.5 text-slate-300 text-xs">
            <Phone className="w-3 h-3 shrink-0 text-slate-300" />
            <span className="truncate">{project.numero_cliente}</span>
          </div>
        )}
        {project.valor && (
          <div className="flex items-center gap-1.5 text-slate-300 text-xs">
            <DollarSign className="w-3 h-3 shrink-0 text-slate-300" />
            <span className="truncate font-medium text-emerald-400">R$ {project.valor}</span>
          </div>
        )}
        {project.data_termino && (
          <div className="flex items-center gap-1.5 text-slate-300 text-xs">
            <Calendar className="w-3 h-3 shrink-0 text-slate-300" />
            <span>{formatDate(project.data_termino)}</span>
          </div>
        )}
        {project.nome_cliente && (
          <div className="flex items-center gap-1.5 text-slate-300 text-xs">
            <User className="w-3 h-3 shrink-0 text-slate-300" />
            <span className="truncate">{project.nome_cliente}</span>
          </div>
        )}
      </div>

      {project.descricao && (
        <p className="text-slate-300 text-xs leading-relaxed line-clamp-2">{project.descricao}</p>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-1 border-t border-white/[0.05] opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300
                     hover:text-indigo-300 hover:bg-indigo-500/10 text-xs font-medium transition-colors"
        >
          <Pencil className="w-3 h-3" />Editar
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300
                     hover:text-red-400 hover:bg-red-500/10 text-xs font-medium transition-colors"
        >
          <Trash2 className="w-3 h-3" />Excluir
        </button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface ProjectsProps {
  onProjectCreated:        (project: Project) => void
  pendingClient?:          Client | null
  onPendingClientConsumed?: () => void
}

export default function Projects({ onProjectCreated, pendingClient, onPendingClientConsumed }: ProjectsProps) {
  const [projects, setProjects]       = useState<Project[]>([])
  const [clients, setClients]         = useState<Client[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [modalOpen, setModalOpen]     = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [formInitial, setFormInitial] = useState<Omit<Project, 'id'>>(EMPTY)

  useEffect(() => {
    loadProjects()
    loadClients()
  }, [])

  // Abre o modal pré-preenchido com o cliente recém-criado
  useEffect(() => {
    if (!pendingClient) return
    setFormInitial({
      ...EMPTY,
      client_id:      pendingClient.id,
      nome_cliente:   pendingClient.nome,
      numero_cliente: pendingClient.telefone ?? '',
    })
    setEditingId(null)
    setModalOpen(true)
    onPendingClientConsumed?.()
  }, [pendingClient])

  async function loadProjects() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) setError('Erro ao carregar projetos.')
    else if (data) setProjects(data.map(fromDB))
    setLoading(false)
  }

  async function loadClients() {
    const { data } = await supabase
      .from('clients')
      .select('id, nome, telefone, email, cpf_cnpj, tipo, cidade, estado, observacoes')
      .order('nome')
    if (data) setClients(data as Client[])
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async function handleSave(data: Omit<Project, 'id'>) {
    setError('')
    if (editingId) {
      const { error } = await supabase
        .from('projects')
        .update(toDB(data))
        .eq('id', editingId)

      if (error) { setError('Erro ao salvar projeto.'); return }
      setProjects(ps => ps.map(p => p.id === editingId ? { ...data, id: editingId } : p))
    } else {
      const { data: inserted, error } = await supabase
        .from('projects')
        .insert(toDB(data))
        .select()
        .single()

      if (error || !inserted) { setError('Erro ao criar projeto.'); return }
      const newProject = fromDB(inserted)
      setProjects(ps => [newProject, ...ps])
      onProjectCreated(newProject)
    }
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    const proj = projects.find(p => p.id === id)
    if (proj) {
      await supabase.from('kanban_tasks')
        .delete()
        .eq('title', proj.nome_projeto)
        .eq('from_project', true)
    }
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) { setError('Erro ao excluir projeto.'); return }
    setProjects(ps => ps.filter(p => p.id !== id))
  }

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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">Projetos</h1>
          <p className="text-slate-300 text-sm mt-0.5">
            {loading ? 'Carregando…' : `${projects.length} ${projects.length === 1 ? 'projeto' : 'projetos'}`}
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

      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-900/80 ring-1 ring-white/10 flex items-center justify-center mb-4">
            <FolderKanban className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-slate-300 font-medium text-sm">Nenhum projeto ainda</p>
          <p className="text-slate-300 text-xs mt-1">Clique em "Novo Projeto" para começar</p>
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

      {modalOpen && (
        <ProjectModal
          initial={formInitial}
          clients={clients}
          editing={!!editingId}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
