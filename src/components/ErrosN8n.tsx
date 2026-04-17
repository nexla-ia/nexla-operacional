import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, Loader2, X, Clock, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface N8nError {
  id:          string
  payload:     string
  resolved:    boolean
  resolved_at: string | null
  resolved_by: string | null
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
// Divide o texto em tokens: URL, `código`, *negrito*, texto simples

type Token =
  | { t: 'url';  v: string }
  | { t: 'code'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'text'; v: string }

function tokenize(text: string): Token[] {
  const RE = /(https?:\/\/[^\s`\n]+)|`([^`]+)`|\*([^*]+)\*/g
  const tokens: Token[] = []
  let last = 0
  let m: RegExpExecArray | null

  while ((m = RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: 'text', v: text.slice(last, m.index) })
    if (m[1]) tokens.push({ t: 'url',  v: m[1] })
    else if (m[2]) tokens.push({ t: 'code', v: m[2] })
    else if (m[3]) tokens.push({ t: 'bold', v: m[3] })
    last = m.index + m[0].length
  }

  if (last < text.length) tokens.push({ t: 'text', v: text.slice(last) })
  return tokens
}

function MessageBody({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm text-slate-300 leading-relaxed">
      {text.split('\n').map((line, i) => {
        if (line.trim() === '') return <div key={i} className="h-1" />
        return (
          <p key={i}>
            {tokenize(line).map((tok, j) => {
              if (tok.t === 'url') return (
                <a key={j} href={tok.v} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors break-all">
                  {tok.v}<ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              )
              if (tok.t === 'code') {
                const isUrl = /^https?:\/\//.test(tok.v)
                if (isUrl) return (
                  <a key={j} href={tok.v} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[0.82em] px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:text-indigo-300 hover:bg-indigo-500/15 transition-colors break-all">
                    {tok.v}<ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )
                return (
                  <code key={j} className="font-mono text-[0.82em] px-1.5 py-0.5 rounded-md bg-white/[0.07] text-slate-200 border border-white/[0.08]">
                    {tok.v}
                  </code>
                )
              }
              if (tok.t === 'bold') return <strong key={j} className="font-semibold text-slate-100">{tok.v}</strong>
              return <span key={j}>{tok.v}</span>
            })}
          </p>
        )
      })}
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

  const bg     = isResolved ? 'bg-slate-800/40' : isWarning ? 'bg-amber-950/30' : 'bg-red-950/20'
  const border = isResolved ? 'border-white/[0.08]' : isWarning ? 'border-amber-500/30' : 'border-red-500/30'
  const bar    = isWarning ? 'from-amber-500' : 'from-red-500'

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-200 ${bg} ${border}`}>

      {!isResolved && <div className={`h-0.5 bg-gradient-to-r ${bar} to-transparent opacity-60`} />}

      <div className="p-5">

        {/* topo */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <Clock className="w-3 h-3" />
            <span title={formatFull(error.created_at)}>{timeAgo(error.created_at)}</span>
            <span className="mx-0.5">·</span>
            {formatFull(error.created_at)}
          </span>

          {isResolved ? (
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Resolvido
              </span>
              {error.resolved_at && (
                <span className="text-[10px] text-slate-400">{formatFull(error.resolved_at)}</span>
              )}
              {error.resolved_by && (
                <span className="text-[10px] text-slate-400">por <span className="text-slate-300 font-medium">{error.resolved_by}</span></span>
              )}
            </div>
          ) : (
            <button onClick={() => onResolve(error.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors shrink-0">
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

  async function currentUserName(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'Desconhecido'
    const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    return data?.full_name || user.email || 'Desconhecido'
  }

  async function resolve(id: string) {
    const now  = new Date().toISOString()
    const name = await currentUserName()
    const { error } = await supabase
      .from('n8n_errors')
      .update({ resolved: true, resolved_at: now, resolved_by: name })
      .eq('id', id)
    if (error) { setMsg('Erro ao confirmar.'); return }
    setErrors(es => es.map(e => e.id === id ? { ...e, resolved: true, resolved_at: now, resolved_by: name } : e))
  }

  async function resolveAll() {
    const ids = errors.filter(e => !e.resolved).map(e => e.id)
    if (!ids.length) return
    const now  = new Date().toISOString()
    const name = await currentUserName()
    const { error } = await supabase
      .from('n8n_errors')
      .update({ resolved: true, resolved_at: now, resolved_by: name })
      .in('id', ids)
    if (error) { setMsg('Erro.'); return }
    setErrors(es => es.map(e => ids.includes(e.id) ? { ...e, resolved: true, resolved_at: now, resolved_by: name } : e))
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
          <p className="text-slate-300 text-sm font-medium">Monitoramento em tempo real dos fluxos n8n</p>
        </div>
        <div className="flex items-center gap-2">
          {abertos > 0 && filter !== 'resolvidos' && (
            <button onClick={resolveAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/8 border border-emerald-500/15 hover:bg-emerald-500/15 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar todos
            </button>
          )}
          <button onClick={() => { load(); setNewCount(0) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-300 bg-white/[0.03] border border-white/[0.06] hover:text-white hover:bg-white/[0.07] transition-all">
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
                : 'text-slate-300 border-transparent hover:text-slate-300 hover:border-white/[0.06]'}`}>
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${filter === f.id ? 'bg-white/10' : 'bg-white/[0.04] text-slate-300'}`}>
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
              ? <CheckCircle2 className="w-5 h-5 text-slate-300" />
              : <AlertTriangle className="w-5 h-5 text-slate-300" />}
          </div>
          <p className="text-slate-300 font-semibold text-sm">
            {filter === 'abertos'    && 'Nenhum erro em aberto'}
            {filter === 'resolvidos' && 'Nenhum erro resolvido'}
            {filter === 'todos'      && 'Nenhum erro registrado'}
          </p>
          {filter === 'abertos' && <p className="text-slate-300 text-xs mt-1">Tudo funcionando normalmente.</p>}
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
