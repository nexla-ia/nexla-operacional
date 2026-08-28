import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, Calendar as CalIcon, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'

type TipoEvento = 'projeto' | 'mensalidade' | 'reuniao' | 'evento'
type EventSource = 'cal_event' | 'project' | 'mensalidade'

interface CalEvent {
  id?: string
  date: string        // YYYY-MM-DD
  time?: string       // HH:MM
  label: string
  tipo: TipoEvento
  description?: string
  source: EventSource
}

const TIPO: Record<TipoEvento, { label: string; text: string; bg: string; dot: string; border: string }> = {
  projeto:     { label: 'Projeto',     text: 'text-indigo-300', bg: 'bg-indigo-500/20',  dot: 'bg-indigo-400',  border: 'border-indigo-500/30' },
  mensalidade: { label: 'Mensalidade', text: 'text-violet-300', bg: 'bg-violet-500/20',  dot: 'bg-violet-400',  border: 'border-violet-500/30' },
  reuniao:     { label: 'Reunião',     text: 'text-amber-300',  bg: 'bg-amber-500/20',   dot: 'bg-amber-400',   border: 'border-amber-500/30'  },
  evento:      { label: 'Evento',      text: 'text-emerald-300',bg: 'bg-emerald-500/20', dot: 'bg-emerald-400', border: 'border-emerald-500/30'},
}

const MONTHS  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS    = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const TIPOS   : TipoEvento[] = ['projeto', 'mensalidade', 'reuniao', 'evento']

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-300 mb-1.5'

// ── Modal: eventos do dia ─────────────────────────────────────────────────────

