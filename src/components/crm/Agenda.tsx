import { useMemo, useState } from 'react'
import {
  CalendarClock, ChevronLeft, ChevronRight, ChevronRight as Chevron, Check, Square,
  CheckSquare, Clock, AlertTriangle, ListTodo, CalendarDays, MessageCircle, Phone,
  CalendarPlus, Building2,
} from 'lucide-react'
import type { CrmLead, CrmTask, CrmProfile, CrmCanal } from '../../lib/types'
import { canalOf, hojeISO, addDias, diasAte, fmtDataBR, labelDia, waLink, soDigitos, CANAIS } from './constants'

interface AgendaItem {
  key:       string
  date:      string | null
  titulo:    string
  descricao: string | null
  canal:     CrmCanal
  lead:      CrmLead
  task?:     CrmTask
}

interface Props {
  leads:        CrmLead[]
  tasks:        CrmTask[]
  profiles:     CrmProfile[]
  meId:         string | null
  isAdmin:      boolean
  onOpenLead:   (leadId: string) => void
  onToggleTask: (task: CrmTask, concluida: boolean) => void
  onReschedule: (task: CrmTask, date: string) => void
}

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function Agenda({ leads, tasks, profiles, meId, isAdmin, onOpenLead, onToggleTask, onReschedule }: Props) {
  const [modo, setModo]             = useState<'lista' | 'semana'>('lista')
  const [filtroCanal, setFiltroCanal] = useState<string>('todos')
  const [filtroResp, setFiltroResp]   = useState<string>(isAdmin ? 'todos' : (meId ?? 'todos'))
  const [verConcluidas, setVerConcluidas] = useState(false)
  const [semanaOffset, setSemanaOffset]   = useState(0)
  const [arrastando, setArrastando] = useState<CrmTask | null>(null)
  const [diaAlvo, setDiaAlvo]       = useState<string | null>(null)

  const hoje = hojeISO()

  const leadPorId = useMemo(() => {
    const m: Record<string, CrmLead> = {}
    for (const l of leads) m[l.id] = l
    return m
  }, [leads])

  // Tarefas + o "próximo contato" marcado no lead viram itens de agenda.
  const todos = useMemo(() => {
    const itens: AgendaItem[] = []
    for (const t of tasks) {
      const lead = leadPorId[t.lead_id]
      if (!lead) continue
      // Lead já ganho/perdido não fica cobrando toque pendente na agenda
      if (lead.status !== 'aberto' && !t.concluida) continue
      itens.push({
        key: `t-${t.id}`, date: t.due_date, titulo: t.titulo, descricao: t.descricao,
        canal: (t.canal ?? 'outro') as CrmCanal, lead, task: t,
      })
    }
    for (const l of leads) {
      if (l.status !== 'aberto' || !l.proximo_contato) continue
      itens.push({ key: `l-${l.id}`, date: l.proximo_contato, titulo: 'Retomar contato', descricao: null, canal: 'outro', lead: l })
    }
    return itens.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  }, [tasks, leads, leadPorId])

  const filtrados = useMemo(() => todos.filter(i => {
    if (filtroCanal !== 'todos' && i.canal !== filtroCanal) return false
    if (filtroResp !== 'todos') {
      const resp = i.task?.responsavel_id ?? i.lead.responsavel_id
      if (filtroResp === 'sem' ? !!resp : resp !== filtroResp) return false
    }
    return true
  }), [todos, filtroCanal, filtroResp])

  const pendentes = filtrados.filter(i => !i.task?.concluida)

  const atrasadas   = pendentes.filter(i => { const d = diasAte(i.date); return d !== null && d < 0 })
  const deHoje      = pendentes.filter(i => diasAte(i.date) === 0)
  const feitasHoje  = filtrados.filter(i => i.task?.concluida && i.task.concluida_em?.slice(0, 10) === hoje)
  const daSemana    = pendentes.filter(i => { const d = diasAte(i.date); return d !== null && d >= 0 && d <= 7 })

  const metaHoje    = deHoje.length + feitasHoje.length
  const progresso   = metaHoje > 0 ? Math.round((feitasHoje.length / metaHoje) * 100) : 0

  // ── Visão semana ────────────────────────────────────────────────────────────

  const inicioSemana = useMemo(() => {
    const dow = (new Date(`${hoje}T00:00:00`).getDay() + 6) % 7 // 0 = segunda
    return addDias(hoje, -dow + semanaOffset * 7)
  }, [hoje, semanaOffset])

  const diasDaSemana = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDias(inicioSemana, i)),
    [inicioSemana],
  )

  const rotuloSemana = `${fmtDataBR(inicioSemana).slice(0, 5)} – ${fmtDataBR(diasDaSemana[6]).slice(0, 5)}`

  function soltarNoDia(dia: string) {
    const t = arrastando
    setArrastando(null); setDiaAlvo(null)
    if (t && t.due_date !== dia) onReschedule(t, dia)
  }

  // ── Grupos da lista ─────────────────────────────────────────────────────────

  const grupos: { titulo: string; tom: string; itens: AgendaItem[] }[] = [
    { titulo: 'Atrasadas',        tom: 'text-red-300',    itens: atrasadas },
    { titulo: 'Hoje',             tom: 'text-amber-300',  itens: deHoje },
    { titulo: 'Amanhã',           tom: 'text-slate-300',  itens: pendentes.filter(i => diasAte(i.date) === 1) },
    { titulo: 'Próximos 7 dias',  tom: 'text-slate-300',  itens: pendentes.filter(i => { const d = diasAte(i.date); return d !== null && d > 1 && d <= 7 }) },
    { titulo: 'Depois',           tom: 'text-slate-400',  itens: pendentes.filter(i => { const d = diasAte(i.date); return d !== null && d > 7 }) },
    { titulo: 'Sem data',         tom: 'text-slate-400',  itens: pendentes.filter(i => i.date === null) },
  ]
  if (verConcluidas) grupos.push({ titulo: 'Concluídas hoje', tom: 'text-emerald-300', itens: feitasHoje })

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">

      {/* ── Resumo do dia ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Resumo Icon={AlertTriangle} cor="text-red-400"     label="Atrasadas"       valor={atrasadas.length}
          rodape={atrasadas.length ? 'precisam de ação hoje' : 'nada atrasado'} destaque={atrasadas.length > 0} />
        <Resumo Icon={Clock}         cor="text-amber-400"   label="Para hoje"       valor={deHoje.length}
          rodape={`${feitasHoje.length} de ${metaHoje || 0} concluídas`} />
        <Resumo Icon={CheckSquare}   cor="text-emerald-400" label="Feitas hoje"     valor={feitasHoje.length}
          rodape={`${progresso}% do dia`} barra={progresso} />
        <Resumo Icon={CalendarDays}  cor="text-indigo-400"  label="Próximos 7 dias" valor={daSemana.length}
          rodape="toques agendados" />
      </div>

      {/* ── Controles ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          {([['lista', 'Lista', ListTodo], ['semana', 'Semana', CalendarDays]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setModo(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${modo === id ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        <select value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-xs focus:outline-none focus:border-white/20 [&>option]:bg-slate-900">
          <option value="todos">Todos os canais</option>
          {CANAIS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>

        {isAdmin && (
          <select value={filtroResp} onChange={e => setFiltroResp(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-xs focus:outline-none focus:border-white/20 [&>option]:bg-slate-900">
            <option value="todos">Todos os responsáveis</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</option>)}
            <option value="sem">Sem responsável</option>
          </select>
        )}

        {modo === 'lista' && (
          <button onClick={() => setVerConcluidas(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors
              ${verConcluidas ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-slate-200'}`}>
            <Check className="w-3.5 h-3.5" /> Concluídas
          </button>
        )}

        {modo === 'semana' && (
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => setSemanaOffset(o => o - 1)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-white text-xs font-semibold w-28 text-center tabular-nums">{rotuloSemana}</span>
            <button onClick={() => setSemanaOffset(o => o + 1)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            {semanaOffset !== 0 && (
              <button onClick={() => setSemanaOffset(0)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-white/[0.05] border border-white/[0.08] hover:text-white transition-colors">
                Hoje
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Lista ── */}
      {modo === 'lista' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-6 pb-4">
            {pendentes.length === 0 && !verConcluidas && (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center mb-1">
                  <Check className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-white font-semibold text-sm">Agenda limpa</p>
                <p className="text-slate-400 text-xs max-w-xs">Sem toques pendentes. Cadastre um lead para a régua criar os próximos.</p>
              </div>
            )}

            {grupos.map(g => g.itens.length === 0 ? null : (
              <div key={g.titulo}>
                <p className={`text-[10px] font-mono uppercase tracking-[0.2em] mb-2.5 ${g.tom}`}>
                  {g.titulo} · {g.itens.length}
                </p>
                <div className="space-y-2">
                  {g.itens.map(item => (
                    <LinhaAgenda key={item.key} item={item} hoje={hoje}
                      onOpenLead={onOpenLead} onToggleTask={onToggleTask} onReschedule={onReschedule} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Semana ── */}
      {modo === 'semana' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {atrasadas.length > 0 && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-300 mb-2">
                Atrasadas · {atrasadas.length} — arraste para um dia da semana
              </p>
              <div className="flex gap-2 flex-wrap">
                {atrasadas.slice(0, 12).map(item => (
                  <CardSemana key={item.key} item={item} compacto
                    onDragStart={() => item.task && setArrastando(item.task)}
                    onDragEnd={() => { setArrastando(null); setDiaAlvo(null) }}
                    onOpenLead={onOpenLead} onToggleTask={onToggleTask} />
                ))}
                {atrasadas.length > 12 && (
                  <span className="text-red-300/70 text-[11px] self-center">+{atrasadas.length - 12}</span>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 grid grid-cols-7 gap-2 overflow-x-auto" style={{ minWidth: 720 }}>
            {diasDaSemana.map((dia, i) => {
              const doDia    = pendentes.filter(x => x.date === dia)
              const feitas   = filtrados.filter(x => x.task?.concluida && x.task.concluida_em?.slice(0, 10) === dia)
              const ehHoje   = dia === hoje
              const alvo     = diaAlvo === dia
              const [, m, d] = dia.split('-')
              return (
                <div key={dia}
                  onDragOver={e => { if (arrastando) { e.preventDefault(); setDiaAlvo(dia) } }}
                  onDragLeave={() => setDiaAlvo(cur => (cur === dia ? null : cur))}
                  onDrop={e => { e.preventDefault(); soltarNoDia(dia) }}
                  className={`flex flex-col min-h-0 rounded-2xl border transition-all
                    ${alvo ? 'bg-indigo-500/10 border-indigo-500/40'
                      : ehHoje ? 'bg-amber-500/[0.04] border-amber-500/25' : 'bg-slate-900/60 border-white/[0.07]'}`}>

                  <div className="px-3 pt-3 pb-2 border-b border-white/[0.05] shrink-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-[11px] font-semibold ${ehHoje ? 'text-amber-300' : 'text-slate-400'}`}>{DIAS_SEMANA[i]}</span>
                      <span className={`text-sm font-bold tabular-nums ${ehHoje ? 'text-white' : 'text-slate-300'}`}>{d}/{m}</span>
                      {doDia.length > 0 && (
                        <span className="ml-auto text-[10px] text-slate-300 bg-white/[0.06] px-1.5 rounded-full tabular-nums">{doDia.length}</span>
                      )}
                    </div>
                    {feitas.length > 0 && (
                      <p className="text-emerald-400/80 text-[10px] mt-0.5">{feitas.length} feita(s)</p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
                    {doDia.length === 0 && (
                      <div className={`flex items-center justify-center h-12 rounded-xl border border-dashed text-[10px]
                        ${alvo ? 'border-indigo-500/50 text-indigo-300' : 'border-white/[0.06] text-slate-600'}`}>
                        {alvo ? 'Soltar' : '—'}
                      </div>
                    )}
                    {doDia.map(item => (
                      <CardSemana key={item.key} item={item}
                        onDragStart={() => item.task && setArrastando(item.task)}
                        onDragEnd={() => { setArrastando(null); setDiaAlvo(null) }}
                        onOpenLead={onOpenLead} onToggleTask={onToggleTask} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Linha da lista ────────────────────────────────────────────────────────────

function LinhaAgenda({ item, hoje, onOpenLead, onToggleTask, onReschedule }: {
  item:         AgendaItem
  hoje:         string
  onOpenLead:   (id: string) => void
  onToggleTask: (t: CrmTask, concluida: boolean) => void
  onReschedule: (t: CrmTask, date: string) => void
}) {
  const canal    = canalOf(item.canal)
  const d        = diasAte(item.date)
  const atrasado = !item.task?.concluida && d !== null && d < 0
  const feita    = !!item.task?.concluida
  const tel      = soDigitos(item.lead.telefone)

  return (
    <div onClick={() => onOpenLead(item.lead.id)}
      className={`group flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors cursor-pointer
        ${feita ? 'bg-white/[0.015] border-white/[0.05]'
          : atrasado ? 'bg-red-500/[0.04] border-red-500/20 hover:border-red-500/35'
            : 'bg-white/[0.02] border-white/[0.07] hover:border-white/20'}`}>

      {item.task ? (
        <button onClick={e => { e.stopPropagation(); onToggleTask(item.task!, !feita) }}
          title={feita ? 'Reabrir tarefa' : 'Marcar como feita'}
          className={`shrink-0 p-1 rounded-lg transition-colors
            ${feita ? 'text-emerald-400 hover:text-slate-400' : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}>
          {feita ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        </button>
      ) : (
        <CalendarClock className="w-4 h-4 text-slate-500 shrink-0 ml-1" />
      )}

      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ring-1 shrink-0 ${canal.tone}`}>
        <canal.Icon className="w-3 h-3" />
        <span className="hidden sm:inline">{canal.label}</span>
      </span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${feita ? 'text-slate-500 line-through' : 'text-white'}`}>
          {item.titulo}
          {item.task?.dia_offset != null && (
            <span className="ml-2 text-[10px] font-normal text-slate-500">{labelDia(item.task.dia_offset)} da régua</span>
          )}
        </p>
        <p className="text-slate-400 text-[11px] truncate flex items-center gap-1">
          {item.lead.nome}
          {item.lead.empresa && <><Building2 className="w-3 h-3 shrink-0" />{item.lead.empresa}</>}
        </p>
      </div>

      {/* Ações rápidas */}
      <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {tel && (
          <>
            <a href={waLink(item.lead.telefone)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              title="Abrir WhatsApp"
              className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" />
            </a>
            <a href={`tel:${tel}`} onClick={e => e.stopPropagation()} title="Ligar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors">
              <Phone className="w-3.5 h-3.5" />
            </a>
          </>
        )}
        {item.task && !feita && (
          <button onClick={e => { e.stopPropagation(); onReschedule(item.task!, addDias(item.date && item.date > hoje ? item.date : hoje, 1)) }}
            title="Adiar 1 dia"
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors">
            <CalendarPlus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="text-right shrink-0">
        <p className={`text-xs font-semibold tabular-nums ${atrasado ? 'text-red-300' : feita ? 'text-slate-600' : 'text-slate-300'}`}>
          {item.date ? fmtDataBR(item.date) : 'sem data'}
        </p>
        {d !== null && !feita && (
          <p className="text-[10px] text-slate-500">
            {d < 0 ? `${Math.abs(d)}d atrasada` : d === 0 ? 'hoje' : `em ${d}d`}
          </p>
        )}
      </div>

      <Chevron className="w-4 h-4 text-slate-600 shrink-0" />
    </div>
  )
}

// ── Card da visão semana ──────────────────────────────────────────────────────

function CardSemana({ item, compacto, onDragStart, onDragEnd, onOpenLead, onToggleTask }: {
  item:         AgendaItem
  compacto?:    boolean
  onDragStart:  () => void
  onDragEnd:    () => void
  onOpenLead:   (id: string) => void
  onToggleTask: (t: CrmTask, concluida: boolean) => void
}) {
  const canal = canalOf(item.canal)
  const d     = diasAte(item.date)
  const atrasado = d !== null && d < 0

  return (
    <div draggable={!!item.task} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onClick={() => onOpenLead(item.lead.id)}
      title={`${item.titulo} — ${item.lead.nome}`}
      className={`rounded-xl border p-2 transition-colors ${item.task ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
        ${atrasado ? 'bg-red-500/[0.06] border-red-500/25 hover:border-red-500/40' : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'}
        ${compacto ? 'w-[190px]' : ''}`}>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${canal.dot}`} />
        <canal.Icon className="w-3 h-3 text-slate-400 shrink-0" />
        <p className="text-white text-[11px] font-medium truncate flex-1">{item.titulo}</p>
        {item.task && (
          <button onClick={e => { e.stopPropagation(); onToggleTask(item.task!, true) }}
            title="Marcar como feita"
            className="shrink-0 text-slate-600 hover:text-emerald-400 transition-colors">
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-slate-400 text-[10px] truncate mt-1">{item.lead.nome}</p>
    </div>
  )
}

// ── Cartão de resumo ──────────────────────────────────────────────────────────

function Resumo({ Icon, cor, label, valor, rodape, barra, destaque }: {
  Icon:      typeof Clock
  cor:       string
  label:     string
  valor:     number
  rodape:    string
  barra?:    number
  destaque?: boolean
}) {
  return (
    <div className={`p-4 rounded-2xl border ${destaque ? 'bg-red-500/[0.05] border-red-500/20' : 'bg-white/[0.02] border-white/[0.07]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${cor}`} />
        <span className="text-slate-400 text-[11px] font-medium">{label}</span>
      </div>
      <p className="text-white text-xl font-bold tabular-nums leading-none">{valor}</p>
      <p className="text-slate-500 text-[10px] mt-1.5">{rodape}</p>
      {barra !== undefined && (
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mt-2">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${barra}%` }} />
        </div>
      )}
    </div>
  )
}
