import { useEffect, useState } from 'react'
import {
  X, Loader2, Trash2, Phone, Mail, MessageCircle, Plus, Send, Trophy,
  CalendarClock, Square, CheckSquare, History, Tag as TagIcon, Building2, Clock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { maskBRL, parseBRL, numToMask, maskPhone } from '../../lib/utils'
import type { CrmLead, CrmStage, CrmProfile, CrmTask, CrmInteraction, CrmInteractionType } from '../../lib/types'
import {
  TEMPERATURAS, ORIGENS, INTERACTION_META, INTERACAO_MANUAL,
  iniciais, fmtBRL, fmtDataBR, fmtDataHoraBR, relTime, waLink, soDigitos, diasDesde, diasAte,
} from './constants'

const inputCls = `w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-xs
  placeholder-slate-500 focus:outline-none focus:border-indigo-500/40 transition-colors`
const selectCls = `${inputCls} [&>option]:bg-slate-900 cursor-pointer`
const rotuloCls = 'block text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-1.5'

interface Props {
  lead:           CrmLead
  stages:         CrmStage[]
  profiles:       CrmProfile[]
  me:             { id: string; nome: string } | null
  onClose:        () => void
  onPatch:        (id: string, changes: Partial<CrmLead>) => Promise<void>
  onStageChange:  (lead: CrmLead, stageId: string) => void
  onDelete:       (id: string) => void
  onTasksChanged: () => void
}

export default function LeadPanel({ lead, stages, profiles, me, onClose, onPatch, onStageChange, onDelete, onTasksChanged }: Props) {
  const [interacoes, setInteracoes] = useState<CrmInteraction[]>([])
  const [tarefas, setTarefas]       = useState<CrmTask[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tipoInt, setTipoInt]       = useState<CrmInteractionType>('ligacao')
  const [textoInt, setTextoInt]     = useState('')
  const [salvandoInt, setSalvandoInt] = useState(false)
  const [novaTarefa, setNovaTarefa] = useState<{ titulo: string; due_date: string } | null>(null)
  const [novaTag, setNovaTag]       = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const stage = stages.find(s => s.id === lead.stage_id) ?? null
  const cor   = stage?.cor ?? '#6366f1'

  useEffect(() => { carregar() }, [lead.id, lead.stage_id, lead.status])

  async function carregar() {
    setCarregando(true)
    const [{ data: ix }, { data: tk }] = await Promise.all([
      supabase.from('crm_interactions').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('crm_tasks').select('*').eq('lead_id', lead.id).order('due_date', { nullsFirst: false }),
    ])
    setInteracoes((ix ?? []) as CrmInteraction[])
    setTarefas((tk ?? []) as CrmTask[])
    setCarregando(false)
  }

  async function registrarInteracao() {
    const texto = textoInt.trim()
    if (!texto) return
    setSalvandoInt(true)
    const { data } = await supabase.from('crm_interactions').insert({
      lead_id: lead.id, tipo: tipoInt, conteudo: texto, autor_nome: me?.nome ?? null,
    }).select().single()
    if (data) setInteracoes(cur => [data as CrmInteraction, ...cur])
    await onPatch(lead.id, { data_ult_contato: new Date().toISOString() })
    setTextoInt('')
    setSalvandoInt(false)
  }

  async function criarTarefa() {
    if (!novaTarefa || !novaTarefa.titulo.trim()) return
    const { data } = await supabase.from('crm_tasks').insert({
      lead_id:          lead.id,
      titulo:           novaTarefa.titulo.trim(),
      due_date:         novaTarefa.due_date || null,
      responsavel_id:   lead.responsavel_id ?? me?.id ?? null,
      responsavel_nome: lead.responsavel_nome ?? me?.nome ?? null,
    }).select().single()
    if (data) {
      setTarefas(cur => [...cur, data as CrmTask])
      await supabase.from('crm_interactions').insert({
        lead_id: lead.id, tipo: 'tarefa', conteudo: `Tarefa criada: ${(data as CrmTask).titulo}`, autor_nome: me?.nome ?? null,
      })
      carregar()
      onTasksChanged()
    }
    setNovaTarefa(null)
  }

  async function alternarTarefa(t: CrmTask) {
    const concluida = !t.concluida
    const agora = concluida ? new Date().toISOString() : null
    setTarefas(cur => cur.map(x => (x.id === t.id ? { ...x, concluida, concluida_em: agora } : x)))
    await supabase.from('crm_tasks').update({ concluida, concluida_em: agora }).eq('id', t.id)
    if (concluida) {
      await supabase.from('crm_interactions').insert({
        lead_id: lead.id, tipo: 'tarefa', conteudo: `Tarefa concluída: ${t.titulo}`, autor_nome: me?.nome ?? null,
      })
      carregar()
    }
    onTasksChanged()
  }

  async function removerTarefa(id: string) {
    setTarefas(cur => cur.filter(t => t.id !== id))
    await supabase.from('crm_tasks').delete().eq('id', id)
    onTasksChanged()
  }

  function adicionarTag() {
    const t = novaTag.trim()
    if (!t || lead.tags.includes(t)) { setNovaTag(''); return }
    onPatch(lead.id, { tags: [...lead.tags, t] })
    setNovaTag('')
  }

  const tel = soDigitos(lead.telefone)
  const tarefasAbertas = tarefas.filter(t => !t.concluida)
  const statusChip = lead.status === 'ganho'
    ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25'
    : lead.status === 'perdido'
      ? 'bg-red-500/15 text-red-300 ring-red-500/25'
      : 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/25'

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <aside className="relative w-full max-w-[440px] h-full bg-[#0b0d13] border-l border-white/[0.08] shadow-2xl shadow-black/60 flex flex-col animate-slide-in-right">

        {/* ── Cabeçalho ── */}
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: `${cor}22`, color: cor, boxShadow: `inset 0 0 0 1.5px ${cor}55` }}>
              {iniciais(lead.nome)}
            </div>
            <div className="flex-1 min-w-0">
              <input defaultValue={lead.nome} key={`nome-${lead.id}`}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== lead.nome) onPatch(lead.id, { nome: v }) }}
                className="w-full bg-transparent text-white font-semibold text-base outline-none focus:bg-white/[0.04] rounded-lg px-1 -ml-1 py-0.5 transition-colors" />
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 font-semibold ${statusChip}`}>
                  {lead.status === 'ganho' ? 'Ganho' : lead.status === 'perdido' ? 'Perdido' : 'Em aberto'}
                </span>
                {lead.empresa && (
                  <span className="text-slate-400 text-[11px] inline-flex items-center gap-1 truncate">
                    <Building2 className="w-3 h-3" />{lead.empresa}
                  </span>
                )}
                <span className="text-slate-500 text-[11px] inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />{diasDesde(lead.data_entrada_etapa)}d na etapa
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Ações rápidas */}
          <div className="flex items-center gap-2 mt-4">
            <a href={tel ? waLink(lead.telefone) : undefined} target="_blank" rel="noopener noreferrer"
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-colors
                ${tel ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20' : 'bg-white/[0.03] text-slate-600 ring-1 ring-white/[0.06] pointer-events-none'}`}>
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
            <a href={tel ? `tel:${tel}` : undefined}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-colors
                ${tel ? 'bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.07] hover:bg-white/[0.08]' : 'bg-white/[0.03] text-slate-600 ring-1 ring-white/[0.06] pointer-events-none'}`}>
              <Phone className="w-3.5 h-3.5" /> Ligar
            </a>
            <a href={lead.email ? `mailto:${lead.email}` : undefined}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-colors
                ${lead.email ? 'bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.07] hover:bg-white/[0.08]' : 'bg-white/[0.03] text-slate-600 ring-1 ring-white/[0.06] pointer-events-none'}`}>
              <Mail className="w-3.5 h-3.5" /> E-mail
            </a>
          </div>
        </div>

        {/* ── Conteúdo ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Etapa + temperatura */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotuloCls}>Etapa</label>
              <select className={selectCls} value={lead.stage_id ?? ''}
                onChange={e => onStageChange(lead, e.target.value)}>
                {stages.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={rotuloCls}>Temperatura</label>
              <div className="flex gap-1.5">
                {TEMPERATURAS.map(t => (
                  <button key={t.key} onClick={() => onPatch(lead.id, { temperatura: t.key })}
                    className={`flex-1 py-2 rounded-xl text-[11px] font-semibold ring-1 transition-all
                      ${lead.temperatura === t.key ? t.chip : 'bg-white/[0.02] text-slate-500 ring-white/[0.06] hover:text-slate-300'}`}>
                    {t.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Registrar interação */}
          <div>
            <label className={rotuloCls}>Registrar interação</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {INTERACAO_MANUAL.map(tipo => {
                const meta = INTERACTION_META[tipo]
                const ativo = tipoInt === tipo
                return (
                  <button key={tipo} onClick={() => setTipoInt(tipo)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ring-1 transition-all
                      ${ativo ? meta.tone : 'bg-white/[0.02] text-slate-400 ring-white/[0.06] hover:text-slate-200'}`}>
                    <meta.Icon className="w-3 h-3" /> {meta.label}
                  </button>
                )
              })}
            </div>
            <textarea value={textoInt} onChange={e => setTextoInt(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) registrarInteracao() }}
              placeholder="O que foi conversado? Qual o próximo passo?"
              className={`${inputCls} resize-none`} />
            <button onClick={registrarInteracao} disabled={salvandoInt || !textoInt.trim()}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:hover:bg-indigo-500 text-white text-xs font-semibold transition-colors">
              {salvandoInt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Registrar {INTERACTION_META[tipoInt].label.toLowerCase()}
            </button>
          </div>

          {/* Dados do lead */}
          <div className="space-y-3">
            <label className={rotuloCls}>Dados</label>
            <div className="grid grid-cols-2 gap-3">
              <Campo leadId={lead.id} rotulo="Telefone" valor={lead.telefone ?? ''} mascara={maskPhone}
                onSave={v => onPatch(lead.id, { telefone: v || null })} placeholder="(00) 00000-0000" />
              <Campo leadId={lead.id} rotulo="E-mail" valor={lead.email ?? ''}
                onSave={v => onPatch(lead.id, { email: v || null })} placeholder="email@empresa.com" />
              <Campo leadId={lead.id} rotulo="Empresa" valor={lead.empresa ?? ''}
                onSave={v => onPatch(lead.id, { empresa: v || null })} placeholder="Empresa" />
              <div>
                <label className={rotuloCls}>Origem</label>
                <select className={selectCls} value={lead.origem ?? ''}
                  onChange={e => onPatch(lead.id, { origem: e.target.value || null })}>
                  <option value="">Sem origem</option>
                  {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                  {lead.origem && !ORIGENS.includes(lead.origem) && <option value={lead.origem}>{lead.origem}</option>}
                </select>
              </div>
              <Campo leadId={lead.id} rotulo="Valor (R$)" valor={numToMask(Number(lead.valor || 0))} mascara={maskBRL}
                onSave={v => onPatch(lead.id, { valor: parseBRL(v) ?? 0 })} placeholder="0,00" />
              <Campo leadId={lead.id} rotulo="Mensalidade (R$)" valor={numToMask(Number(lead.valor_recorrente || 0))} mascara={maskBRL}
                onSave={v => onPatch(lead.id, { valor_recorrente: parseBRL(v) ?? 0 })} placeholder="0,00" />
              <div>
                <label className={rotuloCls}>Responsável</label>
                <select className={selectCls} value={lead.responsavel_id ?? ''}
                  onChange={e => {
                    const p = profiles.find(x => x.id === e.target.value)
                    onPatch(lead.id, { responsavel_id: e.target.value || null, responsavel_nome: p?.full_name ?? null })
                  }}>
                  <option value="">Sem responsável</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</option>)}
                </select>
              </div>
              <div>
                <label className={rotuloCls}>Próximo contato</label>
                <input type="date" className={inputCls} value={lead.proximo_contato?.slice(0, 10) ?? ''}
                  onChange={e => onPatch(lead.id, { proximo_contato: e.target.value || null })} />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className={rotuloCls}>Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {lead.tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] text-slate-300 text-[11px]">
                    <TagIcon className="w-3 h-3 text-slate-500" />{t}
                    <button onClick={() => onPatch(lead.id, { tags: lead.tags.filter(x => x !== t) })}
                      className="text-slate-500 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <input value={novaTag} onChange={e => setNovaTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarTag() } }}
                placeholder="+ adicionar tag e Enter" className={inputCls} />
            </div>

            {/* Observações */}
            <div>
              <label className={rotuloCls}>Observações</label>
              <textarea key={`obs-${lead.id}`} defaultValue={lead.observacoes ?? ''} rows={3}
                onBlur={e => { const v = e.target.value; if (v !== (lead.observacoes ?? '')) onPatch(lead.id, { observacoes: v || null }) }}
                placeholder="Contexto, necessidade, histórico de negociação..."
                className={`${inputCls} resize-none`} />
            </div>

            {lead.status === 'perdido' && lead.motivo_perda && (
              <div className="px-3 py-2.5 rounded-xl bg-red-500/[0.06] border border-red-500/20">
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-red-400/80 mb-1">Motivo da perda</p>
                <p className="text-red-200 text-xs">{lead.motivo_perda}</p>
              </div>
            )}
            {lead.status === 'ganho' && (
              <div className="px-3 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-emerald-200 text-xs">
                  Venda fechada em {fmtDataBR(lead.data_fechamento)} · {fmtBRL(Number(lead.valor || 0))}
                </p>
              </div>
            )}
          </div>

          {/* Tarefas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`${rotuloCls} mb-0`}>Tarefas {tarefasAbertas.length > 0 && `· ${tarefasAbertas.length} aberta(s)`}</label>
              <button onClick={() => setNovaTarefa({ titulo: '', due_date: '' })}
                className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 transition-colors">
                <Plus className="w-3 h-3" /> Nova
              </button>
            </div>

            {novaTarefa && (
              <div className="mb-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-2">
                <input autoFocus value={novaTarefa.titulo} onChange={e => setNovaTarefa({ ...novaTarefa, titulo: e.target.value })}
                  placeholder="Ex.: Enviar proposta revisada" className={inputCls} />
                <div className="flex gap-2">
                  <input type="date" value={novaTarefa.due_date} onChange={e => setNovaTarefa({ ...novaTarefa, due_date: e.target.value })}
                    className={inputCls} />
                  <button onClick={criarTarefa} className="px-4 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition-colors">
                    Criar
                  </button>
                  <button onClick={() => setNovaTarefa(null)} className="px-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-xs hover:bg-white/10 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {tarefas.length === 0 && !novaTarefa && (
                <p className="text-slate-500 text-[11px] py-2">Nenhuma tarefa. Crie um follow-up para não perder o timing.</p>
              )}
              {tarefas.map(t => {
                const d = diasAte(t.due_date)
                const atrasada = !t.concluida && d !== null && d < 0
                return (
                  <div key={t.id} className={`group flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors
                    ${atrasada ? 'bg-red-500/[0.05] border-red-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                    <button onClick={() => alternarTarefa(t)}
                      className={`shrink-0 transition-colors ${t.concluida ? 'text-emerald-400' : 'text-slate-500 hover:text-emerald-400'}`}>
                      {t.concluida ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate ${t.concluida ? 'text-slate-500 line-through' : 'text-white'}`}>{t.titulo}</p>
                      {t.due_date && (
                        <p className={`text-[10px] ${atrasada ? 'text-red-300' : 'text-slate-500'}`}>
                          <CalendarClock className="w-2.5 h-2.5 inline mr-1" />
                          {fmtDataBR(t.due_date)}{atrasada ? ` · ${Math.abs(d!)}d atrasada` : ''}
                        </p>
                      )}
                    </div>
                    <button onClick={() => removerTarefa(t.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-600 hover:text-red-400 transition-all shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Histórico */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <label className={`${rotuloCls} mb-0`}>Histórico</label>
              {!carregando && <span className="text-slate-600 text-[10px]">{interacoes.length} registro(s)</span>}
            </div>

            {carregando ? (
              <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /></div>
            ) : interacoes.length === 0 ? (
              <p className="text-slate-500 text-[11px] py-2">Nada registrado ainda.</p>
            ) : (
              <div className="relative pl-5 space-y-3">
                <div className="absolute left-[7px] top-1.5 bottom-1 w-px bg-white/[0.07]" />
                {interacoes.map(ix => {
                  const meta = INTERACTION_META[ix.tipo] ?? INTERACTION_META.nota
                  return (
                    <div key={ix.id} className="relative">
                      <span className={`absolute -left-5 top-1.5 w-[7px] h-[7px] rounded-full ring-2 ring-[#0b0d13] ${meta.dot}`} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ring-1 ${meta.tone}`}>
                          <meta.Icon className="w-2.5 h-2.5" />{meta.label}
                        </span>
                        <span className="text-slate-500 text-[10px]" title={fmtDataHoraBR(ix.created_at)}>
                          {relTime(ix.created_at)}
                        </span>
                        {ix.autor_nome && <span className="text-slate-600 text-[10px]">· {ix.autor_nome.split(' ')[0]}</span>}
                      </div>
                      {ix.conteudo && <p className="text-slate-300 text-xs mt-1 whitespace-pre-wrap break-words">{ix.conteudo}</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Rodapé ── */}
        <div className="px-5 py-3.5 border-t border-white/[0.06] shrink-0 flex items-center gap-3">
          <p className="text-slate-600 text-[10px] flex-1">
            Criado em {fmtDataBR(lead.created_at)}
            {lead.data_ult_contato ? ` · último contato ${relTime(lead.data_ult_contato)}` : ''}
          </p>
          {confirmDel ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmDel(false)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={() => onDelete(lead.id)}
                className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-[11px] font-semibold transition-colors">
                Excluir mesmo
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 text-[11px] transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Excluir lead
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}

// ── Campo editável (salva ao sair do campo) ───────────────────────────────────

function Campo({ leadId, rotulo, valor, onSave, placeholder, mascara }: {
  leadId:       string
  rotulo:       string
  valor:        string
  onSave:       (v: string) => void
  placeholder?: string
  mascara?:     (v: string) => string
}) {
  const [v, setV] = useState(valor)
  useEffect(() => { setV(valor) }, [leadId, valor])

  return (
    <div>
      <label className={rotuloCls}>{rotulo}</label>
      <input value={v} placeholder={placeholder} className={inputCls}
        onChange={e => setV(mascara ? mascara(e.target.value) : e.target.value)}
        onBlur={() => { if (v !== valor) onSave(v.trim()) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </div>
  )
}
