import { useState, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, Clock,
  Users, FolderKanban, RefreshCw, ArrowDownCircle,
  Receipt, Loader2, DollarSign,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { numToMask, formatDate } from '../lib/utils'

interface Stats {
  saldoCaixa: number; saldoMes: number
  entradas: number; pendentes: number; despesas: number
  clientes: number; projetos: number; mensalidades: number; valorProjetos: number
}

interface Movement {
  id: string; tipo: 'entrada' | 'despesa'; descricao: string; valor: number; data: string
}

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS_PT   = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

export default function DashboardHome({ role }: { role?: 'admin' | 'operator' }) {
  const isAdmin = role === 'admin'
  const [stats,    setStats]    = useState<Stats>({ saldoCaixa:0, saldoMes:0, entradas:0, pendentes:0, despesas:0, clientes:0, projetos:0, mensalidades:0, valorProjetos:0 })
  const [recent,   setRecent]   = useState<Movement[]>([])
  const [loading,  setLoading]  = useState(true)

  const now     = new Date()
  const dateStr = `${DAYS_PT[now.getDay()]}, ${now.getDate()} de ${MONTHS_PT[now.getMonth()]} de ${now.getFullYear()}`

  useEffect(() => { load() }, [isAdmin])

  async function load() {
    setLoading(true)

    // Contadores operacionais — visíveis para todos
    const [
      { count: cClientes },
      { count: cProjetos },
      { count: cMens },
    ] = await Promise.all([
      supabase.from('clients').select('*',      { count: 'exact', head: true }),
      supabase.from('projects').select('*',     { count: 'exact', head: true }),
      supabase.from('mensalidades').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
    ])

    setStats(s => ({ ...s, clientes: cClientes ?? 0, projetos: cProjetos ?? 0, mensalidades: cMens ?? 0 }))

    // Dados financeiros — somente admin
    if (!isAdmin) { setLoading(false); return }

    const hoje        = new Date()
    const anoMes      = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
    const inicioMes   = `${anoMes}-01`
    const fimMes      = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10)

    const [
      { data: entries },
      { data: entriesMes },
      { data: entriesAllRecebidas },
      { data: pendentesAll },
      { data: expensesAvulsas },
      { data: expensesAvulsasAllPagas },
      { data: expensesFixas },
      { data: projectsValor },
    ] = await Promise.all([
      supabase.from('project_entries').select('valor,status,data,nome_projeto,id').order('data', { ascending: false }).limit(20),
      supabase.from('project_entries').select('valor,data').eq('status', 'recebido').gte('data', inicioMes).lte('data', fimMes),
      supabase.from('project_entries').select('valor').eq('status', 'recebido'),
      supabase.from('project_entries').select('valor').eq('status', 'pendente'),
      supabase.from('expenses').select('valor,data,descricao,id,tipo,pago').eq('tipo', 'avulsa').gte('data', inicioMes).lte('data', fimMes),
      supabase.from('expenses').select('valor').eq('tipo', 'avulsa').eq('pago', true),
      supabase.from('expenses').select('valor,id').eq('tipo', 'fixa'),
      supabase.from('projects').select('valor'),
    ])

    const [
      { data: ajustesData },
      { data: pagamentosPagos },
      { data: mensalidadesValores },
      { data: fixasPagamentos },
    ] = await Promise.all([
      supabase.from('ajustes_caixa').select('valor'),
      supabase.from('cobranca_pagamentos').select('client_id, mes').eq('status', 'pago'),
      supabase.from('mensalidades').select('client_id, valor'),
      supabase.from('expense_pagamentos').select('expense_id, mes'),
    ])

    const valorByClient: Record<string, number> = {}
    for (const m of mensalidadesValores ?? []) {
      if (m.client_id) valorByClient[m.client_id as string] = Number(m.valor || 0)
    }
    const mensalidadesPagasLifetime = (pagamentosPagos ?? []).reduce(
      (s, p) => s + (valorByClient[p.client_id as string] ?? 0), 0
    )
    const mensalidadesPagasMes = (pagamentosPagos ?? [])
      .filter(p => p.mes === anoMes)
      .reduce((s, p) => s + (valorByClient[p.client_id as string] ?? 0), 0)

    const valorByFixa: Record<string, number> = {}
    for (const e of expensesFixas ?? []) {
      valorByFixa[e.id as string] = Number(e.valor || 0)
    }
    const fixasPagasLifetime = (fixasPagamentos ?? []).reduce(
      (s, p) => s + (valorByFixa[p.expense_id as string] ?? 0), 0
    )
    const fixasPagasMes = (fixasPagamentos ?? [])
      .filter(p => p.mes === anoMes)
      .reduce((s, p) => s + (valorByFixa[p.expense_id as string] ?? 0), 0)

    const avulsasPagasMes = (expensesAvulsas ?? []).filter(e => e.pago).reduce((s, e) => s + (Number(e.valor) || 0), 0)
    const entradas      = (entriesMes    ?? []).reduce((s, e) => s + (e.valor ?? 0), 0) + mensalidadesPagasMes
    const pendentes     = (pendentesAll  ?? []).reduce((s, e) => s + (e.valor ?? 0), 0)
    const despesas      = avulsasPagasMes + fixasPagasMes
    const valorProjetos = (projectsValor ?? []).reduce((s, p) => s + ((p.valor as number) ?? 0), 0)
    const totalEntradasLifetime     = (entriesAllRecebidas ?? []).reduce((s, e) => s + (Number(e.valor) || 0), 0)
    const totalAvulsasPagasLifetime = (expensesAvulsasAllPagas ?? []).reduce((s, e) => s + (Number(e.valor) || 0), 0)
    const totalAjustes              = (ajustesData ?? []).reduce((s, a) => s + (Number(a.valor) || 0), 0)
    const saldoCaixa = totalEntradasLifetime + mensalidadesPagasLifetime - totalAvulsasPagasLifetime - fixasPagasLifetime + totalAjustes

    setStats(s => ({
      ...s,
      entradas, pendentes, despesas,
      saldoMes:   entradas - despesas,
      saldoCaixa, valorProjetos,
    }))

    const mov: Movement[] = [
      ...(entries  ?? []).slice(0,6).map(e => ({ id: e.id, tipo: 'entrada' as const, descricao: e.nome_projeto ?? '', valor: e.valor, data: e.data })),
      ...(expensesAvulsas ?? []).slice(0,6).map(e => ({ id: e.id, tipo: 'despesa' as const, descricao: (e.descricao as string) ?? '', valor: e.valor, data: e.data })),
    ].sort((a,b) => (b.data ?? '').localeCompare(a.data ?? '')).slice(0,8)

    setRecent(mov)
    setLoading(false)
  }

  const positive   = stats.saldoCaixa >= 0
  const mesPos     = stats.saldoMes >= 0
  const total      = stats.entradas + stats.despesas
  const pctEnt     = total > 0 ? (stats.entradas / total) * 100 : 0
  const pctDesp    = total > 0 ? (stats.despesas / total) * 100 : 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ── */}
      <div className="flex items-end justify-between animate-stagger-1">
        <div>
          <p className="text-slate-300 text-xs font-medium mb-1 uppercase tracking-widest">{dateStr}</p>
          <h1 className="text-white font-extrabold text-2xl tracking-tight">Visão Geral</h1>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-300 text-xs font-medium bg-white/[0.03] border border-white/[0.06] hover:text-white hover:bg-white/[0.07] transition-all">
          <RefreshCw className="w-3 h-3" /> Atualizar
        </button>
      </div>

      {/* ── Cards financeiros — somente admin ── */}
      {isAdmin && <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 animate-stagger-2">

        {/* Saldo — card destaque */}
        <div className={`relative overflow-hidden rounded-2xl p-6 border col-span-1
          ${positive
            ? 'bg-gradient-to-br from-emerald-500/12 via-transparent to-transparent border-emerald-500/35'
            : 'bg-gradient-to-br from-red-500/12 via-transparent to-transparent border-red-500/35'}`}>
          <div className={`absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl opacity-15
            ${positive ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <div className="relative">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
              Saldo em Caixa
            </p>
            <p className={`text-4xl font-extrabold tracking-tight font-numeric mb-1 ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
              R$ {numToMask(stats.saldoCaixa)}
            </p>
            <p className="text-slate-300 text-xs font-medium">acumulado · tudo recebido − pago</p>

            {/* Delta do mês */}
            <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-wider text-slate-300 font-medium">no mês</span>
              <span className={`text-xs font-numeric font-semibold ${mesPos ? 'text-emerald-300' : 'text-red-300'}`}>
                {mesPos ? '+' : '−'} R$ {numToMask(Math.abs(stats.saldoMes))}
              </span>
            </div>

            {total > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="flex text-[10px] text-slate-300 justify-between font-medium">
                  <span>Ent. {pctEnt.toFixed(0)}%</span>
                  <span>Desp. {pctDesp.toFixed(0)}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden flex gap-0.5">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${pctEnt}%` }} />
                  <div className="h-full bg-red-500 rounded-full transition-all duration-1000" style={{ width: `${pctDesp}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3 cards menores */}
        <div className="col-span-1 lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Entradas',     sub: `recebidas · ${MONTHS_PT[now.getMonth()].toLowerCase()}`,    value: stats.entradas,  Icon: TrendingUp,   color: 'text-indigo-300', bg: 'bg-indigo-500/10', ring: 'border-indigo-500/30', glow: 'bg-indigo-400' },
            { label: 'A receber',    sub: 'pendente',      value: stats.pendentes, Icon: Clock,        color: 'text-amber-300',  bg: 'bg-amber-500/10',  ring: 'border-amber-500/30',  glow: 'bg-amber-400' },
            { label: 'Despesas',     sub: MONTHS_PT[now.getMonth()].toLowerCase(), value: stats.despesas,  Icon: TrendingDown, color: 'text-red-300',    bg: 'bg-red-500/10',    ring: 'border-red-500/30',    glow: 'bg-red-400' },
          ].map(c => (
            <div key={c.label} className={`relative overflow-hidden rounded-2xl p-5 border ${c.bg} ${c.ring} group hover:brightness-110 transition-all`}>
              <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl opacity-0 group-hover:opacity-10 transition-opacity ${c.glow}`} />
              <div className="relative">
                <c.Icon className={`w-4 h-4 mb-4 ${c.color} opacity-70`} />
                <p className={`text-2xl font-extrabold font-numeric tracking-tight ${c.color}`}>
                  R$ {numToMask(c.value)}
                </p>
                <p className="text-slate-300 text-xs font-medium mt-1">{c.label} <span className="text-slate-300">· {c.sub}</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>}

      {/* ── Contadores operacionais ── */}
      <div className={`grid gap-3 animate-stagger-3 ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border bg-slate-500/8 border-slate-500/25">
          <Users className="w-4 h-4 shrink-0 text-slate-200 opacity-60" />
          <div>
            <p className="text-xl font-extrabold font-numeric text-slate-200">{stats.clientes}</p>
            <p className="text-slate-300 text-xs font-medium">Clientes</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border bg-violet-500/8 border-violet-500/30">
          <FolderKanban className="w-4 h-4 shrink-0 text-violet-300 opacity-60" />
          <div>
            <p className="text-xl font-extrabold font-numeric text-violet-300">{stats.projetos}</p>
            <p className="text-slate-300 text-xs font-medium">Projetos</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border bg-cyan-500/8 border-cyan-500/30">
          <RefreshCw className="w-4 h-4 shrink-0 text-cyan-300 opacity-60" />
          <div>
            <p className="text-xl font-extrabold font-numeric text-cyan-300">{stats.mensalidades}</p>
            <p className="text-slate-300 text-xs font-medium">Mensalidades</p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border bg-emerald-500/8 border-emerald-500/30">
            <DollarSign className="w-4 h-4 shrink-0 text-emerald-300 opacity-70" />
            <div className="min-w-0">
              <p className="text-xl font-extrabold font-numeric text-emerald-300 truncate">R$ {numToMask(stats.valorProjetos)}</p>
              <p className="text-slate-300 text-xs font-medium">Valor em projetos</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Movimentações recentes — somente admin ── */}
      {isAdmin && <div className="animate-stagger-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-sm tracking-tight">Movimentações recentes</h2>
          <span className="text-slate-300 text-xs font-medium">{recent.length} registros</span>
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
            <p className="text-slate-300 text-sm font-medium">Nenhuma movimentação</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
            {recent.map((item, i) => (
              <div key={item.tipo + item.id}
                className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.02]
                  ${i < recent.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                  ${item.tipo === 'entrada' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  {item.tipo === 'entrada'
                    ? <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-500" />
                    : <Receipt        className="w-3.5 h-3.5 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 text-sm font-medium truncate">{item.descricao}</p>
                  {item.data && <p className="text-slate-300 text-xs mt-0.5 font-medium">{formatDate(item.data)}</p>}
                </div>
                <p className={`font-bold text-sm font-numeric shrink-0 ${item.tipo === 'entrada' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.tipo === 'entrada' ? '+' : '−'} R$ {numToMask(item.valor)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>}

    </div>
  )
}
