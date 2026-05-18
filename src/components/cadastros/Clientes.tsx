import { useState, useEffect, useRef } from 'react'
import {
  Plus, Pencil, X, Users, Loader2, Phone, Mail, FileText,
  ChevronDown, Search, UserX, RotateCcw, TrendingDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { maskPhone, maskCPF, maskCNPJ } from '../../lib/utils'
import type { Client } from '../../lib/types'

// ── Churn types & constants ────────────────────────────────────────────────────

type ChurnMotivo =
  | 'preco' | 'concorrencia' | 'projeto_encerrado'
  | 'insatisfeito' | 'internalizou' | 'inadimplencia' | 'outro'

interface ChurnEvent {
  id: string
  client_id: string
  motivo: ChurnMotivo
  comentario?: string
  mrr_perdido: number
  data_churn: string
}

const MOTIVOS: {
  key: ChurnMotivo; label: string; sub: string
  hex: string; text: string; base: string; active: string
}[] = [
  { key: 'preco',             label: 'Preço',         sub: 'Achou mais barato',    hex: '#fbbf24', text: 'text-amber-400',  base: 'bg-amber-500/10 border-amber-500/20',   active: 'bg-amber-500/20 border-amber-400/60'   },
  { key: 'concorrencia',      label: 'Concorrência',  sub: 'Migrou de empresa',    hex: '#fb923c', text: 'text-orange-400', base: 'bg-orange-500/10 border-orange-500/20',  active: 'bg-orange-500/20 border-orange-400/60'  },
  { key: 'projeto_encerrado', label: 'Encerrado',     sub: 'Projeto concluído',    hex: '#34d399', text: 'text-emerald-400',base: 'bg-emerald-500/10 border-emerald-500/20', active: 'bg-emerald-500/20 border-emerald-400/60' },
  { key: 'insatisfeito',      label: 'Insatisfeito',  sub: 'Com o serviço',        hex: '#f87171', text: 'text-red-400',    base: 'bg-red-500/10 border-red-500/20',        active: 'bg-red-500/20 border-red-400/60'        },
  { key: 'internalizou',      label: 'Internalizou',  sub: 'Criou equipe própria', hex: '#38bdf8', text: 'text-sky-400',    base: 'bg-sky-500/10 border-sky-500/20',        active: 'bg-sky-500/20 border-sky-400/60'        },
  { key: 'inadimplencia',     label: 'Inadimplência', sub: 'Dívida não paga',      hex: '#fb7185', text: 'text-rose-400',   base: 'bg-rose-500/10 border-rose-500/20',      active: 'bg-rose-500/20 border-rose-400/60'      },
  { key: 'outro',             label: 'Outro',         sub: 'Outro motivo',         hex: '#94a3b8', text: 'text-slate-400',  base: 'bg-slate-500/10 border-slate-500/20',    active: 'bg-slate-500/20 border-slate-400/60'    },
]

const MINFO = Object.fromEntries(MOTIVOS.map(m => [m.key, m])) as Record<ChurnMotivo, typeof MOTIVOS[0]>

function fromChurnDB(r: Record<string, unknown>): ChurnEvent {
  return {
    id: r.id as string,
    client_id: r.client_id as string,
    motivo: r.motivo as ChurnMotivo,
    comentario: (r.comentario as string) || undefined,
    mrr_perdido: Number(r.mrr_perdido) || 0,
    data_churn: r.data_churn as string,
  }
}

// ── CNPJ lookup ────────────────────────────────────────────────────────────────

async function fetchCNPJData(cnpj: string): Promise<{ nome?: string; cidade?: string; estado?: string; telefone?: string; email?: string } | null> {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return null
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      nome:     data.razao_social || data.nome_fantasia || undefined,
      cidade:   data.municipio    || undefined,
      estado:   data.uf           || undefined,
      telefone: data.ddd_telefone_1
        ? data.ddd_telefone_1.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')
        : undefined,
      email:    data.email        || undefined,
    }
  } catch {
    return null
  }
}

// ── Shared constants ───────────────────────────────────────────────────────────

