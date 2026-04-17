import { useState, useEffect } from 'react'
import {
  AlertTriangle, CheckCircle2, ExternalLink, RefreshCw,
  Loader2, X, ChevronDown, ChevronUp, Workflow, Clock, Trash2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface N8nPayload {
  execution?: {
    id?: string
    url?: string
    error?: {
      name?: string
      message?: string
      level?: string
      node?: {
        name?: string
        type?: string
      }
    }
    lastNodeExecuted?: string
    mode?: string
  }
  workflow?: {
    id?: string
    name?: string
  }
}

interface N8nError {
  id: string
  payload: N8nPayload
  resolved: boolean
  resolved_at: string | null
  created_at: string
}

type Filter = 'todos' | 'abertos' | 'resolvidos'

// ── Helpers ───────────────────────────────────────────────────────────────────

function extract(e: N8nError) {
  const p    = e.payload
  const exec = p.execution ?? {}
  const err  = exec.error ?? {}
  return {
    workflowName:  p.workflow?.name ?? 'Workflow desconhecido',
    workflowId:    p.workflow?.id ?? '',
    executionId:   exec.id ?? '',
    executionUrl:  exec.url ?? '',
    errorName:     err.name ?? 'Erro',
    errorMessage:  err.message ?? 'Sem mensagem',
    nodeName:      err.node?.name ?? exec.lastNodeExecuted ?? '—',
    nodeType:      err.node?.type?.split('.').pop() ?? '',
    mode:          exec.mode ?? '',
    level:         err.level ?? 'error',
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'agora mesmo'
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

function formatFull(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Card de erro ──────────────────────────────────────────────────────────────

function ErrorCard({ error, onResolve, onDelete }: {
  error: N8nError
  onResolve: (id: string) => void
  onDelete:  (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const e = extract(error)
  const isWarning = e.level === 'warning'

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden
      ${error.resolved
        ? 'bg-white/[0.01] border-white/[0.04] opacity-60'
        : isWarning
          ? 'bg-amber-500/[0.04] border-amber-500/15'
          : 'bg-red-500/[0.05] border-red-500/15'}`}>

      {/* linha colorida no topo */}
      {!error.resolved && (
        <div className={`h-0.5 w-full ${isWarning ? 'bg-gradient-to-r from-amber-500/60 to-transparent' : 'bg-gradient-to-r from-red-500/60 to-transparent'}`} />
      )}

      <div className="p-5">
        {/* cabeçalho */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
              ${error.resolved ? 'bg-emerald-500/10' : isWarning ? 'bg-amber-500/10' : 'bg-red-500/10'}`}>
              {error.resolved
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : <AlertTriangle className={`w-4 h-4 ${isWarning ? 'text-amber-400' : 'text-red-400'}`} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border
                  ${isWarning ? 'bg-amber-500/10 text-amber-400 border-amber-500/15' : 'bg-red-500/10 text-red-400 border-red-500/15'}`}>
                  <Workflow className="w-2.5 h-2.5" />
                  {e.workflowName}
                </span>
                <span className="text-slate-600 text-[10px] font-medium">{e.errorName}</span>
              </div>
              <p className={`text-sm font-semibold mt-1 leading-snug truncate
                ${error.resolved ? 'text-slate-500' : 'text-slate-200'}`}>
                {e.errorMessage}
              </p>
            </div>
          </div>

          {/* ações */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
              title="Ver detalhes">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {e.executionUrl && (
              <a href={e.executionUrl} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                title="Abrir no n8n">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {!error.resolved && (
              <button
                onClick={() => onResolve(error.id)}
                className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                title="Marcar como resolvido">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(error.id)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Excluir">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* meta */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-slate-700 text-xs font-medium">
            <Clock className="w-3 h-3" />
            <span title={formatFull(error.created_at)}>{timeAgo(error.created_at)}</span>
            <span className="text-slate-800">·</span>
            <span>{formatFull(error.created_at)}</span>
          </span>
          {e.nodeName && e.nodeName !== '—' && (
            <span className="text-slate-700 text-xs font-medium">
              Nó: <span className="text-slate-500 font-mono text-[11px]">{e.nodeName}</span>
            </span>
          )}
          {e.mode && (
            <span className="text-slate-700 text-xs font-medium">
              via <span className="text-slate-500">{e.mode}</span>
            </span>
          )}
          {error.resolved && error.resolved_at && (
            <span className="flex items-center gap-1 text-emerald-700 text-xs font-medium">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Resolvido em {formatFull(error.resolved_at)}
            </span>
          )}
        </div>

        {/* payload expandido */}
        {expanded && (
          <div className="mt-4 rounded-xl bg-black/40 border border-white/[0.06] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05]">
              <span className="text-slate-600 text-[11px] font-semibold uppercase tracking-wider">Payload JSON</span>
              <span className="text-slate-700 text-[10px] font-mono">execution #{e.executionId}</span>
            </div>
            <pre className="px-4 py-3 text-[11px] text-slate-400 font-mono leading-relaxed overflow-x-auto max-h-64 overflow-y-auto scrollbar-none whitespace-pre-wrap break-all">
              {JSON.stringify(error.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ErrosN8n() {
  const [errors,  setErrors]  = useState<N8nError[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<Filter>('abertos')
  const [msg,     setMsg]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('n8n_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) setMsg('Erro ao carregar.')
    else setErrors((data ?? []) as N8nError[])
    setLoading(false)
  }

  async function resolve(id: string) {
    const { error } = await supabase
      .from('n8n_errors')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { setMsg('Erro ao resolver.'); return }
    setErrors(es => es.map(e => e.id === id ? { ...e, resolved: true, resolved_at: new Date().toISOString() } : e))
  }

  async function del(id: string) {
    const { error } = await supabase.from('n8n_errors').delete().eq('id', id)
    if (error) { setMsg('Erro ao excluir.'); return }
    setErrors(es => es.filter(e => e.id !== id))
  }

  async function resolveAll() {
    const ids = filtered.filter(e => !e.resolved).map(e => e.id)
    if (!ids.length) return
    const { error } = await supabase
      .from('n8n_errors')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .in('id', ids)
    if (error) { setMsg('Erro.'); return }
    const now = new Date().toISOString()
    setErrors(es => es.map(e => ids.includes(e.id) ? { ...e, resolved: true, resolved_at: now } : e))
  }

  const total     = errors.length
  const abertos   = errors.filter(e => !e.resolved).length
  const resolvidos = errors.filter(e => e.resolved).length

  const filtered = errors.filter(e => {
    if (filter === 'abertos')    return !e.resolved
    if (filter === 'resolvidos') return e.resolved
    return true
  })

  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: 'abertos',    label: 'Abertos',    count: abertos   },
    { id: 'resolvidos', label: 'Resolvidos', count: resolvidos },
    { id: 'todos',      label: 'Todos',      count: total     },
  ]

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5 animate-stagger-1">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-white font-extrabold text-xl tracking-tight">Erros N8N</h1>
            {abertos > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 text-xs font-bold border border-red-500/20">
                {abertos} aberto{abertos !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-slate-600 text-sm font-medium">Erros recebidos dos fluxos n8n</p>
        </div>
        <div className="flex items-center gap-2">
          {abertos > 0 && filter === 'abertos' && (
            <button onClick={resolveAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/8 border border-emerald-500/15 hover:bg-emerald-500/15 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Resolver todos
            </button>
          )}
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 bg-white/[0.03] border border-white/[0.06] hover:text-white hover:bg-white/[0.07] transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 text-sm font-medium animate-stagger-1">
          {msg}
          <button onClick={() => setMsg('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex items-center gap-1.5 mb-5 animate-stagger-2">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border
              ${filter === f.id
                ? f.id === 'abertos'
                  ? 'bg-red-500/10 text-red-300 border-red-500/20'
                  : f.id === 'resolvidos'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                : 'text-slate-600 border-transparent hover:text-slate-300 hover:border-white/[0.06]'}`}>
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold
              ${filter === f.id ? 'bg-white/10' : 'bg-white/[0.04] text-slate-700'}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center animate-stagger-3">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
            {filter === 'resolvidos'
              ? <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              : <AlertTriangle className="w-5 h-5 text-slate-700" />}
          </div>
          <p className="text-slate-500 font-semibold text-sm">
            {filter === 'abertos'    && 'Nenhum erro em aberto'}
            {filter === 'resolvidos' && 'Nenhum erro resolvido'}
            {filter === 'todos'      && 'Nenhum erro registrado'}
          </p>
          <p className="text-slate-700 text-xs mt-1 font-medium">
            {filter === 'abertos' ? 'Tudo funcionando normalmente.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-3 animate-stagger-3">
          {filtered.map(e => (
            <ErrorCard key={e.id} error={e} onResolve={resolve} onDelete={del} />
          ))}
        </div>
      )}

      {/* ── Instruções de webhook ── */}
      <div className="mt-8 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] animate-stagger-4">
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-3">Configuração do Webhook no N8N</p>
        <p className="text-slate-600 text-xs font-medium mb-3">
          No fluxo n8n, adicione um nó <span className="text-slate-400 font-bold">HTTP Request</span> após o <span className="text-slate-400 font-bold">Error Trigger</span> com os dados abaixo:
        </p>
        <div className="space-y-2 font-mono text-xs">
          <div className="flex gap-3">
            <span className="text-slate-700 w-16 shrink-0">Method</span>
            <span className="text-indigo-300">POST</span>
          </div>
          <div className="flex gap-3">
            <span className="text-slate-700 w-16 shrink-0">URL</span>
            <span className="text-indigo-300 break-all">
              {`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/n8n_errors`}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.05]">
            <p className="text-slate-700 mb-1.5">Headers:</p>
            <div className="space-y-1 pl-2">
              <div className="flex gap-3"><span className="text-slate-600 w-28 shrink-0">apikey</span><span className="text-amber-400 break-all">{import.meta.env.VITE_SUPABASE_ANON_KEY?.slice(0,40)}…</span></div>
              <div className="flex gap-3"><span className="text-slate-600 w-28 shrink-0">Content-Type</span><span className="text-slate-400">application/json</span></div>
              <div className="flex gap-3"><span className="text-slate-600 w-28 shrink-0">Prefer</span><span className="text-slate-400">return=minimal</span></div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.05]">
            <p className="text-slate-700 mb-1.5">Body (JSON):</p>
            <pre className="pl-2 text-slate-400 leading-relaxed">{`{ "payload": {{ $json }} }`}</pre>
          </div>
        </div>
      </div>
    </>
  )
}
