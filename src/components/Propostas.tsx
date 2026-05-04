import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, X, Loader2, ArrowUpRight, ArrowDownRight,
  CheckCircle2, Clock, XCircle, FileText,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { maskBRL, parseBRL, numToMask, formatDate, maskPhone } from '../lib/utils'
import type { Proposal, Client } from '../lib/types'
import { SearchableSelect } from './SearchableSelect'

// ── Constantes ────────────────────────────────────────────────────────────────

const EMPTY: Omit<Proposal, 'id'> = {
  client_id: undefined, cliente_nome: '', cliente_telefone: '',
  titulo: '', descricao: '',
  setup_valor: '', mensalidade_valor: '',
  recorrencia: 'mensal', status: 'enviada',
  data_envio: '', observacoes: '',
}

const inputCls = `w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-sm
  font-numeric placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors`
const inputClsText = `w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-sm
  placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors`
const labelCls = 'block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300 mb-2'

const STATUS_META: Record<Proposal['status'], { label: string; dot: string; tone: string }> = {
  rascunho: { label: 'Rascunho', dot: 'bg-slate-400',   tone: 'text-slate-300'   },
  enviada:  { label: 'Enviada',  dot: 'bg-indigo-400',  tone: 'text-indigo-200'  },
  aceita:   { label: 'Aceita',   dot: 'bg-emerald-400', tone: 'text-emerald-200' },
  recusada: { label: 'Recusada', dot: 'bg-rose-400',    tone: 'text-rose-200'    },
}

const STATUS_ICON: Record<Proposal['status'], typeof Clock> = {
  rascunho: FileText, enviada: Clock, aceita: CheckCircle2, recusada: XCircle,
}

const RECORRENCIA_LABEL: Record<Proposal['recorrencia'], string> = {
  mensal: 'mensal', semestral: 'semestral', anual: 'anual',
}

const RECORRENCIA_MESES: Record<Proposal['recorrencia'], number> = {
  mensal: 1, semestral: 6, anual: 12,
}

const MES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── DB mapping ────────────────────────────────────────────────────────────────

