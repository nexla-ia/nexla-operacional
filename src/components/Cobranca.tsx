import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search, RefreshCw, Loader2, X, Check, ChevronDown, Briefcase,
  Copy, CheckCheck, AlertCircle, Calendar, CalendarClock,
} from 'lucide-react'
import { createPortal } from 'react-dom'

import { supabase } from '../lib/supabase'
import { numToMask, formatDate } from '../lib/utils'

// ── Constantes ────────────────────────────────────────────────────────────────

const PIX_CNPJ = '59.838.572/0001-97'

const MES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const MES_ATUAL = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})()

// ── Types ─────────────────────────────────────────────────────────────────────

interface MensalidadeRow {
  kind: 'mensalidade'
  clientId: string
  clienteNome: string
  descricao: string
  valor: number
  dia_vencimento: string
}

interface EntradaRow {
  kind: 'entrada'
  id: string
  nomeProjeto: string
  descricao: string
  valor: number
  data: string | null
  status: 'pendente' | 'recebido'
}

type Row = MensalidadeRow | EntradaRow
type PagamentoStatus = 'pago' | 'nao_pago'

// ── Helpers de vencimento ─────────────────────────────────────────────────────

function getMensalidadeDueDate(diaVencimento: number, ref: Date): Date {
  const y = ref.getFullYear(), m = ref.getMonth()
  const lastDay = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(diaVencimento, lastDay))
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function daysBetween(from: Date, to: Date) {
  const ms = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
            - new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

// ── Mensagem pronta ───────────────────────────────────────────────────────────

function buildMessage(opts: {
  nome: string
  descricao: string
  valor: number
  vencimentoLabel: string  // "hoje", "amanhã", "dia 05"
  dataLabel: string        // "05/05/2026"
}) {
  const valorStr = numToMask(opts.valor)
  return `Olá, ${opts.nome.trim()}! Tudo bem?

Passando para lembrar que sua ${opts.descricao} no valor de R$ ${valorStr} vence ${opts.vencimentoLabel} (${opts.dataLabel}).

Para sua comodidade, segue nossa chave PIX:

🔹 CNPJ: ${PIX_CNPJ}

Após o pagamento, basta nos enviar o comprovante. Qualquer dúvida, estou à disposição!`
}

function buildMessageAtrasado(opts: {
  nome: string
  descricao: string
  valor: number
  dataLabel: string        // "05/05/2026"
  diasAtraso: number
}) {
  const valorStr = numToMask(opts.valor)
  const tempo = opts.diasAtraso === 1 ? '1 dia' : `${opts.diasAtraso} dias`
  return `Olá, ${opts.nome.trim()}! Tudo bem?

Passando para te lembrar de um pagamento que ficou em aberto: a ${opts.descricao} de R$ ${valorStr}, com vencimento em ${opts.dataLabel} (${tempo} atrás).

Imagino que possa ter passado batido — acontece! Se já fez o pagamento, é só me enviar o comprovante que eu confirmo por aqui.

Caso ainda não tenha pago, segue nossa chave PIX:

🔹 CNPJ: ${PIX_CNPJ}

Se precisar de mais tempo ou reagendar pra outra data, é só me falar. Qualquer dúvida estou à disposição!`
}

// ── Botão de copiar ───────────────────────────────────────────────────────────

function CopyButton({ message, label = 'Copiar mensagem' }: {
  message: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = message
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all
        ${copied
          ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30'
          : 'bg-white text-slate-900 hover:bg-slate-100'}`}>
      {copied
        ? <><CheckCheck className="w-3 h-3" /> copiado</>
        : <><Copy className="w-3 h-3" /> {label}</>}
    </button>
  )
}

// ── Status dropdown (mensalidades) ────────────────────────────────────────────

function StatusDropdown({ status, onChange }: {
  status: PagamentoStatus
  onChange: (s: PagamentoStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef          = useRef<HTMLButtonElement>(null)
  const isPago          = status === 'pago'

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(o => !o)
  }

  const menuStyle = rect ? (() => {
    const menuH      = 80
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp     = spaceBelow < menuH + 8
    return {
      position: 'fixed' as const,
      right:    window.innerWidth - rect.right,
      top:      openUp ? rect.top - menuH - 4 : rect.bottom + 4,
      minWidth: 130,
      zIndex:   9999,
    }
  })() : {}

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all whitespace-nowrap
          ${isPago
            ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25'
            : 'bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.08] hover:ring-white/20'}`}
      >
        {isPago
          ? <Check className="w-3 h-3" />
          : <span className="w-2 h-2 rounded-full border border-current opacity-60 inline-block shrink-0" />}
        {isPago ? 'pago' : 'não pago'}
        <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={menuStyle} className="rounded-xl border border-white/10 bg-[#0a0c11] shadow-2xl overflow-hidden">
            <button
              onClick={e => { e.stopPropagation(); onChange('pago'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-mono uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/10 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> pago
            </button>
            <button
              onClick={e => { e.stopPropagation(); onChange('nao_pago'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-mono uppercase tracking-wider text-slate-300 hover:bg-white/[0.05] transition-colors border-t border-white/[0.05]"
            >
              <span className="w-3.5 h-3.5 rounded-full border border-current opacity-50 inline-block" /> não pago
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

function StatusBadge({ status }: { status: 'pendente' | 'recebido' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider whitespace-nowrap
      ${status === 'recebido'
        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25'
        : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25'}`}>
      {status === 'recebido' ? <Check className="w-3 h-3" /> : <span className="w-2 h-2 rounded-full border border-current opacity-60 inline-block" />}
      {status === 'recebido' ? 'recebido' : 'pendente'}
    </span>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function Cobranca() {
  const [rows, setRows]         = useState<Row[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statuses, setStatuses] = useState<Record<string, PagamentoStatus>>({})
  const [promessas, setPromessas] = useState<Record<string, string>>({})  // client_id -> data ISO
  const [userId, setUserId]     = useState<string | null>(null)
  const [adiarFor, setAdiarFor] = useState<MensalidadeRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)

    const [
      { data: mensalidades },
      { data: entries },
      { data: pagamentos },
    ] = await Promise.all([
      supabase.from('mensalidades').select('*').eq('status', 'ativo').order('cliente_nome'),
      supabase.from('project_entries').select('*').order('nome_projeto'),
      supabase.from('cobranca_pagamentos').select('client_id, status, data_prometida').eq('mes', MES_ATUAL),
    ])

    const statusMap: Record<string, PagamentoStatus> = {}
    const promessaMap: Record<string, string> = {}
    for (const p of pagamentos ?? []) {
      statusMap[p.client_id] = p.status as PagamentoStatus
      if (p.data_prometida) promessaMap[p.client_id] = p.data_prometida as string
    }
    setStatuses(statusMap)
    setPromessas(promessaMap)

    const built: Row[] = [
      ...(mensalidades ?? []).map(m => ({
        kind:           'mensalidade' as const,
        clientId:       m.client_id ?? m.cliente_nome,
        clienteNome:    m.cliente_nome ?? '',
        descricao:      m.descricao ?? 'Mensalidade',
        valor:          m.valor ?? 0,
        dia_vencimento: String(m.dia_vencimento ?? ''),
      })),
      ...(entries ?? []).map(e => ({
        kind:        'entrada' as const,
        id:          e.id,
        nomeProjeto: e.nome_projeto ?? 'Projeto',
        descricao:   e.descricao ?? '',
        valor:       e.valor ?? 0,
        data:        (e.data as string) ?? null,
        status:      (e.status ?? 'pendente') as 'pendente' | 'recebido',
      })),
    ]
    setRows(built)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function changeStatus(clientId: string, status: PagamentoStatus) {
    if (!userId) return
    setStatuses((prev: Record<string, PagamentoStatus>) => ({ ...prev, [clientId]: status }))
    const payload: { user_id: string; client_id: string; mes: string; status: PagamentoStatus; data_prometida?: null } =
      { user_id: userId, client_id: clientId, mes: MES_ATUAL, status }
    if (status === 'pago') payload.data_prometida = null
    const { error } = await supabase.from('cobranca_pagamentos').upsert(
      payload,
      { onConflict: 'user_id,client_id,mes' }
    )
    if (error) setStatuses((prev: Record<string, PagamentoStatus>) => { const n = { ...prev }; delete n[clientId]; return n })
    if (status === 'pago') setPromessas((prev: Record<string, string>) => { const n = { ...prev }; delete n[clientId]; return n })
  }

  async function setPromessa(clientId: string, dataISO: string | null) {
    if (!userId) return
    if (dataISO) {
      setPromessas((prev: Record<string, string>) => ({ ...prev, [clientId]: dataISO }))
    } else {
      setPromessas((prev: Record<string, string>) => { const n = { ...prev }; delete n[clientId]; return n })
    }
    const status: PagamentoStatus = statuses[clientId] ?? 'nao_pago'
    const { error } = await supabase.from('cobranca_pagamentos').upsert(
      { user_id: userId, client_id: clientId, mes: MES_ATUAL, status, data_prometida: dataISO },
      { onConflict: 'user_id,client_id,mes' }
    )
    if (error) {
      setPromessas((prev: Record<string, string>) => { const n = { ...prev }; delete n[clientId]; return n })
    }
    setAdiarFor(null)
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  const hoje    = new Date()
  const amanha  = new Date(hoje); amanha.setDate(amanha.getDate() + 1)

  const q = search.toLowerCase()
  const filtered = rows.filter(r =>
    r.kind === 'mensalidade'
      ? r.clienteNome.toLowerCase().includes(q)
      : r.nomeProjeto.toLowerCase().includes(q)
  )

  const mensRows    = filtered.filter(r => r.kind === 'mensalidade') as MensalidadeRow[]
  const entradaRows = filtered.filter(r => r.kind === 'entrada')     as EntradaRow[]

  // Detecta vencimentos próximos (hoje + amanhã) e atrasados (vencimento já passou e não pago)
  type Iminente = {
    key: string
    quando: 'hoje' | 'amanhã'
    nome: string
    descricao: string
    valor: number
    dataLabel: string
    rowRef: MensalidadeRow | EntradaRow
  }

  type Atrasado = {
    key: string
    nome: string
    descricao: string
    valor: number
    dataLabel: string
    diasAtraso: number
    eraPromessa: boolean
    rowRef: MensalidadeRow | EntradaRow
  }

  const iminentes: Iminente[] = []
  const atrasados: Atrasado[] = []

  rows.forEach(r => {
    if (r.kind === 'mensalidade') {
      const dia = parseInt(r.dia_vencimento)
      if (!dia) return
      const status = statuses[r.clientId] ?? 'nao_pago'
      if (status === 'pago') return

      const promessa = promessas[r.clientId]
      const due = promessa
        ? new Date(promessa + 'T12:00:00')
        : getMensalidadeDueDate(dia, hoje)

      const diff = daysBetween(hoje, due)

      if (diff < 0) {
        atrasados.push({
          key: 'm-' + r.clientId,
          nome: r.clienteNome,
          descricao: r.descricao,
          valor: r.valor,
          dataLabel: due.toLocaleDateString('pt-BR'),
          diasAtraso: Math.abs(diff),
          eraPromessa: !!promessa,
          rowRef: r,
        })
      } else if (diff === 0) {
        iminentes.push({
          key: 'm-' + r.clientId,
          quando: 'hoje',
          nome: r.clienteNome,
          descricao: r.descricao,
          valor: r.valor,
          dataLabel: due.toLocaleDateString('pt-BR'),
          rowRef: r,
        })
      } else if (diff === 1) {
        iminentes.push({
          key: 'm-' + r.clientId,
          quando: 'amanhã',
          nome: r.clienteNome,
          descricao: r.descricao,
          valor: r.valor,
          dataLabel: due.toLocaleDateString('pt-BR'),
          rowRef: r,
        })
      }
    } else {
      if (r.status === 'recebido') return
      if (!r.data) return
      const due = new Date(r.data + 'T12:00:00')
      const diff = daysBetween(hoje, due)
      if (diff < 0) {
        atrasados.push({
          key: 'e-' + r.id,
          nome: r.nomeProjeto,
          descricao: r.descricao || 'Cobrança',
          valor: r.valor,
          dataLabel: due.toLocaleDateString('pt-BR'),
          diasAtraso: Math.abs(diff),
          eraPromessa: false,
          rowRef: r,
        })
      } else if (diff === 0 || diff === 1) {
        iminentes.push({
          key: 'e-' + r.id,
          quando: diff === 0 ? 'hoje' : 'amanhã',
          nome: r.nomeProjeto,
          descricao: r.descricao || 'Cobrança',
          valor: r.valor,
          dataLabel: due.toLocaleDateString('pt-BR'),
          rowRef: r,
        })
      }
    }
  })

  iminentes.sort((a, b) => (a.quando === b.quando ? 0 : a.quando === 'hoje' ? -1 : 1))
  atrasados.sort((a, b) => b.diasAtraso - a.diasAtraso)

  const venceHojeCount   = iminentes.filter(i => i.quando === 'hoje').length
  const venceAmanhaCount = iminentes.filter(i => i.quando === 'amanhã').length
  const atrasadosCount   = atrasados.length

  // KPIs
  const pagosCount    = Object.values(statuses).filter(s => s === 'pago').length
  const naoPagosCount = rows.filter(r => r.kind === 'mensalidade' && (!statuses[(r as MensalidadeRow).clientId] || statuses[(r as MensalidadeRow).clientId] === 'nao_pago')).length

  const mesNome = MES_NOME[hoje.getMonth()]
  const ano     = hoje.getFullYear()

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1400px] mx-auto pb-16">

      {/* Editorial header */}
      <header className="flex items-end justify-between gap-6 mb-12 pt-2 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-slate-300/70">
            Cobranças · {mesNome} {ano}
          </p>
          <h1 className="font-display text-white mt-2 leading-[0.95] tracking-tight"
              style={{
                fontSize: 'clamp(48px, 7vw, 88px)',
                fontVariationSettings: '"opsz" 144, "SOFT" 30',
                fontWeight: 400,
              }}>
            Cobranças<span className="text-indigo-300/90 italic ml-1" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>.</span>
          </h1>
          <p className="text-slate-300 text-sm mt-3 max-w-md font-display italic"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
            quem paga, quem deve, e o que vence agora.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-slate-300 text-xs font-medium bg-white/[0.03] border border-white/[0.08] hover:border-white/20 transition-colors shrink-0 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      {/* KPIs */}
      {!loading && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] rounded-3xl overflow-hidden mb-8">
          <KpiCobranca kicker="Pagos" sub={`em ${mesNome.toLowerCase()}`} value={pagosCount} tone="emerald" />
          <KpiCobranca kicker="Não pagos" sub="aguardando pagamento" value={naoPagosCount} tone="rose" />
          <KpiCobranca kicker="Vence em breve" sub={`hoje · ${venceHojeCount} · amanhã · ${venceAmanhaCount}`} value={venceHojeCount + venceAmanhaCount} tone="amber" />
          <KpiCobranca kicker="Em atraso" sub="vencimento já passou" value={atrasadosCount} tone="rose" />
        </section>
      )}

      {/* Em atraso — destaque com mensagem tranquila */}
      {!loading && atrasados.length > 0 && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-rose-300/90">
                Em atraso · {atrasados.length}
              </p>
              <h2 className="font-display text-3xl text-white mt-1.5 tracking-tight"
                  style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
                Cobrança <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>gentil</span>
              </h2>
              <p className="text-slate-300/70 text-xs mt-1.5">
                mensagem tranquila com lembrete e abertura pra reagendar
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-300/70">PIX da empresa</p>
              <CopyableValue value={PIX_CNPJ} label="CNPJ" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {atrasados.map(a => (
              <AtrasadoCard key={a.key} item={a} />
            ))}
          </div>
        </section>
      )}

      {/* Vence em breve — destaque */}
      {!loading && iminentes.length > 0 && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-amber-300/90">
                Vence em breve · {iminentes.length}
              </p>
              <h2 className="font-display text-3xl text-white mt-1.5 tracking-tight"
                  style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
                Hora de <span className="italic text-slate-300/80" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 80' }}>cobrar</span>
              </h2>
              <p className="text-slate-300/70 text-xs mt-1.5">
                copie a mensagem com o PIX e envie pra cada cliente
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-300/70">PIX da empresa</p>
              <CopyableValue value={PIX_CNPJ} label="CNPJ" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {iminentes.map(i => (
              <IminenteCard key={i.key} item={i} />
            ))}
          </div>
        </section>
      )}

      {/* Busca */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300/60" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente ou projeto…"
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-sm placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 text-slate-300/70 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-white/[0.06] rounded-3xl">
          <p className="font-display text-3xl text-white tracking-tight"
             style={{ fontVariationSettings: '"opsz" 96, "SOFT" 60' }}>
            Nenhum registro encontrado.
          </p>
          <p className="text-slate-300 text-sm mt-3 font-display italic"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
            cadastre mensalidades ou entradas pra começar.
          </p>
        </div>
      ) : (
        <div className="space-y-10">

          {/* Mensalidades */}
          {mensRows.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
                  Mensalidades · {mensRows.length}
                </p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-300/60">
                  recorrentes do mês
                </p>
              </div>
              <div className="bg-[#0a0c11] border border-white/[0.06] rounded-2xl overflow-hidden">
                {mensRows.map((row, idx) => {
                  const status: PagamentoStatus = statuses[row.clientId] ?? 'nao_pago'
                  const promessa = promessas[row.clientId]
                  const dia = parseInt(row.dia_vencimento)
                  const dueOrig = dia ? getMensalidadeDueDate(dia, hoje) : null
                  const dueEfetiva = promessa ? new Date(promessa + 'T12:00:00') : dueOrig
                  const venceHoje   = dueEfetiva && isSameDay(dueEfetiva, hoje)
                  const venceAmanha = dueEfetiva && isSameDay(dueEfetiva, amanha)
                  return (
                    <div key={row.clientId}
                      className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02]
                        ${idx !== 0 ? 'border-t border-white/[0.04]' : ''}
                        ${status === 'pago' ? 'opacity-50' : ''}`}>
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/20 flex items-center justify-center shrink-0">
                        <span className="text-indigo-300 text-[10px] font-mono font-bold tracking-wider">{row.clienteNome.slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{row.clienteNome}</p>
                        <p className="text-slate-300/70 text-xs mt-0.5 truncate">
                          {row.descricao} · vence dia {row.dia_vencimento}
                          {promessa && (
                            <span className="ml-2 text-indigo-300 font-mono uppercase tracking-wider">
                              · prometido p/ {dueEfetiva!.toLocaleDateString('pt-BR')}
                            </span>
                          )}
                          {!promessa && venceHoje   && <span className="ml-2 text-amber-300 font-mono uppercase tracking-wider">· hoje</span>}
                          {!promessa && venceAmanha && <span className="ml-2 text-amber-300/80 font-mono uppercase tracking-wider">· amanhã</span>}
                        </p>
                      </div>
                      <span className="font-numeric text-rose-300 text-sm font-medium shrink-0">R$ {numToMask(row.valor)}</span>
                      {status !== 'pago' && (
                        <button
                          onClick={() => setAdiarFor(row)}
                          title={promessa ? 'Alterar promessa' : 'Cliente prometeu pagar em outra data'}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all whitespace-nowrap
                            ${promessa
                              ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25 hover:bg-indigo-500/25'
                              : 'bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.08] hover:ring-white/20'}`}>
                          <CalendarClock className="w-3 h-3" />
                          {promessa ? 'adiada' : 'adiar'}
                        </button>
                      )}
                      <StatusDropdown status={status} onChange={s => changeStatus(row.clientId, s)} />
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Entradas */}
          {entradaRows.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70">
                  Entradas de projetos · {entradaRows.length}
                </p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-300/60">
                  setups e parcelas
                </p>
              </div>
              <div className="bg-[#0a0c11] border border-white/[0.06] rounded-2xl overflow-hidden">
                {entradaRows.map((row, idx) => (
                  <div key={row.id}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02]
                      ${idx !== 0 ? 'border-t border-white/[0.04]' : ''}
                      ${row.status === 'recebido' ? 'opacity-50' : ''}`}>
                    <div className="w-9 h-9 rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20 flex items-center justify-center shrink-0">
                      <Briefcase className="w-4 h-4 text-violet-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{row.nomeProjeto}</p>
                      <p className="text-slate-300/70 text-xs mt-0.5 truncate">
                        {row.descricao || 'cobrança'}
                        {row.data && <span className="ml-2 font-mono text-slate-300/60">· {formatDate(row.data)}</span>}
                      </p>
                    </div>
                    <span className="font-numeric text-rose-300 text-sm font-medium shrink-0">R$ {numToMask(row.valor)}</span>
                    <StatusBadge status={row.status} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <p className="text-slate-300 text-sm font-display italic"
                 style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
                nenhum resultado para "{search}"
              </p>
            </div>
          )}
        </div>
      )}

      {adiarFor && (
        <AdiarModal
          row={adiarFor}
          dataAtual={promessas[adiarFor.clientId]}
          onSave={(dataISO) => setPromessa(adiarFor.clientId, dataISO)}
          onClear={() => setPromessa(adiarFor.clientId, null)}
          onClose={() => setAdiarFor(null)}
        />
      )}
    </div>
  )
}

// ── Modal de adiar pagamento ──────────────────────────────────────────────────

function AdiarModal({ row, dataAtual, onSave, onClear, onClose }: {
  row: MensalidadeRow
  dataAtual: string | undefined
  onSave: (dataISO: string) => Promise<void>
  onClear: () => Promise<void>
  onClose: () => void
}) {
  const hojeISO = new Date().toISOString().slice(0, 10)

  const atalhos = useMemo(() => {
    const h = new Date()
    const result: { label: string; iso: string }[] = []
    for (let i = 1; i <= 5; i++) {
      const d = new Date(h)
      d.setDate(d.getDate() + i)
      const dias = ['domingo','segunda','terça','quarta','quinta','sexta','sábado']
      const label = i === 1 ? 'amanhã'
                  : i === 2 ? 'depois de amanhã'
                  : `${dias[d.getDay()]} (${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')})`
      result.push({ label, iso: d.toISOString().slice(0, 10) })
    }
    return result
  }, [])

  const [data, setData] = useState(dataAtual || atalhos[0].iso)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setSaving(true)
    await onSave(data)
    setSaving(false)
  }

  async function handleClear() {
    setSaving(true)
    await onClear()
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0a0c11] border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">

        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.05]">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-indigo-300/80">
              Reagendar · cobrança
            </p>
            <h2 className="font-display text-2xl text-white tracking-tight mt-1"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
              Cliente vai pagar quando?
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-7 py-6 space-y-5">

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300/60">Cliente</p>
            <p className="text-white text-sm font-medium mt-1 truncate">{row.clienteNome}</p>
            <p className="text-slate-300/70 text-xs mt-0.5">
              {row.descricao} · vence dia {row.dia_vencimento} · R$ {numToMask(row.valor)}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300 mb-2">Atalhos</p>
            <div className="flex flex-wrap gap-1.5">
              {atalhos.map(a => {
                const active = data === a.iso
                return (
                  <button key={a.iso} type="button" onClick={() => setData(a.iso)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wide transition-all
                      ${active
                        ? 'bg-white text-slate-900'
                        : 'bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.08] hover:ring-white/20'}`}>
                    {a.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300 mb-2">Ou escolha uma data</p>
            <input
              type="date"
              min={hojeISO}
              value={data}
              onChange={e => setData(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-sm focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
            />
          </div>

          <p className="text-slate-300/60 text-[11px] leading-relaxed">
            A cobrança será deslocada para essa data. A data original (dia {row.dia_vencimento}) fica registrada — quando você marcar como "pago", a promessa é limpa automaticamente.
          </p>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving || !data}
              className="flex-1 py-3 rounded-full text-slate-900 text-sm font-semibold bg-white
                         hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando</span>
                : dataAtual ? 'Atualizar promessa' : 'Reagendar'}
            </button>
            {dataAtual && (
              <button type="button" onClick={handleClear} disabled={saving}
                className="px-4 py-3 rounded-full text-rose-300 text-sm font-medium bg-rose-500/[0.06] border border-rose-500/15 hover:bg-rose-500/[0.10] transition-colors">
                Remover
              </button>
            )}
            <button type="button" onClick={onClose} disabled={saving}
              className="px-5 py-3 rounded-full text-slate-300 text-sm font-medium bg-transparent border border-white/[0.08] hover:border-white/20 transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Auxiliares ────────────────────────────────────────────────────────────────

function KpiCobranca({ kicker, sub, value, tone }: {
  kicker: string
  sub: string
  value: number
  tone: 'emerald' | 'rose' | 'amber'
}) {
  const color =
    tone === 'emerald' ? 'text-emerald-200' :
    tone === 'rose'    ? 'text-rose-200' :
                         'text-amber-200'
  return (
    <div className="bg-[#0a0c11] p-6 sm:p-7">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-300/70">{kicker}</p>
      <p className={`font-display text-4xl tracking-tight mt-3 ${color}`}
         style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
        <span className="font-numeric">{value}</span>
      </p>
      <p className="text-slate-300/70 text-xs mt-2">{sub}</p>
    </div>
  )
}

function CopyableValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy}
      className="inline-flex items-center gap-2 mt-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:border-white/20 transition-colors group">
      {label && <span className="text-[10px] font-mono uppercase text-slate-300/60">{label}</span>}
      <span className="font-numeric text-sm text-white">{value}</span>
      {copied
        ? <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
        : <Copy className="w-3.5 h-3.5 text-slate-300/60 group-hover:text-white transition-colors" />}
    </button>
  )
}

function AtrasadoCard({ item }: { item: {
  key: string
  nome: string
  descricao: string
  valor: number
  dataLabel: string
  diasAtraso: number
  eraPromessa: boolean
  rowRef: MensalidadeRow | EntradaRow
}}) {
  const message = buildMessageAtrasado({
    nome:       item.nome,
    descricao:  item.descricao,
    valor:      item.valor,
    dataLabel:  item.dataLabel,
    diasAtraso: item.diasAtraso,
  })
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="bg-[#0a0c11] border border-rose-500/25 ring-1 ring-rose-500/10 rounded-2xl p-6 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-rose-500/15 ring-1 ring-rose-500/25 flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-rose-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-rose-300">
              {item.eraPromessa ? 'prometido' : 'vencido'} em {item.dataLabel}
              <span className="ml-2 text-rose-300/70 normal-case tracking-normal">
                · há {item.diasAtraso === 1 ? '1 dia' : `${item.diasAtraso} dias`}
              </span>
            </p>
            <h3 className="font-display text-xl text-white tracking-tight mt-1 leading-tight truncate"
                style={{ fontVariationSettings: '"opsz" 24, "SOFT" 40' }}>
              {item.nome}
            </h3>
            <p className="text-slate-300/70 text-xs mt-1 truncate">{item.descricao}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-2xl text-rose-200"
             style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
            <span className="text-slate-300/60 text-xs font-mono mr-1">R$</span>
            <span className="font-numeric">{numToMask(item.valor)}</span>
          </p>
        </div>
      </div>

      {showPreview && (
        <pre className="text-slate-300/85 text-xs font-mono whitespace-pre-wrap leading-relaxed bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 mb-3 max-h-48 overflow-y-auto">
{message}
        </pre>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-white/[0.05]">
        <CopyButton message={message} label="copiar mensagem" />
        <button onClick={() => setShowPreview(p => !p)}
          className="text-[11px] font-mono uppercase tracking-wider text-slate-300/70 hover:text-white px-3 py-1.5 rounded-full border border-white/[0.06] hover:border-white/15 transition-colors">
          {showPreview ? 'ocultar' : 'ver mensagem'}
        </button>
      </div>
    </div>
  )
}

function IminenteCard({ item }: { item: {
  key: string
  quando: 'hoje' | 'amanhã'
  nome: string
  descricao: string
  valor: number
  dataLabel: string
  rowRef: MensalidadeRow | EntradaRow
}}) {
  const isHoje = item.quando === 'hoje'
  const message = buildMessage({
    nome:            item.nome,
    descricao:       item.descricao,
    valor:           item.valor,
    vencimentoLabel: isHoje ? 'hoje' : 'amanhã',
    dataLabel:       item.dataLabel,
  })
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className={`bg-[#0a0c11] border rounded-2xl p-6 transition-colors
      ${isHoje
        ? 'border-amber-500/25 ring-1 ring-amber-500/10'
        : 'border-white/[0.07]'}`}>

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
            ${isHoje ? 'bg-amber-500/15 ring-1 ring-amber-500/25' : 'bg-indigo-500/10 ring-1 ring-indigo-500/20'}`}>
            {isHoje
              ? <AlertCircle className="w-4 h-4 text-amber-300" />
              : <Calendar    className="w-4 h-4 text-indigo-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-mono uppercase tracking-[0.25em]
              ${isHoje ? 'text-amber-300' : 'text-indigo-300'}`}>
              vence {item.quando} · {item.dataLabel}
            </p>
            <h3 className="font-display text-xl text-white tracking-tight mt-1 leading-tight truncate"
                style={{ fontVariationSettings: '"opsz" 24, "SOFT" 40' }}>
              {item.nome}
            </h3>
            <p className="text-slate-300/70 text-xs mt-1 truncate">{item.descricao}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-2xl text-rose-200"
             style={{ fontVariationSettings: '"opsz" 48, "SOFT" 30' }}>
            <span className="text-slate-300/60 text-xs font-mono mr-1">R$</span>
            <span className="font-numeric">{numToMask(item.valor)}</span>
          </p>
        </div>
      </div>

      {/* Preview da mensagem (toggle) */}
      {showPreview && (
        <pre className="text-slate-300/85 text-xs font-mono whitespace-pre-wrap leading-relaxed bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 mb-3 max-h-48 overflow-y-auto">
{message}
        </pre>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-white/[0.05]">
        <CopyButton message={message} label="copiar mensagem" />
        <button onClick={() => setShowPreview(p => !p)}
          className="text-[11px] font-mono uppercase tracking-wider text-slate-300/70 hover:text-white px-3 py-1.5 rounded-full border border-white/[0.06] hover:border-white/15 transition-colors">
          {showPreview ? 'ocultar' : 'ver mensagem'}
        </button>
      </div>
    </div>
  )
}
