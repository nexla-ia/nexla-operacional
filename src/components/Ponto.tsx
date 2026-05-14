import { useState, useEffect, useCallback } from 'react'
import { Clock, CheckCircle2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type PontoTipo = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida'

interface PontoRecord {
  id: string
  user_id: string
  tipo: PontoTipo
  registrado_em: string
  data: string
}

interface ProfileLight {
  id: string
  full_name: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<PontoTipo, string> = {
  entrada:        'Entrada',
  saida_almoco:   'Saída p/ Almoço',
  retorno_almoco: 'Retorno do Almoço',
  saida:          'Saída',
}

const TIPO_SHORT: Record<PontoTipo, string> = {
  entrada:        'Entrada',
  saida_almoco:   'S. Almoço',
  retorno_almoco: 'R. Almoço',
  saida:          'Saída',
}

const TIPO_TEXT: Record<PontoTipo, string> = {
  entrada:        'text-emerald-400',
  saida_almoco:   'text-amber-400',
  retorno_almoco: 'text-sky-400',
  saida:          'text-violet-400',
}

const TIPO_ORDER: PontoTipo[] = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida']

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0') }

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function fmtHoras(h: number) {
  const hh = Math.floor(Math.abs(h))
  const mm = Math.round((Math.abs(h) - hh) * 60)
  return `${pad2(hh)}:${pad2(mm)}`
}

function localDateStr(d: Date = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function calcHoras(punches: PontoRecord[]): number | null {
  const byTipo: Partial<Record<PontoTipo, PontoRecord>> = {}
  for (const p of punches) byTipo[p.tipo] = p

  const entrada = byTipo['entrada']
  const saida   = byTipo['saida']
  if (!entrada || !saida) return null

  let ms = new Date(saida.registrado_em).getTime() - new Date(entrada.registrado_em).getTime()

  const sa = byTipo['saida_almoco']
  const ra = byTipo['retorno_almoco']
  if (sa && ra) {
    ms -= new Date(ra.registrado_em).getTime() - new Date(sa.registrado_em).getTime()
  }

  return ms / 3_600_000
}

function nextTipo(punches: PontoRecord[]): PontoTipo | 'done' {
  const tipos = new Set(punches.map(p => p.tipo))
  for (const t of TIPO_ORDER) if (!tipos.has(t)) return t
  return 'done'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Ponto() {
  const [now, setNow]               = useState(new Date())
  const [userId, setUserId]         = useState<string | null>(null)
  const [role, setRole]             = useState<'admin' | 'operator' | null>(null)
  const [view, setView]             = useState<'meu' | 'equipe'>('meu')
  const [loading, setLoading]       = useState(true)
  const [punching, setPunching]     = useState(false)
  const [justPunched, setJustPunched] = useState<PontoTipo | null>(null)
  const [todayPunches, setTodayPunches] = useState<PontoRecord[]>([])
  const [weekPunches,  setWeekPunches]  = useState<PontoRecord[]>([])

  // Admin equipe state
  const [profiles, setProfiles]         = useState<ProfileLight[]>([])
  const [selectedUid, setSelectedUid]   = useState<string | null>(null)
  const [equipeMonth, setEquipeMonth]   = useState(localDateStr().slice(0, 7))
  const [equipeRecords, setEquipeRecords] = useState<PontoRecord[]>([])
  const [equipeLoading, setEquipeLoading] = useState(false)

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      setUserId(data.user.id)
      const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
      setRole((p?.role as 'admin' | 'operator') ?? 'operator')
    })
  }, [])

  const loadToday = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('ponto_registros')
      .select('*')
      .eq('user_id', userId)
      .eq('data', localDateStr())
      .order('registrado_em', { ascending: true })
    setTodayPunches((data ?? []) as PontoRecord[])
  }, [userId])

  const loadWeek = useCallback(async () => {
    if (!userId) return
    const today = new Date()
    const diff  = today.getDay() === 0 ? -6 : 1 - today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() + diff)
    const { data } = await supabase
      .from('ponto_registros')
      .select('*')
      .eq('user_id', userId)
      .gte('data', localDateStr(monday))
      .lte('data', localDateStr(today))
      .order('registrado_em', { ascending: true })
    setWeekPunches((data ?? []) as PontoRecord[])
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    Promise.all([loadToday(), loadWeek()]).finally(() => setLoading(false))
  }, [userId, loadToday, loadWeek])

  // Load profiles for equipe view
  useEffect(() => {
    if (role !== 'admin') return
    supabase.from('profiles').select('id,full_name').then(({ data }) => {
      const ps = (data ?? []) as ProfileLight[]
      setProfiles(ps)
      if (ps.length) setSelectedUid(ps[0].id)
    })
  }, [role])

  // Load equipe records
  useEffect(() => {
    if (!selectedUid || view !== 'equipe') return
    setEquipeLoading(true)
    const [y, m] = equipeMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    supabase
      .from('ponto_registros')
      .select('*')
      .eq('user_id', selectedUid)
      .gte('data', `${equipeMonth}-01`)
      .lte('data', `${equipeMonth}-${pad2(lastDay)}`)
      .order('registrado_em', { ascending: true })
      .then(({ data }) => {
        setEquipeRecords((data ?? []) as PontoRecord[])
        setEquipeLoading(false)
      })
  }, [selectedUid, equipeMonth, view])

  async function baterPonto() {
    if (!userId) return
    const tipo = nextTipo(todayPunches)
    if (tipo === 'done') return
    setPunching(true)
    const ts = new Date()
    const { error } = await supabase.from('ponto_registros').insert({
      tipo,
      registrado_em: ts.toISOString(),
      data: localDateStr(ts),
    })
    if (!error) {
      setJustPunched(tipo)
      setTimeout(() => setJustPunched(null), 3000)
      await Promise.all([loadToday(), loadWeek()])
    }
    setPunching(false)
  }

  function changeMonth(delta: number) {
    const [y, m] = equipeMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setEquipeMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const next    = nextTipo(todayPunches)
  const isDone  = next === 'done'
  const todayStr = localDateStr()

  // Week days Mon–Sun
  const dayOfWeek = now.getDay()
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek) + i)
    return d
  })
  const weekByDay: Record<string, PontoRecord[]> = {}
  for (const p of weekPunches) {
    if (!weekByDay[p.data]) weekByDay[p.data] = []
    weekByDay[p.data].push(p)
  }

  // Equipe month
  const [equipeY, equipeM] = equipeMonth.split('-').map(Number)
  const daysInMonth = new Date(equipeY, equipeM, 0).getDate()
  const monthDays: Date[] = Array.from({ length: daysInMonth }, (_, i) =>
    new Date(equipeY, equipeM - 1, i + 1)
  )
  const equipeByDay: Record<string, PontoRecord[]> = {}
  for (const p of equipeRecords) {
    if (!equipeByDay[p.data]) equipeByDay[p.data] = []
    equipeByDay[p.data].push(p)
  }

  const workdays = monthDays.filter(d => d.getDay() !== 0 && d.getDay() !== 6).length
  const monthTarget  = workdays * 8
  const monthWorked  = monthDays.reduce((acc, d) => {
    const h = calcHoras(equipeByDay[localDateStr(d)] ?? [])
    return acc + (h ?? 0)
  }, 0)
  const monthBalance = monthWorked - monthTarget

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between animate-stagger-1">
        <div>
          <h1 className="font-display text-white font-black text-3xl tracking-tight leading-none">Ponto</h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">
            {DIAS_FULL[now.getDay()]}, {now.getDate()} de {MESES[now.getMonth()]} de {now.getFullYear()}
          </p>
        </div>
        {role === 'admin' && (
          <div className="flex bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
            {(['meu', 'equipe'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150
                  ${view === v ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 hover:text-white'}`}>
                {v === 'meu' ? 'Meu Ponto' : 'Equipe'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Meu Ponto ─────────────────────────────────────────────────────── */}
      {view === 'meu' && (
        <>
          {/* Clock + Punch card */}
          <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-stagger-2">
            <div className="flex flex-col lg:flex-row">

              {/* Live clock */}
              <div className="flex-1 flex flex-col items-center justify-center py-10 px-8
                border-b lg:border-b-0 lg:border-r border-white/[0.05]">
                <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest mb-3">Agora</p>
                <p className="font-mono text-white font-bold leading-none select-none"
                  style={{ fontSize: 'clamp(52px, 8vw, 84px)', letterSpacing: '-0.03em' }}>
                  {pad2(now.getHours())}:{pad2(now.getMinutes())}
                  <span className="text-slate-600" style={{ fontSize: '0.45em' }}>:{pad2(now.getSeconds())}</span>
                </p>
              </div>

              {/* Punch area */}
              <div className="flex-1 flex flex-col items-center justify-center py-10 px-8 gap-5">
                {justPunched ? (
                  <div className="flex flex-col items-center gap-3 animate-fade-in-up">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/25 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                    <p className="text-emerald-300 font-semibold">{TIPO_LABELS[justPunched]} registrada</p>
                    <p className="text-slate-400 text-sm font-mono">{pad2(now.getHours())}:{pad2(now.getMinutes())}</p>
                  </div>
                ) : isDone ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/25 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-violet-400" />
                    </div>
                    <p className="text-slate-300 font-semibold">Ponto do dia concluído</p>
                    <p className="text-slate-500 text-sm">Até amanhã!</p>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={baterPonto}
                      disabled={punching || loading}
                      className="group relative flex flex-col items-center justify-center w-36 h-36 rounded-[2.5rem]
                        bg-gradient-to-br from-indigo-600 to-violet-600
                        shadow-2xl shadow-indigo-500/40
                        hover:shadow-indigo-500/60 hover:-translate-y-1
                        active:translate-y-0 active:scale-95
                        transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                      {punching
                        ? <Loader2 className="w-10 h-10 text-white animate-spin" />
                        : <Clock className="w-10 h-10 text-white group-hover:scale-110 transition-transform duration-200" />
                      }
                      <span className="text-white text-[10px] font-bold uppercase tracking-widest mt-2">
                        {punching ? 'Registrando…' : 'Bater Ponto'}
                      </span>
                    </button>
                    <p className="text-slate-400 text-sm text-center leading-relaxed">
                      Próximo registro:{' '}
                      <span className={`font-semibold ${next !== 'done' ? TIPO_TEXT[next] : ''}`}>
                        {next !== 'done' ? TIPO_LABELS[next] : ''}
                      </span>
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Today's 4 punch slots */}
            <div className="border-t border-white/[0.05] px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-4">Registros de hoje</p>
              {loading ? (
                <div className="flex items-center justify-center h-12">
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {TIPO_ORDER.map((tipo, idx) => {
                    const punch = todayPunches.find(p => p.tipo === tipo)
                    const isPast = (next !== 'done' && TIPO_ORDER.indexOf(next) > idx) || isDone
                    return (
                      <div key={tipo} className={`rounded-2xl px-4 py-3.5 border transition-all
                        ${punch
                          ? 'bg-white/[0.04] border-white/[0.08]'
                          : isPast && !isDone
                            ? 'bg-white/[0.02] border-white/[0.04] opacity-60'
                            : 'bg-white/[0.01] border-white/[0.03]'}`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5
                          ${punch ? TIPO_TEXT[tipo] : 'text-slate-600'}`}>
                          {TIPO_LABELS[tipo]}
                        </p>
                        <p className={`font-mono text-xl font-bold ${punch ? 'text-white' : 'text-slate-700'}`}>
                          {punch ? fmtTime(punch.registrado_em) : '—:——'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Week summary */}
          <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-stagger-3">
            <div className="px-6 py-4 border-b border-white/[0.05]">
              <h3 className="text-white font-semibold text-sm">Esta semana</h3>
            </div>
            {loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Dia</th>
                      {TIPO_ORDER.map(t => (
                        <th key={t} className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {TIPO_SHORT[t]}
                        </th>
                      ))}
                      <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekDays.map(d => {
                      const key     = localDateStr(d)
                      const punches = weekByDay[key] ?? []
                      const isToday = key === todayStr
                      const isWknd  = d.getDay() === 0 || d.getDay() === 6
                      const horas   = calcHoras(punches)
                      const extras  = horas !== null && !isWknd ? horas - 8 : null
                      return (
                        <tr key={key} className={`border-b border-white/[0.03] last:border-0 transition-colors
                          ${isToday ? 'bg-indigo-500/[0.05]' : isWknd ? 'opacity-30' : 'hover:bg-white/[0.02]'}`}>
                          <td className="px-5 py-3.5">
                            <span className={`font-semibold ${isToday ? 'text-indigo-300' : 'text-slate-300'}`}>
                              {DIAS[d.getDay()]}
                            </span>
                            <span className="text-slate-600 text-xs ml-2">{d.getDate()}/{d.getMonth() + 1}</span>
                          </td>
                          {TIPO_ORDER.map(tipo => {
                            const punch = punches.find(p => p.tipo === tipo)
                            return (
                              <td key={tipo} className="px-4 py-3.5 text-center">
                                <span className={`font-mono text-sm ${punch ? TIPO_TEXT[tipo] : 'text-slate-700'}`}>
                                  {punch ? fmtTime(punch.registrado_em) : '—'}
                                </span>
                              </td>
                            )
                          })}
                          <td className="px-5 py-3.5 text-right">
                            {horas !== null ? (
                              <span className="font-mono text-white text-sm font-semibold">
                                {fmtHoras(horas)}
                                {extras !== null && extras > 0.05 && (
                                  <span className="text-emerald-400 text-[10px] ml-1.5">+{fmtHoras(extras)}</span>
                                )}
                                {extras !== null && extras < -0.05 && (
                                  <span className="text-red-400 text-[10px] ml-1.5">-{fmtHoras(Math.abs(extras))}</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-700 font-mono text-sm">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Equipe view (admin only) ───────────────────────────────────────── */}
      {view === 'equipe' && role === 'admin' && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap gap-4 items-center animate-stagger-2">
            {/* Month nav */}
            <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
              <button onClick={() => changeMonth(-1)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white text-sm font-semibold px-3 min-w-[140px] text-center">
                {MESES[equipeM - 1]} {equipeY}
              </span>
              <button onClick={() => changeMonth(1)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Employee selector */}
            <div className="flex flex-wrap gap-2">
              {profiles.map(p => (
                <button key={p.id} onClick={() => setSelectedUid(p.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all
                    ${selectedUid === p.id
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                      : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-white hover:border-white/20'}`}>
                  {p.full_name || p.id.slice(0, 8)}
                </button>
              ))}
            </div>
          </div>

          {/* Month totals */}
          <div className="grid grid-cols-3 gap-4 animate-stagger-2">
            {[
              { label: 'Horas trabalhadas', value: fmtHoras(monthWorked), cls: 'text-white' },
              { label: 'Meta do mês', value: fmtHoras(monthTarget), cls: 'text-slate-400' },
              {
                label: 'Saldo de horas',
                value: (monthBalance >= 0 ? '+' : '-') + fmtHoras(Math.abs(monthBalance)),
                cls: monthBalance >= 0 ? 'text-emerald-400' : 'text-red-400',
              },
            ].map(item => (
              <div key={item.label} className="rounded-2xl bg-white/[0.02] border border-white/[0.06] px-5 py-4">
                <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`font-mono text-2xl font-bold ${item.cls}`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Monthly table */}
          <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-stagger-3">
            {equipeLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      <th className="px-4 py-3 text-left   text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-12">Dia</th>
                      <th className="px-3 py-3 text-left   text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-14">Sem.</th>
                      <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Entrada</th>
                      <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-amber-500">S. Almoço</th>
                      <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-sky-500">R. Almoço</th>
                      <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-violet-500">Saída</th>
                      <th className="px-4 py-3 text-right  text-[10px] font-semibold uppercase tracking-wider text-slate-500">Trabalhado</th>
                      <th className="px-4 py-3 text-right  text-[10px] font-semibold uppercase tracking-wider text-slate-500">Meta</th>
                      <th className="px-4 py-3 text-right  text-[10px] font-semibold uppercase tracking-wider text-slate-500">Extras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthDays.map(d => {
                      const key     = localDateStr(d)
                      const punches = equipeByDay[key] ?? []
                      const isToday = key === todayStr
                      const isWknd  = d.getDay() === 0 || d.getDay() === 6
                      const horas   = calcHoras(punches)
                      const extras  = horas !== null && !isWknd ? horas - 8 : null
                      const byTipo: Partial<Record<PontoTipo, PontoRecord>> = {}
                      for (const p of punches) byTipo[p.tipo] = p

                      return (
                        <tr key={key} className={`border-b border-white/[0.03] last:border-0 transition-colors
                          ${isToday ? 'bg-indigo-500/[0.06]' : isWknd ? 'opacity-30' : 'hover:bg-white/[0.02]'}`}>
                          <td className="px-4 py-2.5">
                            <span className={`font-mono text-base font-bold ${isToday ? 'text-indigo-300' : 'text-slate-300'}`}>
                              {pad2(d.getDate())}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{DIAS[d.getDay()]}</td>
                          {TIPO_ORDER.map(tipo => {
                            const punch = byTipo[tipo]
                            return (
                              <td key={tipo} className="px-4 py-2.5 text-center">
                                <span className={`font-mono text-sm ${punch ? TIPO_TEXT[tipo] : 'text-slate-700'}`}>
                                  {punch ? fmtTime(punch.registrado_em) : isWknd ? '—' : '·'}
                                </span>
                              </td>
                            )
                          })}
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-mono text-sm ${horas !== null ? 'text-white font-semibold' : 'text-slate-700'}`}>
                              {horas !== null ? fmtHoras(horas) : isWknd ? '—' : '·'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="font-mono text-sm text-slate-600">
                              {isWknd ? '—' : '08:00'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {extras !== null ? (
                              <span className={`font-mono text-sm font-semibold ${extras >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {extras >= 0 ? '+' : '-'}{fmtHoras(Math.abs(extras))}
                              </span>
                            ) : (
                              <span className="text-slate-700 font-mono text-sm">{isWknd ? '—' : '·'}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