function fromDB(r: Record<string, unknown>): Proposal {
  return {
    id:                r.id as string,
    client_id:         (r.client_id as string) || undefined,
    cliente_nome:      (r.cliente_nome as string) ?? '',
    cliente_telefone:  (r.cliente_telefone as string) ?? '',
    titulo:            (r.titulo as string) ?? '',
    descricao:         (r.descricao as string) ?? '',
    setup_valor:       numToMask(r.setup_valor as number | null),
    mensalidade_valor: numToMask(r.mensalidade_valor as number | null),
    recorrencia:       (r.recorrencia as Proposal['recorrencia']) ?? 'mensal',
    status:            (r.status as Proposal['status']) ?? 'enviada',
    data_envio:        (r.data_envio as string) ?? '',
    observacoes:       (r.observacoes as string) ?? '',
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ProposalModal({ initial, editing, clients, onSave, onClose }: {
  initial: Omit<Proposal, 'id'>
  editing: boolean
  clients: Client[]
  onSave: (d: Omit<Proposal, 'id'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm]     = useState(initial)
  const [saving, setSaving] = useState(false)
  const [mode, setMode]     = useState<'cliente' | 'lead'>(initial.client_id ? 'cliente' : 'lead')
  const set = <K extends keyof Omit<Proposal, 'id'>>(k: K, v: Proposal[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  function handleClient(id: string) {
    if (!id) {
      set('client_id', undefined); set('cliente_nome', ''); set('cliente_telefone', ''); return
    }
    const c = clients.find(c => c.id === id)
    if (!c) return
    setForm(f => ({ ...f, client_id: c.id, cliente_nome: c.nome, cliente_telefone: c.telefone || '' }))
  }

  function switchMode(next: 'cliente' | 'lead') {
    setMode(next)
    if (next === 'lead') setForm(f => ({ ...f, client_id: undefined }))
    else                 setForm(f => ({ ...f, client_id: undefined, cliente_nome: '', cliente_telefone: '' }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    if (mode === 'cliente' && !form.client_id) return
    if (mode === 'lead' && !form.cliente_nome.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#0a0c11] border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">

        <div className="flex items-center justify-between px-8 py-6 border-b border-white/[0.05]">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-indigo-300/80">
              {editing ? 'Editar' : 'Compor'} · proposta
            </p>
            <h2 className="font-display text-3xl text-white tracking-tight mt-1.5" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}>
              {editing ? 'Revisar termos' : 'Nova proposta'}
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
                {m === 'cliente' ? 'Cliente cadastrado' : 'Lead novo'}
              </button>
            ))}
          </div>

          {mode === 'cliente' ? (
            <div>
              <label className={labelCls}>Cliente</label>
              {clients.length === 0 ? (
                <div className="px-4 py-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 text-amber-200/80 text-sm">
                  Nenhum cliente cadastrado. Use o modo "Lead novo".
                </div>
              ) : (
                <SearchableSelect required value={form.client_id ?? ''} onChange={handleClient}
                  placeholder="Selecione um cliente…"
                  options={clients.map(c => ({ value: c.id, label: c.nome, sublabel: c.cpf_cnpj || c.telefone || undefined }))}
                />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelCls}>Nome do lead</label>
                <input className={inputClsText} placeholder="Ex: João Silva" required
                  value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input className={inputCls} placeholder="(00) 00000-0000" inputMode="tel"
                  value={form.cliente_telefone}
                  onChange={e => set('cliente_telefone', maskPhone(e.target.value))} />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Título da proposta</label>
            <input className={inputClsText} placeholder="Ex: Atendimento + Site institucional" required
              value={form.titulo} onChange={e => set('titulo', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Setup (R$)</label>
              <input className={inputCls} placeholder="0,00" inputMode="numeric"
                value={form.setup_valor} onChange={e => set('setup_valor', maskBRL(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Mensalidade (R$)</label>
              <input className={inputCls} placeholder="0,00" inputMode="numeric"
                value={form.mensalidade_valor} onChange={e => set('mensalidade_valor', maskBRL(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Recorrência</label>
              <div className="flex gap-1 p-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
                {(['mensal','semestral','anual'] as const).map(r => (
                  <button key={r} type="button" onClick={() => set('recorrencia', r)}
                    className={`flex-1 py-2 rounded-full text-[11px] font-medium transition-all
                      ${form.recorrencia === r ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>
                    {r === 'mensal' ? 'Mensal' : r === 'semestral' ? '6 meses' : 'Anual'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Data de envio</label>
              <input type="date" className={inputCls + ' cursor-pointer'} style={{ colorScheme: 'dark' }}
                value={form.data_envio} onChange={e => set('data_envio', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(STATUS_META) as Proposal['status'][]).map(s => {
                const m = STATUS_META[s]
                const active = form.status === s
                return (
                  <button key={s} type="button" onClick={() => set('status', s)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-medium transition-all
                      ${active
                        ? 'bg-white/[0.06] border border-white/15 text-white'
                        : 'bg-white/[0.02] border border-white/[0.05] text-slate-300 hover:border-white/15'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className={labelCls}>Descrição</label>
            <textarea rows={2} className={inputClsText + ' resize-none'} placeholder="O que está incluso na proposta…"
              value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Observações internas</label>
            <textarea rows={2} className={inputClsText + ' resize-none'} placeholder="Notas, prazos, condições…"
              value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit"
              disabled={saving || (mode === 'cliente' ? !form.client_id : !form.cliente_nome.trim())}
              className="flex-1 py-3 rounded-full text-slate-900 text-sm font-semibold bg-white
                         hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando</span>
                : editing ? 'Salvar alterações' : 'Criar proposta'}
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

// ── Saúde do mês (hero saldo + KPIs) ──────────────────────────────────────────

function SaudeMes({ receitaRecorrente, entradasMes, custoFixo, despesasMes, qtdMensalidadesAtivas }: {
  receitaRecorrente: number
  entradasMes: number
  custoFixo: number
  despesasMes: number
  qtdMensalidadesAtivas: number
}) {
  const receitaTotal = receitaRecorrente + entradasMes
  const despesaTotal = custoFixo + despesasMes
  const saldo        = receitaTotal - despesaTotal
  const margemPct    = despesaTotal > 0 ? (saldo / despesaTotal) * 100 : 0
  const ticketMedio  = qtdMensalidadesAtivas > 0 ? receitaRecorrente / qtdMensalidadesAtivas : 0
  const positivo     = saldo >= 0

  const hoje    = new Date()
  const mesNome = MES_NOME[hoje.getMonth()].toLowerCase()

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-white/[0.06] border border-white/[0.06] rounded-3xl overflow-hidden mb-12">

      {/* Hero saldo */}
      <div className="lg:col-span-7 bg-[#0a0c11] p-10 sm:p-12 relative overflow-hidden">
        {/* Subtle radial light */}
        <div className={`absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none
          ${positivo ? 'bg-emerald-500/[0.08]' : 'bg-rose-500/[0.08]'}`} />

        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
          Saldo líquido · {mesNome}
        </p>

        <div className="mt-7 flex items-baseline gap-3 relative">
          <span className={`text-3xl font-display ${positivo ? 'text-emerald-300' : 'text-rose-300'}`}
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 60' }}>
            {positivo ? '+' : '−'}
          </span>
          <span className="text-slate-300 text-2xl font-mono mr-1">R$</span>
          <span className={`font-display tracking-tight leading-none ${positivo ? 'text-white' : 'text-rose-50'}`}
                style={{
                  fontVariationSettings: '"opsz" 144, "SOFT" 30',
                  fontSize: 'clamp(56px, 8vw, 104px)',
                  fontWeight: 400,
                }}>
            {numToMask(Math.abs(saldo))}
          </span>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono
            ${positivo
              ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
              : 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20'}`}>
            {positivo
              ? <ArrowUpRight className="w-3 h-3" />
              : <ArrowDownRight className="w-3 h-3" />}
            {margemPct >= 0 ? '+' : ''}{margemPct.toFixed(1)}% sobre despesa
          </span>
          <span className="text-slate-300 text-xs">
            ticket médio <span className="font-numeric text-white">R$ {numToMask(ticketMedio)}</span>
          </span>
        </div>

        <p className="mt-10 text-slate-300 text-sm font-display italic max-w-md leading-relaxed"
           style={{ fontVariationSettings: '"opsz" 14, "SOFT" 50' }}>
          {positivo
            ? `Você está cobrindo as despesas com ${qtdMensalidadesAtivas} ${qtdMensalidadesAtivas === 1 ? 'cliente pagante' : 'clientes pagantes'}. Tudo certo para crescer.`
            : `Faltam R$ ${numToMask(Math.abs(saldo))} para fechar o mês no zero. Precisa de propostas novas.`}
        </p>
      </div>

      {/* KPIs */}
      <div className="lg:col-span-5 bg-[#0a0c11] grid grid-cols-2 grid-rows-2 gap-px bg-white/[0.06]">
        <KPI
          kicker="Recorrente"
          value={receitaRecorrente}
          tone="emerald"
          sub={`${qtdMensalidadesAtivas} mensalidade${qtdMensalidadesAtivas === 1 ? '' : 's'} ativa${qtdMensalidadesAtivas === 1 ? '' : 's'}`}
        />
        <KPI
          kicker="Entradas no mês"
          value={entradasMes}
          tone="emerald"
          sub="setups e projetos"
        />
        <KPI
          kicker="Despesa fixa"
          value={custoFixo}
          tone="rose"
          sub="recorrente / mês"
        />
        <KPI
          kicker="Avulsas no mês"
          value={despesasMes}
          tone="rose"
          sub="pontuais"
        />
      </div>
    </section>
  )
}

function KPI({ kicker, value, tone, sub }: {
  kicker: string
  value: number
  tone: 'emerald' | 'rose'
  sub: string
}) {
  const color = tone === 'emerald' ? 'text-emerald-200' : 'text-rose-200'
  return (
    <div className="bg-[#0a0c11] p-6 sm:p-7 flex flex-col justify-between">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">{kicker}</p>
      <div className="mt-6">
        <p className={`font-display text-3xl tracking-tight ${color}`}
           style={{ fontVariationSettings: '"opsz" 48, "SOFT" 40' }}>
          <span className="text-slate-300/60 text-base font-mono mr-1">R$</span>
          <span className="font-numeric">{numToMask(value)}</span>
        </p>
        <p className="text-slate-300 text-xs mt-2">{sub}</p>
      </div>
    </div>
  )
}

// ── Projeção 12 meses ─────────────────────────────────────────────────────────

function ProjecaoChart({ receitaRecorrente, custoFixo, mensalidadeAceitas, mensalidadeEnviadas, setupAceitas, setupEnviadas }: {
  receitaRecorrente: number
  custoFixo: number
  mensalidadeAceitas: number
  mensalidadeEnviadas: number
  setupAceitas: number
  setupEnviadas: number
}) {
  const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  const hoje  = new Date()
  const labels: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    labels.push(meses[d.getMonth()])
  }

  const data = labels.map((_, i) => ({
    atual:    receitaRecorrente,
    aceitas:  mensalidadeAceitas + (i === 0 ? setupAceitas : 0),
    enviadas: mensalidadeEnviadas + (i === 0 ? setupEnviadas : 0),
    custo:    custoFixo,
  }))

  const totaisOtimista = data.map(d => d.atual + d.aceitas + d.enviadas)
  const maxValor = Math.max(custoFixo, ...totaisOtimista, 1) * 1.18

  // SVG dimensions
  const W = 880, H = 320, padL = 56, padR = 16, padT = 24, padB = 36
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const step   = innerW / 12
  const barW   = step * 0.55

  const yOf = (v: number) => padT + innerH - (v / maxValor) * innerH

  let acum = 0
  const saldoPath = data.map((d, i) => {
    acum += (d.atual + d.aceitas) - d.custo
    return { x: padL + step * i + step / 2, valor: acum }
  })
  const saldoMaxAbs = Math.max(...saldoPath.map(p => Math.abs(p.valor)), 1)
  const saldoYBase  = padT + innerH / 2
  const saldoYOf    = (v: number) => saldoYBase - (v / saldoMaxAbs) * (innerH / 2 - 12)

  const ticks = [0, maxValor * 0.25, maxValor * 0.5, maxValor * 0.75, maxValor]

  // Resumos
  const saldo12mAtual    = (receitaRecorrente - custoFixo) * 12
  const saldo12mAceitas  = (receitaRecorrente + mensalidadeAceitas - custoFixo) * 12 + setupAceitas
  const saldo12mOtimista = (receitaRecorrente + mensalidadeAceitas + mensalidadeEnviadas - custoFixo) * 12 + setupAceitas + setupEnviadas

  return (
    <section className="bg-[#0a0c11] border border-white/[0.06] rounded-3xl p-8 sm:p-10 mb-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
            Trajetória · próximos doze meses
          </p>
          <h3 className="font-display text-3xl text-white tracking-tight mt-1.5"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
            Projeção <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>financeira</span>
          </h3>
        </div>
        <div className="flex items-center gap-5 text-[11px] text-slate-300 font-mono uppercase tracking-wider">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-emerald-400/80" />base</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-emerald-400/35" />aceitas</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-amber-300/40" />enviadas</span>
          <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-rose-400/80" />custo</span>
          <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-indigo-300" />saldo acum.</span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="grAtual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="rgb(52,211,153)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="grAceitas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="rgb(110,231,183)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="grEnviadas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="rgb(252,211,77)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="rgb(245,158,11)" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="grSaldo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="rgb(165,180,252)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid horizontal */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)}
                stroke="rgba(255,255,255,0.045)" />
              <text x={padL - 10} y={yOf(t) + 3.5} fill="rgba(203,213,225,0.45)"
                fontSize="9" fontFamily="JetBrains Mono" textAnchor="end">
                {t >= 1000 ? `${(t/1000).toFixed(1)}k` : t.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Barras */}
          {data.map((d, i) => {
            const x = padL + step * i + (step - barW) / 2
            const yAtual    = yOf(d.atual)
            const hAtual    = padT + innerH - yAtual
            const yAceitas  = yOf(d.atual + d.aceitas)
            const hAceitas  = yAtual - yAceitas
            const yEnviadas = yOf(d.atual + d.aceitas + d.enviadas)
            const hEnviadas = yAceitas - yEnviadas
            return (
              <g key={i}>
                {hAtual    > 0.5 && <rect x={x} y={yAtual}    width={barW} height={hAtual}    fill="url(#grAtual)"    rx="3" />}
                {hAceitas  > 0.5 && <rect x={x} y={yAceitas}  width={barW} height={hAceitas}  fill="url(#grAceitas)"  rx="3" />}
                {hEnviadas > 0.5 && <rect x={x} y={yEnviadas} width={barW} height={hEnviadas} fill="url(#grEnviadas)" rx="3" />}
              </g>
            )
          })}

          {/* Linha custo fixo */}
          {custoFixo > 0 && (
            <>
              <line
                x1={padL} y1={yOf(custoFixo)}
                x2={W - padR} y2={yOf(custoFixo)}
                stroke="rgba(251,113,133,0.85)" strokeWidth="1.5" strokeDasharray="5 4"
              />
              <text x={W - padR - 4} y={yOf(custoFixo) - 6}
                fill="rgba(253,164,175,0.85)" fontSize="9" fontFamily="JetBrains Mono"
                textAnchor="end">
                custo {custoFixo >= 1000 ? `${(custoFixo/1000).toFixed(1)}k` : custoFixo.toFixed(0)}
              </text>
            </>
          )}

          {/* Saldo acumulado: area + line */}
          <path
            fill="url(#grSaldo)"
            d={`M ${saldoPath[0].x},${saldoYBase}
                ${saldoPath.map(p => `L ${p.x},${saldoYOf(p.valor)}`).join(' ')}
                L ${saldoPath[saldoPath.length - 1].x},${saldoYBase} Z`}
          />
          <polyline
            fill="none"
            stroke="rgb(165,180,252)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={saldoPath.map(p => `${p.x},${saldoYOf(p.valor)}`).join(' ')}
          />
          {saldoPath.map((p, i) => (
            <circle key={i} cx={p.x} cy={saldoYOf(p.valor)} r="2.5"
              fill="#0a0c11" stroke="rgb(165,180,252)" strokeWidth="1.5" />
          ))}

          {/* Eixo X */}
          {labels.map((l, i) => (
            <text key={i} x={padL + step * i + step / 2} y={H - 12}
              fill={i === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(203,213,225,0.55)'}
              fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle"
              letterSpacing="1.5">
              {l.toUpperCase()}
            </text>
          ))}
        </svg>
      </div>

      {/* Cenários */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden mt-8">
        <ScenarioCell kicker="Cenário base" value={saldo12mAtual} hint="só com receita atual" />
        <ScenarioCell kicker="Com aceitas" value={saldo12mAceitas} hint="propostas já fechadas" highlight />
        <ScenarioCell kicker="Otimista" value={saldo12mOtimista} hint="se todas as enviadas fecharem" />
      </div>
    </section>
  )
}

function ScenarioCell({ kicker, value, hint, highlight }: {
  kicker: string
  value: number
  hint: string
  highlight?: boolean
}) {
  const positivo = value >= 0
  return (
    <div className={`bg-[#0a0c11] p-6 ${highlight ? 'ring-1 ring-inset ring-indigo-400/20' : ''}`}>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">{kicker}</p>
        {highlight && <span className="text-[9px] font-mono uppercase tracking-widest text-indigo-300">primário</span>}
      </div>
      <p className={`mt-3 font-display text-2xl tracking-tight ${positivo ? 'text-white' : 'text-rose-200'}`}
         style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
        <span className="text-slate-300/60 text-sm font-mono mr-1">R$</span>
        <span className="font-numeric">{numToMask(value)}</span>
        <span className="text-slate-300/50 text-xs font-mono ml-2">/12m</span>
      </p>
      <p className="text-slate-300 text-xs mt-1.5">{hint}</p>
    </div>
  )
}

// ── Calculadora ───────────────────────────────────────────────────────────────

function Calculadora({ custoFixoMensal, receitaRecorrente, qtdClientesAtivos }: {
  custoFixoMensal: number
  receitaRecorrente: number
  qtdClientesAtivos: number
}) {
  const [margem, setMargem]       = useState('30')
  const [novosClientes, setNovos] = useState('5')
  const [setupMult, setSetupMult] = useState('1.5')

  const margemNum = parseFloat(margem) || 0
  const novosNum  = Math.max(1, parseInt(novosClientes) || 1)
  const setupNum  = parseFloat(setupMult) || 0

  const custoComMargem   = custoFixoMensal * (1 + margemNum / 100)
  const faltaCobrir      = Math.max(0, custoComMargem - receitaRecorrente)
  const mensalidadeIdeal = faltaCobrir / novosNum
  const minimo           = Math.max(0, (custoFixoMensal - receitaRecorrente) / novosNum)
  const setupIdeal       = mensalidadeIdeal * setupNum

  return (
    <section className="bg-[#0a0c11] border border-white/[0.06] rounded-3xl overflow-hidden mb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-white/[0.06]">

        {/* Pergunta + inputs */}
        <div className="lg:col-span-5 bg-[#0a0c11] p-8 sm:p-10">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
            Calculadora · valor ideal
          </p>
          <h3 className="font-display text-3xl text-white tracking-tight mt-1.5 leading-tight"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
            Quanto cobrar
            <span className="italic text-slate-300/80 block" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>
              do próximo cliente?
            </span>
          </h3>
          <p className="text-slate-300 text-sm mt-4 leading-relaxed max-w-md">
            Com <span className="text-emerald-300 font-numeric">{qtdClientesAtivos}</span> {qtdClientesAtivos === 1 ? 'cliente pagante' : 'clientes pagando'} hoje, ajuste os parâmetros abaixo e veja o ticket que cobre o custo + margem.
          </p>

          <div className="space-y-5 mt-8">
            <div>
              <label className={labelCls}>Margem desejada · %</label>
              <input type="number" min={0} max={500} className={inputCls}
                value={margem} onChange={e => setMargem(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Novos clientes a fechar</label>
              <input type="number" min={1} className={inputCls}
                value={novosClientes} onChange={e => setNovos(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Setup = × mensalidade</label>
              <input type="number" min={0} step={0.1} className={inputCls}
                value={setupMult} onChange={e => setSetupMult(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Resultados */}
        <div className="lg:col-span-7 bg-[#0a0c11] grid grid-rows-3 gap-px bg-white/[0.06]">
          <ResultRow
            kicker="Mensalidade ideal"
            value={mensalidadeIdeal}
            note={`por cliente / mês · margem ${margemNum}%`}
            tone="primary"
          />
          <ResultRow
            kicker="Setup sugerido"
            value={setupIdeal}
            note={`${setupNum}× mensalidade · cobrança única`}
            tone="emerald"
          />
          <ResultRow
            kicker="Mínimo p/ não dar prejuízo"
            value={minimo}
            note="margem 0% · só para cobrir custo"
            tone="amber"
          />
        </div>
      </div>
    </section>
  )
}

function ResultRow({ kicker, value, note, tone }: {
  kicker: string
  value: number
  note: string
  tone: 'primary' | 'emerald' | 'amber'
}) {
  const dot =
    tone === 'primary' ? 'bg-indigo-300' :
    tone === 'emerald' ? 'bg-emerald-300' :
                         'bg-amber-300'
  return (
    <div className="bg-[#0a0c11] p-7 sm:p-9 flex items-center gap-6">
      <div className="flex-shrink-0 flex items-center gap-3">
        <span className={`w-1 h-12 rounded-full ${dot}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">{kicker}</p>
        <p className="text-slate-300 text-xs mt-0.5">{note}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-display tracking-tight text-white"
           style={{ fontSize: 'clamp(28px, 3vw, 44px)', fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
          <span className="text-slate-300/60 text-sm font-mono mr-1.5">R$</span>
          <span className="font-numeric">{numToMask(value)}</span>
        </p>
      </div>
    </div>
  )
}

// ── Card de proposta ──────────────────────────────────────────────────────────

function ProposalCard({ p, onEdit, onDelete, onStatus }: {
  p: Proposal
  onEdit: () => void
  onDelete: () => void
  onStatus: (s: Proposal['status']) => void
}) {
  const meta  = STATUS_META[p.status]
  const Icon  = STATUS_ICON[p.status]
  const meses = RECORRENCIA_MESES[p.recorrencia]
  const mensalidadeNum = parseBRL(p.mensalidade_valor) ?? 0
  const setupNum       = parseBRL(p.setup_valor) ?? 0
  const totalPeriodo   = setupNum + mensalidadeNum * meses

  return (
    <article className="group relative bg-[#0a0c11] border border-white/[0.06] hover:border-white/[0.14]
                        rounded-2xl p-6 transition-colors">
      {/* Status */}
      <div className="flex items-center justify-between mb-5">
        <span className={`inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider ${meta.tone}`}>
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-300/50">
          {p.data_envio ? formatDate(p.data_envio) : '—'}
        </span>
      </div>

      {/* Cliente + título */}
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300/60 truncate">
        {p.cliente_nome}
        {!p.client_id && <span className="ml-2 text-amber-300/70 normal-case tracking-normal">· lead</span>}
      </p>
      <h3 className="font-display text-2xl text-white tracking-tight mt-2 leading-tight line-clamp-2"
          style={{ fontVariationSettings: '"opsz" 48, "SOFT" 40' }}>
        {p.titulo}
      </h3>

      {p.cliente_telefone && (
        <p className="text-slate-300/70 text-[11px] font-numeric mt-1.5">{p.cliente_telefone}</p>
      )}

      {/* Valores */}
      <div className="mt-6 pt-5 border-t border-white/[0.05] grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300/60">Setup</p>
          <p className="text-emerald-200 font-display text-xl mt-1.5"
             style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
            <span className="text-slate-300/60 text-xs font-mono mr-0.5">R$</span>
            <span className="font-numeric">{p.setup_valor || '0,00'}</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300/60">
            {RECORRENCIA_LABEL[p.recorrencia]}
          </p>
          <p className="text-emerald-200 font-display text-xl mt-1.5"
             style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
            <span className="text-slate-300/60 text-xs font-mono mr-0.5">R$</span>
            <span className="font-numeric">{p.mensalidade_valor || '0,00'}</span>
          </p>
        </div>
      </div>

      {/* Total no período */}
      <div className="mt-5 flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300/60">
          total · {meses}m
        </span>
        <span className="font-numeric text-white text-base font-medium">
          R$ {numToMask(totalPeriodo)}
        </span>
      </div>

      {p.descricao && (
        <p className="text-slate-300/80 text-xs leading-relaxed line-clamp-2 mt-4 font-display italic"
           style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
          {p.descricao}
        </p>
      )}

      {/* Ações */}
      <div className="mt-6 pt-4 border-t border-white/[0.05] flex items-center gap-2">
        <select value={p.status} onChange={e => onStatus(e.target.value as Proposal['status'])}
          className="flex-1 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-200
                     text-[11px] font-mono uppercase tracking-wider focus:outline-none focus:border-white/20 cursor-pointer">
          {(Object.keys(STATUS_META) as Proposal['status'][]).map(s => (
            <option key={s} value={s} className="bg-slate-900 normal-case">{STATUS_META[s].label}</option>
          ))}
        </select>
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

// ── Página ────────────────────────────────────────────────────────────────────

export default function Propostas() {
  const [items, setItems]             = useState<Proposal[]>([])
  const [clients, setClients]         = useState<Client[]>([])
  const [custoFixo, setCusto]         = useState(0)
  const [receita, setReceita]         = useState(0)
  const [qtdMensAtivas, setQtdMens]   = useState(0)
  const [despesasMes, setDespesasMes] = useState(0)
  const [entradasMes, setEntradasMes] = useState(0)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [modal, setModal]             = useState(false)
  const [editId, setEditId]           = useState<string | null>(null)
  const [initial, setInitial]         = useState<Omit<Proposal, 'id'>>(EMPTY)
  const [filter, setFilter]           = useState<'todas' | Proposal['status']>('todas')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const hoje = new Date()
    const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
    const fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10)

    const [
      { data: props, error: e },
      { data: cls },
      { data: expFixas },
      { data: expAvulsas },
      { data: mens },
      { data: entradas },
    ] = await Promise.all([
      supabase.from('proposals').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,nome,telefone,email,cpf_cnpj,tipo,cidade,estado,observacoes').order('nome'),
      supabase.from('expenses').select('valor').eq('tipo', 'fixa'),
      supabase.from('expenses').select('valor,data,pago').eq('tipo', 'avulsa').gte('data', ini).lte('data', fim),
      supabase.from('mensalidades').select('valor,status').eq('status', 'ativo'),
      supabase.from('project_entries').select('valor,data,status').eq('status', 'recebido').gte('data', ini).lte('data', fim),
    ])
    if (e) setError('Erro ao carregar propostas.')
    else if (props) setItems(props.map(fromDB))
    if (cls)        setClients(cls as Client[])
    if (expFixas)   setCusto(expFixas.reduce((s, r: { valor: number }) => s + (Number(r.valor) || 0), 0))
    if (expAvulsas) setDespesasMes(expAvulsas.reduce((s, r: { valor: number }) => s + (Number(r.valor) || 0), 0))
    if (mens) {
      setReceita(mens.reduce((s, r: { valor: number }) => s + (Number(r.valor) || 0), 0))
      setQtdMens(mens.length)
    }
    if (entradas) setEntradasMes(entradas.reduce((s, r: { valor: number }) => s + (Number(r.valor) || 0), 0))
    setLoading(false)
  }

  async function handleSave(data: Omit<Proposal, 'id'>) {
    setError('')
    const payload = {
      client_id:         data.client_id || null,
      cliente_nome:      data.cliente_nome,
      cliente_telefone:  data.cliente_telefone || null,
      titulo:            data.titulo,
      descricao:         data.descricao || null,
      setup_valor:       parseBRL(data.setup_valor) ?? 0,
      mensalidade_valor: parseBRL(data.mensalidade_valor) ?? 0,
      recorrencia:       data.recorrencia,
      status:            data.status,
      data_envio:        data.data_envio || null,
      observacoes:       data.observacoes || null,
    }
    if (editId) {
      const { error } = await supabase.from('proposals').update(payload).eq('id', editId)
      if (error) { setError('Erro ao salvar.'); return }
      setItems(is => is.map(i => i.id === editId ? { ...data, id: editId } : i))
    } else {
      const { data: row, error } = await supabase.from('proposals').insert(payload).select().single()
      if (error || !row) { setError('Erro ao criar.'); return }
      setItems(is => [fromDB(row), ...is])
    }
    setModal(false)
  }

  async function del(id: string) {
    const { error } = await supabase.from('proposals').delete().eq('id', id)
    if (error) { setError('Erro ao excluir.'); return }
    setItems(is => is.filter(i => i.id !== id))
  }

  async function changeStatus(id: string, status: Proposal['status']) {
    const { error } = await supabase.from('proposals').update({ status }).eq('id', id)
    if (!error) setItems(is => is.map(i => i.id === id ? { ...i, status } : i))
  }

  const filtered = useMemo(
    () => filter === 'todas' ? items : items.filter(i => i.status === filter),
    [items, filter],
  )

  const counts = useMemo(() => ({
    todas:    items.length,
    rascunho: items.filter(i => i.status === 'rascunho').length,
    enviada:  items.filter(i => i.status === 'enviada').length,
    aceita:   items.filter(i => i.status === 'aceita').length,
    recusada: items.filter(i => i.status === 'recusada').length,
  }), [items])

  const projecao = useMemo(() => {
    const sumBy = (status: Proposal['status']) => items
      .filter(i => i.status === status)
      .reduce((acc, p) => ({
        mens: acc.mens + (parseBRL(p.mensalidade_valor) ?? 0),
        setup: acc.setup + (parseBRL(p.setup_valor) ?? 0),
      }), { mens: 0, setup: 0 })
    const aceitas  = sumBy('aceita')
    const enviadas = sumBy('enviada')
    return {
      mensalidadeAceitas:  aceitas.mens,
      setupAceitas:        aceitas.setup,
      mensalidadeEnviadas: enviadas.mens,
      setupEnviadas:       enviadas.setup,
    }
  }, [items])

  const hoje    = new Date()
  const mesNome = MES_NOME[hoje.getMonth()]
  const ano     = hoje.getFullYear()

  return (
    <div className="max-w-[1400px] mx-auto pb-16">

      {/* Editorial header */}
      <header className="flex items-end justify-between gap-6 mb-12 pt-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-slate-300/70">
            Edição · {mesNome} {ano}
          </p>
          <h1 className="font-display text-white mt-2 leading-[0.95] tracking-tight"
              style={{
                fontSize: 'clamp(48px, 7vw, 88px)',
                fontVariationSettings: '"opsz" 144, "SOFT" 30',
                fontWeight: 400,
              }}>
            Propostas<span className="text-indigo-300/90 italic ml-1" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>.</span>
          </h1>
          <p className="text-slate-300 text-sm mt-3 max-w-md font-display italic"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
            {loading
              ? 'lendo o pulso financeiro do mês…'
              : `${items.length} ${items.length === 1 ? 'proposta em circulação' : 'propostas em circulação'} — uma visão da pipeline e da saúde do negócio.`}
          </p>
        </div>
        <button
          onClick={() => { setInitial(EMPTY); setEditId(null); setModal(true) }}
          className="hidden sm:flex items-center gap-2 px-5 py-3 rounded-full text-slate-900 text-sm font-semibold
                     bg-white hover:bg-slate-100 transition-colors shrink-0">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Nova proposta
        </button>
      </header>

      {/* Mobile CTA */}
      <button
        onClick={() => { setInitial(EMPTY); setEditId(null); setModal(true) }}
        className="sm:hidden mb-8 w-full flex items-center justify-center gap-2 py-3 rounded-full text-slate-900 text-sm font-semibold bg-white">
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        Nova proposta
      </button>

      {error && (
        <div className="mb-6 flex items-center gap-3 px-5 py-3 rounded-2xl bg-rose-500/[0.06] border border-rose-500/15 text-rose-200 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Saúde do mês */}
      <SaudeMes
        receitaRecorrente={receita}
        entradasMes={entradasMes}
        custoFixo={custoFixo}
        despesasMes={despesasMes}
        qtdMensalidadesAtivas={qtdMensAtivas}
      />

      {/* Projeção 12 meses */}
      <ProjecaoChart
        receitaRecorrente={receita}
        custoFixo={custoFixo}
        mensalidadeAceitas={projecao.mensalidadeAceitas}
        mensalidadeEnviadas={projecao.mensalidadeEnviadas}
        setupAceitas={projecao.setupAceitas}
        setupEnviadas={projecao.setupEnviadas}
      />

      {/* Calculadora */}
      <Calculadora
        custoFixoMensal={custoFixo}
        receitaRecorrente={receita}
        qtdClientesAtivos={qtdMensAtivas}
      />

      {/* Pipeline / Filtros */}
      <div className="flex items-baseline justify-between gap-6 flex-wrap mb-8">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
            Pipeline
          </p>
          <h2 className="font-display text-3xl text-white mt-1.5 tracking-tight"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
            Em <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>circulação</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {([
            ['todas',    'Todas'],
            ['enviada',  'Enviadas'],
            ['aceita',   'Aceitas'],
            ['recusada', 'Recusadas'],
            ['rascunho', 'Rascunhos'],
          ] as const).map(([key, label]) => {
            const active = filter === key
            return (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-full text-[11px] font-medium tracking-wide transition-all
                  ${active
                    ? 'bg-white text-slate-900'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'}`}>
                {label}
                <span className={`ml-1.5 font-mono ${active ? 'text-slate-500' : 'text-slate-300/50'}`}>
                  {counts[key]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 text-slate-300/70 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-white/[0.06] rounded-3xl">
          <p className="font-display text-3xl text-white tracking-tight"
             style={{ fontVariationSettings: '"opsz" 96, "SOFT" 60' }}>
            Nada por aqui ainda.
          </p>
          <p className="text-slate-300 text-sm mt-3 max-w-sm font-display italic"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
            {items.length === 0
              ? 'crie sua primeira proposta para ver o impacto na projeção.'
              : 'nenhuma proposta neste filtro — tente outro recorte.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(p => (
            <ProposalCard key={p.id} p={p}
              onEdit={() => { const { id, ...r } = p; setInitial(r); setEditId(id); setModal(true) }}
              onDelete={() => del(p.id)}
              onStatus={s => changeStatus(p.id, s)} />
          ))}
        </div>
      )}

      {modal && (
        <ProposalModal initial={initial} editing={!!editId} clients={clients}
          onSave={handleSave} onClose={() => setModal(false)} />
      )}
    </div>
  )
}
