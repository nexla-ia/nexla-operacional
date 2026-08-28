import { useState, useRef, useEffect } from 'react'
import { Plus, X, Layers, Loader2, GripVertical, User, Phone, DollarSign, Calendar, FileText, Tag, Star, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate, numToMask } from '../lib/utils'

interface Task {
  id: string
  title: string
  subtitle?: string
  fromProject?: boolean
  color?: string
  project_id?: string
  due_date?: string
  important?: boolean
}

interface Column {
  id: string
  title: string
  position: number
  tasks: Task[]
}

interface KanbanBoardProps {
  pendingTask?: { title: string; subtitle?: string; project_id?: string } | null
  onPendingTaskConsumed?: () => void
  role?: 'admin' | 'operator' | null
}

const DEFAULT_COLS = [
  { title: 'A Fazer',      position: 0 },
  { title: 'Em Andamento', position: 1 },
  { title: 'Concluída',    position: 2 },
]

const ACCENT_BY_POS: Record<number, string> = {
  0: 'bg-slate-400',
  1: 'bg-indigo-500',
  2: 'bg-emerald-500',
}

// ── Sistema de cores (core) ───────────────────────────────────────────────────

const CORES: { key: string; dot: string; ring: string; bg: string; border: string; label: string }[] = [
  { key: 'none',    dot: 'bg-slate-600',   ring: 'ring-slate-500/30',   bg: 'bg-slate-800/80',   border: 'border-white/[0.06]',   label: 'Padrão'   },
  { key: 'red',     dot: 'bg-red-500',     ring: 'ring-red-500/30',     bg: 'bg-red-950/30',     border: 'border-red-500/25',     label: 'Urgente'  },
  { key: 'amber',   dot: 'bg-amber-400',   ring: 'ring-amber-400/30',   bg: 'bg-amber-950/30',   border: 'border-amber-400/25',   label: 'Atenção'  },
  { key: 'emerald', dot: 'bg-emerald-500', ring: 'ring-emerald-500/30', bg: 'bg-emerald-950/30', border: 'border-emerald-500/25', label: 'OK'       },
  { key: 'blue',    dot: 'bg-blue-500',    ring: 'ring-blue-500/30',    bg: 'bg-blue-950/30',    border: 'border-blue-500/25',    label: 'Info'     },
  { key: 'violet',  dot: 'bg-violet-500',  ring: 'ring-violet-500/30',  bg: 'bg-violet-950/30',  border: 'border-violet-500/25',  label: 'Especial' },
]

function coreOf(key?: string) {
  return CORES.find(c => c.key === (key || 'none')) ?? CORES[0]
}

// ── Modal: detalhes do projeto ────────────────────────────────────────────────

interface ProjectDetail {
  nome_projeto:   string
  tipo_projeto:   string
  nome_cliente:   string
  numero_cliente: string
  valor:          string
  data_termino:   string
  descricao:      string
}

