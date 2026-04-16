import { useState } from 'react'
import { Plus, X } from 'lucide-react'

interface Task {
  id: string
  title: string
}

interface Column {
  id: string
  title: string
  tasks: Task[]
}

const INITIAL_COLUMNS: Column[] = [
  { id: 'todo',  title: 'A Fazer',      tasks: [] },
  { id: 'doing', title: 'Em Andamento', tasks: [] },
  { id: 'done',  title: 'Concluída',    tasks: [] },
]

const ACCENT: Record<string, string> = {
  todo:  'bg-slate-400',
  doing: 'bg-indigo-500',
  done:  'bg-emerald-500',
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export default function KanbanBoard() {
  const [columns, setColumns]           = useState<Column[]>(INITIAL_COLUMNS)
  const [addingTask, setAddingTask]     = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColTitle, setNewColTitle]   = useState('')

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

  function submitColumn() {
    if (!newColTitle.trim()) return
    setColumns(cols => [...cols, { id: uid(), title: newColTitle.trim(), tasks: [] }])
    setNewColTitle('')
    setAddingColumn(false)
  }

  function cancelTask() {
    setAddingTask(null)
    setNewTaskTitle('')
  }

  function cancelColumn() {
    setAddingColumn(false)
    setNewColTitle('')
  }

  const accent = (id: string) => ACCENT[id] ?? 'bg-violet-500'

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 items-start min-h-0">

      {columns.map(col => (
        <div
          key={col.id}
          className="flex-shrink-0 w-72 flex flex-col rounded-2xl bg-slate-900/70 border border-white/[0.07] backdrop-blur-sm"
        >
          {/* Cabeçalho da coluna */}
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-white/[0.05]">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${accent(col.id)}`} />
            <span className="text-white font-semibold text-sm flex-1 truncate">
              {col.title}
            </span>
            <span className="text-xs text-slate-500 tabular-nums bg-white/5 px-2 py-0.5 rounded-full shrink-0">
              {col.tasks.length}
            </span>
          </div>

          {/* Tarefas */}
          <div className="px-3 pt-3 pb-1 flex flex-col gap-2">
            {col.tasks.length === 0 && addingTask !== col.id && (
              <p className="text-slate-600 text-xs text-center py-4">
                Nenhuma tarefa
              </p>
            )}
            {col.tasks.map(task => (
              <div
                key={task.id}
                className="group flex items-start gap-2 px-3 py-2.5 rounded-xl
                           bg-slate-800/80 border border-white/[0.06]
                           hover:border-white/[0.13] transition-colors"
              >
                <span className="text-slate-200 text-sm flex-1 leading-snug break-words">
                  {task.title}
                </span>
                <button
                  onClick={() => removeTask(col.id, task.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity
                             text-slate-600 hover:text-red-400 mt-0.5 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
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
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submitTask(col.id)
                    }
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
                if (e.key === 'Escape') cancelColumn()
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
                onClick={cancelColumn}
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
