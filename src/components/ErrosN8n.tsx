import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Loader2, X, Clock, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface N8nError {
  id:          string
  payload:     string
  resolved:    boolean
  resolved_at: string | null
  created_at:  string
}

type Filter = 'abertos' | 'resolvidos' | 'todos'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'agora mesmo'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function formatFull(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Renderer de mensagem ──────────────────────────────────────────────────────
// Transforma o texto do n8n em elementos React:
// *texto* → negrito   `código` → code   https://... → link clicável

const URL_RE   = /(https?:\/\/[^\s`\n]+)/g
const BOLD_RE  = /\*([^*]+)\*/g
const CODE_RE  = /`([^`]+)`/g

function renderSegment(text: string, key: string) {
  // Divide pelo padrão de URLs
  const parts = text.split(URL_RE)
  return parts.map((part, i) => {
    if (URL_RE.test(part)) {
      URL_RE.lastIndex = 0
      return (
        <a key={`${key}-u${i}`} href={part} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline underline-offset-2 decoration-indigo-500/40 hover:decoration-indigo-400 transition-colors break-all">
          {part}
          <ExternalLink className="w-3 h-3 shrink-0 inline" />
        </a>
      )
    }
    URL_RE.lastIndex = 0
    return <span key={`${key}-t${i}`}>{part}</span>
  })
}

function renderLine(line: string, lineKey: string) {
  // Divide por `código` e *negrito*
  const tokens: React.ReactNode[] = []
  let remaining = line
  let idx = 0

  while (remaining.length > 0) {
    const codeMatch = CODE_RE.exec(remaining)
    const boldMatch = BOLD_RE.exec(remaining)
    CODE_RE.lastIndex = 0
    BOLD_RE.lastIndex = 0

    const firstCode = codeMatch?.index ?? Infinity
    const firstBold = boldMatch?.index ?? Infinity

    if (firstCode === Infinity && firstBold === Infinity) {
      tokens.push(...renderSegment(remaining, `${lineKey}-${idx++}`))
      break
    }

    if (firstCode <= firstBold && codeMatch) {
      if (firstCode > 0) tokens.push(...renderSegment(remaining.slice(0, firstCode), `${lineKey}-${idx++}`))
      tokens.push(
        <code key={`${lineKey}-c${idx++}`}
          className="font-mono text-[0.82em] px-1.5 py-0.5 rounded-md bg-white/[0.07] text-slate-200 border border-white/[0.08]">
          {codeMatch[1]}
        </code>
      )
      remaining = remaining.slice(firstCode + codeMatch[0].length)
    } else if (boldMatch) {
      if (firstBold > 0) tokens.push(...renderSegment(remaining.slice(0, firstBold), `${lineKey}-${idx++}`))
      tokens.push(
        <strong key={`${lineKey}-b${idx++}`} className="font-semibold text-slate-100">
          {boldMatch[1]}
        </strong>
      )
      remaining = remaining.slice(firstBold + boldMatch[0].length)
    } else break
  }

  return tokens
}

function MessageBody({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-sm text-slate-300 leading-relaxed">
      {lines.map((line, i) => (
        <p key={i} className={line.trim() === '' ? 'h-2' : ''}>
          {line.trim() !== '' && renderLine(line, `l${i}`)}
        </p>
      ))}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

function ErrorCard({ error, onResolve }: {
  error:     N8nError
  onResolve: (id: string) => void
}) {
  const isResolved = error.resolved
  const isWarning  = typeof error.payload === 'string' && error.payload.includes('⚠️')
  const message    = typeof error.payload === 'string' ? error.payload : JSON.stringify(error.payload, null, 2)

  const border = isResolved ? 'border-white/[0.06]' : isWarning ? 'border-amber-500/20' : 'border-red-500/20'
  const bar    = isResolved ? '' : isWarning ? 'from-amber-500' : 'from-red-500'

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-200 bg-white/[0.02] ${border} ${isResolved ? 'opacity-50' : ''}`}>

      {!isResolved && <div className={`h-px bg-gradient-to-r ${bar} to-transparent`} />}

      <div className="p-5">

        {/* topo */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
            <Clock className="w-3 h-3" />
            <span title={formatFull(error.created_at)}>{timeAgo(error.created_at)}</span>
            <span className="text-slate-800 mx-0.5">·</span>
            {formatFull(error.created_at)}
          </span>

          {isResolved ? (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Resolvido
              {error.resolved_at && <span className="text-emerald-900">· {formatFull(error.resolved_at)}</span>}
            </span>
          ) : (
            <button onClick={() => onResolve(error.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/8 border border-emerald-500/15 hover:bg-emerald-500/15 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confirmar
            </button>
          )}
        </div>

        {/* mensagem renderizada */}
        <MessageBody text={message} />

      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function ErrosN8n() {
  const [errors,  setErrors]  = useState<N8nError[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<Filter>('abertos')
  const [msg,     setMsg]     = useState('')
  const [newCount, setNewCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('n8n_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) setMsg('Erro ao carregar.')
    else setErrors((data ?? []) as N8nError[])
    setLoading(false)
  }, [])

  // Realtime: escuta novos erros e atualizações
  useEffect(() => {
    load()

    const channel = supabase
      .channel('n8n_errors_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'n8n_errors' }, payload => {
        setErrors(prev => [payload.new as N8nError, ...prev])
        setNewCount(c => c + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'n8n_errors' }, payload => {
        setErrors(prev => prev.map(e => e.id === (payload.new as N8nError).id ? payload.new as N8nError : e))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [load])

  async function resolve(id: string) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('n8n_errors')
      .update({ resolved: true, resolved_at: now })
      .eq('id', id)
    if (error) { setMsg('Erro ao confirmar.'); return }
    setErrors(es => es.map(e => e.id === id ? { ...e, resolved: true, resolved_at: now } : e))
  }

  async function resolveAll() {
    const ids = errors.filter(e => !e.resolved).map(e => e.id)
    if (!ids.length) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('n8n_errors')
      .update({ resolved: true, resolved_at: now })
      .in('id', ids)
    if (error) { setMsg('Erro.'); return }
    setErrors(es => es.map(e => ids.includes(e.id) ? { ...e, resolved: true, resolved_at: now } : e))
  }

  const abertos    = errors.filter(e => !e.resolved).length
  const resolvidos = errors.filter(e =>  e.resolved).length

  const filtered = filter === 'abertos'    ? errors.filter(e => !e.resolved)
                 : filter === 'resolvidos' ? errors.filter(e =>  e.resolved)
                 : errors

  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: 'abertos',    label: 'Abertos',    count: abertos       },
    { id: 'resolvidos', label: 'Resolvidos', count: resolvidos    },
    { id: 'todos',      label: 'Todos',      count: errors.length },
  ]

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 animate-stagger-1">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-white font-extrabold text-xl tracking-tight">Erros N8N</h1>
            {abertos > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 text-xs font-bold border border-red-500/20">
                {abertos} aberto{abertos !== 1 ? 's' : ''}
              </span>
            )}
            {newCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 text-xs font-bold border border-indigo-500/20 animate-pulse">
                +{newCount} novo{newCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-slate-600 text-sm font-medium">Monitoramento em tempo real dos fluxos n8n</p>
        </div>
        <div className="flex items-center gap-2">
          {abertos > 0 && filter !== 'resolvidos' && (
            <button onClick={resolveAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/8 border border-emerald-500/15 hover:bg-emerald-500/15 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar todos
            </button>
          )}
          <button onClick={() => { load(); setNewCount(0) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 bg-white/[0.03] border border-white/[0.06] hover:text-white hover:bg-white/[0.07] transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 text-sm font-medium">
          {msg}<button onClick={() => setMsg('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex items-center gap-1.5 mb-5 animate-stagger-2">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border
              ${filter === f.id
                ? f.id === 'abertos'    ? 'bg-red-500/10 text-red-300 border-red-500/20'
                : f.id === 'resolvidos' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                :                        'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                : 'text-slate-600 border-transparent hover:text-slate-300 hover:border-white/[0.06]'}`}>
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${filter === f.id ? 'bg-white/10' : 'bg-white/[0.04] text-slate-700'}`}>
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
              ? <CheckCircle2 className="w-5 h-5 text-slate-700" />
              : <AlertTriangle className="w-5 h-5 text-slate-700" />}
          </div>
          <p className="text-slate-500 font-semibold text-sm">
            {filter === 'abertos'    && 'Nenhum erro em aberto'}
            {filter === 'resolvidos' && 'Nenhum erro resolvido'}
            {filter === 'todos'      && 'Nenhum erro registrado'}
          </p>
          {filter === 'abertos' && <p className="text-slate-700 text-xs mt-1">Tudo funcionando normalmente.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 animate-stagger-3">
          {filtered.map(e => (
            <ErrorCard key={e.id} error={e} onResolve={resolve} />
          ))}
        </div>
      )}
    </>
  )
}
