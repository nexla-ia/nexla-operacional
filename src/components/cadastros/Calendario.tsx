import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'

interface CalEvent {
  date: string
  label: string
  tipo: 'projeto' | 'mensalidade'
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

export default function Calendario() {
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalEvent[]>([])

  useEffect(() => { loadEvents() }, [year, month])

  async function loadEvents() {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const end   = `${year}-${String(month + 1).padStart(2, '0')}-31`

    const [{ data: projects }, { data: mensalidades }] = await Promise.all([
      supabase.from('projects').select('nome_projeto,data_termino').gte('data_termino', start).lte('data_termino', end),
      supabase.from('mensalidades').select('cliente_nome,dia_vencimento').eq('status', 'ativo'),
    ])

    const evts: CalEvent[] = []

    for (const p of projects ?? []) {
      if (p.data_termino) evts.push({ date: p.data_termino, label: p.nome_projeto, tipo: 'projeto' })
    }
    for (const m of mensalidades ?? []) {
      const d = String(m.dia_vencimento).padStart(2, '0')
      evts.push({
        date: `${year}-${String(month + 1).padStart(2, '0')}-${d}`,
        label: m.cliente_nome,
        tipo: 'mensalidade',
      })
    }
    setEvents(evts)
  }

  function prev() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function next() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  function eventsForDay(d: number) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return events.filter(e => e.date === key)
  }

  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white font-bold text-xl">Calendário</h1>
        <div className="flex items-center gap-2">
          <button onClick={prev} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-white font-semibold text-sm w-40 text-center">{MONTHS[month]} {year}</span>
          <button onClick={next} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />Prazo de projeto</div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-violet-500" />Vencimento mensalidade</div>
      </div>

      {/* Grid */}
      <div className="rounded-2xl bg-slate-900/70 border border-white/[0.07] overflow-hidden">
        {/* Cabeçalho dias */}
        <div className="grid grid-cols-7 border-b border-white/[0.07]">
          {DAYS.map(d => (
            <div key={d} className="px-2 py-3 text-center text-xs font-medium text-slate-500">{d}</div>
          ))}
        </div>
        {/* Células */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const dayEvents = day ? eventsForDay(day) : []
            return (
              <div key={idx}
                className={`min-h-[80px] p-2 border-r border-b border-white/[0.04] last:border-r-0 transition-colors
                  ${day ? 'hover:bg-white/[0.03]' : ''}
                  ${idx % 7 === 6 ? 'border-r-0' : ''}
                `}>
                {day && (
                  <>
                    <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-medium
                      ${isToday(day) ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 2).map((e, i) => (
                        <div key={i} className={`px-1.5 py-0.5 rounded text-[10px] truncate font-medium
                          ${e.tipo === 'projeto' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-violet-500/20 text-violet-300'}`}>
                          {e.label}
                        </div>
                      ))}
                      {dayEvents.length > 2 && <p className="text-[10px] text-slate-600 px-1">+{dayEvents.length - 2} mais</p>}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Eventos do mês */}
      {events.length > 0 && (
        <div className="mt-6">
          <h2 className="text-white font-semibold text-sm mb-3">Eventos de {MONTHS[month]}</h2>
          <div className="space-y-2">
            {events.sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/70 border border-white/[0.07]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${e.tipo === 'projeto' ? 'bg-indigo-500' : 'bg-violet-500'}`} />
                <span className="text-slate-200 text-sm flex-1 truncate">{e.label}</span>
                <span className="text-slate-500 text-xs shrink-0">{formatDate(e.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {events.length === 0 && (
        <div className="flex flex-col items-center justify-center h-24 text-center mt-4">
          <CalendarDays className="w-6 h-6 text-slate-700 mb-2" />
          <p className="text-slate-600 text-sm">Nenhum evento neste mês</p>
        </div>
      )}
    </>
  )
}
