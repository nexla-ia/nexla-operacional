import { useEffect, useMemo, useState } from 'react'
import { Trophy, XCircle, Target, Wallet, Percent, Repeat, Activity, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { CrmLead, CrmStage, CrmProfile, CrmFunnel, CrmInteraction } from '../../lib/types'
import { fmtBRL, fmtBRLCompact, fmtDataHoraBR, INTERACTION_META } from './constants'

const PERIODOS = [
  { key: 'mes',  label: 'Mês atual' },
  { key: '30',   label: 'Últimos 30 dias' },
  { key: '90',   label: 'Últimos 90 dias' },
  { key: 'tudo', label: 'Todo o período' },
] as const

type Periodo = (typeof PERIODOS)[number]['key']

interface Props {
  leads:    CrmLead[]
  stages:   CrmStage[]
  profiles: CrmProfile[]
  funnels:  CrmFunnel[]
  meId:     string | null
  isAdmin:  boolean
}

interface LinhaVendedor {
  id:         string
  nome:       string
  criados:    number
  abertos:    number
  ganhos:     number
  perdidos:   number
  valorGanho: number
  mrrGanho:   number
  atividades: number
  conversao:  number
}

export default function Desempenho({ leads, stages, profiles, funnels, meId, isAdmin }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [funil, setFunil]     = useState('todos')
  const [atividades, setAtividades] = useState<CrmInteraction[]>([])
  const [carregando, setCarregando] = useState(true)

  const inicio = useMemo(() => {
    const d = new Date()
    if (periodo === 'mes')  { d.setDate(1); d.setHours(0, 0, 0, 0); return d }
    if (periodo === '30')   { d.setDate(d.getDate() - 30); return d }
    if (periodo === '90')   { d.setDate(d.getDate() - 90); return d }
    return new Date(0)
  }, [periodo])

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    supabase.from('crm_interactions')
      .select('id, lead_id, tipo, conteudo, autor_nome, created_at')
      .gte('created_at', inicio.toISOString())
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (!ativo) return
        setAtividades((data ?? []) as CrmInteraction[])
        setCarregando(false)
      })
    return () => { ativo = false }
  }, [inicio])

  const escopo = useMemo(
    () => leads.filter(l => funil === 'todos' || l.funil_id === funil),
    [leads, funil],
  )

  const noPeriodo = (iso?: string | null) => !!iso && new Date(iso) >= inicio

  const criados  = escopo.filter(l => noPeriodo(l.created_at))
  const ganhos   = escopo.filter(l => l.status === 'ganho'   && noPeriodo(l.data_fechamento))
  const perdidos = escopo.filter(l => l.status === 'perdido' && noPeriodo(l.data_fechamento))
  const abertos  = escopo.filter(l => l.status === 'aberto')

  const valorGanho = ganhos.reduce((s, l) => s + Number(l.valor || 0), 0)
  const mrrGanho   = ganhos.reduce((s, l) => s + Number(l.valor_recorrente || 0), 0)
  const pipeline   = abertos.reduce((s, l) => s + Number(l.valor || 0), 0)
  const fechados   = ganhos.length + perdidos.length
  const conversao  = fechados ? Math.round((ganhos.length / fechados) * 100) : 0
  const ticket     = ganhos.length ? valorGanho / ganhos.length : 0

  // ── Ranking por vendedor ────────────────────────────────────────────────────

  const linhas: LinhaVendedor[] = useMemo(() => {
    const base = profiles.map(p => ({ id: p.id, nome: p.full_name?.trim() || 'Sem nome' }))
    const comSem = [...base, { id: '__sem__', nome: 'Sem responsável' }]

    const linhas = comSem.map(v => {
      const doVendedor = (l: CrmLead) =>
        v.id === '__sem__' ? !l.responsavel_id : l.responsavel_id === v.id
      const g = ganhos.filter(doVendedor)
      const p = perdidos.filter(doVendedor)
      const fech = g.length + p.length
      return {
        id:         v.id,
        nome:       v.nome,
        criados:    criados.filter(doVendedor).length,
        abertos:    abertos.filter(doVendedor).length,
        ganhos:     g.length,
        perdidos:   p.length,
        valorGanho: g.reduce((s, l) => s + Number(l.valor || 0), 0),
        mrrGanho:   g.reduce((s, l) => s + Number(l.valor_recorrente || 0), 0),
        atividades: atividades.filter(a => (a.autor_nome ?? '').trim() === v.nome).length,
        conversao:  fech ? Math.round((g.length / fech) * 100) : 0,
      }
    }).filter(l => l.criados + l.abertos + l.ganhos + l.perdidos + l.atividades > 0)

    linhas.sort((a, b) => b.valorGanho - a.valorGanho || b.ganhos - a.ganhos)
    return isAdmin ? linhas : linhas.filter(l => l.id === meId)
  }, [profiles, criados, abertos, ganhos, perdidos, atividades, isAdmin, meId])

  // ── Distribuição no funil ───────────────────────────────────────────────────

  const etapas = useMemo(() => {
    const alvo = funil === 'todos' ? stages : stages.filter(s => s.funil_id === funil)
    return alvo
      .filter(s => s.tipo === 'aberto')
      .sort((a, b) => a.posicao - b.posicao)
      .map(s => {
        const doStage = abertos.filter(l => l.stage_id === s.id)
        return { ...s, qtd: doStage.length, valor: doStage.reduce((acc, l) => acc + Number(l.valor || 0), 0) }
      })
  }, [stages, abertos, funil])

  const maxEtapa = Math.max(1, ...etapas.map(e => e.qtd))

  // ── Origens e motivos ───────────────────────────────────────────────────────

  const origens = useMemo(() => {
    const m: Record<string, { total: number; ganhos: number }> = {}
    for (const l of criados) {
      const k = l.origem?.trim() || 'Sem origem'
      m[k] ??= { total: 0, ganhos: 0 }
      m[k].total++
    }
    for (const l of ganhos) {
      const k = l.origem?.trim() || 'Sem origem'
      m[k] ??= { total: 0, ganhos: 0 }
      m[k].ganhos++
    }
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total).slice(0, 6)
  }, [criados, ganhos])

  const maxOrigem = Math.max(1, ...origens.map(([, v]) => v.total))

  const motivos = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of perdidos) {
      const k = (l.motivo_perda ?? 'Não informado').split('—')[0].trim() || 'Não informado'
      m[k] = (m[k] ?? 0) + 1
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [perdidos])

  // ── Feed de interações ──────────────────────────────────────────────────────

  const leadPorId = useMemo(() => {
    const m: Record<string, CrmLead> = {}
    for (const l of leads) m[l.id] = l
    return m
  }, [leads])

  const meuNome = useMemo(
    () => profiles.find(p => p.id === meId)?.full_name?.trim() ?? '',
    [profiles, meId],
  )

  const feed = useMemo(() => {
    const noEscopo = atividades.filter(ix => {
      const l = leadPorId[ix.lead_id]
      return funil === 'todos' || (l && l.funil_id === funil)
    })
    const visiveis = isAdmin ? noEscopo : noEscopo.filter(ix => (ix.autor_nome ?? '').trim() === meuNome)
    return visiveis.slice(0, 60)
  }, [atividades, leadPorId, funil, isAdmin, meuNome])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-4">

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}
          className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-xs focus:outline-none focus:border-white/20 [&>option]:bg-slate-900">
          {PERIODOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select value={funil} onChange={e => setFunil(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-xs focus:outline-none focus:border-white/20 [&>option]:bg-slate-900">
          <option value="todos">Todos os funis</option>
          {funnels.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        {carregando && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi Icon={Target}  cor="text-indigo-400"  label="Leads criados" valor={String(criados.length)}
          rodape={`${abertos.length} em aberto`} />
        <Kpi Icon={Trophy}  cor="text-emerald-400" label="Vendas ganhas" valor={String(ganhos.length)}
          rodape={fmtBRL(valorGanho)} />
        <Kpi Icon={XCircle} cor="text-red-400"     label="Perdidos" valor={String(perdidos.length)}
          rodape={`${fechados} negócios fechados`} />
        <Kpi Icon={Percent} cor="text-violet-400"  label="Taxa de conversão" valor={`${conversao}%`}
          rodape={`ticket médio ${fmtBRLCompact(ticket)}`} />
        <Kpi Icon={Wallet}  cor="text-emerald-400" label="Faturamento fechado" valor={fmtBRLCompact(valorGanho)}
          rodape="valor único das vendas" />
        <Kpi Icon={Repeat}  cor="text-teal-400"    label="Recorrente conquistado" valor={fmtBRLCompact(mrrGanho)}
          rodape="por mês" />
        <Kpi Icon={Target}  cor="text-sky-400"     label="Pipeline em aberto" valor={fmtBRLCompact(pipeline)}
          rodape={`${abertos.length} leads ativos`} />
        <Kpi Icon={Activity} cor="text-amber-400"  label="Interações registradas" valor={String(atividades.length)}
          rodape="ligações, e-mails, reuniões…" />
      </div>

      {/* Ranking */}
      <Bloco titulo={isAdmin ? 'Desempenho por vendedor' : 'Seu desempenho'}>
        {linhas.length === 0 ? (
          <p className="text-slate-500 text-xs py-4">Nenhuma atividade no período selecionado.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.15em]">
                  <th className="text-left font-medium py-2 px-2">Vendedor</th>
                  <th className="text-right font-medium py-2 px-2">Criados</th>
                  <th className="text-right font-medium py-2 px-2">Abertos</th>
                  <th className="text-right font-medium py-2 px-2">Ganhos</th>
                  <th className="text-right font-medium py-2 px-2">Perdidos</th>
                  <th className="text-right font-medium py-2 px-2">Conv.</th>
                  <th className="text-right font-medium py-2 px-2">Interações</th>
                  <th className="text-right font-medium py-2 px-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.id} className="border-t border-white/[0.05]">
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        {isAdmin && i === 0 && l.valorGanho > 0 && <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        <span className="text-white font-medium truncate max-w-[160px]">{l.nome}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-300 tabular-nums">{l.criados}</td>
                    <td className="py-2.5 px-2 text-right text-slate-300 tabular-nums">{l.abertos}</td>
                    <td className="py-2.5 px-2 text-right text-emerald-300 font-semibold tabular-nums">{l.ganhos}</td>
                    <td className="py-2.5 px-2 text-right text-red-300 tabular-nums">{l.perdidos}</td>
                    <td className="py-2.5 px-2 text-right text-slate-300 tabular-nums">{l.conversao}%</td>
                    <td className="py-2.5 px-2 text-right text-amber-300 tabular-nums">{l.atividades}</td>
                    <td className="py-2.5 px-2 text-right text-white font-semibold tabular-nums">
                      {fmtBRLCompact(l.valorGanho)}
                      {l.mrrGanho > 0 && <span className="text-teal-400/80 text-[10px] block">+{fmtBRLCompact(l.mrrGanho)}/mês</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribuição no funil */}
        <Bloco titulo="Onde estão os leads em aberto">
          {etapas.length === 0 ? (
            <p className="text-slate-500 text-xs py-4">Sem etapas para exibir.</p>
          ) : (
            <div className="space-y-3">
              {etapas.map(e => (
                <div key={e.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-2 text-slate-300 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ background: e.cor }} />
                      {e.nome}
                    </span>
                    <span className="text-slate-400 text-[11px] tabular-nums">
                      {e.qtd} {e.valor > 0 && <span className="text-emerald-300/80">· {fmtBRLCompact(e.valor)}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(e.qtd / maxEtapa) * 100}%`, background: e.cor }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        {/* Origens */}
        <Bloco titulo="De onde vêm os leads">
          {origens.length === 0 ? (
            <p className="text-slate-500 text-xs py-4">Nenhum lead criado no período.</p>
          ) : (
            <div className="space-y-3">
              {origens.map(([nome, v]) => (
                <div key={nome}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-300 text-xs">{nome}</span>
                    <span className="text-slate-400 text-[11px] tabular-nums">
                      {v.total} lead(s){v.ganhos > 0 && <span className="text-emerald-300/80"> · {v.ganhos} ganho(s)</span>}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden flex">
                    <div className="h-full bg-emerald-500" style={{ width: `${(v.ganhos / maxOrigem) * 100}%` }} />
                    <div className="h-full bg-indigo-500/70" style={{ width: `${((v.total - v.ganhos) / maxOrigem) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Bloco>
      </div>

      {/* Motivos de perda */}
      {motivos.length > 0 && (
        <Bloco titulo="Por que estamos perdendo">
          <div className="flex flex-wrap gap-2">
            {motivos.map(([nome, qtd]) => (
              <span key={nome} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/[0.07] border border-red-500/20 text-red-200 text-xs">
                {nome}
                <span className="text-red-300/80 font-semibold tabular-nums">{qtd}</span>
              </span>
            ))}
          </div>
        </Bloco>
      )}

      {/* Feed de interações */}
      <Bloco titulo={isAdmin ? 'Atividades recentes do time' : 'Suas atividades recentes'}>
        {feed.length === 0 ? (
          <p className="text-slate-500 text-xs py-4">Nenhuma interação registrada no período.</p>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {feed.map(ix => {
              const meta = INTERACTION_META[ix.tipo] ?? INTERACTION_META.nota
              const lead = leadPorId[ix.lead_id]
              return (
                <div key={ix.id} className="flex items-start gap-2.5">
                  <span className={`mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ring-1 shrink-0 ${meta.tone}`}>
                    <meta.Icon className="w-2.5 h-2.5" />{meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-xs truncate">
                      <span className="text-white font-medium">{lead?.nome ?? 'Lead removido'}</span>
                      {ix.conteudo ? ` — ${ix.conteudo}` : ''}
                    </p>
                    <p className="text-slate-600 text-[10px]">
                      {fmtDataHoraBR(ix.created_at)}{ix.autor_nome ? ` · ${ix.autor_nome}` : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Bloco>
    </div>
  )
}

// ── UI ────────────────────────────────────────────────────────────────────────

function Kpi({ Icon, cor, label, valor, rodape }: {
  Icon:   typeof Trophy
  cor:    string
  label:  string
  valor:  string
  rodape: string
}) {
  return (
    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${cor}`} />
        <span className="text-slate-400 text-[11px] font-medium">{label}</span>
      </div>
      <p className="text-white text-xl font-bold tabular-nums leading-none">{valor}</p>
      <p className="text-slate-500 text-[10px] mt-1.5">{rodape}</p>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.07]">
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 mb-4">{titulo}</p>
      {children}
    </div>
  )
}
