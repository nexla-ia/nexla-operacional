import { useState, useEffect, useCallback, Fragment } from 'react'
import { CheckCircle2, Loader2, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type PontoTipo      = 'entrada' | 'saida_almoco' | 'retorno_almoco' | 'saida'
type PresenceStatus = 'ausente' | 'trabalhando' | 'almoco' | 'retornou' | 'encerrou'

interface PontoRecord {
  id: string; user_id: string; tipo: PontoTipo
  registrado_em: string; data: string
}
interface ProfileLight { id: string; full_name: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPO_ORDER: PontoTipo[] = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida']
const TIPO_LABELS: Record<PontoTipo, string> = {
  entrada: 'Entrada', saida_almoco: 'Saída p/ Almoço',
  retorno_almoco: 'Retorno do Almoço', saida: 'Saída',
}
const TIPO_SHORT: Record<PontoTipo, string> = {
  entrada: 'Entrada', saida_almoco: 'Almoço',
  retorno_almoco: 'Retorno', saida: 'Saída',
}

const C: Record<PontoTipo | 'done', { hex: string; ring: string; glow: string; bg: string }> = {
  entrada:        { hex: '#34d399', ring: 'rgba(52,211,153,0.55)',  glow: 'rgba(52,211,153,0.18)',  bg: 'rgba(52,211,153,0.07)'  },
  saida_almoco:   { hex: '#fbbf24', ring: 'rgba(251,191,36,0.55)',  glow: 'rgba(251,191,36,0.18)',  bg: 'rgba(251,191,36,0.07)'  },
  retorno_almoco: { hex: '#38bdf8', ring: 'rgba(56,189,248,0.55)',  glow: 'rgba(56,189,248,0.18)',  bg: 'rgba(56,189,248,0.07)'  },
  saida:          { hex: '#a78bfa', ring: 'rgba(167,139,250,0.55)', glow: 'rgba(167,139,250,0.18)', bg: 'rgba(167,139,250,0.07)' },
  done:           { hex: '#818cf8', ring: 'rgba(129,140,248,0.3)',  glow: 'rgba(129,140,248,0.1)',  bg: 'rgba(129,140,248,0.05)' },
}

const STATUS_CFG: Record<PresenceStatus, { label: string; cls: string; dot: string }> = {
  ausente:     { label: 'Não registrou', cls: 'text-slate-500',   dot: '#475569' },
  trabalhando: { label: 'Trabalhando',   cls: 'text-emerald-400', dot: '#34d399' },
  almoco:      { label: 'Almoço',        cls: 'text-amber-400',   dot: '#fbbf24' },
  retornou:    { label: 'Retornou',      cls: 'text-sky-400',     dot: '#38bdf8' },
  encerrou:    { label: 'Encerrou',      cls: 'text-violet-400',  dot: '#a78bfa' },
}

const DIAS_FULL = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0') }
function fmtTime(iso: string) { const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }
function fmtHoras(h: number) {
  const hh = Math.floor(Math.abs(h)); const mm = Math.round((Math.abs(h) - hh) * 60)
  return `${pad2(hh)}:${pad2(mm)}`
}
function localDateStr(d: Date = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function calcHoras(punches: PontoRecord[]): number | null {
  const m: Partial<Record<PontoTipo, PontoRecord>> = {}
  for (const p of punches) m[p.tipo] = p
  if (!m.entrada || !m.saida) return null
  let ms = new Date(m.saida.registrado_em).getTime() - new Date(m.entrada.registrado_em).getTime()
  if (m.saida_almoco && m.retorno_almoco)
    ms -= new Date(m.retorno_almoco.registrado_em).getTime() - new Date(m.saida_almoco.registrado_em).getTime()
  return ms / 3_600_000
}
function calcElapsed(punches: PontoRecord[], now: Date): number | null {
  const m: Partial<Record<PontoTipo, PontoRecord>> = {}
  for (const p of punches) m[p.tipo] = p
  if (!m.entrada) return null
  let ms = now.getTime() - new Date(m.entrada.registrado_em).getTime()
  if (m.saida_almoco && m.retorno_almoco)
    ms -= new Date(m.retorno_almoco.registrado_em).getTime() - new Date(m.saida_almoco.registrado_em).getTime()
  else if (m.saida_almoco && !m.retorno_almoco)
    ms -= now.getTime() - new Date(m.saida_almoco.registrado_em).getTime()
  return Math.max(0, ms / 3_600_000)
}
function getStatus(punches: PontoRecord[]): PresenceStatus {
  const t = new Set(punches.map(p => p.tipo))
  if (t.has('saida')) return 'encerrou'
  if (t.has('retorno_almoco')) return 'retornou'
  if (t.has('saida_almoco')) return 'almoco'
  if (t.has('entrada')) return 'trabalhando'
  return 'ausente'
}
function nextTipo(punches: PontoRecord[]): PontoTipo | 'done' {
  const t = new Set(punches.map(p => p.tipo))
  for (const tp of TIPO_ORDER) if (!t.has(tp)) return tp
  return 'done'
}
function byTipoMap(punches: PontoRecord[]): Partial<Record<PontoTipo, PontoRecord>> {
  const m: Partial<Record<PontoTipo, PontoRecord>> = {}
  for (const p of punches) m[p.tipo] = p
  return m
}

// ── PresencaCard (admin Hoje) ─────────────────────────────────────────────────

function PresencaCard({ profile, punches, now }: {
  profile: ProfileLight; punches: PontoRecord[]; now: Date
}) {
  const status   = getStatus(punches)
  const cfg      = STATUS_CFG[status]
  const bm       = byTipoMap(punches)
  const horas    = calcHoras(punches)
  const elapsed  = status !== 'encerrou' && status !== 'ausente' ? calcElapsed(punches, now) : null
  const balance  = horas !== null ? horas - 8 : null
  const isActive = status === 'trabalhando' || status === 'retornou'

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 flex flex-col gap-4 hover:border-white/[0.12] transition-colors">

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ring-1 ring-indigo-500/20"
            style={{ background: 'rgba(99,102,241,0.12)' }}>
            <span className="text-indigo-300 text-sm font-bold">
              {(profile.full_name || 'U').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-tight">{profile.full_name || 'Sem nome'}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'ponto-ping' : ''}`}
                style={{ background: cfg.dot }} />
              <span className={`text-[11px] font-semibold ${cfg.cls}`}>{cfg.label}</span>
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          {status === 'encerrou' && horas !== null ? (
            <>
              <p className="font-mono text-white text-base font-bold leading-none">{fmtHoras(horas)}</p>
              {balance !== null && (
                <p className={`font-mono text-[11px] font-semibold mt-0.5 ${balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {balance >= 0 ? '+' : '–'}{fmtHoras(Math.abs(balance))}
                </p>
              )}
            </>
          ) : elapsed !== null ? (
            <>
              <p className="font-mono text-slate-300 text-base font-bold leading-none">{fmtHoras(elapsed)}</p>
              <p className="text-[10px] text-slate-600 font-medium mt-0.5">em curso</p>
            </>
          ) : null}
        </div>
      </div>

      {/* 4 punch slots */}
      <div className="grid grid-cols-2 gap-2">
        {TIPO_ORDER.map(tipo => {
          const punch = bm[tipo]
          const col = C[tipo]
          return (
            <div key={tipo} className={`rounded-xl px-3 py-2.5 border transition-all
              ${punch ? 'border-white/[0.08]' : 'border-white/[0.03]'}`}
              style={{ background: punch ? col.bg : 'rgba(255,255,255,0.01)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                style={{ color: punch ? col.hex : '#334155' }}>
                {TIPO_SHORT[tipo]}
              </p>
              <p className={`font-mono text-lg font-bold leading-none ${punch ? 'text-white' : 'text-slate-700'}`}>
                {punch ? fmtTime(punch.registrado_em) : '—:——'}
              </p>
            </div>
          )
        })}
      </div>

      {/* Balance bar (only when encerrou) */}
      {status === 'encerrou' && horas !== null && (
        <div className="mt-1">
          <div className="flex justify-between text-[10px] text-slate-600 font-medium mb-1">
            <span>0h</span><span>8h (meta)</span><span>10h</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (horas / 10) * 100)}%`,
                background: horas >= 8 ? '#34d399' : '#f87171',
              }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Ponto() {
  const [now, setNow]               = useState(new Date())
  const [userId, setUserId]         = useState<string | null>(null)
  const [role, setRole]             = useState<'admin' | 'operator' | null>(null)
  const [view, setView]             = useState<'meu' | 'hoje' | 'equipe'>('meu')
  const [loading, setLoading]       = useState(true)
  const [punching, setPunching]     = useState(false)
  const [rippling, setRippling]     = useState(false)
  const [justPunched, setJustPunched] = useState<PontoTipo | null>(null)
  const [todayPunches, setTodayPunches] = useState<PontoRecord[]>([])
  const [weekPunches,  setWeekPunches]  = useState<PontoRecord[]>([])

  // Admin
  const [profiles, setProfiles]         = useState<ProfileLight[]>([])
  const [hojeAll, setHojeAll]           = useState<PontoRecord[]>([])
  const [hojeLoading, setHojeLoading]   = useState(false)
  const [selectedUid, setSelectedUid]   = useState<string | null>(null)
  const [equipeMonth, setEquipeMonth]   = useState(localDateStr().slice(0, 7))
  const [equipeRecords, setEquipeRecords] = useState<PontoRecord[]>([])
  const [equipeLoading, setEquipeLoading] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

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
      .from('ponto_registros').select('*').eq('user_id', userId).eq('data', localDateStr())
      .order('registrado_em', { ascending: true })
    setTodayPunches((data ?? []) as PontoRecord[])
  }, [userId])

  const loadWeek = useCallback(async () => {
    if (!userId) return
    const today = new Date()
    const monday = new Date(today)
    monday.setDate(today.getDate() + (today.getDay() === 0 ? -6 : 1 - today.getDay()))
    const { data } = await supabase
      .from('ponto_registros').select('*').eq('user_id', userId)
      .gte('data', localDateStr(monday)).lte('data', localDateStr(today))
      .order('registrado_em', { ascending: true })
    setWeekPunches((data ?? []) as PontoRecord[])
  }, [userId])

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    Promise.all([loadToday(), loadWeek()]).finally(() => setLoading(false))
  }, [userId, loadToday, loadWeek])

  useEffect(() => {
    if (role !== 'admin') return
    supabase.from('profiles').select('id,full_name').then(({ data }) => {
      const ps = (data ?? []) as ProfileLight[]
      setProfiles(ps)
      if (ps.length) setSelectedUid(ps[0].id)
    })
  }, [role])

  useEffect(() => {
    if (role !== 'admin' || view !== 'hoje') return
    setHojeLoading(true)
    supabase.from('ponto_registros').select('*').eq('data', localDateStr())
      .order('registrado_em', { ascending: true })
      .then(({ data }) => { setHojeAll((data ?? []) as PontoRecord[]); setHojeLoading(false) })
  }, [role, view])

  useEffect(() => {
    if (!selectedUid || view !== 'equipe') return
    setEquipeLoading(true)
    const [y, m] = equipeMonth.split('-').map(Number)
    supabase.from('ponto_registros').select('*').eq('user_id', selectedUid)
      .gte('data', `${equipeMonth}-01`).lte('data', `${equipeMonth}-${pad2(new Date(y, m, 0).getDate())}`)
      .order('registrado_em', { ascending: true })
      .then(({ data }) => { setEquipeRecords((data ?? []) as PontoRecord[]); setEquipeLoading(false) })
  }, [selectedUid, equipeMonth, view])

  async function baterPonto() {
    if (!userId) return
    const tipo = nextTipo(todayPunches)
    if (tipo === 'done') return
    setRippling(true); setPunching(true)
    setTimeout(() => setRippling(false), 600)
    const ts = new Date()
    const { error } = await supabase.from('ponto_registros').insert({
      tipo, registrado_em: ts.toISOString(), data: localDateStr(ts),
    })
    if (!error) {
      setJustPunched(tipo)
      setTimeout(() => setJustPunched(null), 3500)
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

  const next         = nextTipo(todayPunches)
  const isDone       = next === 'done'
  const todayStr     = localDateStr()
  const activeColor  = isDone ? C['done'] : next !== 'done' ? C[next] : C['done']
  const bm           = byTipoMap(todayPunches)

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

  const hojeByUser: Record<string, PontoRecord[]> = {}
  for (const p of hojeAll) {
    if (!hojeByUser[p.user_id]) hojeByUser[p.user_id] = []
    hojeByUser[p.user_id].push(p)
  }

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
  const monthWorked  = monthDays.reduce((acc, d) => acc + (calcHoras(equipeByDay[localDateStr(d)] ?? []) ?? 0), 0)
  const monthBalance = monthWorked - workdays * 8

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between animate-stagger-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">
            {DIAS_FULL[now.getDay()]}
          </p>
          <h1 className="font-display text-white font-black text-3xl tracking-tight leading-none">Ponto</h1>
        </div>
        {role === 'admin' && (
          <div className="flex bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
            {(['meu', 'hoje', 'equipe'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 capitalize
                  ${view === v ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25' : 'text-slate-400 hover:text-white'}`}>
                {v === 'meu' ? 'Meu Ponto' : v === 'hoje' ? 'Hoje' : 'Equipe'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══ MEU PONTO ════════════════════════════════════════════════════════ */}
      {view === 'meu' && (
        <>
          {/* Hero card: clock + progress + button */}
          <div className="rounded-3xl border overflow-hidden animate-stagger-2 relative"
            style={{
              borderColor: 'rgba(255,255,255,0.07)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)',
            }}>

            {/* Atmospheric glow behind button */}
            <div className="absolute right-1/4 top-1/2 -translate-y-1/2 w-64 h-64 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${activeColor.glow} 0%, transparent 70%)`,
                transition: 'background 0.6s ease',
              }} />

            <div className="relative flex flex-col lg:flex-row">

              {/* Clock section */}
              <div className="flex-1 px-8 pt-8 pb-6 lg:pb-8 border-b lg:border-b-0 lg:border-r border-white/[0.05]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 mb-5">
                  {now.getDate()} de {MESES[now.getMonth()]} · {now.getFullYear()}
                </p>

                {/* Giant clock */}
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="font-mono text-white font-bold select-none"
                    style={{ fontSize: 'clamp(56px, 10vw, 88px)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                    {pad2(now.getHours())}
                  </span>
                  <span className="font-mono font-bold text-slate-500 select-none"
                    style={{ fontSize: 'clamp(48px, 8vw, 72px)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                    :
                  </span>
                  <span className="font-mono text-white font-bold select-none"
                    style={{ fontSize: 'clamp(56px, 10vw, 88px)', letterSpacing: '-0.04em', lineHeight: 1 }}>
                    {pad2(now.getMinutes())}
                  </span>
                  <span className="font-mono text-slate-600 font-bold select-none self-end pb-1"
                    style={{ fontSize: 'clamp(20px, 3vw, 32px)', letterSpacing: '-0.04em' }}>
                    :{pad2(now.getSeconds())}
                  </span>
                </div>

                {/* Progress trail */}
                <div className="flex items-center gap-0">
                  {TIPO_ORDER.map((tipo, idx) => {
                    const done    = !!bm[tipo]
                    const isCurr  = next === tipo
                    const col     = C[tipo]
                    const punch   = bm[tipo]
                    return (
                      <Fragment key={tipo}>
                        {idx > 0 && (
                          <div className="flex-1 h-[2px] relative mx-1">
                            <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                            {!!bm[TIPO_ORDER[idx - 1]] && (
                              <div className="absolute inset-0 rounded-full transition-all duration-700"
                                style={{ background: C[TIPO_ORDER[idx - 1]].hex }} />
                            )}
                          </div>
                        )}
                        <div className="shrink-0 flex flex-col items-center gap-1.5">
                          {/* Node */}
                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300`}
                            style={{
                              borderColor: done || isCurr ? col.ring : 'rgba(255,255,255,0.1)',
                              background: done ? col.bg : isCurr ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.02)',
                              boxShadow: isCurr ? `0 0 14px ${col.glow}` : 'none',
                            }}>
                            {done
                              ? <Check className="w-3 h-3" style={{ color: col.hex }} />
                              : isCurr
                                ? <div className="w-2 h-2 rounded-full ponto-ping" style={{ background: col.hex }} />
                                : null}
                          </div>
                          {/* Label */}
                          <p className="text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap"
                            style={{ color: done ? col.hex : isCurr ? 'rgba(255,255,255,0.7)' : '#334155' }}>
                            {TIPO_SHORT[tipo]}
                          </p>
                          {/* Time */}
                          <p className="font-mono text-[10px] font-bold"
                            style={{ color: done ? 'rgba(255,255,255,0.7)' : 'transparent' }}>
                            {punch ? fmtTime(punch.registrado_em) : '—:——'}
                          </p>
                        </div>
                      </Fragment>
                    )
                  })}
                </div>
              </div>

              {/* Button section */}
              <div className="flex-none flex flex-col items-center justify-center px-10 py-10 gap-5 min-w-[280px]">
                {justPunched ? (
                  <div className="flex flex-col items-center gap-4 ponto-success">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ background: C[justPunched].bg, border: `2px solid ${C[justPunched].ring}` }}>
                      <CheckCircle2 className="w-9 h-9" style={{ color: C[justPunched].hex }} />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-white text-base">{TIPO_LABELS[justPunched]}</p>
                      <p className="font-mono text-sm mt-0.5" style={{ color: C[justPunched].hex }}>
                        {pad2(now.getHours())}:{pad2(now.getMinutes())}
                      </p>
                    </div>
                  </div>
                ) : isDone ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ background: C.done.bg, border: `2px solid ${C.done.ring}` }}>
                      <CheckCircle2 className="w-9 h-9" style={{ color: C.done.hex }} />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-white text-base">Dia concluído</p>
                      <p className="text-slate-500 text-sm mt-0.5">Até amanhã!</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Punch button */}
                    <div className="relative flex items-center justify-center">
                      {/* Outer ping ring */}
                      {!punching && (
                        <div className="absolute w-44 h-44 rounded-full ponto-ping pointer-events-none"
                          style={{ background: `radial-gradient(circle, ${activeColor.glow} 30%, transparent 70%)` }} />
                      )}
                      {/* Ripple on click */}
                      {rippling && (
                        <div className="absolute w-40 h-40 rounded-full ponto-ripple pointer-events-none"
                          style={{ border: `2px solid ${activeColor.ring}` }} />
                      )}

                      <button
                        onClick={baterPonto}
                        disabled={punching || loading}
                        className="relative w-36 h-36 rounded-full flex flex-col items-center justify-center
                          gap-1 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                          hover:scale-105 active:scale-95"
                        style={{
                          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.08), rgba(0,0,0,0.4))`,
                          border: `2px solid ${activeColor.ring}`,
                          boxShadow: `0 0 40px ${activeColor.glow}, 0 0 0 1px rgba(255,255,255,0.04) inset`,
                          transition: 'border-color 0.5s ease, box-shadow 0.5s ease, transform 0.15s ease',
                        }}>
                        {punching
                          ? <Loader2 className="w-8 h-8 text-white animate-spin" />
                          : (
                            <>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ background: activeColor.glow }}>
                                <div className="w-3.5 h-3.5 rounded-full" style={{ background: activeColor.hex }} />
                              </div>
                              <span className="text-white text-[10px] font-bold uppercase tracking-[0.15em] mt-1">
                                Bater Ponto
                              </span>
                            </>
                          )}
                      </button>
                    </div>

                    {/* Next action label */}
                    {next !== 'done' && (
                      <div className="text-center">
                        <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest mb-1">
                          Próximo registro
                        </p>
                        <p className="font-semibold text-sm" style={{ color: activeColor.hex }}>
                          {TIPO_LABELS[next]}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Week summary */}
          <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-stagger-3">
            <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between">
              <h3 className="text-white font-semibold text-sm">Esta semana</h3>
              {!loading && (() => {
                const total = weekDays.reduce((acc, d) => {
                  const h = calcHoras(weekByDay[localDateStr(d)] ?? [])
                  return acc + (h ?? 0)
                }, 0)
                if (total === 0) return null
                const worked = weekDays.filter(d => d.getDay() !== 0 && d.getDay() !== 6).length
                const bal = total - worked * 8
                return (
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-slate-400 text-xs">{fmtHoras(total)} trabalhadas</span>
                    <span className={`font-mono text-xs font-semibold ${bal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {bal >= 0 ? '+' : '–'}{fmtHoras(Math.abs(bal))} saldo
                    </span>
                  </div>
                )
              })()}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Dia</th>
                      {TIPO_ORDER.map(t => (
                        <th key={t} className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: C[t].hex + '99' }}>
                          {TIPO_SHORT[t]}
                        </th>
                      ))}
                      <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-600">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekDays.map(d => {
                      const key     = localDateStr(d)
                      const punches = weekByDay[key] ?? []
                      const bmd     = byTipoMap(punches)
                      const isToday = key === todayStr
                      const isWknd  = d.getDay() === 0 || d.getDay() === 6
                      const horas   = calcHoras(punches)
                      const bal     = horas !== null && !isWknd ? horas - 8 : null

                      return (
                        <tr key={key} className={`border-b border-white/[0.03] last:border-0 transition-colors
                          ${isToday ? 'bg-white/[0.03]' : isWknd ? 'opacity-30' : 'hover:bg-white/[0.02]'}`}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              {isToday && (
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: activeColor.hex }} />
                              )}
                              <span className={`font-semibold text-sm ${isToday ? 'text-white' : 'text-slate-400'}`}>
                                {DIAS[d.getDay()]}
                              </span>
                              <span className="text-slate-600 text-xs">{d.getDate()}/{d.getMonth() + 1}</span>
                            </div>
                          </td>
                          {TIPO_ORDER.map(tipo => {
                            const punch = bmd[tipo]
                            return (
                              <td key={tipo} className="px-4 py-3.5 text-center">
                                <span className="font-mono text-sm" style={{ color: punch ? C[tipo].hex : '#1e293b' }}>
                                  {punch ? fmtTime(punch.registrado_em) : '—'}
                                </span>
                              </td>
                            )
                          })}
                          <td className="px-5 py-3.5 text-right">
                            {horas !== null ? (
                              <div className="flex flex-col items-end">
                                <span className="font-mono text-white text-sm font-bold">{fmtHoras(horas)}</span>
                                {bal !== null && (
                                  <span className={`font-mono text-[10px] font-semibold ${bal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {bal >= 0 ? '+' : '–'}{fmtHoras(Math.abs(bal))}
                                  </span>
                                )}
                              </div>
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

      {/* ══ HOJE (admin) ═════════════════════════════════════════════════════ */}
      {view === 'hoje' && role === 'admin' && (
        <>
          {/* Metrics strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 animate-stagger-2">
            {(
              [
                ['trabalhando', 'Trabalhando'],
                ['almoco',      'Almoço'],
                ['retornou',    'Retornou'],
                ['encerrou',    'Encerrou'],
                ['ausente',     'Não registrou'],
              ] as Array<[PresenceStatus, string]>
            ).map(([s, label]) => {
              const cfg = STATUS_CFG[s]
              const count = profiles.filter(p => getStatus(hojeByUser[p.id] ?? []) === s).length
              return (
                <div key={s} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${s === 'trabalhando' || s === 'retornou' ? 'ponto-ping' : ''}`}
                    style={{ background: cfg.dot }} />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">{label}</p>
                    <p className={`font-mono text-xl font-bold ${cfg.cls}`}>{count}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Date label */}
          <div className="flex items-center gap-3 animate-stagger-3">
            <p className="text-slate-400 text-sm font-medium">
              {DIAS_FULL[now.getDay()]}, {now.getDate()} de {MESES[now.getMonth()]}
            </p>
            {hojeLoading && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
          </div>

          {/* Cards grid */}
          {hojeLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            </div>
          ) : profiles.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
              Nenhum colaborador cadastrado
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-stagger-3">
              {profiles.map(p => (
                <PresencaCard
                  key={p.id}
                  profile={p}
                  punches={hojeByUser[p.id] ?? []}
                  now={now}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ══ EQUIPE (admin) ═══════════════════════════════════════════════════ */}
      {view === 'equipe' && role === 'admin' && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap gap-4 items-center animate-stagger-2">
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
          <div className="grid grid-cols-3 gap-4 animate-stagger-3">
            {[
              { label: 'Horas trabalhadas', value: fmtHoras(monthWorked),        cls: 'text-white' },
              { label: 'Meta do mês',       value: `${workdays * 8}h`,           cls: 'text-slate-400' },
              {
                label: 'Saldo de horas',
                value: (monthBalance >= 0 ? '+' : '–') + fmtHoras(Math.abs(monthBalance)),
                cls: monthBalance >= 0 ? 'text-emerald-400' : 'text-red-400',
              },
            ].map(item => (
              <div key={item.label} className="rounded-2xl bg-white/[0.02] border border-white/[0.06] px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">{item.label}</p>
                <p className={`font-mono text-2xl font-bold ${item.cls}`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Monthly table */}
          <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-stagger-4">
            {equipeLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      <th className="px-4 py-3 text-left w-12 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Dia</th>
                      <th className="px-3 py-3 text-left w-12 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Sem</th>
                      {TIPO_ORDER.map(t => (
                        <th key={t} className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: C[t].hex + 'aa' }}>
                          {TIPO_SHORT[t]}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-600">Trabalhado</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-600">Meta</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-600">Extras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthDays.map(d => {
                      const key     = localDateStr(d)
                      const punches = equipeByDay[key] ?? []
                      const bmd     = byTipoMap(punches)
                      const isToday = key === todayStr
                      const isWknd  = d.getDay() === 0 || d.getDay() === 6
                      const horas   = calcHoras(punches)
                      const extras  = horas !== null && !isWknd ? horas - 8 : null

                      return (
                        <tr key={key} className={`border-b border-white/[0.03] last:border-0 transition-colors
                          ${isToday ? 'bg-white/[0.04]' : isWknd ? 'opacity-25' : 'hover:bg-white/[0.02]'}`}>
                          <td className="px-4 py-2.5">
                            <span className={`font-mono text-base font-bold
                              ${isToday ? 'text-white' : 'text-slate-400'}`}>
                              {pad2(d.getDate())}
                            </span>
                            {isToday && (
                              <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide"
                                style={{ color: activeColor.hex }}>hoje</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 text-xs">{DIAS[d.getDay()]}</td>
                          {TIPO_ORDER.map(tipo => {
                            const punch = bmd[tipo]
                            return (
                              <td key={tipo} className="px-4 py-2.5 text-center">
                                <span className="font-mono text-sm"
                                  style={{ color: punch ? C[tipo].hex : isWknd ? '#1e293b' : '#334155' }}>
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
                                {extras >= 0 ? '+' : '–'}{fmtHoras(Math.abs(extras))}
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
