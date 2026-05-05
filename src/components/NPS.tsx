import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, X, Loader2, RefreshCw,
  ThumbsUp, ThumbsDown, MessageSquareQuote, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import type { Client } from '../lib/types'
import { SearchableSelect } from './SearchableSelect'

// ── Constantes ────────────────────────────────────────────────────────────────

const MES_NOME  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface NpsResponse {
  id: string
  client_id?: string
  cliente_nome: string
  score: number
  comentario: string
  data: string
}

const EMPTY: Omit<NpsResponse, 'id'> = {
  client_id:    undefined,
  cliente_nome: '',
  score:        9,
  comentario:   '',
  data:         new Date().toISOString().slice(0, 10),
}

const inputCls = `w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-sm
  placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors`
const labelCls = 'block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300 mb-2'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fromDB(r: Record<string, unknown>): NpsResponse {
  return {
    id:           r.id as string,
    client_id:    (r.client_id as string) || undefined,
    cliente_nome: (r.cliente_nome as string) ?? '',
    score:        Number(r.score) || 0,
    comentario:   (r.comentario as string) ?? '',
    data:         (r.data as string) ?? '',
  }
}

function categoriaScore(score: number): 'detrator' | 'neutro' | 'promotor' {
  if (score <= 6) return 'detrator'
  if (score <= 8) return 'neutro'
  return 'promotor'
}

function calcularNPS(responses: { score: number }[]): number {
  if (responses.length === 0) return 0
  const promotores = responses.filter(r => r.score >= 9).length
  const detratores = responses.filter(r => r.score <= 6).length
  return Math.round(((promotores - detratores) / responses.length) * 100)
}

