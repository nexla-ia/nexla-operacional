import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, X, FileText, Loader2, Calculator,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, XCircle,
  Activity, LineChart,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { maskBRL, parseBRL, numToMask, formatDate, maskPhone } from '../lib/utils'
import type { Proposal, Client } from '../lib/types'
import { SearchableSelect } from './SearchableSelect'

const EMPTY: Omit<Proposal, 'id'> = {
  client_id: undefined,
  cliente_nome: '',
  cliente_telefone: '',
  titulo: '',
  descricao: '',
  setup_valor: '',
  mensalidade_valor: '',
  recorrencia: 'mensal',
  status: 'enviada',
  data_envio: '',
  observacoes: '',
}

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-300 mb-1.5'

const STATUS_META: Record<Proposal['status'], { label: string; cls: string; icon: typeof Clock }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/25',     icon: FileText },
  enviada:  { label: 'Enviada',  cls: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/25',  icon: Clock },
  aceita:   { label: 'Aceita',   cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25', icon: CheckCircle2 },
  recusada: { label: 'Recusada', cls: 'bg-red-500/15 text-red-300 ring-red-500/25',           icon: XCircle },
}

const RECORRENCIA_LABEL: Record<Proposal['recorrencia'], string> = {
  mensal:    'Mensal',
  semestral: 'Semestral (6 meses)',
  anual:     'Anual',
}

// Multiplicador para "valor cheio" no período (ex: anual = 12x mensalidade)
const RECORRENCIA_MESES: Record<Proposal['recorrencia'], number> = {
  mensal:    1,
  semestral: 6,
  anual:    12,
}

function fromDB(r: Record<string, unknown>): Proposal {
  return {
    id:                 r.id as string,
    client_id:          (r.client_id as string) || undefined,
    cliente_nome:       (r.cliente_nome as string) ?? '',
    cliente_telefone:   (r.cliente_telefone as string) ?? '',
    titulo:             (r.titulo as string) ?? '',
    descricao:          (r.descricao as string) ?? '',
    setup_valor:        numToMask(r.setup_valor as number | null),
    mensalidade_valor:  numToMask(r.mensalidade_valor as number | null),
    recorrencia:        (r.recorrencia as Proposal['recorrencia']) ?? 'mensal',
    status:             (r.status as Proposal['status']) ?? 'enviada',
    data_envio:         (r.data_envio as string) ?? '',
    observacoes:        (r.observacoes as string) ?? '',
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
    // Limpa vínculo ao trocar para "lead"
    if (next === 'lead') {
      setForm(f => ({ ...f, client_id: undefined }))
    } else {
      setForm(f => ({ ...f, client_id: undefined, cliente_nome: '', cliente_telefone: '' }))
    }
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
              <FileText className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-white font-semibold text-base">
              {editing ? 'Editar Proposta' : 'Nova Proposta'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-7 py-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Toggle Cliente cadastrado / Lead novo */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.07]">
            {(['cliente', 'lead'] as const).map(m => (
              <button key={m} type="button" onClick={() => switchMode(m)}
                className={`py-2 rounded-lg text-xs font-semibold transition-all
                  ${mode === m
                    ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30'
                    : 'text-slate-300 hover:text-white'}`}>
                {m === 'cliente' ? 'Cliente cadastrado' : 'Lead / sem cadastro'}
              </button>
            ))}
          </div>

          {mode === 'cliente' ? (
            <div>
              <label className={labelCls}>Cliente *</label>
              {clients.length === 0 ? (
                <div className="w-full px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                  Nenhum cliente cadastrado. Use o modo "Lead / sem cadastro".
                </div>
              ) : (
                <SearchableSelect
                  required
                  value={form.client_id ?? ''}
                  onChange={handleClient}
                  placeholder="Selecione um cliente…"
                  options={clients.map(c => ({ value: c.id, label: c.nome, sublabel: c.cpf_cnpj || c.telefone || undefined }))}
                />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nome do Lead *</label>
                <input className={inputCls} placeholder="Ex: João Silva" required
                  value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Telefone / WhatsApp</label>
                <input className={inputCls} placeholder="(00) 00000-0000" inputMode="tel"
                  value={form.cliente_telefone}
                  onChange={e => set('cliente_telefone', maskPhone(e.target.value))} />
              </div>
            </div>
          )}

          {/* Título */}
          <div>
            <label className={labelCls}>Título da Proposta *</label>
            <input className={inputCls} placeholder="Ex: Atendimento + Site institucional"
              value={form.titulo} onChange={e => set('titulo', e.target.value)} required />
          </div>

          {/* Setup | Mensalidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Valor de Setup (R$)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm">R$</span>
                <input className={inputCls + ' pl-9'} placeholder="0,00" inputMode="numeric"
                  value={form.setup_valor} onChange={e => set('setup_valor', maskBRL(e.target.value))} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Mensalidade (R$)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 text-sm">R$</span>
                <input className={inputCls + ' pl-9'} placeholder="0,00" inputMode="numeric"
                  value={form.mensalidade_valor} onChange={e => set('mensalidade_valor', maskBRL(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Recorrência | Data envio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Recorrência</label>
              <div className="grid grid-cols-3 gap-2">
                {(['mensal','semestral','anual'] as const).map(r => (
                  <button key={r} type="button" onClick={() => set('recorrencia', r)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all
                      ${form.recorrencia === r
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                    {r === 'mensal' ? 'Mensal' : r === 'semestral' ? '6 meses' : 'Anual'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Data de Envio</label>
              <input type="date" className={inputCls + ' cursor-pointer'} style={{ colorScheme: 'dark' }}
                value={form.data_envio} onChange={e => set('data_envio', e.target.value)} />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(STATUS_META) as Proposal['status'][]).map(s => {
                const meta = STATUS_META[s]
                const active = form.status === s
                return (
                  <button key={s} type="button" onClick={() => set('status', s)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all
                      ${active ? meta.cls + ' ring-1' : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className={labelCls}>Descrição</label>
            <textarea rows={2} className={inputCls + ' resize-none'} placeholder="O que está incluso na proposta…"
              value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </div>

          {/* Observações */}
          <div>
            <label className={labelCls}>Observações internas</label>
            <textarea rows={2} className={inputCls + ' resize-none'} placeholder="Notas internas, prazos, condições…"
              value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit"
              disabled={saving || (mode === 'cliente' ? !form.client_id : !form.cliente_nome.trim())}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer
                         shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed
                         hover:-translate-y-0.5 transition-all duration-300">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando…</span>
                : editing ? 'Salvar' : 'Criar Proposta'}
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-slate-300 text-sm bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Saúde Financeira do Mês Atual ─────────────────────────────────────────────

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

  return (
    <div className="rounded-3xl bg-slate-900/70 border border-white/[0.07] p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center
          ${saldo >= 0 ? 'bg-emerald-500/15 ring-emerald-500/25' : 'bg-red-500/15 ring-red-500/25'}`}>
          <Activity className={`w-4 h-4 ${saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Saúde do mês atual</h3>
          <p className="text-slate-300 text-xs mt-0.5">Receita real + entradas recebidas vs despesas</p>
        </div>
        <div className={`ml-auto text-right ${saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          <p className="text-[10px] uppercase tracking-wider opacity-80">Saldo</p>
          <p className="font-bold text-lg leading-none">
            {saldo >= 0 ? '+' : '−'} R$ {numToMask(Math.abs(saldo))}
          </p>
          <p className="text-[10px] opacity-80 mt-0.5">{margemPct >= 0 ? '+' : ''}{margemPct.toFixed(0)}% sobre despesa</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/15 px-4 py-3">
          <p className="text-emerald-300/90 text-[10px] uppercase tracking-wider">Mensalidades ativas</p>
          <p className="text-emerald-400 font-semibold text-base mt-1">R$ {numToMask(receitaRecorrente)}</p>
          <p className="text-slate-300 text-[11px] mt-0.5">{qtdMensalidadesAtivas} cliente{qtdMensalidadesAtivas === 1 ? '' : 's'} · ticket R$ {numToMask(ticketMedio)}</p>
        </div>
        <div className="rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/15 px-4 py-3">
          <p className="text-emerald-300/90 text-[10px] uppercase tracking-wider">Entradas (mês)</p>
          <p className="text-emerald-400 font-semibold text-base mt-1">R$ {numToMask(entradasMes)}</p>
          <p className="text-slate-300 text-[11px] mt-0.5">setups e projetos recebidos</p>
        </div>
        <div className="rounded-2xl bg-red-500/[0.06] border border-red-500/15 px-4 py-3">
          <p className="text-red-300/90 text-[10px] uppercase tracking-wider">Despesas fixas</p>
          <p className="text-red-400 font-semibold text-base mt-1">R$ {numToMask(custoFixo)}</p>
          <p className="text-slate-300 text-[11px] mt-0.5">recorrentes / mês</p>
        </div>
        <div className="rounded-2xl bg-red-500/[0.06] border border-red-500/15 px-4 py-3">
          <p className="text-red-300/90 text-[10px] uppercase tracking-wider">Despesas avulsas</p>
          <p className="text-red-400 font-semibold text-base mt-1">R$ {numToMask(despesasMes)}</p>
          <p className="text-slate-300 text-[11px] mt-0.5">no mês corrente</p>
        </div>
      </div>
    </div>
  )
}

// ── Gráfico de Projeção 12 meses ──────────────────────────────────────────────

function ProjecaoChart({ receitaRecorrente, custoFixo, mensalidadeAceitas, mensalidadeEnviadas, setupAceitas, setupEnviadas }: {
  receitaRecorrente: number
  custoFixo: number
  mensalidadeAceitas: number
  mensalidadeEnviadas: number
  setupAceitas: number
  setupEnviadas: number
}) {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const hoje  = new Date()
  const labels: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    labels.push(meses[d.getMonth()] + (d.getMonth() === 0 || i === 0 ? `/${String(d.getFullYear()).slice(2)}` : ''))
  }

  // Por mês: receita atual + (no mês 0, soma o setup das aceitas/enviadas como receita única)
  const data = labels.map((_, i) => {
    const setupExtra = i === 0 ? setupAceitas : 0
    const setupOpt   = i === 0 ? setupEnviadas : 0
    return {
      atual:    receitaRecorrente,
      aceitas:  mensalidadeAceitas + setupExtra,
      enviadas: mensalidadeEnviadas + setupOpt,
      custo:    custoFixo,
    }
  })

  const totaisOtimista = data.map(d => d.atual + d.aceitas + d.enviadas)
  const maxValor = Math.max(custoFixo, ...totaisOtimista, 1) * 1.15

  // Dimensões SVG
  const W = 720, H = 240, padL = 50, padR = 12, padT = 16, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const barW   = innerW / 12 * 0.7
  const step   = innerW / 12

  const yOf = (v: number) => padT + innerH - (v / maxValor) * innerH

  // Saldo cumulativo no cenário "com aceitas"
  let acum = 0
  const saldoPath = data.map((d, i) => {
    acum += (d.atual + d.aceitas) - d.custo
    return { x: padL + step * i + step / 2, valor: acum }
  })
  const saldoMaxAbs = Math.max(...saldoPath.map(p => Math.abs(p.valor)), 1)
  const saldoYBase  = padT + innerH / 2
  const saldoYOf    = (v: number) => saldoYBase - (v / saldoMaxAbs) * (innerH / 2 - 8)

  // Y ticks
  const ticks = [0, maxValor * 0.25, maxValor * 0.5, maxValor * 0.75, maxValor]

  return (
    <div className="rounded-3xl bg-slate-900/70 border border-white/[0.07] p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 ring-1 ring-violet-500/25 flex items-center justify-center">
          <LineChart className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Projeção 12 meses</h3>
          <p className="text-slate-300 text-xs mt-0.5">Receita projetada considerando propostas aceitas e enviadas</p>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 mb-3 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/80"></span>Receita atual</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400/50"></span>+ Propostas aceitas</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400/50"></span>+ Enviadas (otimista)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400"></span>Custo fixo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-400"></span>Saldo acumulado</span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* Grid */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <text x={padL - 6} y={yOf(t) + 3} fill="rgba(203,213,225,0.6)" fontSize="9" textAnchor="end">
                {t >= 1000 ? `${(t/1000).toFixed(1)}k` : t.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Barras stacked */}
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
                {hAtual    > 0 && <rect x={x} y={yAtual}    width={barW} height={hAtual}    fill="rgba(16,185,129,0.8)"  rx="2" />}
                {hAceitas  > 0 && <rect x={x} y={yAceitas}  width={barW} height={hAceitas}  fill="rgba(52,211,153,0.5)"  rx="2" />}
                {hEnviadas > 0 && <rect x={x} y={yEnviadas} width={barW} height={hEnviadas} fill="rgba(251,191,36,0.5)"  rx="2" />}
              </g>
            )
          })}

          {/* Linha custo fixo */}
          {custoFixo > 0 && (
            <line
              x1={padL} y1={yOf(custoFixo)}
              x2={W - padR} y2={yOf(custoFixo)}
              stroke="rgba(248,113,113,0.9)" strokeWidth="1.5" strokeDasharray="4 3"
            />
          )}

          {/* Linha saldo acumulado (cenário com aceitas) */}
          <polyline
            fill="none"
            stroke="rgba(129,140,248,0.95)"
            strokeWidth="1.8"
            points={saldoPath.map(p => `${p.x},${saldoYOf(p.valor)}`).join(' ')}
          />
          {saldoPath.map((p, i) => (
            <circle key={i} cx={p.x} cy={saldoYOf(p.valor)} r="2.5" fill="rgb(129,140,248)" />
          ))}

          {/* Eixo X */}
          {labels.map((l, i) => (
            <text key={i} x={padL + step * i + step / 2} y={H - 10}
              fill="rgba(203,213,225,0.7)" fontSize="9" textAnchor="middle">{l}</text>
          ))}
        </svg>
      </div>

      {/* Resumo do cenário */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 py-3">
          <p className="text-slate-300 text-[10px] uppercase tracking-wider">Saldo 12m · cenário atual</p>
          <p className={`font-semibold text-base mt-1 ${(receitaRecorrente - custoFixo) * 12 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            R$ {numToMask((receitaRecorrente - custoFixo) * 12)}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 py-3">
          <p className="text-slate-300 text-[10px] uppercase tracking-wider">Com propostas aceitas</p>
          <p className={`font-semibold text-base mt-1 ${((receitaRecorrente + mensalidadeAceitas - custoFixo) * 12 + setupAceitas) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            R$ {numToMask((receitaRecorrente + mensalidadeAceitas - custoFixo) * 12 + setupAceitas)}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 py-3">
          <p className="text-slate-300 text-[10px] uppercase tracking-wider">Otimista (todas aceitas)</p>
          <p className={`font-semibold text-base mt-1 ${((receitaRecorrente + mensalidadeAceitas + mensalidadeEnviadas - custoFixo) * 12 + setupAceitas + setupEnviadas) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            R$ {numToMask((receitaRecorrente + mensalidadeAceitas + mensalidadeEnviadas - custoFixo) * 12 + setupAceitas + setupEnviadas)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Calculadora de valor ideal ────────────────────────────────────────────────

function Calculadora({ custoFixoMensal, receitaRecorrente, qtdClientesAtivos }: {
  custoFixoMensal: number
  receitaRecorrente: number
  qtdClientesAtivos: number
}) {
  const [margem, setMargem]       = useState('30')
  const [novosClientes, setNovos] = useState('5')
  const [setupMult, setSetupMult] = useState('1.5')

  const margemNum   = parseFloat(margem) || 0
  const novosNum    = Math.max(1, parseInt(novosClientes) || 1)
  const setupNum    = parseFloat(setupMult) || 0

  const custoComMargem   = custoFixoMensal * (1 + margemNum / 100)
  const faltaCobrir      = Math.max(0, custoComMargem - receitaRecorrente)
  const mensalidadeIdeal = faltaCobrir / novosNum
  const minimo           = Math.max(0, (custoFixoMensal - receitaRecorrente) / novosNum)
  const setupIdeal       = mensalidadeIdeal * setupNum
  const saldo            = receitaRecorrente - custoFixoMensal

  return (
    <div className="rounded-3xl bg-slate-900/70 border border-white/[0.07] p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25 flex items-center justify-center">
          <Calculator className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Calculadora de valor ideal</h3>
          <p className="text-slate-300 text-xs mt-0.5">
            Você já tem <span className="text-emerald-300 font-semibold">{qtdClientesAtivos}</span> cliente{qtdClientesAtivos === 1 ? '' : 's'} pagando.
            Quanto cobrar pelos próximos?
          </p>
        </div>
      </div>

      {/* Snapshot atual */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 py-3">
          <p className="text-slate-300 text-[11px] uppercase tracking-wider">Custo fixo / mês</p>
          <p className="text-red-400 font-semibold text-base mt-1">R$ {numToMask(custoFixoMensal)}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 py-3">
          <p className="text-slate-300 text-[11px] uppercase tracking-wider">Receita recorrente</p>
          <p className="text-emerald-400 font-semibold text-base mt-1">R$ {numToMask(receitaRecorrente)}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 py-3">
          <p className="text-slate-300 text-[11px] uppercase tracking-wider">Saldo mensal</p>
          <p className={`font-semibold text-base mt-1 ${saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {saldo >= 0 ? '+' : '-'} R$ {numToMask(Math.abs(saldo))}
          </p>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div>
          <label className={labelCls}>Margem desejada (%)</label>
          <input type="number" min={0} max={500} className={inputCls}
            value={margem} onChange={e => setMargem(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Novos clientes a fechar</label>
          <input type="number" min={1} className={inputCls}
            value={novosClientes} onChange={e => setNovos(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Setup = ×Mensalidade</label>
          <input type="number" min={0} step={0.1} className={inputCls}
            value={setupMult} onChange={e => setSetupMult(e.target.value)} />
        </div>
      </div>

      {/* Resultados */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/10 border border-indigo-500/20 px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-300" />
            <p className="text-indigo-300 text-[11px] uppercase tracking-wider font-semibold">Mensalidade ideal</p>
          </div>
          <p className="text-white font-bold text-xl mt-1">R$ {numToMask(mensalidadeIdeal)}</p>
          <p className="text-slate-300 text-[11px] mt-1">por cliente / mês ({margemNum}% margem)</p>
        </div>

        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-3.5 h-3.5 text-emerald-300" />
            <p className="text-emerald-300 text-[11px] uppercase tracking-wider font-semibold">Setup sugerido</p>
          </div>
          <p className="text-white font-bold text-xl mt-1">R$ {numToMask(setupIdeal)}</p>
          <p className="text-slate-300 text-[11px] mt-1">{setupNum}× mensalidade</p>
        </div>

        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 px-4 py-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
            <p className="text-amber-300 text-[11px] uppercase tracking-wider font-semibold">Mínimo p/ não dar prejuízo</p>
          </div>
          <p className="text-white font-bold text-xl mt-1">R$ {numToMask(minimo)}</p>
          <p className="text-slate-300 text-[11px] mt-1">por cliente / mês (margem 0%)</p>
        </div>
      </div>

      {custoFixoMensal === 0 && (
        <p className="text-slate-300 text-xs mt-4 italic">
          Cadastre despesas fixas em <span className="text-indigo-300">Financeiro &gt; Despesas</span> para a calculadora ficar mais precisa.
        </p>
      )}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

function ProposalCard({ p, onEdit, onDelete, onStatus }: {
  p: Proposal
  onEdit: () => void
  onDelete: () => void
  onStatus: (s: Proposal['status']) => void
}) {
  const meta  = STATUS_META[p.status]
  const Icon  = meta.icon
  const meses = RECORRENCIA_MESES[p.recorrencia]
  const mensalidadeNum = parseBRL(p.mensalidade_valor) ?? 0
  const setupNum       = parseBRL(p.setup_valor) ?? 0
  const totalPeriodo   = setupNum + mensalidadeNum * meses

  return (
    <div className="group flex flex-col gap-3 p-5 rounded-2xl bg-slate-900/70 border border-white/[0.07] hover:border-white/[0.13] transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{p.titulo}</h3>
          <p className="text-slate-300 text-xs mt-0.5 truncate">
            {p.cliente_nome}
            {!p.client_id && <span className="ml-1.5 text-amber-300/80">· lead</span>}
          </p>
          {p.cliente_telefone && (
            <p className="text-slate-300 text-[11px] mt-0.5 truncate">{p.cliente_telefone}</p>
          )}
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ${meta.cls}`}>
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-slate-300 text-[10px] uppercase tracking-wider">Setup</p>
          <p className="text-emerald-400 font-semibold mt-0.5">R$ {p.setup_valor || '0,00'}</p>
        </div>
        <div>
          <p className="text-slate-300 text-[10px] uppercase tracking-wider">{RECORRENCIA_LABEL[p.recorrencia]}</p>
          <p className="text-emerald-400 font-semibold mt-0.5">R$ {p.mensalidade_valor || '0,00'}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2 flex items-center justify-between">
        <span className="text-slate-300 text-[11px]">Total no período ({meses}m)</span>
        <span className="text-white font-semibold text-sm">R$ {numToMask(totalPeriodo)}</span>
      </div>

      {p.descricao && <p className="text-slate-300 text-xs leading-relaxed line-clamp-2">{p.descricao}</p>}

      {p.data_envio && (
        <p className="text-slate-300 text-[11px]">Enviada em {formatDate(p.data_envio)}</p>
      )}

      <div className="flex items-center gap-1 pt-1 border-t border-white/[0.05]">
        <select value={p.status} onChange={e => onStatus(e.target.value as Proposal['status'])}
          className="flex-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
          {(Object.keys(STATUS_META) as Proposal['status'][]).map(s => (
            <option key={s} value={s} className="bg-slate-800">{STATUS_META[s].label}</option>
          ))}
        </select>
        <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-300 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
    if (cls)      setClients(cls as Client[])
    if (expFixas) setCusto(expFixas.reduce((s, r: { valor: number }) => s + (Number(r.valor) || 0), 0))
    if (expAvulsas) setDespesasMes(expAvulsas.reduce((s, r: { valor: number }) => s + (Number(r.valor) || 0), 0))
    if (mens) {
      setReceita(mens.reduce((s, r: { valor: number }) => s + (Number(r.valor) || 0), 0))
      setQtdMens(mens.length)
    }
    if (entradas) setEntradasMes(entradas.reduce((s, r: { valor: number }) => s + (Number(r.valor) || 0), 0))
    setLoading(false)
  }

  // Agregados de propostas para projeção
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

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">Propostas</h1>
          <p className="text-slate-300 text-sm mt-0.5">
            {loading ? 'Carregando…' : `${items.length} ${items.length === 1 ? 'proposta' : 'propostas'}`}
          </p>
        </div>
        <button onClick={() => { setInitial(EMPTY); setEditId(null); setModal(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all duration-300">
          <Plus className="w-4 h-4" />Nova Proposta
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <SaudeMes
        receitaRecorrente={receita}
        entradasMes={entradasMes}
        custoFixo={custoFixo}
        despesasMes={despesasMes}
        qtdMensalidadesAtivas={qtdMensAtivas}
      />

      <ProjecaoChart
        receitaRecorrente={receita}
        custoFixo={custoFixo}
        mensalidadeAceitas={projecao.mensalidadeAceitas}
        mensalidadeEnviadas={projecao.mensalidadeEnviadas}
        setupAceitas={projecao.setupAceitas}
        setupEnviadas={projecao.setupEnviadas}
      />

      <Calculadora
        custoFixoMensal={custoFixo}
        receitaRecorrente={receita}
        qtdClientesAtivos={qtdMensAtivas}
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5">
        {([
          ['todas',    'Todas'],
          ['enviada',  'Enviadas'],
          ['aceita',   'Aceitas'],
          ['recusada', 'Recusadas'],
          ['rascunho', 'Rascunhos'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all
              ${filter === key
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/20'}`}>
            {label} <span className="opacity-70">· {counts[key]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <FileText className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-slate-300 text-sm">
            {items.length === 0 ? 'Nenhuma proposta cadastrada' : 'Nenhuma proposta neste filtro'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
    </>
  )
}