function DayModal({ day, year, month, events, onClose, onAdd }: {
  day: number
  year: number
  month: number
  events: CalEvent[]
  onClose: () => void
  onAdd: (date: string) => void
}) {
  const dateStr   = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  const dayName   = DAYS[new Date(year, month, day).getDay()]
  const sorted    = [...events].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-slate-900 border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden">
        {/* cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div>
            <p className="text-slate-300 text-xs uppercase tracking-wide">{dayName}</p>
            <p className="text-white font-bold text-lg mt-0.5">{formatDate(dateStr)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { onClose(); onAdd(dateStr) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 text-xs font-medium hover:bg-indigo-500/25 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* lista */}
        <div className="px-4 py-4 space-y-2 max-h-80 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <CalIcon className="w-8 h-8 text-slate-300" />
              <p className="text-slate-300 text-sm">Nenhum evento neste dia</p>
            </div>
          ) : sorted.map((e, i) => (
            <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl ${TIPO[e.tipo].bg} border ${TIPO[e.tipo].border}`}>
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TIPO[e.tipo].dot}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${TIPO[e.tipo].text}`}>{e.label}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-slate-300 text-xs">{TIPO[e.tipo].label}</span>
                  {e.time && (
                    <span className="text-slate-300 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />{e.time.slice(0, 5)}
                    </span>
                  )}
                </div>
                {e.description && <p className="text-slate-300 text-xs mt-1 line-clamp-2">{e.description}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Modal: novo evento ────────────────────────────────────────────────────────

function NovoEventoModal({ defaultDate, onCreated, onClose }: {
  defaultDate?: string
  onCreated: () => void
  onClose: () => void
}) {
  const [title, setTitle]   = useState('')
  const [date,  setDate]    = useState(defaultDate ?? '')
  const [time,  setTime]    = useState('')
  const [desc,  setDesc]    = useState('')
  const [tipo,  setTipo]    = useState<'reuniao' | 'evento'>('evento')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const { error: err } = await supabase.from('cal_events').insert({
      title,
      date,
      time: time || null,
      description: desc || null,
      tipo,
    })

    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
              <CalIcon className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-white font-semibold text-base">Novo Evento</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-7 py-6 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
          )}

          {/* tipo */}
          <div>
            <label className={labelCls}>Tipo</label>
            <div className="flex gap-2">
              {(['reuniao', 'evento'] as const).map(t => (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all
                    ${tipo === t
                      ? `${TIPO[t].bg} ${TIPO[t].border} ${TIPO[t].text}`
                      : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                  {TIPO[t].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Título *</label>
            <input className={inputCls} placeholder="Nome do evento" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Data *</label>
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Horário</label>
              <input type="time" className={inputCls} value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Descrição</label>
            <textarea className={`${inputCls} resize-none`} rows={2}
              placeholder="Detalhes opcionais…" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/25 disabled:opacity-60 hover:-translate-y-0.5 transition-all duration-300">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando…</span>
                : 'Salvar Evento'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-slate-300 text-sm bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Calendário principal ──────────────────────────────────────────────────────

export default function Calendario({ role }: { role?: 'admin' | 'operator' | null }) {
  // Operador não tem acesso a Projetos nem ao financeiro — o calendário dele
  // mostra só os eventos criados à mão (reuniões e eventos).
  const isOperator = role === 'operator'
  const tiposVisiveis = isOperator ? TIPOS.filter(t => t === 'reuniao' || t === 'evento') : TIPOS

  const today = new Date()
  const [year,   setYear]   = useState(today.getFullYear())
  const [month,  setMonth]  = useState(today.getMonth())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)

  const [filters, setFilters] = useState<Record<TipoEvento, boolean>>({
    projeto: true, mensalidade: true, reuniao: true, evento: true,
  })

  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [novoModal,   setNovoModal]   = useState(false)
  const [novoDate,    setNovoDate]    = useState<string | undefined>()
  const [draggingId,  setDraggingId]  = useState<string | null>(null)
  const [dragOverDay, setDragOverDay] = useState<number | null>(null)

  useEffect(() => { loadEvents() }, [year, month, isOperator])

  async function loadEvents() {
    setLoading(true)
    const mm   = String(month + 1).padStart(2, '0')
    const last = new Date(year, month + 1, 0).getDate()
    const start = `${year}-${mm}-01`
    const end   = `${year}-${mm}-${last}`

    const { data: calEvts } = await supabase.from('cal_events').select('*').gte('date', start).lte('date', end)

    let projects:     { nome_projeto: string; data_termino: string }[] = []
    let mensalidades: { cliente_nome: string; dia_vencimento: number }[] = []

    if (!isOperator) {
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from('projects').select('nome_projeto,data_termino')
          .gte('data_termino', start).lte('data_termino', end),
        supabase.from('mensalidades').select('cliente_nome,dia_vencimento').eq('status', 'ativo'),
      ])
      projects     = (p ?? []) as typeof projects
      mensalidades = (m ?? []) as typeof mensalidades
    }

    const evts: CalEvent[] = []

    for (const p of projects) {
      if (p.data_termino) evts.push({ date: p.data_termino, label: p.nome_projeto, tipo: 'projeto', source: 'project' })
    }
    for (const m of mensalidades) {
      const d = String(m.dia_vencimento).padStart(2, '0')
      evts.push({ date: `${year}-${mm}-${d}`, label: m.cliente_nome, tipo: 'mensalidade', source: 'mensalidade' })
    }
    for (const c of calEvts ?? []) {
      evts.push({
        id: c.id, date: c.date, time: c.time ?? undefined,
        label: c.title, tipo: c.tipo as TipoEvento, description: c.description ?? undefined,
        source: 'cal_event',
      })
    }

    setEvents(evts)
    setLoading(false)
  }

  function prev()   { month === 0  ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1) }
  function next()   { month === 11 ? (setMonth(0),  setYear(y => y + 1)) : setMonth(m => m + 1) }
  function goToday(){ setYear(today.getFullYear()); setMonth(today.getMonth()) }

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells       = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)] as (number | null)[]

  function eventsForDay(d: number) {
    const key = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return events.filter(e => e.date === key && filters[e.tipo])
  }

  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const toggleFilter = (t: TipoEvento) => setFilters(f => ({ ...f, [t]: !f[t] }))

  function openAdd(date?: string) {
    setNovoDate(date)
    setNovoModal(true)
  }

  async function moveEvent(eventId: string, newDay: number) {
    const newDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`
    // Otimista: atualiza estado local
    setEvents(es => es.map(e => e.id === eventId ? { ...e, date: newDate } : e))
    const { error } = await supabase.from('cal_events').update({ date: newDate }).eq('id', eventId)
    if (error) {
      // rollback recarregando do banco
      loadEvents()
    }
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-white font-bold text-xl">Calendário</h1>
          <button onClick={goToday}
            className="px-3 py-1 rounded-lg text-xs font-medium text-slate-300 bg-white/[0.05] border border-white/[0.08] hover:text-white hover:bg-white/[0.08] transition-colors">
            Hoje
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={prev}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-white font-semibold text-sm w-44 text-center select-none">
            {MONTHS[month]} {year}
          </span>
          <button onClick={next}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => openAdd()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 ml-2 hover:-translate-y-0.5 transition-all duration-300">
            <Plus className="w-4 h-4" /> Novo Evento
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {tiposVisiveis.map(t => (
          <button key={t} onClick={() => toggleFilter(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
              ${filters[t]
                ? `${TIPO[t].bg} ${TIPO[t].text} ${TIPO[t].border}`
                : 'bg-transparent text-slate-300 border-white/[0.06] hover:border-white/10 hover:text-slate-300'}`}>
            <span className={`w-2 h-2 rounded-full ${filters[t] ? TIPO[t].dot : 'bg-slate-700'}`} />
            {TIPO[t].label}
          </button>
        ))}
      </div>

      {/* ── Grade do calendário ── */}
      <div className="rounded-2xl bg-slate-900/70 border border-white/[0.07] overflow-hidden">
        {/* dias da semana */}
        <div className="grid grid-cols-7 border-b border-white/[0.07]">
          {DAYS.map(d => (
            <div key={d} className="py-3 text-center text-xs font-medium text-slate-300 select-none">{d}</div>
          ))}
        </div>

        {/* células */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              const dayEvts = day ? eventsForDay(day) : []
              const visible = dayEvts.slice(0, 3)
              const extra   = dayEvts.length - 3

              const isDropTarget = day !== null && dragOverDay === day && draggingId !== null
              return (
                <div key={idx}
                  onClick={() => day && setSelectedDay(day)}
                  onDragOver={day ? (e) => {
                    if (!draggingId) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dragOverDay !== day) setDragOverDay(day)
                  } : undefined}
                  onDragLeave={day ? () => {
                    if (dragOverDay === day) setDragOverDay(null)
                  } : undefined}
                  onDrop={day ? (e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain') || draggingId
                    setDragOverDay(null)
                    setDraggingId(null)
                    if (id) moveEvent(id, day)
                  } : undefined}
                  className={`min-h-[100px] p-1.5 border-r border-b border-white/[0.04] relative group transition-all
                    ${idx % 7 === 6 ? 'border-r-0' : ''}
                    ${day ? 'cursor-pointer hover:bg-white/[0.025]' : 'bg-white/[0.01]'}
                    ${isDropTarget ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/40' : ''}
                  `}>
                  {day && (
                    <>
                      {/* número do dia */}
                      <div className="flex justify-end mb-1">
                        <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold select-none transition-colors
                          ${isToday(day)
                            ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40'
                            : dayEvts.length > 0
                              ? 'text-white group-hover:bg-white/[0.08]'
                              : 'text-slate-300 group-hover:bg-white/[0.08]'}`}>
                          {day}
                        </span>
                      </div>

                      {/* chips de evento */}
                      <div className="space-y-0.5">
                        {visible.map((e, i) => {
                          const isDraggable = e.source === 'cal_event' && !!e.id
                          const isBeingDragged = isDraggable && draggingId === e.id
                          return (
                            <div key={i}
                              draggable={isDraggable}
                              onDragStart={isDraggable ? (ev) => {
                                ev.stopPropagation()
                                ev.dataTransfer.effectAllowed = 'move'
                                ev.dataTransfer.setData('text/plain', e.id!)
                                setDraggingId(e.id!)
                              } : undefined}
                              onDragEnd={isDraggable ? () => {
                                setDraggingId(null)
                                setDragOverDay(null)
                              } : undefined}
                              onClick={isDraggable ? (ev) => ev.stopPropagation() : undefined}
                              title={isDraggable ? 'Arraste para mover de dia' : undefined}
                              className={`px-1.5 py-0.5 rounded text-[10px] truncate font-medium leading-tight transition-opacity
                                ${TIPO[e.tipo].bg} ${TIPO[e.tipo].text}
                                ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}
                                ${isBeingDragged ? 'opacity-40' : ''}`}>
                              {e.time && (
                                <span className="opacity-60 mr-1 font-normal">{e.time.slice(0,5)}</span>
                              )}
                              {e.label}
                            </div>
                          )
                        })}
                        {extra > 0 && (
                          <p className="text-[10px] text-slate-300 px-1 leading-tight">+{extra} mais</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Lista de eventos do mês ── */}
      {!loading && (
        <div className="mt-6">
          {(() => {
            const filtered = events
              .filter(e => filters[e.tipo])
              .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
            return filtered.length > 0 ? (
              <>
                <h2 className="text-white font-semibold text-sm mb-3">
                  Eventos de {MONTHS[month]}
                  <span className="ml-2 text-slate-300 font-normal">({filtered.length})</span>
                </h2>
                <div className="space-y-1.5">
                  {filtered.map((e, i) => (
                    <div key={i}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/70 border border-white/[0.06] hover:border-white/[0.10] transition-colors">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TIPO[e.tipo].dot}`} />
                      <span className="text-slate-200 text-sm flex-1 truncate">{e.label}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        {e.time && (
                          <span className="text-slate-300 text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3" />{e.time.slice(0,5)}
                          </span>
                        )}
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TIPO[e.tipo].bg} ${TIPO[e.tipo].text}`}>
                          {TIPO[e.tipo].label}
                        </span>
                        <span className="text-slate-300 text-xs">{formatDate(e.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-20 gap-2">
                <CalIcon className="w-6 h-6 text-slate-300" />
                <p className="text-slate-300 text-sm">Nenhum evento neste mês</p>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Modais ── */}
      {selectedDay !== null && (
        <DayModal
          day={selectedDay}
          year={year}
          month={month}
          events={eventsForDay(selectedDay)}
          onClose={() => setSelectedDay(null)}
          onAdd={(date) => { setSelectedDay(null); openAdd(date) }}
        />
      )}

      {novoModal && (
        <NovoEventoModal
          defaultDate={novoDate}
          onCreated={loadEvents}
          onClose={() => setNovoModal(false)}
        />
      )}
    </>
  )
}
