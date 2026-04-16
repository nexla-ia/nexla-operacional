import { useState, useRef } from 'react'
import { Plus, X, Layers } from 'lucide-react'
import type { Column, Task } from '../lib/types'

interface KanbanBoardProps {
  columns: Column[]
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>
}

const ACCENT: Record<string, string> = {
  todo:  'bg-slate-400',
  doing: 'bg-indigo-500',
  done:  'bg-emerald-500',
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export default function KanbanBoard({ columns, setColumns }: KanbanBoardProps) {
  const [addingTask, setAddingTask]     = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColTitle, setNewColTitle]   = useState('')
  const [dragOverCol, setDragOverCol]   = useState<string | null>(null)

  // Guarda qual task está sendo arrastada
  const dragRef = useRef<{ taskId: string; fromColId: string } | null>(null)

  // ── Tarefas ──────────────────────────────────────────────────────────────────

  function submitTask(colId: string) {
    if (!newTaskTitle.trim()) return
    setColumns(cols =>
      cols.map(c =>
        c.id === colId
          ? { ...c, tasks: [...c.tasks, { id: uid(), title: newTaskTitle.trim() }] }
          : c
      )
    )
    setNewTaskTitle('')
    setAddingTask(null)
  }

  function removeTask(colId: string, taskId: string) {
    setColumns(cols =>
      cols.map(c =>
        c.id === colId
          ? { ...c, tasks: c.tasks.filter(t => t.id !== taskId) }
          : c
      )
    )
  }

  // ── Colunas ──────────────────────────────────────────────────────────────────

  function submitColumn() {
    if (!newColTitle.trim()) return
    setColumns(cols => [...cols, { id: uid(), title: newColTitle.trim(), tasks: [] }])
    setNewColTitle('')
    setAddingColumn(false)
  }

  function cancelTask() { setAddingTask(null); setNewTaskTitle('') }
  function cancelCol()  { setAddingColumn(false); setNewColTitle('') }

  // ── Drag & Drop ───────────────────────────────────────────────────────────────

  function onDragStart(taskId: string, fromColId: string) {
    dragRef.current = { taskId, fromColId }
  }

  function onDragOver(e: React.DragEvent, colId: string) {
    e.preventDefault()
    setDragOverCol(colId)
  }

  function onDragLeave() {
    setDragOverCol(null)
  }

  function onDrop(toColId: string) {
    setDragOverCol(null)
    if (!dragRef.current) return
    const { taskId, fromColId } = dragRef.current
    if (fromColId === toColId) return

    setColumns(cols => {
      const task = cols
        .find(c => c.id === fromColId)
        ?.tasks.find(t => t.id === taskId)
      if (!task) return cols
      return cols.map(c => {
        if (c.id === fromColId) return { ...c, tasks: c.tasks.filter(t => t.id !== taskId) }
        if (c.id === toColId)   return { ...c, tasks: [...c.tasks, task] }
        return c
      })
    })
    dragRef.current = null
  }

  const accent = (id: string) => ACCENT[id] ?? 'bg-violet-500'

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 items-start min-h-0 select-none">

      {columns.map(col => (
        <div
          key={col.id}
          onDragOver={e => onDragOver(e, col.id)}
          onDragLeave={onDragLeave}
          onDrop={() => onDrop(col.id)}
          className={`
            flex-shrink-0 w-72 flex flex-col rounded-2xl border backdrop-blur-sm
            transition-all duration-150
            ${dragOverCol === col.id
              ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/10'
              : 'bg-slate-900/70 border-white/[0.07]'
            }
          `}
        >
          {/* Cabeçalho */}
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-white/[0.05]">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${accent(col.id)}`} />
            <span className="text-white font-semibold text-sm flex-1 truncate">{col.title}</span>
            <span className="text-xs text-slate-500 tabular-nums bg-white/5 px-2 py-0.5 rounded-full shrink-0">
              {col.tasks.length}
            </span>
          </div>

          {/* Drop zone vazia */}
          <div className="px-3 pt-3 pb-1 flex flex-col gap-2 min-h-[48px]">
            {col.tasks.length === 0 && addingTask !== col.id && (
              <div className={`
                flex items-center justify-center h-12 rounded-xl border-2 border-dashed text-xs
                transition-colors
                ${dragOverCol === col.id
                  ? 'border-indigo-500/50 text-indigo-400'
                  : 'border-white/[0.06] text-slate-700'
                }
              `}>
                {dragOverCol === col.id ? 'Soltar aqui' : 'Sem tarefas'}
              </div>
            )}

            {/* Cards */}
            {col.tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onRemove={() => removeTask(col.id, task.id)}
                onDragStart={() => onDragStart(task.id, col.id)}
              />
            ))}
          </div>

          {/* Adicionar tarefa */}
          <div className="px-3 pb-4 pt-2">
            {addingTask === col.id ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  rows={2}
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTask(col.id) }
                    if (e.key === 'Escape') cancelTask()
                  }}
                  placeholder="Título da tarefa…"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-indigo-500/40
                             text-white text-sm placeholder-slate-500 resize-none
                             focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => submitTask(col.id)}
                    className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500
                               text-white text-xs font-semibold transition-colors"
                  >
                    Adicionar
                  </button>
                  <button
                    onClick={cancelTask}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10
                               text-slate-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAddingTask(col.id); setNewTaskTitle('') }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl
                           text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]
                           transition-all text-sm"
              >
                <Plus className="w-4 h-4" />
                Adicionar tarefa
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Adicionar coluna */}
      <div className="flex-shrink-0 w-72">
        {addingColumn ? (
          <div className="rounded-2xl bg-slate-900/70 border border-white/[0.07] p-4 space-y-3">
            <input
              autoFocus
              value={newColTitle}
              onChange={e => setNewColTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitColumn()
                if (e.key === 'Escape') cancelCol()
              }}
              placeholder="Nome da coluna…"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-indigo-500/40
                         text-white text-sm placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <div className="flex gap-2">
              <button
                onClick={submitColumn}
                className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500
                           text-white text-xs font-semibold transition-colors"
              >
                Criar coluna
              </button>
              <button
                onClick={cancelCol}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10
                           text-slate-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingColumn(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl
                       border-2 border-dashed border-white/[0.08]
                       text-slate-500 hover:text-slate-300 hover:border-white/[0.18]
                       transition-all text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Adicionar coluna
          </button>
        )}
      </div>
    </div>
  )
}

// ── TaskCard ───────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task
  onRemove: () => void
  onDragStart: () => void
}

function TaskCard({ task, onRemove, onDragStart }: TaskCardProps) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      draggable
      onDragStart={() => { setDragging(true); onDragStart() }}
      onDragEnd={() => setDragging(false)}
      className={`
        group flex items-start gap-2 px-3 py-2.5 rounded-xl
        bg-slate-800/80 border border-white/[0.06]
        hover:border-white/[0.13] cursor-grab active:cursor-grabbing
        transition-all duration-150
        ${dragging ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}
      `}
    >
      <div className="flex-1 min-w-0">
        <span className="text-slate-200 text-sm leading-snug break-words block">
          {task.title}
        </span>
        {task.subtitle && (
          <span className="text-slate-500 text-xs mt-0.5 block truncate">{task.subtitle}</span>
        )}
        {task.fromProject && (
          <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium
                           text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">
            <Layers className="w-2.5 h-2.5" />
            Projeto
          </span>
        )}
      </div>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity
                   text-slate-600 hover:text-red-400 mt-0.5 shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
