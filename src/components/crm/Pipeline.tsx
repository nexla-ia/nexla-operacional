import { Fragment, useMemo, useState } from 'react'
import {
  Search, ChevronRight, ChevronDown, Check, Download, Trash2, Repeat,
  Target, Activity, Trophy, Percent, AlertTriangle, Building2, Loader2,
} from 'lucide-react'
import type { CrmLead, CrmStage, CrmTask, CrmProfile, CrmCadence, CrmCadenceStep } from '../../lib/types'
import {
  canalOf, labelDia, diasDesde, diasAte, fmtDataBR, fmtBRLCompact, iniciais, tempOf, ORIGENS,
} from './constants'

const inputCls = `px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-xs
  placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors`
const selectCls = `${inputCls} text-slate-300 cursor-pointer [&>option]:bg-slate-900`
const rotuloCls = 'block text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-1.5'

type Aba = 'aberto' | 'ganho' | 'perdido'

interface Props {
  leads:             CrmLead[]
  stages:            CrmStage[]
  tasks:             CrmTask[]
  profiles:          CrmProfile[]
  cadences:          CrmCadence[]
  cadenciaOk:        boolean
  isAdmin:           boolean
  passosDa:          (cadenceId: string) => CrmCadenceStep[]
  onOpenLead:        (leadId: string) => void
  onToggleTask:      (task: CrmTask, concluida: boolean) => void
  onStageChange:     (lead: CrmLead, stageId: string) => void
  onPatchLead:       (id: string, changes: Partial<CrmLead>) => Promise<void>
  onDeleteLead:      (id: string) => void
  onAplicarCadencia: (lead: CrmLead, cadenceId: string) => Promise<void>
}

