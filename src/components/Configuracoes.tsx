import { useState, useEffect, useRef } from 'react'
import {
  RefreshCw, CheckCircle2, XCircle,
  Save, Loader2, Zap, TrendingUp, TrendingDown, ArrowUpDown,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ExchangeRate {
  ask:       number
  bid:       number
  high:      number
  low:       number
  pctChange: number
}

interface AppSettings {
  id:              number
  usd_brl_rate:    number | null
  usd_brl_bid:     number | null
  rate_fetched_at: string | null
}

async function fetchAwesomeRate(): Promise<ExchangeRate> {
  const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
  if (!res.ok) throw new Error(`AwesomeAPI respondeu ${res.status}`)
  const d = (await res.json())?.USDBRL
  if (!d) throw new Error('Resposta inesperada da AwesomeAPI')
  return {
    ask:       parseFloat(d.ask),
    bid:       parseFloat(d.bid),
    high:      parseFloat(d.high),
    low:       parseFloat(d.low),
    pctChange: parseFloat(d.pctChange),
  }
}

function fmtRate(n: number | null | undefined) {
  if (n == null || isNaN(n as number)) return '—'
  return `R$ ${Number(n).toFixed(4)}`
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Direction = 'usd-to-brl' | 'brl-to-usd'

function convert(val: number, dir: Direction, rate: number) {
  return dir === 'usd-to-brl' ? val * rate : val / rate
}
function flip(d: Direction): Direction {
  return d === 'usd-to-brl' ? 'brl-to-usd' : 'usd-to-brl'
}

// Pill que mostra a moeda dentro do input
function CurrencyBadge({ code, flag, active }: { code: string; flag: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0 pointer-events-none
      ${active ? 'bg-indigo-500/15 ring-1 ring-indigo-500/25' : 'bg-white/[0.05]'}`}>
      <span className="text-base leading-none">{flag}</span>
      <span className={`text-xs font-bold tracking-wide ${active ? 'text-indigo-300' : 'text-slate-300'}`}>{code}</span>
    </div>
  )
}

export default function Configuracoes() {
  const [saved,    setSaved]    = useState<Partial<AppSettings>>({})
  const [live,     setLive]     = useState<ExchangeRate | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [fetching, setFetching] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState<{ ok: boolean; text: string } | null>(null)

  const [direction, setDirection] = useState<Direction>('usd-to-brl')
  const [topVal,    setTopVal]    = useState('')
  const [botVal,    setBotVal]    = useState('')
  const lastEdited = useRef<'top' | 'bot'>('top')

  useEffect(() => { loadSaved() }, [])

  async function loadSaved() {
    setLoading(true)
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).single()
    if (data) setSaved(data as AppSettings)
    setLoading(false)
  }

  const askRate = live?.ask ?? saved.usd_brl_rate ?? null

  useEffect(() => {
    if (!askRate) return
    if (lastEdited.current === 'top') {
      const n = parseFloat(topVal)
      setBotVal(!topVal || isNaN(n) ? '' : convert(n, direction, askRate).toFixed(2))
    } else {
      const n = parseFloat(botVal)
      setTopVal(!botVal || isNaN(n) ? '' : convert(n, flip(direction), askRate).toFixed(2))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askRate])

  function handleTopChange(raw: string) {
    lastEdited.current = 'top'
    setTopVal(raw)
    if (!askRate) return
    const n = parseFloat(raw)
    setBotVal(!raw || isNaN(n) ? '' : convert(n, direction, askRate).toFixed(2))
  }

  function handleBotChange(raw: string) {
    lastEdited.current = 'bot'
    setBotVal(raw)
    if (!askRate) return
    const n = parseFloat(raw)
    setTopVal(!raw || isNaN(n) ? '' : convert(n, flip(direction), askRate).toFixed(2))
  }

  function handleSwap() {
    setDirection(d => flip(d))
    setTopVal(botVal)
    setBotVal(topVal)
    lastEdited.current = 'top'
  }

  async function handleFetch() {
    setFetching(true)
    setMsg(null)
    setLive(null)
    try {
      setLive(await fetchAwesomeRate())
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setFetching(false)
    }
  }

  async function handleSave() {
    const ask = live?.ask ?? null
    if (!ask) { setMsg({ ok: false, text: 'Busque a cotação antes de salvar' }); return }
    setSaving(true)
    setMsg(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const now = new Date().toISOString()
      const { error } = await supabase.from('app_settings').upsert({
        id: 1, currency_provider: 'awesomeapi', currency_api_key: null,
        usd_brl_rate: ask, usd_brl_bid: live?.bid ?? null,
        rate_fetched_at: now, updated_at: now, updated_by: user?.id ?? null,
      })
      if (error) throw error
      setSaved(s => ({ ...s, usd_brl_rate: ask, usd_brl_bid: live?.bid ?? null, rate_fetched_at: now }))
      setMsg({ ok: true, text: `Cotação salva · USD 1,00 = ${fmtRate(ask)}` })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const display = live ?? (saved.usd_brl_rate ? { ask: saved.usd_brl_rate, bid: saved.usd_brl_bid } : null)
  const pct     = live?.pctChange ?? 0
  const pctUp   = pct >= 0

  // Moedas dos campos conforme direção
  const topCurrency = direction === 'usd-to-brl' ? { code: 'USD', flag: '🇺🇸' } : { code: 'BRL', flag: '🇧🇷' }
  const botCurrency = direction === 'usd-to-brl' ? { code: 'BRL', flag: '🇧🇷' } : { code: 'USD', flag: '🇺🇸' }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
    </div>
  )

  return (
    <div className="max-w-md space-y-4 animate-fade-in-up">

      {/* Card principal */}
      <div className="animate-stagger-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">

        {/* Barra de status da taxa */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-slate-300 text-xs font-semibold">AwesomeAPI</span>
            {display?.ask && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-white text-xs font-bold font-numeric">
                  USD 1 = {fmtRate(display.ask)}
                </span>
                {live && (
                  <span className={`flex items-center gap-0.5 text-[11px] font-semibold
                    ${pctUp ? 'text-red-400' : 'text-emerald-400'}`}>
                    {pctUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {pctUp ? '+' : ''}{pct.toFixed(2)}%
                  </span>
                )}
              </>
            )}
          </div>
          {saved.rate_fetched_at && !live && (
            <span className="text-slate-300/40 text-[11px]">{fmtDate(saved.rate_fetched_at)}</span>
          )}
        </div>

        {/* Campos do conversor */}
        <div className="p-4 space-y-1.5">

          {/* Campo de cima */}
          <div className="relative flex items-center gap-3 bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3
            focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/15 transition-all">
            <CurrencyBadge code={topCurrency.code} flag={topCurrency.flag} active />
            <input
              type="number"
              min="0"
              step="any"
              value={topVal}
              onChange={e => handleTopChange(e.target.value)}
              placeholder="0,00"
              className="flex-1 bg-transparent text-white text-2xl font-extrabold font-numeric
                placeholder-white/20 focus:outline-none min-w-0
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Botão swap centralizado */}
          <div className="flex justify-center py-0.5">
            <button
              onClick={handleSwap}
              className="flex items-center justify-center w-9 h-9 rounded-xl z-10
                bg-[#0d0f18] border border-white/[0.09] text-slate-300
                hover:bg-indigo-500/15 hover:border-indigo-500/35 hover:text-indigo-300
                active:scale-95 transition-all duration-150 shadow-lg"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>

          {/* Campo de baixo */}
          <div className="relative flex items-center gap-3 bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3
            focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/15 transition-all">
            <CurrencyBadge code={botCurrency.code} flag={botCurrency.flag} />
            <input
              type="number"
              min="0"
              step="any"
              value={botVal}
              onChange={e => handleBotChange(e.target.value)}
              placeholder="0,00"
              className="flex-1 bg-transparent text-white text-2xl font-extrabold font-numeric
                placeholder-white/20 focus:outline-none min-w-0
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Sem taxa ainda */}
          {!askRate && (
            <p className="text-center text-slate-300/50 text-xs pt-2 pb-1">
              Clique em <span className="text-white/70 font-medium">Buscar cotação</span> para ativar a conversão
            </p>
          )}
        </div>


        {/* Feedback */}
        {msg && (
          <div className={`flex items-center gap-3 mx-4 mb-4 px-4 py-3 rounded-xl border text-sm font-medium
            ${msg.ok
              ? 'bg-emerald-500/8 border-emerald-500/25 text-emerald-300'
              : 'bg-red-500/8 border-red-500/25 text-red-300'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-2.5 px-4 pb-4">
          <button
            onClick={handleFetch}
            disabled={fetching || saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
              bg-white/[0.04] border border-white/[0.08] text-slate-300
              hover:bg-white/[0.08] hover:text-white
              disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
          >
            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Buscar cotação
          </button>

          <button
            onClick={handleSave}
            disabled={saving || fetching || !live}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
              bg-indigo-500/15 border border-indigo-500/30 text-indigo-300
              hover:bg-indigo-500/22 hover:text-indigo-200
              disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shimmer"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar cotação
          </button>

          <button
            onClick={loadSaved}
            disabled={loading || saving || fetching}
            className="ml-auto p-2.5 rounded-xl text-slate-300 bg-white/[0.02] border border-white/[0.05]
              hover:text-white hover:bg-white/[0.06] disabled:opacity-40 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dica */}
      <div className="animate-stagger-3 rounded-2xl px-5 py-4 border bg-amber-500/[0.05] border-amber-500/20 text-xs text-amber-300/80 leading-relaxed">
        <span className="font-semibold text-amber-300">Dica:</span>{' '}
        Atualize a cotação periodicamente. A taxa salva é usada em todo o sistema para calcular
        o custo de Tokens em reais.
      </div>

    </div>
  )
}