const EMPTY: Omit<Client, 'id' | 'ativo'> = {
  nome: '', email: '', telefone: '', cpf_cnpj: '',
  tipo: 'PF', cidade: '', estado: '', observacoes: '',
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-300 mb-1.5'

// ── UFSelect ───────────────────────────────────────────────────────────────────

function UFSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/40 transition-all hover:border-white/20 flex items-center justify-between">
        <span className={value ? 'text-white' : 'text-slate-300'}>{value || 'UF'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-white/10 rounded-xl shadow-2xl max-h-44 overflow-y-auto scrollbar-thin">
          <button type="button" onClick={() => { onChange(''); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 transition-colors">
            Selecione...
          </button>
          {ESTADOS.map(uf => (
            <button key={uf} type="button" onClick={() => { onChange(uf); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-white/10 ${value === uf ? 'text-indigo-300' : 'text-slate-300'}`}>
              {uf}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── fromDB ─────────────────────────────────────────────────────────────────────

function fromDB(r: Record<string, unknown>): Client {
  return {
    id: r.id as string, nome: (r.nome as string) ?? '',
    email: (r.email as string) ?? '', telefone: (r.telefone as string) ?? '',
    cpf_cnpj: (r.cpf_cnpj as string) ?? '', tipo: (r.tipo as 'PF' | 'PJ') ?? 'PF',
    cidade: (r.cidade as string) ?? '', estado: (r.estado as string) ?? '',
    observacoes: (r.observacoes as string) ?? '',
    ativo: r.ativo !== undefined ? (r.ativo as boolean) : true,
  }
}

// ── ChurnModal ─────────────────────────────────────────────────────────────────

function ChurnModal({ client, onConfirm, onClose }: {
  client: Client
  onConfirm: (motivo: ChurnMotivo, mrr: number, comentario: string) => Promise<void>
  onClose: () => void
}) {
  const [motivo, setMotivo] = useState<ChurnMotivo | null>(null)
  const [mrr, setMrr]       = useState('')
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!motivo) return
    setSaving(true)
    await onConfirm(motivo, parseFloat(mrr) || 0, note)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 ring-1 ring-red-500/25 flex items-center justify-center">
              <UserX className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">Desativar Cliente</h2>
              <p className="text-slate-400 text-xs mt-0.5">{client.nome}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-5">
          {/* Motivo grid */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Motivo do churn *</p>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS.map(m => (
                <button
                  key={m.key} type="button"
                  onClick={() => setMotivo(m.key)}
                  className={`flex flex-col gap-0.5 p-3 rounded-xl border text-left transition-all duration-150
                    ${motivo === m.key ? m.active : `${m.base} hover:border-white/20`}`}
                >
                  <span className={`text-xs font-bold transition-colors ${motivo === m.key ? m.text : 'text-slate-300'}`}>
                    {m.label}
                  </span>
                  <span className="text-[10px] text-slate-500 leading-tight">{m.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* MRR perdido */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">MRR perdido</p>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono pointer-events-none">R$</span>
              <input type="number" min="0" step="0.01" placeholder="0,00"
                value={mrr} onChange={e => setMrr(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono
                  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/40
                  transition-all hover:border-white/20" />
            </div>
          </div>

          {/* Comentário */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Comentário</p>
            <textarea rows={2} placeholder="Contexto adicional sobre a saída…"
              value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
                placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/40
                transition-all hover:border-white/20 resize-none" />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={!motivo || saving}
              className="flex-1 py-2.5 rounded-xl text-red-300 text-sm font-semibold bg-red-500/15 border border-red-500/25
                hover:bg-red-500/25 hover:border-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed
                hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Desativando…</span>
                : 'Desativar Cliente'}
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-slate-300 text-sm font-medium bg-white/[0.04]
                hover:bg-white/[0.08] border border-white/[0.07] transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ChurnPanel ─────────────────────────────────────────────────────────────────

function ChurnPanel({ active, churned, events, onReactivate }: {
  active: number
  churned: Client[]
  events: ChurnEvent[]
  onReactivate: (id: string) => Promise<void>
}) {
  if (churned.length === 0 && events.length === 0) return null

  const total       = active + churned.length
  const rate        = total > 0 ? Math.round((churned.length / total) * 100) : 0
  const mrrPerdido  = events.reduce((s, e) => s + e.mrr_perdido, 0)

  const counts: Partial<Record<ChurnMotivo, { n: number; mrr: number }>> = {}
  for (const e of events) {
    if (!counts[e.motivo]) counts[e.motivo] = { n: 0, mrr: 0 }
    counts[e.motivo]!.n++
    counts[e.motivo]!.mrr += e.mrr_perdido
  }
  const maxN = Math.max(...Object.values(counts).map(v => v!.n), 1)
  const sorted = MOTIVOS.filter(m => counts[m.key]).sort((a, b) => (counts[b.key]?.n ?? 0) - (counts[a.key]?.n ?? 0))

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div className="mt-10 space-y-5 animate-stagger-5">
      {/* Section header */}
      <div className="flex items-center gap-3 pb-1">
        <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/15 flex items-center justify-center">
          <TrendingDown className="w-4 h-4 text-red-400" />
        </div>
        <div>
          <h2 className="text-white font-bold text-sm tracking-tight">Análise de Churn</h2>
          <p className="text-slate-400 text-xs">{churned.length} cliente{churned.length !== 1 ? 's' : ''} inativo{churned.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="ml-auto px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/15">
          <span className="text-red-400 text-xs font-bold font-mono">{rate}% churn rate</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total de churns',  value: churned.length.toString(), sub: 'clientes inativos' },
          { label: 'Taxa de churn',    value: `${rate}%`,                sub: 'do total de clientes' },
          { label: 'MRR perdido',      value: `R$ ${fmt(mrrPerdido)}`,   sub: 'receita mensal perdida' },
        ].map(k => (
          <div key={k.label} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5">{k.label}</p>
            <p className="text-white font-extrabold text-xl font-mono leading-none">{k.value}</p>
            <p className="text-slate-500 text-[10px] mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Motivo breakdown */}
      {sorted.length > 0 && (
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-3.5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Motivos</p>
          {sorted.map(m => {
            const d = counts[m.key]!
            const pct = Math.round((d.n / maxN) * 100)
            return (
              <div key={m.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${m.text}`}>{m.label}</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {d.n}× · R$ {fmt(d.mrr)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: m.hex, opacity: 0.75 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Churned clients list */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Clientes inativos</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {churned.map(c => {
            const lastEvt = events
              .filter(e => e.client_id === c.id)
              .sort((a, b) => b.data_churn.localeCompare(a.data_churn))[0]
            const info = lastEvt ? MINFO[lastEvt.motivo] : null
            return (
              <div key={c.id}
                className="group flex flex-col gap-2.5 p-4 rounded-2xl bg-white/[0.015] border border-white/[0.04]
                  hover:border-white/[0.08] hover:bg-white/[0.025] transition-all duration-200 opacity-60 hover:opacity-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-500/10 border border-slate-500/10 flex items-center justify-center shrink-0">
                      <span className="text-slate-500 text-xs font-bold">{c.nome.slice(0,2).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-slate-300 font-semibold text-sm truncate">{c.nome}</h3>
                      {info && (
                        <span className={`text-[10px] font-semibold ${info.text}`}>{info.label}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => onReactivate(c.id)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-emerald-400
                      hover:text-emerald-300 hover:bg-emerald-500/10 text-xs font-semibold transition-colors">
                    <RotateCcw className="w-3 h-3" />Reativar
                  </button>
                </div>
                {lastEvt?.comentario && (
                  <p className="text-slate-500 text-xs italic leading-snug">"{lastEvt.comentario}"</p>
                )}
                {lastEvt && lastEvt.mrr_perdido > 0 && (
                  <p className="text-slate-500 text-xs font-mono">
                    −R$ {lastEvt.mrr_perdido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── ClientModal ────────────────────────────────────────────────────────────────

function ClientModal({ initial, editing, onSave, onClose }: {
  initial: Omit<Client, 'id' | 'ativo'>
  editing: boolean
  onSave: (d: Omit<Client, 'id' | 'ativo'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm]             = useState(initial)
  const [saving, setSaving]         = useState(false)
  const [cnpjLookup, setCnpjLookup] = useState<'idle' | 'loading' | 'error'>('idle')
  const set = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleCNPJLookup() {
    setCnpjLookup('loading')
    const result = await fetchCNPJData(form.cpf_cnpj)
    if (!result) { setCnpjLookup('error'); return }
    setForm(f => ({
      ...f,
      nome:     result.nome     || f.nome,
      cidade:   result.cidade   || f.cidade,
      estado:   result.estado   || f.estado,
      telefone: result.telefone ? maskPhone(result.telefone) : f.telefone,
      email:    result.email    || f.email,
    }))
    setCnpjLookup('idle')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-white font-semibold text-base">{editing ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-7 py-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex gap-3">
            {(['PF', 'PJ'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('tipo', t)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all
                  ${form.tipo === t ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nome *</label>
              <input className={inputCls} placeholder="Nome completo ou razão social" value={form.nome} onChange={e => set('nome', e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>{form.tipo === 'PF' ? 'CPF' : 'CNPJ'}</label>
              <div className="flex gap-2">
                <input className={inputCls} placeholder={form.tipo === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'}
                  value={form.cpf_cnpj} inputMode="numeric"
                  onChange={e => { set('cpf_cnpj', form.tipo === 'PF' ? maskCPF(e.target.value) : maskCNPJ(e.target.value)); setCnpjLookup('idle') }} />
                {form.tipo === 'PJ' && (
                  <button type="button" onClick={handleCNPJLookup}
                    disabled={cnpjLookup === 'loading' || form.cpf_cnpj.replace(/\D/g, '').length !== 14}
                    className="shrink-0 px-3 py-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-300
                      hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {cnpjLookup === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {cnpjLookup === 'error' && <p className="text-red-400 text-[10px] mt-1">CNPJ não encontrado ou inválido.</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>E-mail</label>
              <input type="email" className={inputCls} placeholder="email@exemplo.com" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Telefone</label>
              <input type="tel" className={inputCls} placeholder="(11) 99999-9999"
                value={form.telefone} inputMode="numeric"
                onChange={e => set('telefone', maskPhone(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Cidade</label>
              <input className={inputCls} placeholder="São Paulo" value={form.cidade} onChange={e => set('cidade', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Estado</label>
              <UFSelect value={form.estado} onChange={v => set('estado', v)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Observações</label>
            <textarea rows={2} className={inputCls + ' resize-none'} placeholder="Notas adicionais…" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/25 disabled:opacity-60 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300">
              {saving ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando…</span> : editing ? 'Salvar' : 'Criar Cliente'}
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-slate-300 text-sm font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Clientes({ readOnly = false, onClientCreated }: { readOnly?: boolean; onClientCreated?: (client: Client) => void }) {
  const [clients, setClients]         = useState<Client[]>([])
  const [churned, setChurned]         = useState<Client[]>([])
  const [churnEvents, setChurnEvents] = useState<ChurnEvent[]>([])
  const [churnTarget, setChurnTarget] = useState<Client | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [modal, setModal]             = useState(false)
  const [editId, setEditId]           = useState<string | null>(null)
  const [initial, setInitial]         = useState<Omit<Client, 'id' | 'ativo'>>(EMPTY)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: activeData }, { data: churnedData }, { data: eventsData }] = await Promise.all([
      supabase.from('clients').select('*').eq('ativo', true).order('nome'),
      supabase.from('clients').select('*').eq('ativo', false).order('nome'),
      supabase.from('churn_events').select('*').order('data_churn', { ascending: false }),
    ])
    setClients(activeData?.map(fromDB) ?? [])
    setChurned(churnedData?.map(fromDB) ?? [])
    setChurnEvents(eventsData?.map(fromChurnDB) ?? [])
    setLoading(false)
  }

  async function handleSave(data: Omit<Client, 'id' | 'ativo'>) {
    setError('')
    const payload = {
      nome: data.nome, email: data.email || null, telefone: data.telefone || null,
      cpf_cnpj: data.cpf_cnpj || null, tipo: data.tipo, cidade: data.cidade || null,
      estado: data.estado || null, observacoes: data.observacoes || null,
    }
    if (editId) {
      const { error: e } = await supabase.from('clients').update(payload).eq('id', editId)
      if (e) { setError('Erro ao salvar.'); return }
      setClients(cs => cs.map(c => c.id === editId ? { ...data, id: editId, ativo: true } : c))
    } else {
      const { data: row, error: e } = await supabase.from('clients').insert(payload).select().single()
      if (e || !row) { setError('Erro ao criar.'); return }
      const newClient = fromDB(row)
      setClients(cs => [...cs, newClient])
      setModal(false)
      onClientCreated?.(newClient)
      return
    }
    setModal(false)
  }

  async function handleChurn(motivo: ChurnMotivo, mrr: number, comentario: string) {
    if (!churnTarget) return
    const id = churnTarget.id
    const { error: e1 } = await supabase.from('churn_events').insert({
      client_id: id, motivo, mrr_perdido: mrr,
      comentario: comentario || null,
      data_churn: new Date().toISOString().split('T')[0],
    })
    if (e1) { setError('Erro ao registrar churn.'); return }
    const { error: e2 } = await supabase.from('clients').update({ ativo: false }).eq('id', id)
    if (e2) { setError('Erro ao desativar.'); return }
    const c = { ...churnTarget, ativo: false }
    setClients(cs => cs.filter(x => x.id !== id))
    setChurned(cs => [...cs, c].sort((a, b) => a.nome.localeCompare(b.nome)))
    const { data } = await supabase.from('churn_events').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(1)
    if (data?.[0]) setChurnEvents(es => [fromChurnDB(data[0]), ...es])
    setChurnTarget(null)
  }

  async function handleReactivate(id: string) {
    const { error: e } = await supabase.from('clients').update({ ativo: true }).eq('id', id)
    if (e) { setError('Erro ao reativar.'); return }
    const c = churned.find(x => x.id === id)
    if (!c) return
    setChurned(cs => cs.filter(x => x.id !== id))
    setClients(cs => [...cs, { ...c, ativo: true }].sort((a, b) => a.nome.localeCompare(b.nome)))
  }

  function openNew() { setInitial(EMPTY); setEditId(null); setModal(true) }
  function openEdit(c: Client) {
    const { id: _id, ativo: _ativo, ...rest } = c
    setInitial(rest); setEditId(c.id); setModal(true)
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-stagger-1">
        <div>
          <h1 className="text-white font-extrabold text-xl tracking-tight">Clientes</h1>
          <p className="text-slate-300 text-sm mt-0.5 font-medium">
            {loading ? 'Carregando…' : `${clients.length} ativo${clients.length !== 1 ? 's' : ''}${churned.length > 0 ? ` · ${churned.length} inativo${churned.length !== 1 ? 's' : ''}` : ''}`}
          </p>
        </div>
        {!readOnly && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300">
            <Plus className="w-4 h-4" />Novo Cliente
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 text-sm font-medium">
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      ) : clients.length === 0 && churned.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center animate-stagger-2">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
            <Users className="w-5 h-5 text-slate-300" />
          </div>
          <p className="text-slate-300 font-semibold text-sm">Nenhum cliente cadastrado</p>
          <p className="text-slate-300 text-xs mt-1 font-medium">Clique em "Novo Cliente" para começar</p>
        </div>
      ) : (
        <>
          {/* Active clients grid */}
          {clients.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 animate-stagger-2">
              {clients.map(c => (
                <div key={c.id}
                  className="group flex flex-col gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]
                    hover:border-white/[0.10] hover:bg-white/[0.03] transition-all duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/10 flex items-center justify-center shrink-0">
                        <span className="text-indigo-300 text-xs font-bold">{c.nome.slice(0,2).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-white font-semibold text-sm truncate">{c.nome}</h3>
                        {c.cpf_cnpj && <p className="text-slate-300 text-xs mt-0.5 font-medium font-mono">{c.cpf_cnpj}</p>}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md
                      ${c.tipo === 'PJ' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/15' : 'bg-blue-500/10 text-blue-400 border border-blue-500/15'}`}>
                      {c.tipo}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {c.email    && <div className="flex items-center gap-2 text-slate-300 text-xs font-medium"><Mail     className="w-3 h-3 shrink-0" /><span className="truncate">{c.email}</span></div>}
                    {c.telefone && <div className="flex items-center gap-2 text-slate-300 text-xs font-medium"><Phone    className="w-3 h-3 shrink-0" /><span>{c.telefone}</span></div>}
                    {(c.cidade || c.estado) && <div className="flex items-center gap-2 text-slate-300 text-xs font-medium"><FileText className="w-3 h-3 shrink-0" /><span>{[c.cidade, c.estado].filter(Boolean).join(' · ')}</span></div>}
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1.5 pt-2 border-t border-white/[0.04] opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300 hover:text-indigo-300 hover:bg-indigo-500/10 text-xs font-semibold transition-colors">
                        <Pencil className="w-3 h-3" />Editar
                      </button>
                      <button onClick={() => setChurnTarget(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors">
                        <UserX className="w-3 h-3" />Desativar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Churn analytics */}
          {!readOnly && (
            <ChurnPanel
              active={clients.length}
              churned={churned}
              events={churnEvents}
              onReactivate={handleReactivate}
            />
          )}
        </>
      )}

      {/* Modals */}
      {modal && (
        <ClientModal initial={initial} editing={!!editId} onSave={handleSave} onClose={() => setModal(false)} />
      )}
      {churnTarget && (
        <ChurnModal client={churnTarget} onConfirm={handleChurn} onClose={() => setChurnTarget(null)} />
      )}
    </>
  )
}