export default function Pipeline({
  leads, stages, tasks, profiles, cadences, cadenciaOk, isAdmin, passosDa,
  onOpenLead, onToggleTask, onStageChange, onPatchLead, onDeleteLead, onAplicarCadencia,
}: Props) {
  const [aba, setAba]           = useState<Aba>('aberto')
  const [busca, setBusca]       = useState('')
  const [fOrigem, setFOrigem]   = useState('todos')
  const [fResp, setFResp]       = useState('todos')
  const [fEtapa, setFEtapa]     = useState('todos')
  const [reguaId, setReguaId]   = useState(cadences.find(c => c.padrao)?.id ?? cadences[0]?.id ?? '')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState<string | null>(null)

  const passos = reguaId ? passosDa(reguaId) : []

  const stageById = useMemo(() => {
    const m: Record<string, CrmStage> = {}
    for (const s of stages) m[s.id] = s
    return m
  }, [stages])

  // lead → (step_id → tarefa), para preencher cada célula de toque
  const toquePorLead = useMemo(() => {
    const m: Record<string, Record<string, CrmTask>> = {}
    for (const t of tasks) {
      if (!t.step_id) continue
      ;(m[t.lead_id] ??= {})[t.step_id] = t
    }
    return m
  }, [tasks])

  const origensUsadas = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) if (l.origem) set.add(l.origem)
    for (const o of ORIGENS) set.add(o)
    return [...set].sort()
  }, [leads])

  const daAba = useMemo(() => leads.filter(l => l.status === aba), [leads, aba])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return daAba.filter(l => {
      if (q && !`${l.nome} ${l.empresa ?? ''} ${l.telefone ?? ''} ${l.email ?? ''}`.toLowerCase().includes(q)) return false
      if (fOrigem !== 'todos' && (l.origem ?? '') !== fOrigem) return false
      if (fEtapa !== 'todos' && l.stage_id !== fEtapa) return false
      if (fResp !== 'todos') {
        if (fResp === 'sem' ? !!l.responsavel_id : l.responsavel_id !== fResp) return false
      }
      return true
    }).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }, [daAba, busca, fOrigem, fEtapa, fResp])

  // ── Números do topo ─────────────────────────────────────────────────────────

  const emAberto   = leads.filter(l => l.status === 'aberto').length
  const convertidos = leads.filter(l => l.status === 'ganho').length
  const perdidos    = leads.filter(l => l.status === 'perdido').length
  const fechados    = convertidos + perdidos
  const taxa        = fechados ? Math.round((convertidos / fechados) * 100) : 0
  const atrasados   = useMemo(() => tasks.filter(t => {
    if (t.concluida) return false
    const lead = leads.find(l => l.id === t.lead_id)
    if (!lead || lead.status !== 'aberto') return false
    const d = diasAte(t.due_date)
    return d !== null && d < 0
  }).length, [tasks, leads])

  // ── CSV ─────────────────────────────────────────────────────────────────────

  function exportarCSV() {
    const cabecalho = [
      'Nome', 'Empresa', 'Origem', 'Responsavel', 'Entrada', 'Etapa', 'Status',
      'Valor', 'Dias', ...passos.map(p => `${labelDia(p.dia_offset)} ${canalOf(p.canal).label}`),
      'Proximo contato', 'Observacoes',
    ]
    const linhas = filtrados.map(l => [
      l.nome, l.empresa ?? '', l.origem ?? '', l.responsavel_nome ?? '',
      fmtDataBR(l.created_at), l.stage_id ? stageById[l.stage_id]?.nome ?? '' : '', l.status,
      String(l.valor ?? 0), String(diasDesde(l.created_at)),
      ...passos.map(p => {
        const t = toquePorLead[l.id]?.[p.id]
        if (!t) return '—'
        return t.concluida ? 'Feito' : `Previsto ${fmtDataBR(t.due_date)}`
      }),
      l.proximo_contato ? fmtDataBR(l.proximo_contato) : '',
      (l.observacoes ?? '').replace(/\n/g, ' '),
    ])
    const csv = [cabecalho, ...linhas]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `pipeline-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function aplicarRegua(lead: CrmLead) {
    if (!reguaId) return
    setAplicando(lead.id)
    await onAplicarCadencia(lead, reguaId)
    setAplicando(null)
  }

  const ABAS: { id: Aba; label: string; qtd: number }[] = [
    { id: 'aberto',  label: 'Pipeline ativo', qtd: emAberto },
    { id: 'ganho',   label: 'Convertidos',    qtd: convertidos },
    { id: 'perdido', label: 'Reativação',     qtd: perdidos },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">

      {/* ── Números ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Num Icon={Target}        cor="text-indigo-400"  label="Leads no pipeline" valor={leads.length} />
        <Num Icon={Activity}      cor="text-sky-400"     label="Em andamento"      valor={emAberto} />
        <Num Icon={Trophy}        cor="text-emerald-400" label="Convertidos"       valor={convertidos} />
        <Num Icon={Percent}       cor="text-violet-400"  label="Taxa de conversão" valor={`${taxa}%`} />
        <Num Icon={AlertTriangle} cor="text-red-400"     label="Toques atrasados"  valor={atrasados} alerta={atrasados > 0} />
      </div>

      {/* ── Abas ── */}
      <div className="flex items-center gap-1 border-b border-white/[0.07]">
        {ABAS.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors
              ${aba === a.id ? 'text-indigo-300 border-indigo-400' : 'text-slate-400 border-transparent hover:text-slate-200'}`}>
            {a.label} <span className="text-slate-500 tabular-nums">· {a.qtd}</span>
          </button>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou empresa..."
            className={`${inputCls} w-64 pl-9`} />
        </div>

        <select value={fOrigem} onChange={e => setFOrigem(e.target.value)} className={selectCls}>
          <option value="todos">Todas as origens</option>
          {origensUsadas.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        <select value={fEtapa} onChange={e => setFEtapa(e.target.value)} className={selectCls}>
          <option value="todos">Todas as etapas</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>

        {isAdmin && (
          <select value={fResp} onChange={e => setFResp(e.target.value)} className={selectCls}>
            <option value="todos">Todos os responsáveis</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</option>)}
            <option value="sem">Sem responsável</option>
          </select>
        )}

        {cadenciaOk && cadences.length > 1 && (
          <select value={reguaId} onChange={e => setReguaId(e.target.value)} className={selectCls} title="Régua exibida nas colunas">
            {cadences.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}

        <div className="flex-1" />

        <button onClick={exportarCSV}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-xs font-medium hover:text-white hover:border-white/20 transition-colors">
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </button>
      </div>

      {/* ── Tabela ── */}
      <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-white/[0.07] bg-slate-900/40">
        <table className="w-full text-xs border-collapse" style={{ minWidth: 980 + passos.length * 84 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#10131c] text-slate-400 text-[10px] font-mono uppercase tracking-[0.12em]">
              <th className="w-8" />
              <th className="text-left font-medium py-3 px-3">Lead</th>
              <th className="text-left font-medium py-3 px-3">Origem</th>
              <th className="text-left font-medium py-3 px-3">Responsável</th>
              <th className="text-left font-medium py-3 px-3">Entrada</th>
              {passos.map(p => (
                <th key={p.id} className="text-center font-medium py-3 px-2 whitespace-nowrap" title={p.titulo}>
                  {labelDia(p.dia_offset)}
                  <span className="block text-[9px] text-slate-500 normal-case tracking-normal">{canalOf(p.canal).label}</span>
                </th>
              ))}
              <th className="text-center font-medium py-3 px-2">Dias</th>
              <th className="text-left font-medium py-3 px-3">Etapa</th>
              <th className="w-20" />
            </tr>
          </thead>

          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={9 + passos.length} className="text-center py-16 text-slate-500 text-sm">
                  Nenhum lead nesta aba com os filtros atuais.
                </td>
              </tr>
            )}

            {filtrados.map(lead => {
              const stage  = lead.stage_id ? stageById[lead.stage_id] : null
              const aberto = expandido === lead.id
              const temp   = tempOf(lead.temperatura)
              const semRegua = passos.length > 0 && !passos.some(p => toquePorLead[lead.id]?.[p.id])

              return (
                <Fragment key={lead.id}>
                  <tr className={`border-t border-white/[0.05] transition-colors hover:bg-white/[0.02] ${aberto ? 'bg-white/[0.03]' : ''}`}>
                    <td className="px-1 text-center">
                      <button onClick={() => setExpandido(aberto ? null : lead.id)}
                        className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] transition-colors">
                        {aberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                          style={{ background: `${stage?.cor ?? '#64748b'}22`, color: stage?.cor ?? '#94a3b8', boxShadow: `inset 0 0 0 1.5px ${stage?.cor ?? '#64748b'}55` }}>
                          {iniciais(lead.nome)}
                        </div>
                        <div className="min-w-0">
                          <button onClick={() => onOpenLead(lead.id)}
                            className="text-white font-semibold hover:text-indigo-300 transition-colors truncate max-w-[190px] block text-left">
                            {lead.nome}
                          </button>
                          {lead.empresa && (
                            <span className="text-slate-500 text-[11px] truncate max-w-[190px] flex items-center gap-1">
                              <Building2 className="w-2.5 h-2.5 shrink-0" />{lead.empresa}
                            </span>
                          )}
                        </div>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${temp.dot}`} title={temp.label} />
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-slate-300">{lead.origem || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-300 truncate max-w-[130px]">{lead.responsavel_nome || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-400 tabular-nums">{fmtDataBR(lead.created_at)}</td>

                    {/* Toques da régua */}
                    {passos.map(p => {
                      const t = toquePorLead[lead.id]?.[p.id]
                      return (
                        <td key={p.id} className="py-2.5 px-2 text-center">
                          {!t ? (
                            <span className="text-slate-700">—</span>
                          ) : (
                            <>
                              <span className="block text-[10px] text-slate-500 mb-1 tabular-nums">
                                {t.due_date ? fmtDataBR(t.due_date).slice(0, 5) : '--'}
                              </span>
                              <Caixinha task={t} onToggle={onToggleTask} />
                            </>
                          )}
                        </td>
                      )
                    })}

                    <td className="py-2.5 px-2 text-center text-slate-300 tabular-nums">{diasDesde(lead.created_at)}</td>

                    <td className="py-2.5 px-3">
                      <select value={lead.stage_id ?? ''} onChange={e => onStageChange(lead, e.target.value)}
                        className="px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-[11px] font-medium cursor-pointer focus:outline-none focus:border-indigo-500/40 [&>option]:bg-slate-900"
                        style={{ color: stage?.cor ?? '#e2e8f0' }}>
                        {stages.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </td>

                    <td className="px-2">
                      <div className="flex items-center justify-end gap-0.5">
                        {semRegua && cadenciaOk && reguaId && (
                          <button onClick={() => aplicarRegua(lead)} disabled={aplicando === lead.id}
                            title="Aplicar a régua neste lead"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors">
                            {aplicando === lead.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Repeat className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button onClick={() => { if (confirm(`Excluir o lead "${lead.nome}"?`)) onDeleteLead(lead.id) }}
                          title="Excluir lead"
                          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {aberto && (
                    <tr className="border-t border-white/[0.05] bg-white/[0.02]">
                      <td colSpan={9 + passos.length} className="px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <Campo rotulo="Telefone / WhatsApp" valor={lead.telefone ?? ''} leadId={lead.id}
                            onSave={v => onPatchLead(lead.id, { telefone: v || null })} />
                          <Campo rotulo="E-mail" valor={lead.email ?? ''} leadId={lead.id}
                            onSave={v => onPatchLead(lead.id, { email: v || null })} />
                          <div>
                            <label className={rotuloCls}>Responsável</label>
                            <select className={`${selectCls} w-full`} value={lead.responsavel_id ?? ''}
                              onChange={e => {
                                const p = profiles.find(x => x.id === e.target.value)
                                onPatchLead(lead.id, { responsavel_id: e.target.value || null, responsavel_nome: p?.full_name ?? null })
                              }}>
                              <option value="">Sem responsável</option>
                              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={rotuloCls}>Próximo contato</label>
                            <input type="date" className={`${inputCls} w-full`} value={lead.proximo_contato?.slice(0, 10) ?? ''}
                              onChange={e => onPatchLead(lead.id, { proximo_contato: e.target.value || null })} />
                          </div>
                          <div className="sm:col-span-2 lg:col-span-4">
                            <label className={rotuloCls}>Observações / próxima ação</label>
                            <textarea key={`obs-${lead.id}`} defaultValue={lead.observacoes ?? ''} rows={2}
                              onBlur={e => { if (e.target.value !== (lead.observacoes ?? '')) onPatchLead(lead.id, { observacoes: e.target.value || null }) }}
                              placeholder="Ex.: aguardar retorno do diagnóstico"
                              className={`${inputCls} w-full resize-none`} />
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mt-3">
                          {Number(lead.valor) > 0 && (
                            <span className="text-emerald-300 text-[11px] font-semibold">{fmtBRLCompact(Number(lead.valor))}</span>
                          )}
                          {lead.motivo_perda && <span className="text-red-300 text-[11px]">Perda: {lead.motivo_perda}</span>}
                          <div className="flex-1" />
                          <button onClick={() => onOpenLead(lead.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-300 text-[11px] hover:text-white transition-colors">
                            Abrir ficha completa <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Legenda ── */}
      <div className="flex items-center gap-5 text-[11px] text-slate-500 flex-wrap">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] bg-emerald-500" /> toque feito</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] bg-red-500/25 border border-red-500" /> atrasado</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] bg-amber-500/25 border border-amber-400" /> para hoje</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] border border-white/20" /> pendente, no prazo</span>
        <span className="ml-auto">clique no quadrado para marcar o toque</span>
      </div>
    </div>
  )
}

// ── Caixinha do toque ─────────────────────────────────────────────────────────

function Caixinha({ task, onToggle }: { task: CrmTask; onToggle: (t: CrmTask, concluida: boolean) => void }) {
  const d        = diasAte(task.due_date)
  const atrasado = !task.concluida && d !== null && d < 0
  const ehHoje   = !task.concluida && d === 0
  const canal    = canalOf(task.canal)

  return (
    <button onClick={() => onToggle(task, !task.concluida)}
      title={`${canal.label} — ${task.titulo}`
        + (task.concluida ? ' · feito' : atrasado ? ` · ${Math.abs(d!)}d atrasado` : '')
        + `\nClique para marcar como ${task.concluida ? 'não feito' : 'feito'}`}
      className={`w-5 h-5 rounded-md border inline-flex items-center justify-center transition-all hover:scale-110
        ${task.concluida ? 'bg-emerald-500 border-emerald-400'
          : atrasado ? 'bg-red-500/25 border-red-500'
          : ehHoje ? 'bg-amber-500/25 border-amber-400'
          : 'bg-white/[0.02] border-white/20'}`}>
      {task.concluida && <Check className="w-3 h-3 text-white" strokeWidth={3.5} />}
      {atrasado && <span className="text-red-300 text-[10px] font-bold leading-none">!</span>}
    </button>
  )
}

// ── Campo editável ────────────────────────────────────────────────────────────

function Campo({ rotulo, valor, leadId, onSave }: {
  rotulo: string
  valor:  string
  leadId: string
  onSave: (v: string) => void
}) {
  return (
    <div>
      <label className={rotuloCls}>{rotulo}</label>
      <input key={`${leadId}-${rotulo}`} defaultValue={valor} className={`${inputCls} w-full`}
        onBlur={e => { if (e.target.value !== valor) onSave(e.target.value.trim()) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </div>
  )
}

// ── Número do topo ────────────────────────────────────────────────────────────

function Num({ Icon, cor, label, valor, alerta }: {
  Icon:    typeof Target
  cor:     string
  label:   string
  valor:   number | string
  alerta?: boolean
}) {
  return (
    <div className={`p-4 rounded-2xl border ${alerta ? 'bg-red-500/[0.05] border-red-500/20' : 'bg-white/[0.02] border-white/[0.07]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${cor}`} />
        <span className="text-slate-400 text-[11px] font-medium">{label}</span>
      </div>
      <p className="text-white text-xl font-bold tabular-nums leading-none">{valor}</p>
    </div>
  )
}