function ProjectDetailModal({ projectId, hideValor, onClose }: { projectId: string; hideValor?: boolean; onClose: () => void }) {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('projects')
      .select('nome_projeto, tipo_projeto, nome_cliente, numero_cliente, valor, data_termino, descricao')
      .eq('id', projectId)
      .single()
      .then(({ data }) => {
        if (data) setProject({ ...data, valor: numToMask(data.valor as number | null) } as ProjectDetail)
        setLoading(false)
      })
  }, [projectId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-white/[0.12] rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
              <Layers className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-white font-semibold text-sm">Detalhes do Projeto</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
          ) : !project ? (
            <p className="text-slate-300 text-sm text-center py-6">Projeto não encontrado.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-bold text-base">{project.nome_projeto}</h3>
                {project.tipo_projeto && (
                  <span className="inline-block mt-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/20">
                    {project.tipo_projeto}
                  </span>
                )}
              </div>
              <div className="space-y-3 pt-1">
                {project.nome_cliente && (
                  <div className="flex items-center gap-2.5">
                    <User className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="text-white text-sm">{project.nome_cliente}</span>
                  </div>
                )}
                {project.numero_cliente && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="text-white text-sm">{project.numero_cliente}</span>
                  </div>
                )}
                {project.valor && !hideValor && (
                  <div className="flex items-center gap-2.5">
                    <DollarSign className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="text-emerald-400 font-semibold text-sm">R$ {project.valor}</span>
                  </div>
                )}
                {project.data_termino && (
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="text-white text-sm">{formatDate(project.data_termino)}</span>
                  </div>
                )}
                {project.descricao && (
                  <div className="flex items-start gap-2.5">
                    <FileText className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
                    <span className="text-slate-200 text-sm leading-relaxed">{project.descricao}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal: detalhes / edição de tarefa manual ─────────────────────────────────

interface TaskDetailModalProps {
  task:     Task
  onClose:  () => void
  onDelete: (taskId: string) => Promise<void>
  onUpdate: (taskId: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>
}

function TaskDetailModal({ task, onClose, onDelete, onUpdate }: TaskDetailModalProps) {
  const [editing, setEditing]         = useState(false)
  const [title, setTitle]             = useState(task.title)
  const [subtitle, setSubtitle]       = useState(task.subtitle ?? '')
  const [dueDate, setDueDate]         = useState(task.due_date ?? '')
  const [color, setColor]             = useState(task.color ?? 'none')
  const [important, setImportant]     = useState(task.important ?? false)
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const core = coreOf(editing ? color : task.color)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onUpdate(task.id, {
      title:     title.trim(),
      subtitle:  subtitle.trim() || undefined,
      due_date:  dueDate || undefined,
      color:     color || undefined,
      important,
    })
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    await onDelete(task.id)
    onClose()
  }

  const inputCls = `w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm
    placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/40 transition-all`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-slate-900 border border-white/[0.12] rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in-up">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <span className="text-white font-semibold text-sm">{editing ? 'Editar Tarefa' : 'Tarefa'}</span>
          <div className="flex items-center gap-1">
            {!editing && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Confirmação de exclusão */}
        {confirmDelete && (
          <div className="px-6 py-5 space-y-3">
            <p className="text-white text-sm font-medium">Excluir esta tarefa?</p>
            <p className="text-slate-400 text-xs">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleDelete}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
              >
                Excluir
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* View mode */}
        {!editing && !confirmDelete && (
          <div className="px-6 py-5 space-y-3.5">
            <div className="flex items-start gap-2">
              <p className="text-white font-semibold text-sm flex-1">{task.title}</p>
              {task.important && (
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0 mt-0.5" />
              )}
            </div>
            {task.subtitle && <p className="text-slate-300 text-sm">{task.subtitle}</p>}
            {task.due_date && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-white text-sm">{formatDate(task.due_date)}</span>
              </div>
            )}
            {task.color && task.color !== 'none' && (
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-400" />
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${core.ring}`}>
                  <span className={`w-2 h-2 rounded-full ${core.dot}`} />
                  {core.label}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Edit mode */}
        {editing && !confirmDelete && (
          <div className="px-6 py-5 space-y-3">
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título da tarefa…"
              className={inputCls}
            />
            <input
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder="Subtítulo (opcional)"
              className={inputCls}
            />
            <div>
              <label className="block text-[10px] text-slate-400 font-medium mb-1">Data limite</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className={inputCls + ' cursor-pointer'}
                style={{ colorScheme: 'dark' }}
              />
            </div>

            {/* Core */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium mr-0.5">Core:</span>
              {CORES.map(c => (
                <button
                  key={c.key}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.key)}
                  className={`w-5 h-5 rounded-full transition-all ${c.dot}
                    ${color === c.key ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/60 scale-110' : 'opacity-60 hover:opacity-100'}`}
                />
              ))}
            </div>

            {/* Importante */}
            <button
              type="button"
              onClick={() => setImportant(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all
                ${important
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}
            >
              <Star className={`w-3.5 h-3.5 ${important ? 'fill-amber-400 text-amber-400' : ''}`} />
              {important ? 'Importante' : 'Marcar como importante'}
            </button>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({ task, onDragStart, onClick }: {
  task: Task
  onDragStart: () => void
  onClick: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const core = coreOf(task.color)

  return (
    <div
      draggable
      onDragStart={() => { setDragging(true); onDragStart() }}
      onDragEnd={() => setDragging(false)}
      onClick={onClick}
      className={`group flex items-start gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all duration-150
        ${core.bg} ${core.border} hover:brightness-110
        ${dragging ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5">
          <span className="text-white text-sm leading-snug break-words flex-1">{task.title}</span>
          {task.important && (
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0 mt-0.5" />
          )}
        </div>
        {!task.fromProject && task.subtitle && (
          <span className="text-slate-300 text-xs mt-0.5 block truncate">{task.subtitle}</span>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {task.fromProject && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">
              <Layers className="w-2.5 h-2.5" />Projeto
            </span>
          )}
          {task.color && task.color !== 'none' && (
            <span className={`w-2 h-2 rounded-full ${core.dot}`} />
          )}
          {task.due_date && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
              <Calendar className="w-2.5 h-2.5" />{formatDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Formulário de nova tarefa (inline por coluna) ─────────────────────────────

function AddTaskForm({ onAdd, onCancel }: {
  onAdd: (title: string, subtitle: string, color: string, due_date: string, important: boolean) => void
  onCancel: () => void
}) {
  const [title,     setTitle]     = useState('')
  const [subtitle,  setSubtitle]  = useState('')
  const [color,     setColor]     = useState('none')
  const [dueDate,   setDueDate]   = useState('')
  const [important, setImportant] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), subtitle.trim(), color, dueDate, important)
  }

  const inputCls = `w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm
    placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/40 transition-all`

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 pt-2 pb-1">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        placeholder="Título da tarefa…"
        className={inputCls}
      />
      <input
        value={subtitle}
        onChange={e => setSubtitle(e.target.value)}
        placeholder="Subtítulo (opcional)"
        className={inputCls}
      />

      {/* Data limite */}
      <div>
        <label className="block text-[10px] text-slate-400 font-medium mb-1">Data limite</label>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className={inputCls + ' cursor-pointer'}
          style={{ colorScheme: 'dark' }}
        />
      </div>

      {/* Core */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-slate-400 font-medium mr-0.5">Core:</span>
        {CORES.map(c => (
          <button
            key={c.key}
            type="button"
            title={c.label}
            onClick={() => setColor(c.key)}
            className={`w-5 h-5 rounded-full transition-all ${c.dot}
              ${color === c.key ? 'ring-2 ring-offset-1 ring-offset-slate-800 ring-white/60 scale-110' : 'opacity-60 hover:opacity-100'}`}
          />
        ))}
      </div>

      {/* Importante */}
      <button
        type="button"
        onClick={() => setImportant(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all w-full
          ${important
            ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'}`}
      >
        <Star className={`w-3.5 h-3.5 ${important ? 'fill-amber-400 text-amber-400' : ''}`} />
        {important ? 'Importante' : 'Marcar como importante'}
      </button>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </form>
  )
}

// ── KanbanBoard ───────────────────────────────────────────────────────────────

export default function KanbanBoard({ pendingTask, onPendingTaskConsumed, role }: KanbanBoardProps) {
  const [columns, setColumns]           = useState<Column[]>([])
  const [loading, setLoading]           = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColTitle, setNewColTitle]   = useState('')
  const [addingTaskColId, setAddingTaskColId] = useState<string | null>(null)
  const [dragOverCol,        setDragOverCol]        = useState<string | null>(null)
  const [dragOverColReorder, setDragOverColReorder] = useState<string | null>(null)

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask]           = useState<Task | null>(null)

  const dragTaskRef = useRef<{ taskId: string; fromColId: string } | null>(null)
  const dragColRef  = useRef<string | null>(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!pendingTask || loading || columns.length === 0) return
    const firstCol = [...columns].sort((a, b) => a.position - b.position)[0]
    if (firstCol) {
      addTaskToDB(firstCol.id, pendingTask.title, pendingTask.subtitle, true, undefined, pendingTask.project_id)
      onPendingTaskConsumed?.()
    }
  }, [pendingTask, loading, columns.length])

  // ── Carga ─────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    setMigrationPending(false)

    let { data: cols, error: colsErr } = await supabase
      .from('kanban_columns').select('*').order('position')

    if (colsErr) { setMigrationPending(true); setLoading(false); return }

    if (!cols || cols.length === 0) {
      const { data: seeded } = await supabase.from('kanban_columns').insert(DEFAULT_COLS).select()
      cols = seeded ?? []
    }

    const { data: tasks } = await supabase.from('kanban_tasks').select('*').order('position')

    const built: Column[] = (cols ?? []).map((c: Record<string, unknown>) => ({
      id:       c.id as string,
      title:    c.title as string,
      position: c.position as number,
      tasks: (tasks ?? [])
        .filter((t: Record<string, unknown>) => t.column_id === c.id)
        .map((t: Record<string, unknown>) => ({
          id:          t.id as string,
          title:       t.title as string,
          subtitle:    (t.subtitle as string) || undefined,
          fromProject: t.from_project as boolean,
          color:       (t.color as string) || undefined,
          project_id:  (t.project_id as string) || undefined,
          due_date:    (t.due_date as string) || undefined,
          important:   (t.important as boolean) || false,
        })),
    }))

    setColumns(built)
    setLoading(false)
  }

  // ── DB helpers ────────────────────────────────────────────────────────────

  async function addTaskToDB(
    colId: string,
    title: string,
    subtitle?: string,
    fromProject = false,
    color?: string,
    project_id?: string,
    due_date?: string,
    important = false,
  ) {
    const maxPos = columns.find(c => c.id === colId)?.tasks.length ?? 0
    const { data, error } = await supabase
      .from('kanban_tasks')
      .insert({ column_id: colId, title, subtitle: subtitle || null, position: maxPos,
        from_project: fromProject, color: color || null, project_id: project_id || null,
        due_date: due_date || null, important })
      .select().single()
    if (error || !data) return
    const t: Task = {
      id: data.id, title: data.title, subtitle: data.subtitle || undefined,
      fromProject: data.from_project, color: data.color || undefined,
      project_id: data.project_id || undefined, due_date: data.due_date || undefined,
      important: data.important || false,
    }
    setColumns(cols => cols.map(c => c.id === colId ? { ...c, tasks: [...c.tasks, t] } : c))
  }

  async function moveTaskInDB(taskId: string, fromColId: string, toColId: string) {
    const newPos = columns.find(c => c.id === toColId)?.tasks.length ?? 0
    await supabase.from('kanban_tasks').update({ column_id: toColId, position: newPos }).eq('id', taskId)
    setColumns(cols => {
      const task = cols.find(c => c.id === fromColId)?.tasks.find(t => t.id === taskId)
      if (!task) return cols
      return cols.map(c => {
        if (c.id === fromColId) return { ...c, tasks: c.tasks.filter(t => t.id !== taskId) }
        if (c.id === toColId)   return { ...c, tasks: [...c.tasks, task] }
        return c
      })
    })
  }

  async function deleteTask(taskId: string) {
    await supabase.from('kanban_tasks').delete().eq('id', taskId)
    setColumns(cols => cols.map(col => ({ ...col, tasks: col.tasks.filter(t => t.id !== taskId) })))
  }

  async function updateTask(taskId: string, updates: Partial<Omit<Task, 'id'>>) {
    const dbUpdates: Record<string, unknown> = {}
    if ('title'     in updates) dbUpdates.title     = updates.title
    if ('subtitle'  in updates) dbUpdates.subtitle  = updates.subtitle || null
    if ('color'     in updates) dbUpdates.color     = updates.color || null
    if ('due_date'  in updates) dbUpdates.due_date  = updates.due_date || null
    if ('important' in updates) dbUpdates.important = updates.important

    await supabase.from('kanban_tasks').update(dbUpdates).eq('id', taskId)

    setColumns(cols => cols.map(col => ({
      ...col,
      tasks: col.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t),
    })))
    setSelectedTask(prev => prev?.id === taskId ? { ...prev, ...updates } : prev)
  }

  async function addColumnToDB() {
    if (!newColTitle.trim()) return
    const { data, error } = await supabase
      .from('kanban_columns')
      .insert({ title: newColTitle.trim(), position: columns.length })
      .select().single()
    if (error || !data) return
    setColumns(cols => [...cols, { id: data.id, title: data.title, position: data.position, tasks: [] }])
    setNewColTitle('')
    setAddingColumn(false)
  }

  async function deleteColumnFromDB(colId: string) {
    await supabase.from('kanban_tasks').delete().eq('column_id', colId)
    await supabase.from('kanban_columns').delete().eq('id', colId)
    setColumns(cols => cols.filter(c => c.id !== colId))
  }

  async function reorderColumns(fromColId: string, toColId: string) {
    const sorted = [...columns].sort((a, b) => a.position - b.position)
    const fromIdx = sorted.findIndex(c => c.id === fromColId)
    const toIdx   = sorted.findIndex(c => c.id === toColId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...sorted]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const updated = reordered.map((c, i) => ({ ...c, position: i }))
    setColumns(updated)
    await Promise.all(updated.map(c =>
      supabase.from('kanban_columns').update({ position: c.position }).eq('id', c.id)
    ))
  }

  // ── Drag: tarefas ─────────────────────────────────────────────────────────

  function onTaskDragStart(taskId: string, fromColId: string) {
    dragTaskRef.current = { taskId, fromColId }
    dragColRef.current  = null
  }
  function onTaskDragOver(e: React.DragEvent, colId: string) {
    if (dragColRef.current) return
    e.preventDefault()
    setDragOverCol(colId)
  }
  function onTaskDragLeave() { setDragOverCol(null) }
  function onTaskDrop(toColId: string) {
    setDragOverCol(null)
    if (!dragTaskRef.current) return
    const { taskId, fromColId } = dragTaskRef.current
    dragTaskRef.current = null
    if (fromColId !== toColId) moveTaskInDB(taskId, fromColId, toColId)
  }

  // ── Drag: colunas ─────────────────────────────────────────────────────────

  function onColDragStart(e: React.DragEvent, colId: string) {
    dragColRef.current  = colId
    dragTaskRef.current = null
    e.stopPropagation()
  }
  function onColDragOver(e: React.DragEvent, colId: string) {
    if (!dragColRef.current) return
    e.preventDefault()
    e.stopPropagation()
    if (dragColRef.current !== colId) setDragOverColReorder(colId)
  }
  function onColDragLeave(e: React.DragEvent) {
    e.stopPropagation()
    setDragOverColReorder(null)
  }
  function onColDrop(e: React.DragEvent, toColId: string) {
    e.stopPropagation()
    setDragOverColReorder(null)
    if (!dragColRef.current || dragColRef.current === toColId) return
    const fromColId = dragColRef.current
    dragColRef.current = null
    reorderColumns(fromColId, toColId)
  }

  async function handleTaskClick(task: Task) {
    if (task.fromProject) {
      if (task.project_id) {
        setSelectedProjectId(task.project_id)
      } else {
        // Tarefa antiga sem project_id — busca pelo título
        const { data } = await supabase
          .from('projects').select('id').eq('nome_projeto', task.title).maybeSingle()
        if (data?.id) setSelectedProjectId(data.id)
      }
    } else {
      setSelectedTask(task)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
  }

  if (migrationPending) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center">
          <Layers className="w-5 h-5 text-amber-400" />
        </div>
        <p className="text-white font-semibold text-sm">Configuração pendente</p>
        <p className="text-slate-300 text-xs max-w-xs">
          Execute a migration <span className="text-amber-400 font-mono">010_kanban.sql</span> no Supabase SQL Editor para ativar o Kanban.
        </p>
        <button onClick={load} className="mt-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-colors">
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4 items-start min-h-0 select-none">

        {[...columns].sort((a, b) => a.position - b.position).map(col => (
          <div key={col.id}
            onDragOver={e => onTaskDragOver(e, col.id)}
            onDragLeave={onTaskDragLeave}
            onDrop={() => onTaskDrop(col.id)}
            className={`flex-shrink-0 w-72 flex flex-col rounded-2xl border backdrop-blur-sm transition-all duration-150
              ${dragOverColReorder === col.id || dragOverCol === col.id
                ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                : 'bg-slate-900/70 border-white/[0.07]'}`}
          >
            {/* Header */}
            <div
              draggable
              onDragStart={e => onColDragStart(e, col.id)}
              onDragOver={e => onColDragOver(e, col.id)}
              onDragLeave={onColDragLeave}
              onDrop={e => onColDrop(e, col.id)}
              className="group flex items-center gap-2 px-3 pt-4 pb-3 border-b border-white/[0.05] cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ACCENT_BY_POS[col.position] ?? 'bg-violet-500'}`} />
              <span className="text-white font-semibold text-sm flex-1 truncate">{col.title}</span>
              <span className="text-xs text-slate-300 tabular-nums bg-white/5 px-2 py-0.5 rounded-full shrink-0">
                {col.tasks.length}
              </span>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); deleteColumnFromDB(col.id) }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tasks */}
            <div className="px-3 pt-3 pb-1 flex flex-col gap-2 min-h-[48px]">
              {col.tasks.length === 0 && addingTaskColId !== col.id && (
                <div className={`flex items-center justify-center h-12 rounded-xl border-2 border-dashed text-xs transition-colors
                  ${dragOverCol === col.id ? 'border-indigo-500/50 text-indigo-400' : 'border-white/[0.06] text-slate-400'}`}>
                  {dragOverCol === col.id ? 'Soltar aqui' : 'Sem tarefas'}
                </div>
              )}
              {col.tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onDragStart={() => onTaskDragStart(task.id, col.id)}
                  onClick={() => handleTaskClick(task)}
                />
              ))}

              {addingTaskColId === col.id && (
                <AddTaskForm
                  onAdd={(title, subtitle, color, due_date, important) => {
                    addTaskToDB(col.id, title, subtitle || undefined, false, color, undefined, due_date || undefined, important)
                    setAddingTaskColId(null)
                  }}
                  onCancel={() => setAddingTaskColId(null)}
                />
              )}
            </div>

            {addingTaskColId !== col.id && (
              <button
                onClick={() => setAddingTaskColId(col.id)}
                className="mx-3 mb-3 mt-1 flex items-center gap-1.5 px-3 py-2 rounded-xl
                           text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]
                           text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />Adicionar tarefa
              </button>
            )}
          </div>
        ))}

        {/* Add column */}
        <div className="flex-shrink-0 w-72">
          {addingColumn ? (
            <div className="rounded-2xl bg-slate-900/70 border border-white/[0.07] p-4 space-y-3">
              <input autoFocus value={newColTitle}
                onChange={e => setNewColTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addColumnToDB()
                  if (e.key === 'Escape') { setAddingColumn(false); setNewColTitle('') }
                }}
                placeholder="Nome da coluna…"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-indigo-500/40 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <div className="flex gap-2">
                <button onClick={addColumnToDB}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors">
                  Criar coluna
                </button>
                <button onClick={() => { setAddingColumn(false); setNewColTitle('') }}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingColumn(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border-2 border-dashed border-white/[0.08] text-slate-400 hover:text-slate-300 hover:border-white/[0.18] transition-all text-sm font-medium">
              <Plus className="w-4 h-4" />Adicionar coluna
            </button>
          )}
        </div>
      </div>

      {selectedProjectId && (
        <ProjectDetailModal projectId={selectedProjectId} hideValor={role === 'operator'} onClose={() => setSelectedProjectId(null)} />
      )}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onDelete={deleteTask}
          onUpdate={updateTask}
        />
      )}
    </>
  )
}
