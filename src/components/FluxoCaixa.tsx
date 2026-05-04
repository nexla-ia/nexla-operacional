import { useState, useEffect, useMemo } from 'react'
import {
  Loader2, RefreshCw, ArrowUpRight, ArrowDownRight,
  AlertTriangle, Sparkles, TrendingDown,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { numToMask } from '../lib/utils'

const MES_NOME       = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MES_CURTO      = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

// ── Tipos internos ────────────────────────────────────────────────────────────

interface MensalidadeRow { id: string; cliente_nome: string; valor: number; dia_vencimento: number; status: string }
interface ExpenseRow     { id: string; descricao: string; valor: number; data: string | null; tipo: 'fixa' | 'avulsa'; dia_vencimento: number | null; pago: boolean }
interface EntryRow       { id: string; nome_projeto: string; valor: number; data: string; status: 'pendente' | 'recebido' }
interface ProposalRow    { id: string; titulo: string; cliente_nome: string; setup_valor: number; mensalidade_valor: number; status: string; recorrencia: 'mensal' | 'semestral' | 'anual'; data_envio: string | null }

interface MovimentoFuturo {
  id: string
  tipo: 'entrada' | 'saida'
  origem: 'mensalidade' | 'fixa' | 'avulsa' | 'projeto'
  descricao: string
  detalhe: string
  valor: number
  data: Date           // primeira ocorrência futura
  recorrente: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function nextDueDate(diaVencimento: number, from: Date): Date {
  const y = from.getFullYear(), m = from.getMonth()
  const lastDay = new Date(y, m + 1, 0).getDate()
  const dia = Math.min(diaVencimento, lastDay)
  const thisMonth = new Date(y, m, dia)
  if (thisMonth >= startOfDay(from)) return thisMonth
  const nextLast = new Date(y, m + 2, 0).getDate()
  return new Date(y, m + 1, Math.min(diaVencimento, nextLast))
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function FluxoCaixa() {
  const [loading, setLoading]  = useState(true)
  const [error, setError]      = useState('')
  const [mensalidades, setMensalidades] = useState<MensalidadeRow[]>([])
  const [expenses, setExpenses]         = useState<ExpenseRow[]>([])
  const [entries, setEntries]           = useState<EntryRow[]>([])
  const [proposals, setProposals]       = useState<ProposalRow[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    const [
      { data: mens, error: e1 },
      { data: exp,  error: e2 },
      { data: ent,  error: e3 },
      { data: prop, error: e4 },
    ] = await Promise.all([
      supabase.from('mensalidades').select('id,cliente_nome,valor,dia_vencimento,status').eq('status', 'ativo'),
      supabase.from('expenses').select('id,descricao,valor,data,tipo,dia_vencimento,pago'),
      supabase.from('project_entries').select('id,nome_projeto,valor,data,status'),
      supabase.from('proposals').select('id,titulo,cliente_nome,setup_valor,mensalidade_valor,status,recorrencia,data_envio'),
    ])
    if (e1 || e2 || e3 || e4) setError('Erro ao carregar dados financeiros.')
    setMensalidades((mens ?? []) as MensalidadeRow[])
    setExpenses    ((exp  ?? []) as ExpenseRow[])
    setEntries     ((ent  ?? []) as EntryRow[])
    setProposals   ((prop ?? []) as ProposalRow[])
    setLoading(false)
  }

  // ── Cálculos ────────────────────────────────────────────────────────────────

  const hoje    = useMemo(() => startOfDay(new Date()), [])
  const inicioMes = useMemo(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1), [hoje])
  const fimMes    = useMemo(() => new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0), [hoje])

  // Saldo em caixa lifetime
  const saldoCaixa = useMemo(() => {
    const entradas = entries.filter(e => e.status === 'recebido').reduce((s, e) => s + Number(e.valor || 0), 0)
    const avulsas  = expenses.filter(e => e.tipo === 'avulsa' && e.pago).reduce((s, e) => s + Number(e.valor || 0), 0)
    const fixasPagas = expenses.filter(e => e.tipo === 'fixa' && e.pago).reduce((s, e) => s + Number(e.valor || 0), 0)
    return entradas - avulsas - fixasPagas
  }, [entries, expenses])

  // Mês corrente
  const mesEntradas = useMemo(() =>
    entries.filter(e => e.status === 'recebido' && e.data && e.data >= toISO(inicioMes) && e.data <= toISO(fimMes))
      .reduce((s, e) => s + Number(e.valor || 0), 0)
  , [entries, inicioMes, fimMes])

  const mesDespesasPagas = useMemo(() =>
    expenses.filter(e => e.pago && (
      (e.tipo === 'avulsa' && e.data && e.data >= toISO(inicioMes) && e.data <= toISO(fimMes)) ||
      e.tipo === 'fixa'
    )).reduce((s, e) => s + Number(e.valor || 0), 0)
  , [expenses, inicioMes, fimMes])

  const saldoMes = mesEntradas - mesDespesasPagas

  // Recorrentes mensais
  const receitaRecorrente = useMemo(() =>
    mensalidades.reduce((s, m) => s + Number(m.valor || 0), 0)
  , [mensalidades])

  const custoFixo = useMemo(() =>
    expenses.filter(e => e.tipo === 'fixa').reduce((s, e) => s + Number(e.valor || 0), 0)
  , [expenses])

  // Runway: meses até zerar o caixa
  const queimaMensal = custoFixo - receitaRecorrente
  const runway = queimaMensal > 0 ? saldoCaixa / queimaMensal : Infinity

  // Próximos 30 dias — a receber + a pagar
  const fim30 = useMemo(() => {
    const d = new Date(hoje); d.setDate(d.getDate() + 30); return d
  }, [hoje])

  const movimentosFuturos = useMemo(() => {
    const list: MovimentoFuturo[] = []

    // Mensalidades ativas
    mensalidades.forEach(m => {
      const d = nextDueDate(m.dia_vencimento, hoje)
      if (d <= fim30) {
        list.push({
          id: 'mens-' + m.id,
          tipo: 'entrada',
          origem: 'mensalidade',
          descricao: m.cliente_nome,
          detalhe: `mensalidade · vence dia ${m.dia_vencimento}`,
          valor: Number(m.valor || 0),
          data: d,
          recorrente: true,
        })
      }
    })

    // Despesas fixas (não pagas no ciclo atual)
    expenses.filter(e => e.tipo === 'fixa' && e.dia_vencimento).forEach(e => {
      const d = nextDueDate(e.dia_vencimento!, hoje)
      if (d <= fim30) {
        list.push({
          id: 'fix-' + e.id,
          tipo: 'saida',
          origem: 'fixa',
          descricao: e.descricao,
          detalhe: `fixa · ${e.pago ? 'paga este mês' : 'a pagar'} · dia ${e.dia_vencimento}`,
          valor: Number(e.valor || 0),
          data: d,
          recorrente: true,
        })
      }
    })

    // Avulsas com data nos próximos 30 dias
    expenses.filter(e => e.tipo === 'avulsa' && e.data && !e.pago).forEach(e => {
      const d = new Date(e.data + 'T12:00:00')
      if (d >= hoje && d <= fim30) {
        list.push({
          id: 'avu-' + e.id,
          tipo: 'saida',
          origem: 'avulsa',
          descricao: e.descricao,
          detalhe: 'avulsa · não paga',
          valor: Number(e.valor || 0),
          data: d,
          recorrente: false,
        })
      }
    })

    // Entradas pendentes
    entries.filter(e => e.status === 'pendente' && e.data).forEach(e => {
      const d = new Date(e.data + 'T12:00:00')
      if (d >= hoje && d <= fim30) {
        list.push({
          id: 'ent-' + e.id,
          tipo: 'entrada',
          origem: 'projeto',
          descricao: e.nome_projeto || 'Projeto',
          detalhe: 'entrada · pendente',
          valor: Number(e.valor || 0),
          data: d,
          recorrente: false,
        })
      }
    })

    return list.sort((a, b) => a.data.getTime() - b.data.getTime())
  }, [mensalidades, expenses, entries, hoje, fim30])

  const totalReceber30 = movimentosFuturos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const totalPagar30   = movimentosFuturos.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)
  const saldoProj30    = saldoCaixa + totalReceber30 - totalPagar30

  // Projeção 12 meses
  const aceitas  = useMemo(() => proposals.filter(p => p.status === 'aceita'),  [proposals])
  const enviadas = useMemo(() => proposals.filter(p => p.status === 'enviada'), [proposals])
  const sumMens  = (arr: ProposalRow[]) => arr.reduce((s, p) => s + Number(p.mensalidade_valor || 0), 0)
  const sumSetup = (arr: ProposalRow[]) => arr.reduce((s, p) => s + Number(p.setup_valor || 0), 0)
  const mensAceitas  = sumMens(aceitas)
  const mensEnviadas = sumMens(enviadas)
  const setupAceitas = sumSetup(aceitas)

  const projecao = useMemo(() => {
    const meses: { label: string; receita: number; despesa: number; saldoAcum: number; isFuturo: boolean }[] = []
    let acum = saldoCaixa
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
      // Receita do mês
      let receita = receitaRecorrente
      // Mensalidades das aceitas: começam no próximo mês (i >= 1)
      if (i >= 1) receita += mensAceitas
      // Setup das aceitas: cai no mês 1
      if (i === 1) receita += setupAceitas
      // Entradas pendentes que caem nesse mês
      const ini = toISO(new Date(d.getFullYear(), d.getMonth(), 1))
      const fim = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
      const pendNoMes = entries.filter(e =>
        e.status === 'pendente' && e.data && e.data >= ini && e.data <= fim
      ).reduce((s, e) => s + Number(e.valor || 0), 0)
      receita += pendNoMes
      // Despesa
      const despesa = custoFixo
      acum += receita - despesa
      meses.push({
        label: MES_CURTO[d.getMonth()],
        receita, despesa, saldoAcum: acum,
        isFuturo: i > 0,
      })
    }
    return meses
  }, [saldoCaixa, receitaRecorrente, custoFixo, mensAceitas, setupAceitas, entries, hoje])

  // Histórico 6 meses anteriores (realizado)
  const historico = useMemo(() => {
    const result: { label: string; receita: number; despesa: number; saldo: number }[] = []
    for (let i = 6; i >= 1; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const ini = toISO(new Date(d.getFullYear(), d.getMonth(), 1))
      const fim = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
      const rec = entries.filter(e => e.status === 'recebido' && e.data && e.data >= ini && e.data <= fim)
        .reduce((s, e) => s + Number(e.valor || 0), 0)
      const desp = expenses.filter(e => e.tipo === 'avulsa' && e.pago && e.data && e.data >= ini && e.data <= fim)
        .reduce((s, e) => s + Number(e.valor || 0), 0)
      result.push({
        label: MES_CURTO[d.getMonth()],
        receita: rec,
        despesa: desp,
        saldo:   rec - desp,
      })
    }
    return result
  }, [entries, expenses, hoje])

  // Alertas
  const alertas = useMemo(() => {
    const list: { tipo: 'alerta' | 'bom'; titulo: string; corpo: string }[] = []
    if (Number.isFinite(runway)) {
      if (runway < 2) list.push({ tipo: 'alerta', titulo: 'Runway crítico', corpo: `Caixa dura cerca de ${runway.toFixed(1)} ${runway === 1 ? 'mês' : 'meses'} no ritmo atual. Acelere as cobranças.` })
      else if (runway < 6) list.push({ tipo: 'alerta', titulo: 'Atenção ao runway', corpo: `Você tem ${runway.toFixed(1)} meses de fôlego. Confirme propostas em pipeline.` })
    }
    if (queimaMensal <= 0 && receitaRecorrente > 0) list.push({ tipo: 'bom', titulo: 'Operação saudável', corpo: 'Sua receita recorrente cobre os custos fixos. Foco em crescer.' })
    if (saldoProj30 < 0) list.push({ tipo: 'alerta', titulo: 'Mês fecha negativo', corpo: `Saldo projetado em 30 dias: R$ ${numToMask(saldoProj30)}. Reveja contas a pagar.` })
    if (totalReceber30 > 0 && totalReceber30 < totalPagar30) list.push({ tipo: 'alerta', titulo: 'A receber < a pagar', corpo: `R$ ${numToMask(totalReceber30)} a entrar contra R$ ${numToMask(totalPagar30)} a sair nos próximos 30 dias.` })
    if (mensEnviadas > 0) list.push({ tipo: 'bom', titulo: 'Pipeline com tração', corpo: `R$ ${numToMask(mensEnviadas)}/mês em propostas enviadas aguardando resposta.` })
    return list
  }, [runway, queimaMensal, receitaRecorrente, saldoProj30, totalReceber30, totalPagar30, mensEnviadas])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
    </div>
  )

  const mesNome = MES_NOME[hoje.getMonth()]
  const ano     = hoje.getFullYear()
  const positivo = saldoCaixa >= 0

  return (
    <div className="max-w-[1400px] mx-auto pb-16">

      {/* Editorial header */}
      <header className="flex items-end justify-between gap-6 mb-12 pt-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-slate-300/70">
            Operação · {mesNome} {ano}
          </p>
          <h1 className="font-display text-white mt-2 leading-[0.95] tracking-tight"
              style={{
                fontSize: 'clamp(48px, 7vw, 88px)',
                fontVariationSettings: '"opsz" 144, "SOFT" 30',
                fontWeight: 400,
              }}>
            Fluxo de caixa<span className="text-indigo-300/90 italic ml-1" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>.</span>
          </h1>
          <p className="text-slate-300 text-sm mt-3 max-w-md font-display italic"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
            visão completa do seu dinheiro — passado, presente e os próximos doze meses.
          </p>
        </div>
        <button onClick={load}
          className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-full text-slate-300 text-xs font-medium bg-white/[0.03] border border-white/[0.08] hover:border-white/20 transition-colors shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </header>

      {error && (
        <div className="mb-6 px-5 py-3 rounded-2xl bg-rose-500/[0.06] border border-rose-500/15 text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* Hero saldo + KPIs */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-white/[0.06] border border-white/[0.06] rounded-3xl overflow-hidden mb-12">

        {/* Saldo em caixa */}
        <div className="lg:col-span-7 bg-[#0a0c11] p-10 sm:p-12 relative overflow-hidden">
          <div className={`absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full blur-3xl pointer-events-none
            ${positivo ? 'bg-emerald-500/[0.08]' : 'bg-rose-500/[0.08]'}`} />

          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
            Saldo em caixa
          </p>

          <div className="mt-7 flex items-baseline gap-3 relative">
            <span className={`text-3xl font-display ${positivo ? 'text-emerald-300' : 'text-rose-300'}`}
                  style={{ fontVariationSettings: '"opsz" 144, "SOFT" 60' }}>
              {positivo ? '+' : '−'}
            </span>
            <span className="text-slate-300 text-2xl font-mono mr-1">R$</span>
            <span className={`font-display tracking-tight leading-none ${positivo ? 'text-white' : 'text-rose-50'}`}
                  style={{
                    fontVariationSettings: '"opsz" 144, "SOFT" 30',
                    fontSize: 'clamp(56px, 8vw, 104px)',
                    fontWeight: 400,
                  }}>
              {numToMask(Math.abs(saldoCaixa))}
            </span>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono
              ${saldoMes >= 0
                ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
                : 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20'}`}>
              {saldoMes >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              no mês {saldoMes >= 0 ? '+' : '−'} R$ {numToMask(Math.abs(saldoMes))}
            </span>

            {Number.isFinite(runway) ? (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono
                ${runway < 3
                  ? 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20'
                  : runway < 6
                  ? 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20'
                  : 'bg-white/[0.04] text-slate-200 ring-1 ring-white/[0.08]'}`}>
                <TrendingDown className="w-3 h-3" />
                runway {runway.toFixed(1)} {runway === 1 ? 'mês' : 'meses'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20">
                <Sparkles className="w-3 h-3" /> operação se sustenta sozinha
              </span>
            )}
          </div>

          <p className="mt-10 text-slate-300 text-sm font-display italic max-w-md leading-relaxed"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 50' }}>
            {saldoProj30 >= saldoCaixa
              ? `Em 30 dias o caixa deve subir para R$ ${numToMask(saldoProj30)}. Trajetória positiva.`
              : `Em 30 dias o caixa deve cair para R$ ${numToMask(saldoProj30)}. Atenção às próximas saídas.`}
          </p>
        </div>

        {/* KPIs */}
        <div className="lg:col-span-5 bg-[#0a0c11] grid grid-cols-2 grid-rows-2 gap-px bg-white/[0.06]">
          <KPI kicker="Entradas no mês"  value={mesEntradas}     tone="emerald" sub={`${MES_CURTO[hoje.getMonth()]}/${String(ano).slice(2)}`} />
          <KPI kicker="Despesas no mês"  value={mesDespesasPagas} tone="rose"    sub="pagas no ciclo" />
          <KPI kicker="A receber 30 d"    value={totalReceber30}   tone="emerald" sub={`${movimentosFuturos.filter(m=>m.tipo==='entrada').length} eventos`} />
          <KPI kicker="A pagar 30 d"      value={totalPagar30}     tone="rose"    sub={`${movimentosFuturos.filter(m=>m.tipo==='saida').length} eventos`} />
        </div>
      </section>

      {/* Alertas */}
      {alertas.length > 0 && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">Sinais</p>
              <h2 className="font-display text-3xl text-white mt-1.5 tracking-tight"
                  style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
                O que <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>observar</span>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alertas.map((a, i) => (
              <div key={i}
                className={`relative bg-[#0a0c11] border rounded-2xl p-5
                  ${a.tipo === 'alerta'
                    ? 'border-amber-500/15'
                    : 'border-emerald-500/15'}`}>
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                    ${a.tipo === 'alerta' ? 'bg-amber-500/15' : 'bg-emerald-500/15'}`}>
                    {a.tipo === 'alerta'
                      ? <AlertTriangle className="w-4 h-4 text-amber-300" />
                      : <Sparkles className="w-4 h-4 text-emerald-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-display text-base tracking-tight
                      ${a.tipo === 'alerta' ? 'text-amber-100' : 'text-emerald-50'}`}
                      style={{ fontVariationSettings: '"opsz" 24, "SOFT" 50' }}>
                      {a.titulo}
                    </p>
                    <p className="text-slate-300 text-xs mt-1 leading-relaxed">{a.corpo}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Calendário 30 dias */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">Próximos 30 dias</p>
            <h2 className="font-display text-3xl text-white mt-1.5 tracking-tight"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
              Agenda do <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>caixa</span>
            </h2>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">Saldo projetado em 30d</p>
            <p className={`font-display text-2xl mt-0.5 ${saldoProj30 >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
               style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
              <span className="text-slate-300/60 text-sm font-mono mr-1">R$</span>
              <span className="font-numeric">{numToMask(saldoProj30)}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/[0.06] border border-white/[0.06] rounded-3xl overflow-hidden">
          <ColunaMovimentos
            titulo="A receber"
            tone="emerald"
            total={totalReceber30}
            itens={movimentosFuturos.filter(m => m.tipo === 'entrada')}
          />
          <ColunaMovimentos
            titulo="A pagar"
            tone="rose"
            total={totalPagar30}
            itens={movimentosFuturos.filter(m => m.tipo === 'saida')}
          />
        </div>
      </section>

      {/* Projeção 12m */}
      <ProjecaoChart12m projecao={projecao} custoFixo={custoFixo} />

      {/* Histórico 6m */}
      {historico.some(m => m.receita > 0 || m.despesa > 0) && (
        <HistoricoChart historico={historico} />
      )}

    </div>
  )
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function KPI({ kicker, value, tone, sub }: {
  kicker: string
  value: number
  tone: 'emerald' | 'rose'
  sub: string
}) {
  const color = tone === 'emerald' ? 'text-emerald-200' : 'text-rose-200'
  return (
    <div className="bg-[#0a0c11] p-6 sm:p-7 flex flex-col justify-between">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">{kicker}</p>
      <div className="mt-6">
        <p className={`font-display text-3xl tracking-tight ${color}`}
           style={{ fontVariationSettings: '"opsz" 48, "SOFT" 40' }}>
          <span className="text-slate-300/60 text-base font-mono mr-1">R$</span>
          <span className="font-numeric">{numToMask(value)}</span>
        </p>
        <p className="text-slate-300 text-xs mt-2">{sub}</p>
      </div>
    </div>
  )
}

function ColunaMovimentos({ titulo, tone, total, itens }: {
  titulo: string
  tone: 'emerald' | 'rose'
  total: number
  itens: MovimentoFuturo[]
}) {
  const corPrincipal = tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300'
  const corBg        = tone === 'emerald' ? 'bg-emerald-400'   : 'bg-rose-400'
  const sinal        = tone === 'emerald' ? '+' : '−'

  return (
    <div className="bg-[#0a0c11] p-6 sm:p-8">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className={`w-1.5 h-1.5 rounded-full ${corBg}`} />
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/80">{titulo}</p>
        </div>
        <p className={`font-numeric ${corPrincipal} text-sm font-medium`}>
          {sinal} R$ {numToMask(total)}
        </p>
      </div>

      {itens.length === 0 ? (
        <p className="text-slate-300/60 text-sm font-display italic py-8 text-center"
           style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
          nada {tone === 'emerald' ? 'a receber' : 'a pagar'} nos próximos 30 dias.
        </p>
      ) : (
        <div className="space-y-px bg-white/[0.04] -mx-2 rounded-xl overflow-hidden">
          {itens.map(m => (
            <div key={m.id} className="bg-[#0a0c11] flex items-center gap-4 px-4 py-3.5">
              <div className="text-center shrink-0 w-12">
                <p className="font-mono text-[10px] text-slate-300/60 uppercase tracking-wider">
                  {MES_CURTO[m.data.getMonth()]}
                </p>
                <p className="font-display text-xl text-white -mt-0.5"
                   style={{ fontVariationSettings: '"opsz" 24, "SOFT" 30' }}>
                  {m.data.getDate()}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{m.descricao}</p>
                <p className="text-slate-300/70 text-[11px] mt-0.5 truncate">
                  {m.detalhe}
                  {m.recorrente && <span className="ml-1.5 text-indigo-300/70">· recorrente</span>}
                </p>
              </div>
              <p className={`font-numeric ${corPrincipal} text-sm font-medium shrink-0`}>
                {sinal} R$ {numToMask(m.valor)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjecaoChart12m({ projecao, custoFixo }: {
  projecao: { label: string; receita: number; despesa: number; saldoAcum: number; isFuturo: boolean }[]
  custoFixo: number
}) {
  const maxReceitaDespesa = Math.max(...projecao.flatMap(p => [p.receita, p.despesa]), 1) * 1.2
  const saldosAcum = projecao.map(p => p.saldoAcum)
  const minSaldo   = Math.min(0, ...saldosAcum)
  const maxSaldo   = Math.max(0, ...saldosAcum)

  // SVG
  const W = 960, H = 380, padL = 64, padR = 24, padT = 32, padB = 40
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const step   = innerW / 12
  const barW   = step * 0.32  // duas barras lado a lado
  const halfGap = 4

  const yOf = (v: number) => padT + innerH - (v / maxReceitaDespesa) * innerH

  // Saldo line: usa o range entre min e max para usar todo o eixo Y
  const saldoYOf = (v: number) => {
    const proportion = (v - minSaldo) / (maxSaldo - minSaldo || 1)
    return padT + innerH - proportion * innerH
  }

  const ticks = [0, maxReceitaDespesa * 0.5, maxReceitaDespesa]

  const ultimoSaldo = projecao[projecao.length - 1].saldoAcum

  return (
    <section className="bg-[#0a0c11] border border-white/[0.06] rounded-3xl p-8 sm:p-10 mb-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
            Trajetória · doze meses à frente
          </p>
          <h3 className="font-display text-3xl text-white tracking-tight mt-1.5"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
            Projeção <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>de caixa</span>
          </h3>
        </div>
        <div className="flex items-center gap-5 text-[11px] text-slate-300 font-mono uppercase tracking-wider">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-emerald-400/80" />receita</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-rose-400/80" />despesa</span>
          <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-indigo-300" />saldo acumulado</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="grRec" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="rgb(52,211,153)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id="grDes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="rgb(251,113,133)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="rgb(225,29,72)" stopOpacity="0.45" />
            </linearGradient>
            <linearGradient id="grSal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="rgb(165,180,252)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)} stroke="rgba(255,255,255,0.045)" />
              <text x={padL - 12} y={yOf(t) + 3.5} fill="rgba(203,213,225,0.45)"
                fontSize="9" fontFamily="JetBrains Mono" textAnchor="end">
                {t >= 1000 ? `${(t/1000).toFixed(1)}k` : t.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Linha do zero do saldo */}
          {minSaldo < 0 && (
            <line x1={padL} y1={saldoYOf(0)} x2={W - padR} y2={saldoYOf(0)}
              stroke="rgba(203,213,225,0.25)" strokeDasharray="2 4" />
          )}

          {/* Barras receita / despesa lado a lado */}
          {projecao.map((p, i) => {
            const xCenter = padL + step * i + step / 2
            const xR = xCenter - barW - halfGap
            const xD = xCenter + halfGap
            const yR = yOf(p.receita)
            const yD = yOf(p.despesa)
            const hR = padT + innerH - yR
            const hD = padT + innerH - yD
            return (
              <g key={i} opacity={p.isFuturo ? 1 : 0.55}>
                {hR > 0.5 && <rect x={xR} y={yR} width={barW} height={hR} fill="url(#grRec)" rx="3" />}
                {hD > 0.5 && <rect x={xD} y={yD} width={barW} height={hD} fill="url(#grDes)" rx="3" />}
                {/* marcador do "agora" */}
                {i === 0 && (
                  <text x={xCenter} y={padT - 10}
                    fill="rgba(165,180,252,0.85)" fontSize="9" fontFamily="JetBrains Mono"
                    textAnchor="middle" letterSpacing="2">
                    AGORA
                  </text>
                )}
              </g>
            )
          })}

          {/* Linha custo fixo */}
          {custoFixo > 0 && (
            <line x1={padL} y1={yOf(custoFixo)} x2={W - padR} y2={yOf(custoFixo)}
              stroke="rgba(251,113,133,0.45)" strokeWidth="1" strokeDasharray="3 4" />
          )}

          {/* Saldo acumulado: area + line */}
          <path
            fill="url(#grSal)"
            d={`M ${padL + step / 2},${saldoYOf(0)}
                ${projecao.map((p, i) => `L ${padL + step * i + step / 2},${saldoYOf(p.saldoAcum)}`).join(' ')}
                L ${padL + step * 11 + step / 2},${saldoYOf(0)} Z`}
          />
          <polyline
            fill="none"
            stroke="rgb(165,180,252)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={projecao.map((p, i) => `${padL + step * i + step / 2},${saldoYOf(p.saldoAcum)}`).join(' ')}
          />
          {projecao.map((p, i) => (
            <circle key={i} cx={padL + step * i + step / 2} cy={saldoYOf(p.saldoAcum)} r="2.5"
              fill="#0a0c11" stroke="rgb(165,180,252)" strokeWidth="1.5" />
          ))}

          {/* Eixo X */}
          {projecao.map((p, i) => (
            <text key={i} x={padL + step * i + step / 2} y={H - 14}
              fill={i === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(203,213,225,0.55)'}
              fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle"
              letterSpacing="1.5">
              {p.label.toUpperCase()}
            </text>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden mt-8">
        <ResumoCenario kicker="Saldo em 6 meses"  value={projecao[5].saldoAcum} />
        <ResumoCenario kicker="Saldo em 12 meses" value={ultimoSaldo} highlight />
        <ResumoCenario kicker="Mês mais apertado"
          value={Math.min(...projecao.map(p => p.saldoAcum))}
          hint={
            (() => {
              const idx = projecao.reduce((minI, p, i, arr) => p.saldoAcum < arr[minI].saldoAcum ? i : minI, 0)
              return projecao[idx].label
            })()
          } />
      </div>
    </section>
  )
}

function ResumoCenario({ kicker, value, hint, highlight }: {
  kicker: string
  value: number
  hint?: string
  highlight?: boolean
}) {
  const positivo = value >= 0
  return (
    <div className={`bg-[#0a0c11] p-6 ${highlight ? 'ring-1 ring-inset ring-indigo-400/20' : ''}`}>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">{kicker}</p>
        {highlight && <span className="text-[9px] font-mono uppercase tracking-widest text-indigo-300">primário</span>}
      </div>
      <p className={`mt-3 font-display text-2xl tracking-tight ${positivo ? 'text-white' : 'text-rose-200'}`}
         style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
        <span className="text-slate-300/60 text-sm font-mono mr-1">R$</span>
        <span className="font-numeric">{numToMask(value)}</span>
      </p>
      {hint && <p className="text-slate-300 text-xs mt-1.5 uppercase tracking-wider">{hint}</p>}
    </div>
  )
}

function HistoricoChart({ historico }: {
  historico: { label: string; receita: number; despesa: number; saldo: number }[]
}) {
  const max = Math.max(...historico.flatMap(h => [h.receita, h.despesa]), 1) * 1.15
  const W = 960, H = 220, padL = 64, padR = 24, padT = 24, padB = 36
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const step   = innerW / historico.length
  const barW   = step * 0.32
  const halfGap = 4

  const yOf = (v: number) => padT + innerH - (v / max) * innerH

  return (
    <section className="bg-[#0a0c11] border border-white/[0.06] rounded-3xl p-8 sm:p-10 mb-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
            Histórico · seis meses
          </p>
          <h3 className="font-display text-3xl text-white tracking-tight mt-1.5"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
            O que <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>aconteceu</span>
          </h3>
        </div>
        <div className="flex items-center gap-5 text-[11px] text-slate-300 font-mono uppercase tracking-wider">
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-emerald-400/70" />recebido</span>
          <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-rose-400/70" />pago</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {historico.map((h, i) => {
            const xCenter = padL + step * i + step / 2
            const xR = xCenter - barW - halfGap
            const xD = xCenter + halfGap
            const yR = yOf(h.receita)
            const yD = yOf(h.despesa)
            const hR = padT + innerH - yR
            const hD = padT + innerH - yD
            return (
              <g key={i}>
                {hR > 0.5 && <rect x={xR} y={yR} width={barW} height={hR} fill="rgba(52,211,153,0.7)" rx="3" />}
                {hD > 0.5 && <rect x={xD} y={yD} width={barW} height={hD} fill="rgba(251,113,133,0.7)" rx="3" />}
                <text x={xCenter} y={H - 12}
                  fill="rgba(203,213,225,0.55)"
                  fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle" letterSpacing="1.5">
                  {h.label.toUpperCase()}
                </text>
              </g>
            )
          })}

          {/* eixo Y */}
          {[0, max * 0.5, max].map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={yOf(t)} x2={W - padR} y2={yOf(t)} stroke="rgba(255,255,255,0.04)" />
              <text x={padL - 12} y={yOf(t) + 3.5} fill="rgba(203,213,225,0.4)"
                fontSize="9" fontFamily="JetBrains Mono" textAnchor="end">
                {t >= 1000 ? `${(t/1000).toFixed(1)}k` : t.toFixed(0)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}

// ── Helper de data ────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

