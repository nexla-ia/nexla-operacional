import { useEffect, useMemo, useState } from 'react'
import {
  Plus, X, Search, Loader2, GripVertical, Edit2, Trash2, Target,
  AlertTriangle, Clock, CalendarClock, Trophy, Flame, CheckSquare, Square,
  ChevronRight, LayoutGrid, BarChart3, ListTodo, Building2, GitMerge, Wallet,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { maskBRL, parseBRL, numToMask, maskPhone } from '../../lib/utils'
import type { CrmFunnel, CrmStage, CrmLead, CrmTask, CrmProfile, CrmInteractionType } from '../../lib/types'
import {
  DEFAULT_STAGES, STAGE_COLORS, ORIGENS, MOTIVOS_PERDA, TEMPERATURAS,
  tempOf, diasDesde, diasAte, fmtBRL, fmtBRLCompact, iniciais, hojeISO, fmtDataBR,
  type Temperatura,
} from './constants'
import LeadPanel from './LeadPanel'
import Desempenho from './Desempenho'

// ── Estilos compartilhados ────────────────────────────────────────────────────

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-300 mb-1.5'
const selectCls = `${inputCls} [&>option]:bg-slate-900`

type View = 'board' | 'agenda' | 'alertas' | 'desempenho'

interface NovoLeadForm {
  nome:             string
  empresa:          string
  telefone:         string
  email:            string
  origem:           string
  temperatura:      Temperatura
  valor:            string
  valor_recorrente: string
  stage_id:         string
  responsavel_id:   string
  proximo_contato:  string
  observacoes:      string
}

interface StageForm {
  id:          string | null
  nome:        string
  cor:         string
  alerta_dias: string
  tipo:        'aberto' | 'ganho' | 'perdido'
}

const EMPTY_LEAD: NovoLeadForm = {
  nome: '', empresa: '', telefone: '', email: '', origem: '', temperatura: 'morno',
  valor: '', valor_recorrente: '', stage_id: '', responsavel_id: '', proximo_contato: '', observacoes: '',
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function CRM({ role }: { role?: 'admin' | 'operator' | null }) {
  const [loading, setLoading]     = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)
  const [me, setMe]               = useState<{ id: string; nome: string } | null>(null)
  const [profiles, setProfiles]   = useState<CrmProfile[]>([])
  const [funnels, setFunnels]     = useState<CrmFunnel[]>([])
  const [stages, setStages]       = useState<CrmStage[]>([])
  const [leads, setLeads]         = useState<CrmLead[]>([])
  const [tasks, setTasks]         = useState<CrmTask[]>([])

  const [activeFunnel, setActiveFunnel] = useState<string | null>(null)
  const [view, setView]           = useState<View>('board')
  const [search, setSearch]       = useState('')
  const [filtroTemp, setFiltroTemp] = useState('todos')
  const [filtroResp, setFiltroResp] = useState('todos')

  const [dragLead, setDragLead]   = useState<CrmLead | null>(null)
  const [dragOver, setDragOver]   = useState<string | null>(null)
  const [dragStage, setDragStage] = useState<CrmStage | null>(null)

  const [panelId, setPanelId]     = useState<string | null>(null)
  const [novoLead, setNovoLead]   = useState<NovoLeadForm | null>(null)
  const [stageModal, setStageModal]   = useState<StageForm | null>(null)
  const [funnelModal, setFunnelModal] = useState<{ id: string | null; nome: string } | null>(null)
  const [ganhoModal, setGanhoModal]   = useState<{ lead: CrmLead; stageId: string; valor: string; criarCliente: boolean } | null>(null)
  const [perdaModal, setPerdaModal]   = useState<{ lead: CrmLead; stageId: string; motivo: string; comentario: string } | null>(null)
  const [saving, setSaving]       = useState(false)
  const [erro, setErro]           = useState('')

  // ── Carga inicial ───────────────────────────────────────────────────────────

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id ?? null

    const [{ data: pf }, funRes, { data: st }, { data: ld }, { data: tk }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role'),
      supabase.from('crm_funnels').select('*').order('posicao'),
      supabase.from('crm_stages').select('*').order('posicao'),
      supabase.from('crm_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_tasks').select('*').order('due_date', { nullsFirst: false }),
    ])

    if (funRes.error) { setMigrationPending(true); setLoading(false); return }

    const perfis = (pf ?? []) as CrmProfile[]
    setProfiles(perfis)
    if (uid) {
      const meu = perfis.find(p => p.id === uid)
      setMe({ id: uid, nome: meu?.full_name?.trim() || auth.user?.email || 'Usuário' })
    }

    let fns = (funRes.data ?? []) as CrmFunnel[]
    let sts = (st ?? []) as CrmStage[]

    if (fns.length === 0) {
      const { data: nf } = await supabase
        .from('crm_funnels').insert({ nome: 'Funil de Vendas', posicao: 0 }).select().single()
      if (nf) {
        fns = [nf as CrmFunnel]
        const { data: ns } = await supabase
          .from('crm_stages').insert(DEFAULT_STAGES.map(s => ({ ...s, funil_id: nf.id }))).select()
        sts = ((ns ?? []) as CrmStage[]).sort((a, b) => a.posicao - b.posicao)
      }
    }

    setFunnels(fns)
    setStages(sts)
    setLeads((ld ?? []) as CrmLead[])
    setTasks((tk ?? []) as CrmTask[])
    setActiveFunnel(cur => cur ?? fns[0]?.id ?? null)
    setLoading(false)
  }

  async function reloadTasks() {
    const { data } = await supabase.from('crm_tasks').select('*').order('due_date', { nullsFirst: false })
    setTasks((data ?? []) as CrmTask[])
  }

  // ── Derivados ───────────────────────────────────────────────────────────────

  const funStages = useMemo(
    () => stages.filter(s => s.funil_id === activeFunnel).sort((a, b) => a.posicao - b.posicao),
    [stages, activeFunnel],
  )

  const stageById = useMemo(() => {
    const m: Record<string, CrmStage> = {}
    for (const s of stages) m[s.id] = s
    return m
  }, [stages])

  const tarefasAbertasPorLead = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of tasks) if (!t.concluida) m[t.lead_id] = (m[t.lead_id] ?? 0) + 1
    return m
  }, [tasks])

  const funLeads = useMemo(() => leads.filter(l => l.funil_id === activeFunnel), [leads, activeFunnel])

  const leadsFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    return funLeads.filter(l => {
      if (q) {
        const alvo = `${l.nome} ${l.empresa ?? ''} ${l.telefone ?? ''} ${l.email ?? ''}`.toLowerCase()
        if (!alvo.includes(q)) return false
      }
      if (filtroTemp !== 'todos' && l.temperatura !== filtroTemp) return false
      if (filtroResp === 'sem' && l.responsavel_id) return false
      if (filtroResp !== 'todos' && filtroResp !== 'sem' && l.responsavel_id !== filtroResp) return false
      return true
    })
  }, [funLeads, search, filtroTemp, filtroResp])

  const porEtapa = useMemo(() => {
    const m: Record<string, CrmLead[]> = {}
    for (const s of funStages) m[s.id] = []
    for (const l of leadsFiltrados) {
      const key = l.stage_id && m[l.stage_id] ? l.stage_id : funStages[0]?.id
      if (key) m[key].push(l)
    }
    return m
  }, [leadsFiltrados, funStages])

  function estaParado(l: CrmLead): boolean {
    const s = l.stage_id ? stageById[l.stage_id] : null
    if (!s || s.tipo !== 'aberto' || !s.alerta_dias) return false
    return diasDesde(l.data_entrada_etapa) > s.alerta_dias
  }

  const leadsParados = useMemo(
    () => funLeads.filter(l => l.status === 'aberto' && estaParado(l))
      .sort((a, b) => diasDesde(b.data_entrada_etapa) - diasDesde(a.data_entrada_etapa)),
    [funLeads, stageById],
  )

  const stats = useMemo(() => {
    const abertos = funLeads.filter(l => l.status === 'aberto')
    const inicioMes = new Date()
    inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    const ganhosMes = funLeads.filter(l => l.status === 'ganho' && l.data_fechamento && new Date(l.data_fechamento) >= inicioMes)
    return {
      abertos:    abertos.length,
      pipeline:   abertos.reduce((s, l) => s + Number(l.valor || 0), 0),
      quentes:    abertos.filter(l => l.temperatura === 'quente').length,
      parados:    leadsParados.length,
      ganhosMes:  ganhosMes.length,
      valorMes:   ganhosMes.reduce((s, l) => s + Number(l.valor || 0), 0),
    }
  }, [funLeads, leadsParados])

  const agendaItens = useMemo(() => {
    const leadById: Record<string, CrmLead> = {}
    for (const l of leads) leadById[l.id] = l
    const itens: { key: string; date: string | null; titulo: string; descricao: string | null; lead: CrmLead; task?: CrmTask }[] = []
    for (const t of tasks) {
      if (t.concluida) continue
      const lead = leadById[t.lead_id]
      if (!lead) continue
      itens.push({ key: `t-${t.id}`, date: t.due_date, titulo: t.titulo, descricao: t.descricao, lead, task: t })
    }
    for (const l of leads) {
      if (l.status !== 'aberto' || !l.proximo_contato) continue
      itens.push({ key: `l-${l.id}`, date: l.proximo_contato, titulo: 'Retomar contato', descricao: null, lead: l })
    }
    return itens.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  }, [tasks, leads])

  const agendaAtrasadas = agendaItens.filter(i => { const d = diasAte(i.date); return d !== null && d < 0 }).length
  const panelLead = leads.find(l => l.id === panelId) ?? null

  // ── Persistência ────────────────────────────────────────────────────────────

  async function patchLead(id: string, changes: Partial<CrmLead>) {
    setLeads(cur => cur.map(l => (l.id === id ? { ...l, ...changes } as CrmLead : l)))
    const { error } = await supabase.from('crm_leads').update(changes).eq('id', id)
    if (error) setErro('Erro ao salvar: ' + error.message)
  }

  async function logInteracao(leadId: string, tipo: CrmInteractionType, conteudo: string) {
    await supabase.from('crm_interactions').insert({
      lead_id: leadId, tipo, conteudo, autor_nome: me?.nome ?? null,
    })
  }

  /** Move o lead de etapa — ganho/perdido abrem o fluxo de fechamento. */
  function pedirTrocaEtapa(lead: CrmLead, toStageId: string) {
    if (lead.stage_id === toStageId) return
    const destino = stageById[toStageId]
    if (!destino) return
    if (destino.tipo === 'ganho') {
      setGanhoModal({ lead, stageId: toStageId, valor: numToMask(Number(lead.valor || 0)) || '', criarCliente: !lead.client_id })
      return
    }
    if (destino.tipo === 'perdido') {
      setPerdaModal({ lead, stageId: toStageId, motivo: MOTIVOS_PERDA[0], comentario: '' })
      return
    }
    moverEtapa(lead, destino)
  }

  async function moverEtapa(lead: CrmLead, destino: CrmStage) {
    const origem = lead.stage_id ? stageById[lead.stage_id] : null
    const agora = new Date().toISOString()
    await patchLead(lead.id, {
      stage_id: destino.id,
      data_entrada_etapa: agora,
      status: 'aberto',
      data_fechamento: null,
      motivo_perda: null,
    })
    await logInteracao(lead.id, 'etapa', `${origem?.nome ?? 'Sem etapa'} → ${destino.nome}`)
  }

  async function confirmarGanho() {
    if (!ganhoModal) return
    setSaving(true)
    const { lead, stageId, valor, criarCliente } = ganhoModal
    const valorNum = parseBRL(valor) ?? Number(lead.valor || 0)
    const agora = new Date().toISOString()

    let clientId = lead.client_id
    if (criarCliente && !clientId) {
      const { data: cli } = await supabase.from('clients').insert({
        nome:        lead.empresa?.trim() || lead.nome,
        email:       lead.email,
        telefone:    lead.telefone,
        tipo:        lead.empresa?.trim() ? 'PJ' : 'PF',
        observacoes: `Convertido do CRM em ${fmtDataBR(hojeISO())}${lead.origem ? ` · origem: ${lead.origem}` : ''}`,
      }).select('id').single()
      clientId = cli?.id ?? null
    }

    await patchLead(lead.id, {
      stage_id: stageId, status: 'ganho', valor: valorNum,
      data_entrada_etapa: agora, data_fechamento: agora, motivo_perda: null,
      client_id: clientId,
    })
    await logInteracao(lead.id, 'ganho', `Venda ganha — ${fmtBRL(valorNum)}${clientId && !lead.client_id ? ' · cliente criado' : ''}`)
    setSaving(false)
    setGanhoModal(null)
  }

  async function confirmarPerda() {
    if (!perdaModal) return
    setSaving(true)
    const { lead, stageId, motivo, comentario } = perdaModal
    const agora = new Date().toISOString()
    await patchLead(lead.id, {
      stage_id: stageId, status: 'perdido',
      motivo_perda: comentario.trim() ? `${motivo} — ${comentario.trim()}` : motivo,
      data_entrada_etapa: agora, data_fechamento: agora,
    })
    await logInteracao(lead.id, 'perdido', `Lead perdido — ${motivo}${comentario.trim() ? `: ${comentario.trim()}` : ''}`)
    setSaving(false)
    setPerdaModal(null)
  }

  async function criarLead() {
    if (!novoLead) return
    if (novoLead.nome.trim().length < 2) { setErro('Informe o nome do lead.'); return }
    setSaving(true)
    const resp = profiles.find(p => p.id === novoLead.responsavel_id)
    const { data, error } = await supabase.from('crm_leads').insert({
      funil_id:         activeFunnel,
      stage_id:         novoLead.stage_id || funStages[0]?.id || null,
      nome:             novoLead.nome.trim(),
      empresa:          novoLead.empresa.trim() || null,
      telefone:         novoLead.telefone.trim() || null,
      email:            novoLead.email.trim() || null,
      origem:           novoLead.origem || null,
      temperatura:      novoLead.temperatura,
      valor:            parseBRL(novoLead.valor) ?? 0,
      valor_recorrente: parseBRL(novoLead.valor_recorrente) ?? 0,
      responsavel_id:   novoLead.responsavel_id || me?.id || null,
      responsavel_nome: resp?.full_name ?? (novoLead.responsavel_id ? null : me?.nome ?? null),
      proximo_contato:  novoLead.proximo_contato || null,
      observacoes:      novoLead.observacoes.trim() || null,
      data_entrada_etapa: new Date().toISOString(),
    }).select().single()
    setSaving(false)
    if (error) { setErro('Erro ao criar lead: ' + error.message); return }
    const novo = data as CrmLead
    setLeads(cur => [novo, ...cur])
    await logInteracao(novo.id, 'nota', 'Lead cadastrado')
    setNovoLead(null)
    setPanelId(novo.id)
  }

  async function excluirLead(id: string) {
    setLeads(cur => cur.filter(l => l.id !== id))
    setPanelId(cur => (cur === id ? null : cur))
    await supabase.from('crm_leads').delete().eq('id', id)
    reloadTasks()
  }

  async function concluirTarefa(t: CrmTask) {
    const agora = new Date().toISOString()
    setTasks(cur => cur.map(x => (x.id === t.id ? { ...x, concluida: true, concluida_em: agora } : x)))
    await supabase.from('crm_tasks').update({ concluida: true, concluida_em: agora }).eq('id', t.id)
    await logInteracao(t.lead_id, 'tarefa', `Tarefa concluída: ${t.titulo}`)
  }

  // ── Etapas ──────────────────────────────────────────────────────────────────

  async function salvarEtapa() {
    if (!stageModal || !activeFunnel) return
    const nome = stageModal.nome.trim()
    if (!nome) { setErro('Dê um nome para a etapa.'); return }
    setSaving(true)
    const payload = {
      nome,
      cor: stageModal.cor,
      tipo: stageModal.tipo,
      alerta_dias: stageModal.alerta_dias ? Number(stageModal.alerta_dias) : null,
    }
    if (stageModal.id) {
      const { error } = await supabase.from('crm_stages').update(payload).eq('id', stageModal.id)
      if (!error) setStages(cur => cur.map(s => (s.id === stageModal.id ? { ...s, ...payload } : s)))
    } else {
      const posicao = funStages.length ? Math.max(...funStages.map(s => s.posicao)) + 1 : 0
      const { data, error } = await supabase.from('crm_stages')
        .insert({ ...payload, funil_id: activeFunnel, posicao }).select().single()
      if (!error && data) setStages(cur => [...cur, data as CrmStage])
    }
    setSaving(false)
    setStageModal(null)
  }

  async function excluirEtapa(stage: CrmStage) {
    const qtd = leads.filter(l => l.stage_id === stage.id).length
    if (qtd > 0) { setErro(`A etapa "${stage.nome}" tem ${qtd} lead(s). Mova-os antes de excluir.`); return }
    if (!confirm(`Excluir a etapa "${stage.nome}"?`)) return
    setStages(cur => cur.filter(s => s.id !== stage.id))
    setStageModal(null)
    await supabase.from('crm_stages').delete().eq('id', stage.id)
  }

  async function reordenarEtapas(fromId: string, toId: string) {
    const ordem = [...funStages]
    const from = ordem.findIndex(s => s.id === fromId)
    const to   = ordem.findIndex(s => s.id === toId)
    if (from < 0 || to < 0 || from === to) return
    const [mov] = ordem.splice(from, 1)
    ordem.splice(to, 0, mov)
    const comPos = ordem.map((s, i) => ({ ...s, posicao: i }))
    setStages(cur => cur.map(s => comPos.find(p => p.id === s.id) ?? s))
    await Promise.all(comPos.map(s => supabase.from('crm_stages').update({ posicao: s.posicao }).eq('id', s.id)))
  }

  // ── Funis ───────────────────────────────────────────────────────────────────

  async function salvarFunil() {
    if (!funnelModal) return
    const nome = funnelModal.nome.trim()
    if (!nome) { setErro('Dê um nome para o funil.'); return }
    setSaving(true)
    if (funnelModal.id) {
      await supabase.from('crm_funnels').update({ nome }).eq('id', funnelModal.id)
      setFunnels(cur => cur.map(f => (f.id === funnelModal.id ? { ...f, nome } : f)))
    } else {
      const posicao = funnels.length
      const { data: nf } = await supabase.from('crm_funnels').insert({ nome, posicao }).select().single()
      if (nf) {
        const { data: ns } = await supabase.from('crm_stages')
          .insert(DEFAULT_STAGES.map(s => ({ ...s, funil_id: nf.id }))).select()
        setFunnels(cur => [...cur, nf as CrmFunnel])
        setStages(cur => [...cur, ...((ns ?? []) as CrmStage[])])
        setActiveFunnel(nf.id)
      }
    }
    setSaving(false)
    setFunnelModal(null)
  }

  async function excluirFunil(id: string) {
    if (funnels.length <= 1) { setErro('Você precisa manter ao menos um funil.'); return }
    const qtd = leads.filter(l => l.funil_id === id).length
    if (!confirm(`Excluir este funil${qtd ? ` e os ${qtd} lead(s) dele` : ''}? Essa ação não pode ser desfeita.`)) return
    setFunnels(cur => cur.filter(f => f.id !== id))
    setStages(cur => cur.filter(s => s.funil_id !== id))
    setLeads(cur => cur.filter(l => l.funil_id !== id))
    setActiveFunnel(cur => (cur === id ? funnels.find(f => f.id !== id)?.id ?? null : cur))
    setFunnelModal(null)
    await supabase.from('crm_funnels').delete().eq('id', id)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
  }

  if (migrationPending) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20 flex items-center justify-center">
          <Target className="w-5 h-5 text-amber-400" />
        </div>
        <p className="text-white font-semibold text-sm">Configuração pendente</p>
        <p className="text-slate-300 text-xs max-w-xs">
          Execute a migration <span className="text-amber-400 font-mono">037_crm.sql</span> no Supabase SQL Editor para ativar o CRM.
        </p>
        <button onClick={init} className="mt-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-colors">
          Tentar novamente
        </button>
      </div>
    )
  }

  const VIEWS: { id: View; label: string; Icon: typeof LayoutGrid; badge?: number }[] = [
    { id: 'board',      label: 'Funil',      Icon: LayoutGrid },
    { id: 'agenda',     label: 'Agenda',     Icon: ListTodo,      badge: agendaAtrasadas },
    { id: 'alertas',    label: 'Alertas',    Icon: AlertTriangle, badge: leadsParados.length },
    { id: 'desempenho', label: 'Desempenho', Icon: BarChart3 },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">

      {erro && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro('')} className="p-1 rounded-lg hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Barra de topo ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
            <Target className="w-4.5 h-4.5 text-indigo-400" />
          </div>
          <div className="leading-tight">
            <p className="text-white font-semibold text-sm">CRM de Vendas</p>
            <p className="text-slate-400 text-[11px]">{stats.abertos} em aberto · {fmtBRLCompact(stats.pipeline)} no pipeline</p>
          </div>
        </div>

        {/* Funis */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {funnels.map(f => {
            const ativo = activeFunnel === f.id
            return (
              <button key={f.id} onClick={() => setActiveFunnel(f.id)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${ativo ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30' : 'text-slate-400 ring-1 ring-white/[0.07] hover:text-slate-200 hover:ring-white/20'}`}>
                <GitMerge className="w-3 h-3" />
                <span className="max-w-[140px] truncate">{f.nome}</span>
                {ativo && (
                  <span onClick={e => { e.stopPropagation(); setFunnelModal({ id: f.id, nome: f.nome }) }}
                    className="p-0.5 rounded hover:bg-white/10" title="Renomear ou excluir funil">
                    <Edit2 className="w-3 h-3" />
                  </span>
                )}
              </button>
            )
          })}
          <button onClick={() => setFunnelModal({ id: null, nome: '' })} title="Novo funil"
            className="w-7 h-7 rounded-full border border-dashed border-white/15 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/40 transition-colors flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1" />

        {/* Views */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${view === v.id ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <v.Icon className="w-3.5 h-3.5" />
              {v.label}
              {!!v.badge && v.badge > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center justify-center">
                  {v.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <button onClick={() => setNovoLead({ ...EMPTY_LEAD, stage_id: funStages[0]?.id ?? '', responsavel_id: me?.id ?? '' })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold transition-colors shadow-lg shadow-indigo-500/20">
          <Plus className="w-4 h-4" /> Novo Lead
        </button>
      </div>

      {/* ── Board ── */}
      {view === 'board' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead, empresa, telefone..."
                className="w-64 pl-9 pr-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-xs placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors" />
            </div>
            <select value={filtroTemp} onChange={e => setFiltroTemp(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-xs focus:outline-none focus:border-white/20 [&>option]:bg-slate-900">
              <option value="todos">Todas as temperaturas</option>
              {TEMPERATURAS.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
            <select value={filtroResp} onChange={e => setFiltroResp(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-slate-300 text-xs focus:outline-none focus:border-white/20 [&>option]:bg-slate-900">
              <option value="todos">Todos os responsáveis</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</option>)}
              <option value="sem">Sem responsável</option>
            </select>

            <div className="flex-1" />

            <div className="flex items-center gap-4 text-xs">
              <Stat icon={<Flame className="w-3.5 h-3.5 text-red-400" />}   valor={String(stats.quentes)}   label="quentes" />
              <Stat icon={<Clock className="w-3.5 h-3.5 text-amber-400" />} valor={String(stats.parados)}   label="parados" />
              <Stat icon={<Trophy className="w-3.5 h-3.5 text-emerald-400" />} valor={String(stats.ganhosMes)} label="ganhos no mês" />
              <Stat icon={<Wallet className="w-3.5 h-3.5 text-emerald-400" />} valor={fmtBRLCompact(stats.valorMes)} label="vendido no mês" />
            </div>
          </div>

          <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-3 items-start select-none">
            {funStages.map(stage => {
              const cards = porEtapa[stage.id] ?? []
              const total = cards.reduce((s, l) => s + Number(l.valor || 0), 0)
              const over  = dragOver === stage.id
              return (
                <div key={stage.id}
                  onDragOver={e => { if (dragLead) { e.preventDefault(); setDragOver(stage.id) } }}
                  onDragLeave={() => setDragOver(cur => (cur === stage.id ? null : cur))}
                  onDrop={e => {
                    e.preventDefault(); setDragOver(null)
                    if (dragLead) { const l = dragLead; setDragLead(null); pedirTrocaEtapa(l, stage.id) }
                  }}
                  className={`w-[286px] shrink-0 flex flex-col max-h-full rounded-2xl border transition-all duration-150
                    ${over ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-900/60 border-white/[0.07]'}
                    ${dragStage?.id === stage.id ? 'opacity-40' : ''}`}>

                  {/* Cabeçalho da etapa */}
                  <div draggable
                    onDragStart={e => { setDragStage(stage); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => setDragStage(null)}
                    onDragOver={e => { if (dragStage) e.preventDefault() }}
                    onDrop={e => { e.stopPropagation(); if (dragStage && dragStage.id !== stage.id) { reordenarEtapas(dragStage.id, stage.id); setDragStage(null) } }}
                    className="group flex items-center gap-2 px-3 pt-3.5 pb-3 border-b border-white/[0.05] cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0" />
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stage.cor }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{stage.nome}</p>
                      <p className="text-slate-500 text-[10px]">
                        {total > 0 ? fmtBRLCompact(total) : '—'}
                        {stage.alerta_dias ? ` · alerta ${stage.alerta_dias}d` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-300 tabular-nums bg-white/5 px-2 py-0.5 rounded-full shrink-0">{cards.length}</span>
                    <button onClick={e => { e.stopPropagation(); setStageModal({ id: stage.id, nome: stage.nome, cor: stage.cor, alerta_dias: stage.alerta_dias ? String(stage.alerta_dias) : '', tipo: stage.tipo }) }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-white/10 transition-all shrink-0">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto px-2.5 py-2.5 flex flex-col gap-2">
                    {cards.length === 0 && (
                      <div className={`flex items-center justify-center h-14 rounded-xl border-2 border-dashed text-[11px] transition-colors
                        ${over ? 'border-indigo-500/50 text-indigo-300' : 'border-white/[0.06] text-slate-500'}`}>
                        {over ? 'Soltar aqui' : 'Nenhum lead'}
                      </div>
                    )}

                    {cards.map(lead => (
                      <LeadCard key={lead.id} lead={lead} stage={stage}
                        parado={estaParado(lead)}
                        tarefas={tarefasAbertasPorLead[lead.id] ?? 0}
                        arrastando={dragLead?.id === lead.id}
                        onDragStart={() => setDragLead(lead)}
                        onDragEnd={() => setDragLead(null)}
                        onClick={() => setPanelId(lead.id)} />
                    ))}

                    <button onClick={() => setNovoLead({ ...EMPTY_LEAD, stage_id: stage.id, responsavel_id: me?.id ?? '' })}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/[0.08] text-slate-500 text-[11px] hover:border-indigo-500/40 hover:text-indigo-300 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Adicionar lead
                    </button>
                  </div>
                </div>
              )
            })}

            <button onClick={() => setStageModal({ id: null, nome: '', cor: STAGE_COLORS[1], alerta_dias: '5', tipo: 'aberto' })}
              className="w-[200px] shrink-0 flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-white/[0.08] text-slate-500 text-xs font-medium hover:border-indigo-500/40 hover:text-indigo-300 transition-colors">
              <Plus className="w-4 h-4" /> Nova etapa
            </button>
          </div>
        </>
      )}

      {/* ── Agenda ── */}
      {view === 'agenda' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-6">
            {agendaItens.length === 0 && (
              <EmptyState Icon={CalendarClock} titulo="Nada agendado"
                texto="Crie tarefas de follow-up no painel do lead para elas aparecerem aqui." />
            )}
            {(['Atrasadas', 'Hoje', 'Próximos 7 dias', 'Depois', 'Sem data'] as const).map(bucket => {
              const itens = agendaItens.filter(i => {
                const d = diasAte(i.date)
                if (bucket === 'Sem data') return d === null
                if (d === null) return false
                if (bucket === 'Atrasadas') return d < 0
                if (bucket === 'Hoje') return d === 0
                if (bucket === 'Próximos 7 dias') return d > 0 && d <= 7
                return d > 7
              })
              if (itens.length === 0) return null
              const tomBucket = bucket === 'Atrasadas' ? 'text-red-300' : bucket === 'Hoje' ? 'text-amber-300' : 'text-slate-300'
              return (
                <div key={bucket}>
                  <p className={`text-[10px] font-mono uppercase tracking-[0.2em] mb-2.5 ${tomBucket}`}>{bucket} · {itens.length}</p>
                  <div className="space-y-2">
                    {itens.map(item => {
                      const d = diasAte(item.date)
                      const atrasado = d !== null && d < 0
                      return (
                        <div key={item.key}
                          className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors cursor-pointer
                            ${atrasado ? 'bg-red-500/[0.04] border-red-500/20' : 'bg-white/[0.02] border-white/[0.07] hover:border-white/20'}`}
                          onClick={() => setPanelId(item.lead.id)}>
                          {item.task ? (
                            <button onClick={e => { e.stopPropagation(); concluirTarefa(item.task!) }}
                              title="Concluir tarefa"
                              className="p-1 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors shrink-0">
                              <Square className="w-4 h-4" />
                            </button>
                          ) : (
                            <CalendarClock className="w-4 h-4 text-slate-500 shrink-0 ml-1" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{item.titulo}</p>
                            <p className="text-slate-400 text-[11px] truncate">
                              {item.lead.nome}{item.lead.empresa ? ` · ${item.lead.empresa}` : ''}
                              {item.descricao ? ` · ${item.descricao}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-xs font-semibold ${atrasado ? 'text-red-300' : 'text-slate-300'}`}>
                              {item.date ? fmtDataBR(item.date) : 'sem data'}
                            </p>
                            {d !== null && (
                              <p className="text-[10px] text-slate-500">
                                {d < 0 ? `${Math.abs(d)}d atrasado` : d === 0 ? 'hoje' : `em ${d}d`}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Alertas ── */}
      {view === 'alertas' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-2">
            {leadsParados.length === 0 ? (
              <EmptyState Icon={CheckSquare} titulo="Nenhum lead parado"
                texto="Todos os leads deste funil estão dentro do prazo de cada etapa." />
            ) : leadsParados.map(lead => {
              const stage = lead.stage_id ? stageById[lead.stage_id] : null
              const dias  = diasDesde(lead.data_entrada_etapa)
              const extra = stage?.alerta_dias ? dias - stage.alerta_dias : 0
              return (
                <div key={lead.id} onClick={() => setPanelId(lead.id)}
                  className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl bg-amber-500/[0.04] border border-amber-500/20 hover:border-amber-500/40 transition-colors cursor-pointer">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: `${stage?.cor ?? '#64748b'}22`, color: stage?.cor ?? '#94a3b8', boxShadow: `inset 0 0 0 1.5px ${stage?.cor ?? '#64748b'}55` }}>
                    {iniciais(lead.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{lead.nome}</p>
                    <p className="text-slate-400 text-[11px] truncate">
                      {stage?.nome ?? '—'} · {tempOf(lead.temperatura).icon} {tempOf(lead.temperatura).label}
                      {lead.responsavel_nome ? ` · ${lead.responsavel_nome}` : ''}
                    </p>
                  </div>
                  {Number(lead.valor) > 0 && (
                    <span className="text-emerald-300 text-xs font-semibold tabular-nums shrink-0">{fmtBRLCompact(Number(lead.valor))}</span>
                  )}
                  <div className="text-right shrink-0">
                    <p className="text-red-300 font-bold text-base leading-none tabular-nums">{dias}d</p>
                    <p className="text-amber-300/80 text-[10px] font-medium">+{extra}d do limite</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Desempenho ── */}
      {view === 'desempenho' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Desempenho leads={leads} stages={stages} profiles={profiles} funnels={funnels}
            meId={me?.id ?? null} isAdmin={role !== 'operator'} />
        </div>
      )}

      {/* ── Painel do lead ── */}
      {panelLead && (
        <LeadPanel
          lead={panelLead}
          stages={stages.filter(s => s.funil_id === panelLead.funil_id).sort((a, b) => a.posicao - b.posicao)}
          profiles={profiles}
          me={me}
          onClose={() => setPanelId(null)}
          onPatch={patchLead}
          onStageChange={pedirTrocaEtapa}
          onDelete={excluirLead}
          onTasksChanged={reloadTasks}
        />
      )}

      {/* ── Modal: novo lead ── */}
      {novoLead && (
        <Modal titulo="Novo Lead" Icon={Target} onClose={() => setNovoLead(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nome *</label>
                <input className={inputCls} value={novoLead.nome} autoFocus
                  onChange={e => setNovoLead({ ...novoLead, nome: e.target.value })} placeholder="Nome do contato" />
              </div>
              <div>
                <label className={labelCls}>Empresa</label>
                <input className={inputCls} value={novoLead.empresa}
                  onChange={e => setNovoLead({ ...novoLead, empresa: e.target.value })} placeholder="Empresa do lead" />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input className={inputCls} value={novoLead.telefone} inputMode="numeric"
                  onChange={e => setNovoLead({ ...novoLead, telefone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input className={inputCls} value={novoLead.email} type="email"
                  onChange={e => setNovoLead({ ...novoLead, email: e.target.value })} placeholder="email@empresa.com" />
              </div>
              <div>
                <label className={labelCls}>Origem</label>
                <select className={selectCls} value={novoLead.origem}
                  onChange={e => setNovoLead({ ...novoLead, origem: e.target.value })}>
                  <option value="">Selecione</option>
                  {ORIGENS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Temperatura</label>
                <select className={selectCls} value={novoLead.temperatura}
                  onChange={e => setNovoLead({ ...novoLead, temperatura: e.target.value as Temperatura })}>
                  {TEMPERATURAS.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Valor do negócio (R$)</label>
                <input className={inputCls} value={novoLead.valor} inputMode="numeric" placeholder="0,00"
                  onChange={e => setNovoLead({ ...novoLead, valor: maskBRL(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Mensalidade (R$)</label>
                <input className={inputCls} value={novoLead.valor_recorrente} inputMode="numeric" placeholder="0,00"
                  onChange={e => setNovoLead({ ...novoLead, valor_recorrente: maskBRL(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>Etapa</label>
                <select className={selectCls} value={novoLead.stage_id}
                  onChange={e => setNovoLead({ ...novoLead, stage_id: e.target.value })}>
                  {funStages.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Responsável</label>
                <select className={selectCls} value={novoLead.responsavel_id}
                  onChange={e => setNovoLead({ ...novoLead, responsavel_id: e.target.value })}>
                  <option value="">Sem responsável</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Próximo contato</label>
                <input className={inputCls} type="date" value={novoLead.proximo_contato}
                  onChange={e => setNovoLead({ ...novoLead, proximo_contato: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Observações</label>
              <textarea className={`${inputCls} resize-none`} rows={3} value={novoLead.observacoes}
                onChange={e => setNovoLead({ ...novoLead, observacoes: e.target.value })}
                placeholder="Contexto da negociação, necessidade do cliente, próximo passo..." />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setNovoLead(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={criarLead} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar lead
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: etapa ── */}
      {stageModal && (
        <Modal titulo={stageModal.id ? 'Editar etapa' : 'Nova etapa'} Icon={LayoutGrid} onClose={() => setStageModal(null)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome da etapa</label>
              <input className={inputCls} value={stageModal.nome} autoFocus
                onChange={e => setStageModal({ ...stageModal, nome: e.target.value })} placeholder="Ex.: Reunião marcada" />
            </div>
            <div>
              <label className={labelCls}>Cor</label>
              <div className="flex flex-wrap gap-2">
                {STAGE_COLORS.map(c => (
                  <button key={c} onClick={() => setStageModal({ ...stageModal, cor: c })}
                    className={`w-7 h-7 rounded-lg transition-transform ${stageModal.cor === c ? 'ring-2 ring-white/70 scale-110' : 'hover:scale-105'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Alerta após (dias)</label>
                <input className={inputCls} value={stageModal.alerta_dias} inputMode="numeric" placeholder="sem alerta"
                  onChange={e => setStageModal({ ...stageModal, alerta_dias: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div>
                <label className={labelCls}>Tipo</label>
                <select className={selectCls} value={stageModal.tipo}
                  onChange={e => setStageModal({ ...stageModal, tipo: e.target.value as StageForm['tipo'] })}>
                  <option value="aberto">Em andamento</option>
                  <option value="ganho">Fecha como ganho</option>
                  <option value="perdido">Fecha como perdido</option>
                </select>
              </div>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Etapas do tipo <span className="text-emerald-300">ganho</span> e <span className="text-red-300">perdido</span> encerram
              o lead e alimentam os números do Desempenho.
            </p>
            <div className="flex gap-3 pt-1">
              {stageModal.id && (
                <button onClick={() => { const s = stages.find(x => x.id === stageModal.id); if (s) excluirEtapa(s) }}
                  className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm hover:bg-red-500/20 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setStageModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={salvarEtapa} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: funil ── */}
      {funnelModal && (
        <Modal titulo={funnelModal.id ? 'Editar funil' : 'Novo funil'} Icon={GitMerge} onClose={() => setFunnelModal(null)}>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome do funil</label>
              <input className={inputCls} value={funnelModal.nome} autoFocus
                onChange={e => setFunnelModal({ ...funnelModal, nome: e.target.value })} placeholder="Ex.: Prospecção ativa" />
            </div>
            {!funnelModal.id && (
              <p className="text-slate-500 text-[11px]">O funil já nasce com as etapas padrão de venda — dá para ajustar depois.</p>
            )}
            <div className="flex gap-3 pt-1">
              {funnelModal.id && (
                <button onClick={() => excluirFunil(funnelModal.id!)}
                  className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm hover:bg-red-500/20 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setFunnelModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={salvarFunil} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: marcar ganho ── */}
      {ganhoModal && (
        <Modal titulo="Marcar como ganho" Icon={Trophy} onClose={() => setGanhoModal(null)} tone="emerald">
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Fechando a venda com <span className="text-white font-semibold">{ganhoModal.lead.nome}</span>.
            </p>
            <div>
              <label className={labelCls}>Valor fechado (R$)</label>
              <input className={inputCls} value={ganhoModal.valor} inputMode="numeric" autoFocus placeholder="0,00"
                onChange={e => setGanhoModal({ ...ganhoModal, valor: maskBRL(e.target.value) })} />
            </div>
            <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] cursor-pointer">
              <input type="checkbox" checked={ganhoModal.criarCliente} disabled={!!ganhoModal.lead.client_id}
                onChange={e => setGanhoModal({ ...ganhoModal, criarCliente: e.target.checked })}
                className="w-4 h-4 accent-emerald-500" />
              <span className="text-slate-300 text-xs">
                {ganhoModal.lead.client_id ? 'Lead já vinculado a um cliente' : 'Cadastrar como cliente automaticamente'}
              </span>
            </label>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setGanhoModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarGanho} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} Confirmar venda
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: marcar perda ── */}
      {perdaModal && (
        <Modal titulo="Marcar como perdido" Icon={X} onClose={() => setPerdaModal(null)} tone="red">
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Encerrando <span className="text-white font-semibold">{perdaModal.lead.nome}</span> como perdido.
            </p>
            <div>
              <label className={labelCls}>Motivo</label>
              <select className={selectCls} value={perdaModal.motivo}
                onChange={e => setPerdaModal({ ...perdaModal, motivo: e.target.value })}>
                {MOTIVOS_PERDA.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Comentário</label>
              <textarea className={`${inputCls} resize-none`} rows={3} value={perdaModal.comentario}
                onChange={e => setPerdaModal({ ...perdaModal, comentario: e.target.value })}
                placeholder="O que aconteceu? Vale retomar em algum momento?" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setPerdaModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
                Cancelar
              </button>
              <button onClick={confirmarPerda} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Confirmar perda
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Card do lead ──────────────────────────────────────────────────────────────

function LeadCard({ lead, stage, parado, tarefas, arrastando, onDragStart, onDragEnd, onClick }: {
  lead:        CrmLead
  stage:       CrmStage
  parado:      boolean
  tarefas:     number
  arrastando:  boolean
  onDragStart: () => void
  onDragEnd:   () => void
  onClick:     () => void
}) {
  const temp  = tempOf(lead.temperatura)
  const dias  = diasDesde(lead.data_entrada_etapa)
  const prox  = diasAte(lead.proximo_contato)
  const valor = Number(lead.valor || 0)

  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
      className={`rounded-xl border p-3 cursor-grab active:cursor-grabbing transition-all
        ${parado ? 'bg-amber-500/[0.05] border-amber-500/25' : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'}
        ${arrastando ? 'opacity-40' : 'hover:-translate-y-px'}`}>

      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: `${stage.cor}22`, color: stage.cor, boxShadow: `inset 0 0 0 1.5px ${stage.cor}55` }}>
          {iniciais(lead.nome)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold truncate">{lead.nome}</p>
          {lead.empresa && (
            <p className="text-slate-400 text-[11px] truncate flex items-center gap-1">
              <Building2 className="w-3 h-3 shrink-0" />{lead.empresa}
            </p>
          )}
        </div>
        <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${temp.dot}`} title={temp.label} />
      </div>

      {(valor > 0 || lead.origem) && (
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {valor > 0 && (
            <span className="text-emerald-300 text-[11px] font-semibold tabular-nums">{fmtBRLCompact(valor)}</span>
          )}
          {Number(lead.valor_recorrente) > 0 && (
            <span className="text-emerald-400/70 text-[10px] tabular-nums">+{fmtBRLCompact(Number(lead.valor_recorrente))}/mês</span>
          )}
          {lead.origem && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-400">{lead.origem}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5 text-[10px]">
        <span className={`inline-flex items-center gap-1 ${parado ? 'text-amber-300' : 'text-slate-500'}`}>
          {parado ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {dias === 0 ? 'hoje' : `${dias}d`}
        </span>
        {tarefas > 0 && (
          <span className="inline-flex items-center gap-1 text-teal-300">
            <ListTodo className="w-3 h-3" />{tarefas}
          </span>
        )}
        {prox !== null && (
          <span className={`inline-flex items-center gap-1 ml-auto ${prox < 0 ? 'text-red-300' : 'text-slate-500'}`}>
            <CalendarClock className="w-3 h-3" />
            {prox < 0 ? `${Math.abs(prox)}d atrás` : prox === 0 ? 'hoje' : fmtDataBR(lead.proximo_contato)}
          </span>
        )}
        {lead.responsavel_nome && prox === null && (
          <span className="ml-auto text-slate-500 truncate max-w-[90px]">{lead.responsavel_nome.split(' ')[0]}</span>
        )}
      </div>
    </div>
  )
}

// ── UI auxiliares ─────────────────────────────────────────────────────────────

function Stat({ icon, valor, label }: { icon: React.ReactNode; valor: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="leading-tight">
        <p className="text-white text-sm font-bold tabular-nums">{valor}</p>
        <p className="text-slate-500 text-[10px]">{label}</p>
      </div>
    </div>
  )
}

function EmptyState({ Icon, titulo, texto }: { Icon: typeof LayoutGrid; titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] flex items-center justify-center mb-1">
        <Icon className="w-5 h-5 text-slate-500" />
      </div>
      <p className="text-white font-semibold text-sm">{titulo}</p>
      <p className="text-slate-400 text-xs max-w-xs">{texto}</p>
    </div>
  )
}

function Modal({ titulo, Icon, tone = 'indigo', onClose, children }: {
  titulo:   string
  Icon:     typeof LayoutGrid
  tone?:    'indigo' | 'emerald' | 'red'
  onClose:  () => void
  children: React.ReactNode
}) {
  const tones = {
    indigo:  'bg-indigo-500/15 ring-indigo-500/25 text-indigo-400',
    emerald: 'bg-emerald-500/15 ring-emerald-500/25 text-emerald-400',
    red:     'bg-red-500/15 ring-red-500/25 text-red-400',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl shadow-black/60 animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07] sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl ring-1 flex items-center justify-center ${tones[tone]}`}>
              <Icon className="w-4 h-4" />
            </div>
            <h2 className="text-white font-semibold text-base leading-none">{titulo}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-7 py-6">{children}</div>
      </div>
    </div>
  )
}
