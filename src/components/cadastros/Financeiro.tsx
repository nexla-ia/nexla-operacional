import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Loader2, ArrowDownCircle, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { numToMask, formatDate } from '../../lib/utils'

interface Summary {
  entradas:  number
  despesas:  number
  pendentes: number
}

interface RecentItem {
  id: string; tipo: 'entrada' | 'despesa'; descricao: string; valor: number; data: string
}

export default function Financeiro() {
  const [summary, setSummary]   = useState<Summary>({ entradas: 0, despesas: 0, pendentes: 0 })
  const [recent, setRecent]     = useState<RecentItem[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: entries }, { data: expenses }] = await Promise.all([
      supabase.from('project_entries').select('valor,status,data,descricao,nome_projeto,id').order('data', { ascending: false }).limit(10),
      supabase.from('expenses').select('valor,tipo,data,descricao,id').order('data', { ascending: false }).limit(10),
    ])

    const entradas  = (entries ?? []).filter((e: Record<string,unknown>) => e.status === 'recebido').reduce((s: number, e: Record<string,unknown>) => s + (e.valor as number ?? 0), 0)
    const pendentes = (entries ?? []).filter((e: Record<string,unknown>) => e.status === 'pendente').reduce((s: number, e: Record<string,unknown>) => s + (e.valor as number ?? 0), 0)
    const despesas  = (expenses ?? []).reduce((s: number, e: Record<string,unknown>) => s + (e.valor as number ?? 0), 0)

    setSummary({ entradas, despesas, pendentes })

    const recentItems: RecentItem[] = [
      ...(entries ?? []).slice(0, 5).map((e: Record<string,unknown>) => ({
        id: e.id as string, tipo: 'entrada' as const,
        descricao: (e.nome_projeto as string) ?? '', valor: e.valor as number, data: e.data as string,
      })),
      ...(expenses ?? []).slice(0, 5).map((e: Record<string,unknown>) => ({
        id: e.id as string, tipo: 'despesa' as const,
        descricao: (e.descricao as string) ?? '', valor: e.valor as number, data: e.data as string,
      })),
    ].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')).slice(0, 8)

    setRecent(recentItems)
    setLoading(false)
  }

  const saldo = summary.entradas - summary.despesas

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
  )

  return (
    <>
      <h1 className="text-white font-bold text-xl mb-6">Financeiro</h1>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Entradas recebidas', value: summary.entradas, icon: TrendingUp, color: 'emerald' },
          { label: 'Pendente a receber', value: summary.pendentes, icon: ArrowDownCircle, color: 'amber' },
          { label: 'Total de despesas',  value: summary.despesas,  icon: TrendingDown, color: 'red' },
          { label: 'Saldo líquido',      value: saldo,             icon: DollarSign,   color: saldo >= 0 ? 'indigo' : 'red' },
        ].map(card => {
          const Icon = card.icon
          const colors: Record<string, string> = {
            emerald: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
            amber:   'bg-amber-500/10  text-amber-400  ring-amber-500/20',
            red:     'bg-red-500/10    text-red-400    ring-red-500/20',
            indigo:  'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20',
          }
          const textColors: Record<string, string> = {
            emerald: 'text-emerald-400', amber: 'text-amber-400',
            red: 'text-red-400', indigo: 'text-indigo-400',
          }
          return (
            <div key={card.label} className="p-5 rounded-2xl bg-slate-900/70 border border-white/[0.07]">
              <div className={`w-9 h-9 rounded-xl ring-1 flex items-center justify-center mb-4 ${colors[card.color]}`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className={`text-xl font-bold ${textColors[card.color]}`}>R$ {numToMask(card.value)}</p>
              <p className="text-slate-500 text-xs mt-1">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* Movimentações recentes */}
      <div>
        <h2 className="text-white font-semibold text-sm mb-3">Movimentações recentes</h2>
        {recent.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Nenhuma movimentação</p>
        ) : (
          <div className="space-y-2">
            {recent.map(item => (
              <div key={item.tipo + item.id} className="flex items-center gap-4 px-5 py-3.5 rounded-xl bg-slate-900/70 border border-white/[0.07]">
                <div className={`w-7 h-7 rounded-lg ring-1 flex items-center justify-center shrink-0 ${item.tipo === 'entrada' ? 'bg-emerald-500/10 ring-emerald-500/20' : 'bg-red-500/10 ring-red-500/20'}`}>
                  {item.tipo === 'entrada' ? <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Receipt className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm truncate">{item.descricao}</p>
                  {item.data && <p className="text-slate-400 text-xs">{formatDate(item.data)}</p>}
                </div>
                <p className={`font-semibold text-sm shrink-0 ${item.tipo === 'entrada' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.tipo === 'entrada' ? '+' : '-'} R$ {numToMask(item.valor)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
