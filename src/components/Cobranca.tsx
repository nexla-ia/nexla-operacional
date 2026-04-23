import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageCircle, Search, RefreshCw, Loader2, X, Check, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'

import { supabase } from '../lib/supabase'
import { numToMask } from '../lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MensalidadeItem {
  descricao: string
  valor: number
  dia_vencimento: string
}

interface ClientRow {
  clientId: string
  clienteNome: string
  telefone: string
  items: MensalidadeItem[]
  total: number
}

type PagamentoStatus = 'pago' | 'nao_pago'

const MES_ATUAL = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})()

// ── Status Dropdown ───────────────────────────────────────────────────────────

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
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all whitespace-nowrap
          ${isPago
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            : 'bg-slate-700/40 border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-white'}`}
      >
        {isPago
          ? <Check className="w-3 h-3" />
          : <span className="w-3 h-3 rounded-full border border-current opacity-50 inline-block shrink-0" />}
        {isPago ? 'Pago' : 'Não pago'}
        <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={menuStyle} className="rounded-xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
            <button
              onClick={e => { e.stopPropagation(); onChange('pago'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Pago
            </button>
            <button
              onClick={e => { e.stopPropagation(); onChange('nao_pago'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-400 hover:bg-white/[0.05] transition-colors border-t border-white/[0.05]"
            >
              <span className="w-3.5 h-3.5 rounded-full border border-current opacity-50 inline-block" />
              Não pago
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Cobranca() {
  const [rows, setRows]         = useState<ClientRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statuses, setStatuses] = useState<Record<string, PagamentoStatus>>({})
  const [userId, setUserId]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id ?? null
    setUserId(uid)

    const [
      { data: mensalidades },
      { data: pagamentos },
    ] = await Promise.all([
      supabase.from('mensalidades').select('*').eq('status', 'ativo').order('cliente_nome'),
      supabase.from('cobranca_pagamentos').select('client_id, status').eq('mes', MES_ATUAL),
    ])

    // Status do mês: chave = client_id
    const statusMap: Record<string, PagamentoStatus> = {}
    for (const p of pagamentos ?? []) {
      statusMap[p.client_id] = p.status as PagamentoStatus
    }
    setStatuses(statusMap)

    // Agrupa mensalidades por client_id (fallback: nome)
    const groups = new Map<string, ClientRow>()
    for (const m of mensalidades ?? []) {
      const key  = m.client_id ?? m.cliente_nome
      const nome = m.cliente_nome ?? ''
      if (!groups.has(key)) {
        groups.set(key, {
          clientId:    key,
          clienteNome: nome,
          telefone:    m.telefone ?? '',
          items:       [],
          total:       0,
        })
      }
      const row = groups.get(key)!
      row.items.push({
        descricao:      m.descricao ?? 'Mensalidade',
        valor:          m.valor ?? 0,
        dia_vencimento: String(m.dia_vencimento ?? ''),
      })
      row.total += m.valor ?? 0
    }

    setRows(Array.from(groups.values()))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function changeStatus(clientId: string, status: PagamentoStatus) {
    if (!userId) return
    setStatuses(prev => ({ ...prev, [clientId]: status }))
    const { error } = await supabase.from('cobranca_pagamentos').upsert(
      { user_id: userId, client_id: clientId, mes: MES_ATUAL, status },
      { onConflict: 'user_id,client_id,mes' }
    )
    if (error) {
      setStatuses(prev => { const n = { ...prev }; delete n[clientId]; return n })
    }
  }

  const filtered = rows.filter(r =>
    r.clienteNome.toLowerCase().includes(search.toLowerCase())
  )

  const pagosCount    = Object.values(statuses).filter(s => s === 'pago').length
  const naoPagosCount = rows.filter(r => !statuses[r.clientId] || statuses[r.clientId] === 'nao_pago').length
  const mes = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-white font-bold text-xl">Cobranças</h1>
          <p className="text-slate-400 text-sm mt-0.5 capitalize">{mes}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-300 text-sm font-medium
                     bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors
                     disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {!loading && (
        <div className="flex gap-3 mb-5">
          <div className="flex-1 px-4 py-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
            <p className="text-emerald-400 text-lg font-bold">{pagosCount}</p>
            <p className="text-emerald-400/70 text-xs font-medium">Pagos este mês</p>
          </div>
          <div className="flex-1 px-4 py-3 rounded-xl bg-orange-500/8 border border-orange-500/15">
            <p className="text-orange-400 text-lg font-bold">{naoPagosCount}</p>
            <p className="text-orange-400/70 text-xs font-medium">Não pagos este mês</p>
          </div>
        </div>
      )}

      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
                     placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                     focus:border-indigo-500/40 transition-all hover:border-white/20"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <MessageCircle className="w-10 h-10 text-slate-600 mb-4" />
          <p className="text-slate-400 font-medium text-sm">
            {rows.length === 0 ? 'Nenhuma mensalidade ativa' : 'Nenhum resultado'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.07] bg-slate-900/70">
          {filtered.map((row, idx) => {
            const status: PagamentoStatus = statuses[row.clientId] ?? 'nao_pago'

            return (
              <div
                key={row.clientId}
                className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03]
                  ${idx !== 0 ? 'border-t border-white/[0.05]' : ''}
                  ${status === 'pago' ? 'opacity-60' : ''}`}
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-indigo-300 text-xs font-bold">
                    {row.clienteNome.slice(0, 2).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{row.clienteNome}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {row.items.length === 1
                      ? `${row.items[0].descricao} · vence dia ${row.items[0].dia_vencimento}`
                      : `${row.items.length} mensalidades`}
                  </p>
                </div>

                <div className="shrink-0 text-right min-w-[80px]">
                  <span className="text-sm font-bold text-red-400">R$ {numToMask(row.total)}</span>
                </div>

                <StatusDropdown
                  status={status}
                  onChange={s => changeStatus(row.clientId, s)}
                />
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
