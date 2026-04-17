import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, Clock,
  Users, FolderKanban, RefreshCw, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { numToMask } from '../lib/utils'

interface Stats {
  saldo:        number
  entradas:     number
  pendentes:    number
  despesas:     number
  clientes:     number
  projetos:     number
  mensalidades: number
}

const EMPTY: Stats = { saldo: 0, entradas: 0, pendentes: 0, despesas: 0, clientes: 0, projetos: 0, mensalidades: 0 }

export default function FinanceiroBar() {
  const [stats,   setStats]   = useState<Stats>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    const [
      { data: entries },
      { data: expenses },
      { count: cClientes },
      { count: cProjetos },
      { count: cMensalidades },
    ] = await Promise.all([
      supabase.from('project_entries').select('valor,status'),
      supabase.from('expenses').select('valor'),
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('mensalidades').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
    ])

    const entradas  = (entries ?? []).filter(e => e.status === 'recebido').reduce((s, e) => s + (e.valor ?? 0), 0)
    const pendentes = (entries ?? []).filter(e => e.status === 'pendente').reduce((s, e) => s + (e.valor ?? 0), 0)
    const despesas  = (expenses ?? []).reduce((s, e) => s + (e.valor ?? 0), 0)

    setStats({
      entradas,
      pendentes,
      despesas,
      saldo:        entradas - despesas,
      clientes:     cClientes  ?? 0,
      projetos:     cProjetos  ?? 0,
      mensalidades: cMensalidades ?? 0,
    })
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const positive = stats.saldo >= 0

  const metrics = [
    {
      label: 'Saldo líquido',
      value: `R$ ${numToMask(stats.saldo)}`,
      icon: DollarSign,
      color: positive
        ? 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20'
        : 'text-red-400 bg-red-500/10 ring-red-500/20',
      textColor: positive ? 'text-emerald-300' : 'text-red-300',
    },
    {
      label: 'Entradas',
      value: `R$ ${numToMask(stats.entradas)}`,
      icon: TrendingUp,
      color: 'text-indigo-400 bg-indigo-500/10 ring-indigo-500/20',
      textColor: 'text-indigo-200',
    },
    {
      label: 'A receber',
      value: `R$ ${numToMask(stats.pendentes)}`,
      icon: Clock,
      color: 'text-amber-400 bg-amber-500/10 ring-amber-500/20',
      textColor: 'text-amber-200',
    },
    {
      label: 'Despesas',
      value: `R$ ${numToMask(stats.despesas)}`,
      icon: TrendingDown,
      color: 'text-red-400 bg-red-500/10 ring-red-500/20',
      textColor: 'text-red-200',
    },
    {
      label: 'Clientes',
      value: String(stats.clientes),
      icon: Users,
      color: 'text-slate-400 bg-slate-500/10 ring-slate-500/20',
      textColor: 'text-slate-200',
    },
    {
      label: 'Projetos',
      value: String(stats.projetos),
      icon: FolderKanban,
      color: 'text-violet-400 bg-violet-500/10 ring-violet-500/20',
      textColor: 'text-violet-200',
    },
    {
      label: 'Mensalidades',
      value: String(stats.mensalidades),
      icon: RefreshCw,
      color: 'text-cyan-400 bg-cyan-500/10 ring-cyan-500/20',
      textColor: 'text-cyan-200',
    },
  ]

  return (
    <div className="shrink-0 border-b border-white/[0.06] bg-slate-900/60 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-5 py-2.5 overflow-x-auto scrollbar-none">

        {/* métricas */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {metrics.map((m, i) => {
            const Icon = m.icon
            return (
              <div key={i}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.035] border border-white/[0.06] shrink-0 hover:bg-white/[0.055] transition-colors">
                <div className={`w-5 h-5 rounded-md ring-1 flex items-center justify-center ${m.color}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="leading-none">
                  <p className={`text-xs font-semibold whitespace-nowrap ${loading ? 'text-slate-400' : m.textColor}`}>
                    {loading ? '—' : m.value}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">{m.label}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* refresh */}
        <div className="flex items-center gap-2 shrink-0 ml-1">
          {lastUpdated && !loading && (
            <span className="text-[10px] text-slate-500 whitespace-nowrap hidden sm:block">
              {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-300 hover:bg-white/[0.06] transition-colors disabled:opacity-40">
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