function classificacaoNPS(nps: number): { label: string; tone: 'emerald' | 'amber' | 'rose' | 'slate' } {
  if (nps >= 75) return { label: 'Excelente',  tone: 'emerald' }
  if (nps >= 50) return { label: 'Muito bom',  tone: 'emerald' }
  if (nps >=  0) return { label: 'Razoável',   tone: 'amber' }
  return            { label: 'Crítico',    tone: 'rose' }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function NpsModal({ initial, editing, clients, onSave, onClose }: {
  initial: Omit<NpsResponse, 'id'>
  editing: boolean
  clients: Client[]
  onSave: (d: Omit<NpsResponse, 'id'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm]     = useState(initial)
  const [saving, setSaving] = useState(false)
  const [mode, setMode]     = useState<'cliente' | 'lead'>(initial.client_id ? 'cliente' : 'lead')

  const set = <K extends keyof Omit<NpsResponse, 'id'>>(k: K, v: NpsResponse[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  function handleClient(id: string) {
    if (!id) {
      set('client_id', undefined); set('cliente_nome', ''); return
    }
    const c = clients.find(c => c.id === id)
    if (!c) return
    setForm(f => ({ ...f, client_id: c.id, cliente_nome: c.nome }))
  }

  function switchMode(next: 'cliente' | 'lead') {
    setMode(next)
    if (next === 'lead') setForm(f => ({ ...f, client_id: undefined }))
    else                 setForm(f => ({ ...f, client_id: undefined, cliente_nome: '' }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.cliente_nome.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const cat = categoriaScore(form.score)
  const corScore =
    cat === 'promotor' ? 'text-emerald-300' :
    cat === 'neutro'   ? 'text-slate-200' :
                         'text-rose-300'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#0a0c11] border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">

        <div className="flex items-center justify-between px-8 py-6 border-b border-white/[0.05]">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-indigo-300/80">
              {editing ? 'Editar' : 'Registrar'} · resposta NPS
            </p>
            <h2 className="font-display text-3xl text-white tracking-tight mt-1.5"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}>
              {editing ? 'Atualizar resposta' : 'Nova resposta'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-8 py-7 space-y-6 max-h-[75vh] overflow-y-auto">

          {/* Toggle */}
          <div className="inline-flex p-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
            {(['cliente', 'lead'] as const).map(m => (
              <button key={m} type="button" onClick={() => switchMode(m)}
                className={`px-4 py-1.5 rounded-full text-[11px] font-medium tracking-wide transition-all
                  ${mode === m ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>
                {m === 'cliente' ? 'Cliente cadastrado' : 'Outro / lead'}
              </button>
            ))}
          </div>

          {mode === 'cliente' ? (
            <div>
              <label className={labelCls}>Cliente</label>
              {clients.length === 0 ? (
                <div className="px-4 py-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 text-amber-200/80 text-sm">
                  Nenhum cliente cadastrado.
                </div>
              ) : (
                <SearchableSelect required value={form.client_id ?? ''} onChange={handleClient}
                  placeholder="Selecione um cliente…"
                  options={clients.map(c => ({ value: c.id, label: c.nome, sublabel: c.cpf_cnpj || c.telefone || undefined }))}
                />
              )}
            </div>
          ) : (
            <div>
              <label className={labelCls}>Nome de quem respondeu</label>
              <input className={inputCls} placeholder="Ex: João Silva"
                value={form.cliente_nome} required
                onChange={e => set('cliente_nome', e.target.value)} />
            </div>
          )}

          {/* Score 0-10 */}
          <div>
            <label className={labelCls}>Score · 0 a 10</label>
            <div className="grid grid-cols-11 gap-1.5">
              {Array.from({ length: 11 }, (_, i) => {
                const c = categoriaScore(i)
                const active = form.score === i
                const baseCls = active
                  ? c === 'promotor' ? 'bg-emerald-500 text-white ring-2 ring-emerald-400/50'
                  : c === 'neutro'   ? 'bg-slate-200 text-slate-900 ring-2 ring-slate-300/50'
                                     : 'bg-rose-500 text-white ring-2 ring-rose-400/50'
                  : c === 'promotor' ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20'
                  : c === 'neutro'   ? 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] ring-1 ring-white/[0.08]'
                                     : 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 ring-1 ring-rose-500/20'
                return (
                  <button key={i} type="button" onClick={() => set('score', i)}
                    className={`aspect-square rounded-xl text-base font-display font-semibold transition-all ${baseCls}`}
                    style={{ fontVariationSettings: '"opsz" 24, "SOFT" 30' }}>
                    {i}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-mono uppercase tracking-wider">
              <span className="text-rose-300/80">detrator (0-6)</span>
              <span className="text-slate-300/70">neutro (7-8)</span>
              <span className="text-emerald-300/80">promotor (9-10)</span>
            </div>
            <p className={`mt-3 text-sm font-display italic ${corScore}`}
               style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
              {cat === 'promotor' && 'cliente promotor — adoraria recomendar.'}
              {cat === 'neutro'   && 'cliente neutro — está satisfeito mas não engajado.'}
              {cat === 'detrator' && 'cliente detrator — risco de churn, ouvir com atenção.'}
            </p>
          </div>

          {/* Comentário */}
          <div>
            <label className={labelCls}>Comentário (opcional)</label>
            <textarea rows={4} className={inputCls + ' resize-none'}
              placeholder="O que o cliente disse? Por que deu essa nota?"
              value={form.comentario}
              onChange={e => set('comentario', e.target.value)} />
          </div>

          {/* Data */}
          <div>
            <label className={labelCls}>Data da resposta</label>
            <input type="date" className={inputCls + ' cursor-pointer max-w-xs'} style={{ colorScheme: 'dark' }}
              value={form.data} onChange={e => set('data', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving || !form.cliente_nome.trim()}
              className="flex-1 py-3 rounded-full text-slate-900 text-sm font-semibold bg-white
                         hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando</span>
                : editing ? 'Salvar alterações' : 'Registrar resposta'}
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="px-6 py-3 rounded-full text-slate-300 text-sm font-medium bg-transparent border border-white/[0.08] hover:border-white/20 transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function NPS() {
  const [responses, setResponses] = useState<NpsResponse[]>([])
  const [clients, setClients]     = useState<Client[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [modal, setModal]         = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [initial, setInitial]     = useState<Omit<NpsResponse, 'id'>>(EMPTY)
  const [filter, setFilter]       = useState<'todas' | 'detrator' | 'neutro' | 'promotor'>('todas')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    const [{ data: resp, error: e }, { data: cls }] = await Promise.all([
      supabase.from('nps_responses').select('*').order('data', { ascending: false }),
      supabase.from('clients').select('id,nome,telefone,email,cpf_cnpj,tipo,cidade,estado,observacoes').order('nome'),
    ])
    if (e) setError('Erro ao carregar respostas.')
    else if (resp) setResponses(resp.map(fromDB))
    if (cls) setClients(cls as Client[])
    setLoading(false)
  }

  async function handleSave(data: Omit<NpsResponse, 'id'>) {
    setError('')
    const payload = {
      client_id:    data.client_id || null,
      cliente_nome: data.cliente_nome,
      score:        data.score,
      comentario:   data.comentario || null,
      data:         data.data,
    }
    if (editId) {
      const { error } = await supabase.from('nps_responses').update(payload).eq('id', editId)
      if (error) { setError('Erro ao salvar.'); return }
      setResponses(rs => rs.map(r => r.id === editId ? { ...data, id: editId } : r))
    } else {
      const { data: row, error } = await supabase.from('nps_responses').insert(payload).select().single()
      if (error || !row) { setError('Erro ao registrar.'); return }
      setResponses(rs => [fromDB(row), ...rs])
    }
    setModal(false)
  }

  async function del(id: string) {
    const { error } = await supabase.from('nps_responses').delete().eq('id', id)
    if (error) { setError('Erro ao excluir.'); return }
    setResponses(rs => rs.filter(r => r.id !== id))
  }

  // ── Cálculos ────────────────────────────────────────────────────────────────

  const hoje    = new Date()
  const mesNome = MES_NOME[hoje.getMonth()]
  const ano     = hoje.getFullYear()

  const inicioMes = useMemo(() => `${ano}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`, [hoje, ano])
  const fimMes    = useMemo(() => {
    const d = new Date(ano, hoje.getMonth() + 1, 0)
    return d.toISOString().slice(0, 10)
  }, [hoje, ano])

  const respostasMes = useMemo(() =>
    responses.filter(r => r.data >= inicioMes && r.data <= fimMes)
  , [responses, inicioMes, fimMes])

  const respostasMesAnterior = useMemo(() => {
    const ant = new Date(ano, hoje.getMonth() - 1, 1)
    const ini = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}-01`
    const fim = new Date(ant.getFullYear(), ant.getMonth() + 1, 0).toISOString().slice(0, 10)
    return responses.filter(r => r.data >= ini && r.data <= fim)
  }, [responses, hoje, ano])

  const npsAtual    = calcularNPS(respostasMes)
  const npsAnterior = calcularNPS(respostasMesAnterior)
  const delta       = npsAtual - npsAnterior

  const promotores = respostasMes.filter(r => r.score >= 9).length
  const neutros    = respostasMes.filter(r => r.score >= 7 && r.score <= 8).length
  const detratores = respostasMes.filter(r => r.score <= 6).length
  const total      = respostasMes.length

  const pctPromotores = total > 0 ? (promotores / total) * 100 : 0
  const pctNeutros    = total > 0 ? (neutros    / total) * 100 : 0
  const pctDetratores = total > 0 ? (detratores / total) * 100 : 0

  const classif = classificacaoNPS(npsAtual)

  // Histórico 6 meses
  const historico = useMemo(() => {
    const out: { label: string; nps: number; total: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ano, hoje.getMonth() - i, 1)
      const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
      const slice = responses.filter(r => r.data >= ini && r.data <= fim)
      out.push({
        label: MES_CURTO[d.getMonth()],
        nps:   calcularNPS(slice),
        total: slice.length,
      })
    }
    return out
  }, [responses, hoje, ano])

  // Filtro de respostas exibidas
  const respostasFiltradas = useMemo(() => {
    if (filter === 'todas') return responses
    return responses.filter(r => categoriaScore(r.score) === filter)
  }, [responses, filter])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
    </div>
  )

  return (
    <div className="max-w-[1400px] mx-auto pb-16">

      {/* Editorial header */}
      <header className="flex items-end justify-between gap-6 mb-12 pt-2 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-slate-300/70">
            NPS · {mesNome} {ano}
          </p>
          <h1 className="font-display text-white mt-2 leading-[0.95] tracking-tight"
              style={{
                fontSize: 'clamp(48px, 7vw, 88px)',
                fontVariationSettings: '"opsz" 144, "SOFT" 30',
                fontWeight: 400,
              }}>
            Satisfação<span className="text-indigo-300/90 italic ml-1" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>.</span>
          </h1>
          <p className="text-slate-300 text-sm mt-3 max-w-md font-display italic"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
            o pulso dos clientes mês a mês — quem indica, quem reclama, e o que dá pra melhorar.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-slate-300 text-xs font-medium bg-white/[0.03] border border-white/[0.08] hover:border-white/20 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
          <button onClick={() => { setInitial(EMPTY); setEditId(null); setModal(true) }}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-slate-900 text-sm font-semibold bg-white hover:bg-slate-100 transition-colors">
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Nova resposta
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 px-5 py-3 rounded-2xl bg-rose-500/[0.06] border border-rose-500/15 text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* Hero NPS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-white/[0.06] border border-white/[0.06] rounded-3xl overflow-hidden mb-12">

        {/* Score gigante */}
        <div className="lg:col-span-7 bg-[#0a0c11] p-10 sm:p-12 relative overflow-hidden">
          <div className={`absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none
            ${classif.tone === 'emerald' ? 'bg-emerald-500/[0.08]' :
              classif.tone === 'amber'   ? 'bg-amber-500/[0.06]'  :
              classif.tone === 'rose'    ? 'bg-rose-500/[0.08]'   :
                                           'bg-slate-500/[0.05]'}`} />

          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
            NPS · {mesNome.toLowerCase()}
          </p>

          <div className="mt-7 flex items-baseline gap-3 relative">
            {total > 0 && (
              <span className={`text-3xl font-display
                ${classif.tone === 'emerald' ? 'text-emerald-300' :
                  classif.tone === 'amber'   ? 'text-amber-300'   :
                  classif.tone === 'rose'    ? 'text-rose-300'    :
                                               'text-slate-300'}`}
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 60' }}>
                {npsAtual >= 0 ? '+' : '−'}
              </span>
            )}
            <span className="font-display tracking-tight leading-none text-white"
                  style={{
                    fontVariationSettings: '"opsz" 144, "SOFT" 30',
                    fontSize: 'clamp(56px, 8vw, 132px)',
                    fontWeight: 400,
                  }}>
              {total > 0 ? Math.abs(npsAtual) : '—'}
            </span>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider
              ${classif.tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20' :
                classif.tone === 'amber'   ? 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20'       :
                classif.tone === 'rose'    ? 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20'          :
                                             'bg-white/[0.04] text-slate-200 ring-1 ring-white/[0.08]'}`}>
              {classif.label}
            </span>
            <span className="text-slate-300 text-xs font-mono">
              {total} {total === 1 ? 'resposta' : 'respostas'} no mês
            </span>
            {respostasMesAnterior.length > 0 && total > 0 && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-mono
                ${delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-300'}`}>
                {delta > 0 ? <ArrowUpRight className="w-3 h-3" /> :
                 delta < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                {delta > 0 ? '+' : ''}{delta} vs mês anterior
              </span>
            )}
          </div>

          <p className="mt-10 text-slate-300 text-sm font-display italic max-w-md leading-relaxed"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 50' }}>
            {total === 0 && 'ainda sem respostas neste mês — comece a coletar feedback dos seus clientes.'}
            {total > 0 && classif.tone === 'emerald' && 'seus clientes amam o que você entrega. Aproveite para pedir indicações.'}
            {total > 0 && classif.tone === 'amber'   && 'tem espaço pra crescer — entenda os neutros e converta detratores.'}
            {total > 0 && classif.tone === 'rose'    && 'sinal vermelho — escute os detratores e aja rápido pra reverter.'}
          </p>
        </div>

        {/* KPIs distribuição */}
        <div className="lg:col-span-5 bg-[#0a0c11] grid grid-cols-2 grid-rows-2 gap-px bg-white/[0.06]">
          <KpiNps kicker="Promotores" sub="9 a 10"  count={promotores} pct={pctPromotores} tone="emerald" />
          <KpiNps kicker="Detratores" sub="0 a 6"   count={detratores} pct={pctDetratores} tone="rose" />
          <KpiNps kicker="Neutros"    sub="7 a 8"   count={neutros}    pct={pctNeutros}    tone="slate" />
          <KpiNps kicker="Total"      sub="respostas" count={total}    pct={100}            tone="white" hideBar />
        </div>
      </section>

      {/* Distribuição em barra empilhada */}
      {total > 0 && (
        <section className="bg-[#0a0c11] border border-white/[0.06] rounded-3xl p-8 sm:p-10 mb-12">
          <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
                Distribuição · {mesNome.toLowerCase()}
              </p>
              <h3 className="font-display text-3xl text-white tracking-tight mt-1.5"
                  style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
                Como se <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>dividem</span>
              </h3>
            </div>
            <p className="text-slate-300/70 text-xs">{total} respostas</p>
          </div>

          <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden flex">
            <div className="h-full bg-rose-500" style={{ width: `${pctDetratores}%` }} />
            <div className="h-full bg-slate-300" style={{ width: `${pctNeutros}%` }} />
            <div className="h-full bg-emerald-500" style={{ width: `${pctPromotores}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-6 mt-5">
            <DistRow label="Detratores" pct={pctDetratores} count={detratores} tone="rose" />
            <DistRow label="Neutros"    pct={pctNeutros}    count={neutros}    tone="slate" />
            <DistRow label="Promotores" pct={pctPromotores} count={promotores} tone="emerald" />
          </div>
        </section>
      )}

      {/* Histórico 6 meses */}
      <HistoricoNps historico={historico} />

      {/* Lista de respostas */}
      <section>
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
              Respostas · {responses.length}
            </p>
            <h2 className="font-display text-3xl text-white mt-1.5 tracking-tight"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
              O que <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>dizem</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              ['todas',    'Todas',      responses.length],
              ['promotor', 'Promotores', responses.filter(r => r.score >= 9).length],
              ['neutro',   'Neutros',    responses.filter(r => r.score >= 7 && r.score <= 8).length],
              ['detrator', 'Detratores', responses.filter(r => r.score <= 6).length],
            ] as const).map(([key, label, count]) => {
              const active = filter === key
              return (
                <button key={key} onClick={() => setFilter(key)}
                  className={`px-4 py-2 rounded-full text-[11px] font-medium tracking-wide transition-all
                    ${active
                      ? 'bg-white text-slate-900'
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'}`}>
                  {label}
                  <span className={`ml-1.5 font-mono ${active ? 'text-slate-500' : 'text-slate-300/50'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {respostasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-white/[0.06] rounded-3xl">
            <p className="font-display text-3xl text-white tracking-tight"
               style={{ fontVariationSettings: '"opsz" 96, "SOFT" 60' }}>
              {responses.length === 0 ? 'Nada por aqui ainda.' : 'Sem respostas neste filtro.'}
            </p>
            <p className="text-slate-300 text-sm mt-3 max-w-sm font-display italic"
               style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
              {responses.length === 0
                ? 'pergunte aos seus clientes "de 0 a 10, quanto você nos indicaria?" e registre as respostas.'
                : 'tente outro recorte para ver mais respostas.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {respostasFiltradas.map(r => (
              <RespostaCard key={r.id} r={r}
                onEdit={() => { const { id, ...rest } = r; setInitial(rest); setEditId(id); setModal(true) }}
                onDelete={() => del(r.id)} />
            ))}
          </div>
        )}
      </section>

      {modal && (
        <NpsModal initial={initial} editing={!!editId} clients={clients}
          onSave={handleSave} onClose={() => setModal(false)} />
      )}
    </div>
  )
}

// ── KPI ───────────────────────────────────────────────────────────────────────

function KpiNps({ kicker, sub, count, pct, tone, hideBar }: {
  kicker: string
  sub: string
  count: number
  pct: number
  tone: 'emerald' | 'rose' | 'slate' | 'white'
  hideBar?: boolean
}) {
  const cor =
    tone === 'emerald' ? 'text-emerald-200' :
    tone === 'rose'    ? 'text-rose-200'    :
    tone === 'slate'   ? 'text-slate-200'   :
                         'text-white'
  const corBar =
    tone === 'emerald' ? 'bg-emerald-500'   :
    tone === 'rose'    ? 'bg-rose-500'      :
                         'bg-slate-300'

  return (
    <div className="bg-[#0a0c11] p-5 sm:p-6 flex flex-col justify-between">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">{kicker}</p>
      <div className="mt-4">
        <p className={`font-display text-3xl tracking-tight ${cor}`}
           style={{ fontVariationSettings: '"opsz" 48, "SOFT" 40' }}>
          <span className="font-numeric">{count}</span>
          {!hideBar && (
            <span className="text-slate-300/50 text-xs font-mono ml-2">· {pct.toFixed(0)}%</span>
          )}
        </p>
        <p className="text-slate-300/70 text-[11px] mt-1.5 font-mono uppercase tracking-wider">{sub}</p>
        {!hideBar && (
          <div className="mt-3 h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className={`h-full ${corBar} rounded-full transition-all duration-700`}
              style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

function DistRow({ label, pct, count, tone }: {
  label: string
  pct: number
  count: number
  tone: 'emerald' | 'slate' | 'rose'
}) {
  const dot =
    tone === 'emerald' ? 'bg-emerald-500' :
    tone === 'slate'   ? 'bg-slate-300'   :
                         'bg-rose-500'
  return (
    <div className="flex items-baseline gap-3">
      <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">{label}</p>
        <p className="font-display text-2xl text-white tracking-tight mt-1"
           style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
          <span className="font-numeric">{pct.toFixed(0)}</span>
          <span className="text-slate-300/50 text-sm font-mono">%</span>
          <span className="text-slate-300/60 text-xs font-mono ml-2">· {count}</span>
        </p>
      </div>
    </div>
  )
}

// ── Histórico ─────────────────────────────────────────────────────────────────

function HistoricoNps({ historico }: { historico: { label: string; nps: number; total: number }[] }) {
  if (historico.every(h => h.total === 0)) return null

  const W = 880, H = 220, padL = 56, padR = 24, padT = 36, padB = 36
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const step = innerW / historico.length
  const barW = step * 0.55

  // Range Y de -100 a +100
  const yOf = (v: number) => padT + innerH - ((v + 100) / 200) * innerH
  const yZero = yOf(0)

  return (
    <section className="bg-[#0a0c11] border border-white/[0.06] rounded-3xl p-8 sm:p-10 mb-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
            Histórico · seis meses
          </p>
          <h3 className="font-display text-3xl text-white tracking-tight mt-1.5"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
            Como <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>evoluímos</span>
          </h3>
        </div>
        <div className="flex items-center gap-5 text-[11px] text-slate-300 font-mono uppercase tracking-wider">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-emerald-400/70" />positivo</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-rose-400/70" />negativo</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* Grid: linhas em -100, 0, +100 */}
          {[100, 50, 0, -50, -100].map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)}
                stroke={v === 0 ? 'rgba(203,213,225,0.2)' : 'rgba(255,255,255,0.04)'}
                strokeDasharray={v === 0 ? '2 4' : undefined} />
              <text x={padL - 10} y={yOf(v) + 3.5} fill="rgba(203,213,225,0.5)"
                fontSize="9" fontFamily="JetBrains Mono" textAnchor="end">
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}

          {/* Barras */}
          {historico.map((h, i) => {
            const x = padL + step * i + (step - barW) / 2
            const isPositive = h.nps >= 0
            const yTop = isPositive ? yOf(h.nps) : yZero
            const height = Math.abs(yOf(h.nps) - yZero)
            const fill = h.total === 0 ? 'rgba(255,255,255,0.04)' :
                         isPositive ? 'rgba(52,211,153,0.7)' : 'rgba(251,113,133,0.7)'
            return (
              <g key={i}>
                {height > 0.5 && h.total > 0 && (
                  <rect x={x} y={yTop} width={barW} height={height} fill={fill} rx="3" />
                )}
                {h.total > 0 && (
                  <text x={x + barW / 2} y={isPositive ? yTop - 6 : yTop + height + 12}
                    fill="rgba(255,255,255,0.85)" fontSize="10" fontFamily="JetBrains Mono"
                    textAnchor="middle">
                    {h.nps > 0 ? `+${h.nps}` : h.nps}
                  </text>
                )}
                <text x={x + barW / 2} y={H - 12}
                  fill="rgba(203,213,225,0.55)"
                  fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle" letterSpacing="1.5">
                  {h.label.toUpperCase()}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}

// ── Card de resposta ──────────────────────────────────────────────────────────

function RespostaCard({ r, onEdit, onDelete }: {
  r: NpsResponse
  onEdit: () => void
  onDelete: () => void
}) {
  const cat = categoriaScore(r.score)
  const corPrincipal =
    cat === 'promotor' ? 'text-emerald-200' :
    cat === 'neutro'   ? 'text-slate-200'   :
                         'text-rose-200'
  const corBorder =
    cat === 'promotor' ? 'border-emerald-500/15' :
    cat === 'neutro'   ? 'border-white/[0.07]'   :
                         'border-rose-500/15'
  const Icon =
    cat === 'promotor' ? ThumbsUp :
    cat === 'neutro'   ? MessageSquareQuote :
                         ThumbsDown
  const corIcon =
    cat === 'promotor' ? 'text-emerald-300' :
    cat === 'neutro'   ? 'text-slate-300'   :
                         'text-rose-300'

  return (
    <article className={`group bg-[#0a0c11] border ${corBorder} rounded-2xl p-6 hover:border-white/[0.14] transition-colors`}>
      <div className="flex items-start gap-4 mb-4">
        <div className={`shrink-0 w-12 h-12 rounded-xl ring-1 flex items-center justify-center
          ${cat === 'promotor' ? 'bg-emerald-500/10 ring-emerald-500/20' :
            cat === 'neutro'   ? 'bg-white/[0.04] ring-white/[0.08]' :
                                 'bg-rose-500/10 ring-rose-500/20'}`}>
          <Icon className={`w-5 h-5 ${corIcon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300/60">
            {cat === 'promotor' ? 'promotor' : cat === 'neutro' ? 'neutro' : 'detrator'}
            <span className="ml-2 normal-case tracking-normal text-slate-300/50">{formatDate(r.data)}</span>
          </p>
          <h3 className="font-display text-xl text-white tracking-tight mt-1 leading-tight truncate"
              style={{ fontVariationSettings: '"opsz" 24, "SOFT" 40' }}>
            {r.cliente_nome}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-display text-3xl ${corPrincipal}`}
             style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
            <span className="font-numeric">{r.score}</span>
            <span className="text-slate-300/50 text-sm font-mono">/10</span>
          </p>
        </div>
      </div>

      {r.comentario && (
        <blockquote className="text-slate-300 text-sm font-display italic leading-relaxed pl-4 border-l-2 border-white/[0.08]"
                    style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
          “{r.comentario}”
        </blockquote>
      )}

      <div className="flex items-center gap-1 pt-4 mt-4 border-t border-white/[0.05] opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-2 rounded-full text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  )
}
