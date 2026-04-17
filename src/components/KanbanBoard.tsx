import { useState, useRef, useEffect } from 'react'
import { Plus, X, Layers, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Task {
  id: string
  title: string
  subtitle?: string
  fromProject?: boolean
}

interface Column {
  id: string
  title: string
  position: number
  tasks: Task[]
}

interface KanbanBoardProps {
  pendingTask?: { title: string; subtitle?: string } | null
  onPendingTaskConsumed?: () => void
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

export default function KanbanBoard({ pendingTask, onPendingTaskConsumed }: KanbanBoardProps) {
  const [columns, setColumns]           = useState<Column[]>([])
  const [loading, setLoading]           = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)
  const [addingTask, setAddingTask]     = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColTitle, setNewColTitle]   = useState('')
  const [dragOverCol, setDragOverCol]   = useState<string | null>(null)
  const dragRef = useRef<{ taskId: string; fromColId: string } | null>(null)

  useEffect(() => { load() }, [])

  // Quando projeto criado chega E colunas já estão carregadas → insere no banco
  useEffect(() => {
    if (!pendingTask || loading || columns.length === 0) return
    const firstCol = [...columns].sort((a, b) => a.position - b.position)[0]
    if (firstCol) {
      addTaskToDB(firstCol.id, pendingTask.title, pendingTask.subtitle, true)
      onPendingTaskConsumed?.()
    }
  }, [pendingTask, loading, columns.length])

  // ── Carga ────────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    setMigrationPending(false)

    let { data: cols, error: colsErr } = await supabase
      .from('kanban_columns').select('*').order('position')

    // Tabela não existe ainda (migration 010 não rodou)
    if (colsErr) {
      setMigrationPending(true)
      setLoading(false)
      return
    }

    // Semeia colunas padrão na primeira execução
    if (!cols || cols.length === 0) {
      const { data: seeded } = await supabase
        .from('kanban_columns').insert(DEFAULT_COLS).select()
      cols = seeded ?? []
    }

    const { data: tasks } = await supabase
      .from('kanban_tasks').select('*').order('position')

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
        })),
    }))

    setColumns(built)
    setLoading(false)
  }

  // ── DB helpers ────────────────────────────────────────────────────────────────

  async function addTaskToDB(colId: string, title: string, subtitle?: string, fromProject = false) {
    const maxPos = columns.find(c => c.id === colId)?.tasks.length ?? 0
    const { data, error } = await supabase
      .from('kanban_tasks')
      .insert({ column_id: colId, title, subtitle: subtitle || null, position: maxPos, from_project: fromProject })
      .select().single()
    if (error || !data) return
    const t: Task = { id: data.id, title: data.title, subtitle: data.subtitle || undefined, fromProject: data.from_project }
    setColumns(cols => cols.map(c => c.id === colId ? { ...c, tasks: [...c.tasks, t] } : c))
  }

  async function removeTaskFromDB(colId: string, taskId: string) {
    await supabase.from('kanban_tasks').delete().eq('id', taskId)
    setColumns(cols => cols.map(c =>
      c.id === colId ? { ...c, tasks: c.tasks.filter(t => t.id !== taskId) } : c
    ))
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

  // ── Drag & Drop ───────────────────────────────────────────────────────────────

  function onDragStart(taskId: string, fromColId: string) { dragRef.current = { taskId, fromColId } }
  function onDragOver(e: React.DragEvent, colId: string)  { e.preventDefault(); setDragOverCol(colId) }
  function onDragLeave() { setDragOverCol(null) }
  function onDrop(toColId: string) {
    setDragOverCol(null)
    if (!dragRef.current) return
    const { taskId, fromColId } = dragRef.current
    dragRef.current = null
    if (fromColId !== toColId) moveTaskInDB(taskId, fromColId, toColId)
  }

  function submitTask(colId: string) {
    if (!newTaskTitle.trim()) return
    addTaskToDB(colId, newTaskTitle.trim())
    setNewTaskTitle(''); setAddingTask(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
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
    <div className="flex gap-4 overflow-x-auto pb-4 items-start min-h-0 select-none">

      {columns.map(col => (
        <div key={col.id}
          onDragOver={e => onDragOver(e, col.id)}
          onDragLeave={onDragLeave}
          onDrop={() => onDrop(col.id)}
          className={`flex-shrink-0 w-72 flex flex-col rounded-2xl border backdrop-blur-sm transition-all duration-150
            ${dragOverCol === col.id
              ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/10'
              : 'bg-slate-900/70 border-white/[0.07]'}`}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-white/[0.05]">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ACCENT_BY_POS[col.position] ?? 'bg-violet-500'}`} />
            <span className="text-white font-semibold text-sm flex-1 truncate">{col.title}</span>
            <span className="text-xs text-slate-300 tabular-nums bg-white/5 px-2 py-0.5 rounded-full shrink-0">
              {col.tasks.length}
            </span>
          </div>

          {/* Tasks */}
          <div className="px-3 pt-3 pb-1 flex flex-col gap-2 min-h-[48px]">
            {col.tasks.length === 0 && addingTask !== col.id && (
              <div className={`flex items-center justify-center h-12 rounded-xl border-2 border-dashed text-xs transition-colors
                ${dragOverCol === col.id ? 'border-indigo-500/50 text-indigo-400' : 'border-white/[0.06] text-slate-300'}`}>
                {dragOverCol === col.id ? 'Soltar aqui' : 'Sem tarefas'}
              </div>
            )}
            {col.tasks.map(task => (
              <TaskCard key={task.id} task={task}
                onRemove={() => removeTaskFromDB(col.id, task.id)}
                onDragStart={() => onDragStart(task.id, col.id)} />
            ))}
          </div>

          {/* Add task */}
          <div className="px-3 pb-4 pt-2">
            {addingTask === col.id ? (
              <div className="space-y-2">
                <textarea autoFocus rows={2} value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTask(col.id) }
                    if (e.key === 'Escape') { setAddingTask(null); setNewTaskTitle('') }
                  }}
                  placeholder="Título da tarefa…"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-indigo-500/40 text-white text-sm placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <div className="flex gap-2">
                  <button onClick={() => submitTask(col.id)}
                    className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors">
                    Adicionar
                  </button>
                  <button onClick={() => { setAddingTask(null); setNewTaskTitle('') }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAddingTask(col.id); setNewTaskTitle('') }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:text-slate-300 hover:bg-white/[0.04] transition-all text-sm">
                <Plus className="w-4 h-4" />Adicionar tarefa
              </button>
            )}
          </div>
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
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border-2 border-dashed border-white/[0.08] text-slate-300 hover:text-slate-300 hover:border-white/[0.18] transition-all text-sm font-medium">
            <Plus className="w-4 h-4" />Adicionar coluna
          </button>
        )}
      </div>
    </div>
  )
}

// ── TaskCard ───────────────────────────────────────────────────────────────────

function TaskCard({ task, onRemove, onDragStart }: {
  task: Task; onRemove: () => void; onDragStart: () => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div draggable
      onDragStart={() => { setDragging(true); onDragStart() }}
      onDragEnd={() => setDragging(false)}
      className={`group flex items-start gap-2 px-3 py-2.5 rounded-xl bg-slate-800/80 border border-white/[0.06] hover:border-white/[0.13] cursor-grab active:cursor-grabbing transition-all duration-150
        ${dragging ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}`}
    >
      <div className="flex-1 min-w-0">
        <span className="text-slate-200 text-sm leading-snug break-words block">{task.title}</span>
        {task.subtitle && (
          <span className="text-slate-300 text-xs mt-0.5 block truncate">{task.subtitle}</span>
        )}
        {task.fromProject && (
          <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">
            <Layers className="w-2.5 h-2.5" />Projeto
          </span>
        )}
      </div>
      <button onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-400 mt-0.5 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
