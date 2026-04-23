import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, Search, RefreshCw, Loader2, Phone, X, Check, ChevronDown } from 'lucide-react'

import { supabase } from '../lib/supabase'
import { numToMask } from '../lib/utils'
import type { Client } from '../lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingItem {
  descricao: string
  valor: number
  tipo: 'mensalidade' | 'projeto'
  detalhe?: string
}

interface ClientRow {
  client: Client
  items: PendingItem[]
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
  const isPago = status === 'pago'

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all
          ${isPago
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            : 'bg-slate-700/40 border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-white'}`}
      >
        {isPago
          ? <Check className="w-3 h-3" />
          : <span className="w-3 h-3 rounded-full border border-current opacity-50 inline-block" />}
        {isPago ? 'Pago' : 'Não pago'}
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 min-w-[130px] rounded-xl border border-white/10 bg-slate-900 shadow-xl overflow-hidden">
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
        </>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Cobranca() {
  const [rows, setRows]         = useState<ClientRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [statuses, setStatuses] = useState<Record<string, PagamentoStatus>>({})

  const load = useCallback(async () => {
    setLoading(true)

    const [
      { data: clients },
      { data: mensalidades },
      { data: projects },
      { data: entries },
      { data: pagamentos },
    ] = await Promise.all([
      supabase.from('clients').select('*').order('nome'),
      supabase.from('mensalidades').select('*').eq('status', 'ativo'),
      supabase.from('projects').select('nome_projeto, nome_cliente'),
      supabase.from('project_entries').select('*').eq('status', 'pendente'),
      supabase.from('cobranca_pagamentos').select('client_id, status').eq('mes', MES_ATUAL),
    ])

    // Mapa de status do mês atual
    const statusMap: Record<string, PagamentoStatus> = {}
    for (const p of pagamentos ?? []) {
      statusMap[p.client_id] = p.status as PagamentoStatus
    }
    setStatuses(statusMap)

    const projectClientMap: Record<string, string> = {}
    for (const p of projects ?? []) {
      if (p.nome_projeto && p.nome_cliente)
        projectClientMap[p.nome_projeto.toLowerCase()] = p.nome_cliente.toLowerCase()
    }

    const built: ClientRow[] = []
    for (const c of clients ?? []) {
      const nome = c.nome?.toLowerCase() ?? ''
      const items: PendingItem[] = []

      for (const m of mensalidades ?? []) {
        const matchById   = m.client_id && m.client_id === c.id
        const matchByName = !m.client_id && (
          (m.cliente_nome ?? '').toLowerCase().includes(nome) ||
          nome.includes((m.cliente_nome ?? '').toLowerCase())
        )
        if (matchById || matchByName)
          items.push({ tipo: 'mensalidade', descricao: m.descricao ?? 'Mensalidade', valor: m.valor ?? 0, detalhe: `vence dia ${m.dia_vencimento}` })
      }

      for (const e of entries ?? []) {
        const matchById   = e.client_id && e.client_id === c.id
        const projCliente = projectClientMap[(e.nome_projeto ?? '').toLowerCase()] ?? ''
        const matchByName = !e.client_id && projCliente && (projCliente.includes(nome) || nome.includes(projCliente))
        if (matchById || matchByName)
          items.push({ tipo: 'projeto', descricao: e.nome_projeto ?? 'Projeto', valor: e.valor ?? 0, detalhe: e.descricao || undefined })
      }

      const total = items.reduce((s, i) => s + i.valor, 0)
      built.push({ client: c as Client, items, total })
    }

    setRows(built)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function changeStatus(clientId: string, status: PagamentoStatus) {
    setStatuses(prev => ({ ...prev, [clientId]: status }))
    await supabase.from('cobranca_pagamentos').upsert(
      { client_id: clientId, mes: MES_ATUAL, status },
      { onConflict: 'user_id,client_id,mes' }
    )
  }

  const filtered = rows.filter(r =>
    r.client.nome.toLowerCase().includes(search.toLowerCase()) ||
    (r.client.telefone ?? '').includes(search)
  )

  const pagosCount    = Object.values(statuses).filter(s => s === 'pago').length
  const naoPagosCount = rows.filter(r => !statuses[r.client.id] || statuses[r.client.id] === 'nao_pago').length
  const mes = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <>
      {/* Header */}
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

      {/* Resumo do mês */}
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

      {/* Busca */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente ou telefone…"
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

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <MessageCircle className="w-10 h-10 text-slate-600 mb-4" />
          <p className="text-slate-400 font-medium text-sm">
            {rows.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum resultado'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.07] bg-slate-900/70 overflow-hidden">
          {filtered.map((row, idx) => {
            const { client } = row
            const status: PagamentoStatus = statuses[client.id] ?? 'nao_pago'

            return (
              <div
                key={client.id}
                className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03]
                  ${idx !== 0 ? 'border-t border-white/[0.05]' : ''}
                  ${status === 'pago' ? 'opacity-60' : ''}`}
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-indigo-300 text-xs font-bold">
                    {client.nome.slice(0, 2).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{client.nome}</p>
                  {client.telefone ? (
                    <span className="flex items-center gap-1 text-slate-400 text-xs mt-0.5">
                      <Phone className="w-3 h-3" />{client.telefone}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-xs italic mt-0.5 block">sem telefone</span>
                  )}
                </div>

                <div className="shrink-0 text-right min-w-[80px]">
                  {row.total > 0
                    ? <span className="text-sm font-bold text-red-400">R$ {numToMask(row.total)}</span>
                    : <span className="text-xs text-slate-500">—</span>
                  }
                </div>

                <StatusDropdown
                  status={status}
                  onChange={s => changeStatus(client.id, s)}
                />
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
