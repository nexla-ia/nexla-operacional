import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, Copy, Check, Search, RefreshCw, Loader2, ChevronDown, ChevronUp, Phone, X, Send } from 'lucide-react'

const N8N_WEBHOOK = 'https://n8n.nexladesenvolvimento.com.br/webhook/cobrançaMensalidade'
import { supabase } from '../lib/supabase'
import { numToMask } from '../lib/utils'
import type { Client } from '../lib/types'

// ── Tipos internos ────────────────────────────────────────────────────────────

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
  message: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────


function buildMessage(client: Client, items: PendingItem[], total: number): string {
  const lines: string[] = []
  lines.push(`Olá, ${client.nome}! 👋`)
  lines.push('')
  lines.push('Identificamos os seguintes valores em aberto:')
  lines.push('')

  for (const item of items) {
    const tag = item.tipo === 'mensalidade' ? '🔄' : '💼'
    lines.push(`${tag} ${item.descricao}: R$ ${numToMask(item.valor)}${item.detalhe ? ` (${item.detalhe})` : ''}`)
  }

  lines.push('')
  lines.push(`*Total: R$ ${numToMask(total)}*`)
  lines.push('')
  lines.push('Para regularizar, entre em contato conosco. Obrigado! 🙏')

  return lines.join('\n')
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Cobranca() {
  const [rows, setRows]         = useState<ClientRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [copied, setCopied]     = useState<string | null>(null)
  const [sending, setSending]   = useState<string | null>(null)
  const [sent, setSent]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    const [
      { data: clients },
      { data: mensalidades },
      { data: projects },
      { data: entries },
    ] = await Promise.all([
      supabase.from('clients').select('*').order('nome'),
      supabase.from('mensalidades').select('*').eq('status', 'ativo'),
      supabase.from('projects').select('nome_projeto, nome_cliente'),
      supabase.from('project_entries').select('*').eq('status', 'pendente'),
    ])

    // Mapa: nome do projeto → nome do cliente
    const projectClientMap: Record<string, string> = {}
    for (const p of projects ?? []) {
      if (p.nome_projeto && p.nome_cliente) {
        projectClientMap[p.nome_projeto.toLowerCase()] = p.nome_cliente.toLowerCase()
      }
    }

    const built: ClientRow[] = []

    for (const c of clients ?? []) {
      const nome = c.nome?.toLowerCase() ?? ''
      const items: PendingItem[] = []

      // Mensalidades: primeiro por client_id (FK), depois por nome (retrocompat.)
      for (const m of mensalidades ?? []) {
        const matchById   = m.client_id && m.client_id === c.id
        const matchByName = !m.client_id && (
          (m.cliente_nome ?? '').toLowerCase().includes(nome) ||
          nome.includes((m.cliente_nome ?? '').toLowerCase())
        )
        if (matchById || matchByName) {
          items.push({
            tipo: 'mensalidade',
            descricao: m.descricao ?? 'Mensalidade',
            valor: m.valor ?? 0,
            detalhe: `vence dia ${m.dia_vencimento}`,
          })
        }
      }

      // Entradas de projetos: por client_id ou por nome do projeto mapeado
      for (const e of entries ?? []) {
        const matchById = e.client_id && e.client_id === c.id
        const projCliente = projectClientMap[(e.nome_projeto ?? '').toLowerCase()] ?? ''
        const matchByName = !e.client_id && projCliente &&
          (projCliente.includes(nome) || nome.includes(projCliente))
        if (matchById || matchByName) {
          items.push({
            tipo: 'projeto',
            descricao: e.nome_projeto ?? 'Projeto',
            valor: e.valor ?? 0,
            detalhe: e.descricao || undefined,
          })
        }
      }

      const total = items.reduce((s, i) => s + i.valor, 0)
      const message = buildMessage(c as Client, items, total)

      built.push({ client: c as Client, items, total, message })
    }

    setRows(built)
    // Inicializa mensagens editáveis
    const msgs: Record<string, string> = {}
    for (const r of built) msgs[r.client.id] = r.message
    setMessages(msgs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function setMsg(id: string, val: string) {
    setMessages(m => ({ ...m, [id]: val }))
  }

  async function copyMsg(id: string) {
    await navigator.clipboard.writeText(messages[id] ?? '')
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function sendToN8n(row: ClientRow) {
    const id  = row.client.id
    const msg = messages[id] ?? row.message
    setSending(id)
    try {
      await fetch(N8N_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id:    row.client.id,
          cliente_nome:  row.client.nome,
          telefone:      row.client.telefone,
          total:         row.total,
          mensagem:      msg,
          itens:         row.items,
        }),
      })
      setSent(id)
      setTimeout(() => setSent(null), 3000)
    } catch {
      // silencia — o n8n pode retornar status não-2xx mas ainda processar
      setSent(id)
      setTimeout(() => setSent(null), 3000)
    } finally {
      setSending(null)
    }
  }

  const filtered = rows.filter(r =>
    r.client.nome.toLowerCase().includes(search.toLowerCase()) ||
    r.client.telefone.includes(search)
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">Cobranças</h1>
          <p className="text-slate-300 text-sm mt-0.5">
            {loading ? 'Carregando…' : `${filtered.length} cliente${filtered.length !== 1 ? 's' : ''} · ${rows.filter(r => r.total > 0).length} com pendências`}
          </p>
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

      {/* Busca */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente ou telefone…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
                     placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                     focus:border-indigo-500/40 transition-all hover:border-white/20"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-300">
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
          <MessageCircle className="w-10 h-10 text-slate-300 mb-4" />
          <p className="text-slate-300 font-medium text-sm">
            {rows.length === 0 ? 'Nenhum cliente com pendências' : 'Nenhum resultado'}
          </p>
          <p className="text-slate-300 text-xs mt-1">
            {rows.length === 0
              ? 'Cadastre mensalidades ou entradas de projetos pendentes'
              : 'Tente outro nome ou telefone'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => {
            const { client, items, total } = row
            const isOpen = expanded === client.id
            const msg = messages[client.id] ?? row.message
            const hasPhone = !!client.telefone

            return (
              <div
                key={client.id}
                className={`rounded-2xl border backdrop-blur-sm transition-all duration-200
                  ${isOpen ? 'bg-slate-900/90 border-white/[0.12]' : 'bg-slate-900/70 border-white/[0.07] hover:border-white/[0.11]'}`}
              >
                {/* Cabeçalho do card */}
                <button
                  onClick={() => setExpanded(isOpen ? null : client.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left"
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center shrink-0">
                    <span className="text-indigo-300 text-xs font-bold">
                      {client.nome.slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{client.nome}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {client.telefone && (
                        <span className="flex items-center gap-1 text-slate-300 text-xs">
                          <Phone className="w-3 h-3" />{client.telefone}
                        </span>
                      )}
                      <span className="text-xs text-slate-300">
                        {items.length} item{items.length !== 1 ? 'ns' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Total + chevron */}
                  <div className="flex items-center gap-3 shrink-0">
                    {total > 0
                      ? <span className="text-sm font-bold text-red-400">R$ {numToMask(total)}</span>
                      : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20">Em dia</span>
                    }
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-slate-300" />
                      : <ChevronDown className="w-4 h-4 text-slate-300" />}
                  </div>
                </button>

                {/* Painel expandido */}
                {isOpen && (
                  <div className="px-5 pb-5 space-y-4 border-t border-white/[0.07] pt-4">

                    {/* Itens pendentes */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-300 uppercase tracking-wide">Pendências</p>
                      {items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{item.tipo === 'mensalidade' ? '🔄' : '💼'}</span>
                            <div>
                              <p className="text-slate-200 text-xs font-medium">{item.descricao}</p>
                              {item.detalhe && <p className="text-slate-300 text-[10px]">{item.detalhe}</p>}
                            </div>
                          </div>
                          <span className="text-red-400 text-xs font-semibold">R$ {numToMask(item.valor)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Mensagem editável */}
                    <div>
                      <p className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-2">Mensagem</p>
                      <textarea
                        rows={10}
                        value={msg}
                        onChange={e => setMsg(client.id, e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm
                                   placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                                   focus:border-indigo-500/40 transition-all resize-none leading-relaxed"
                      />
                    </div>

                    {/* Ações */}
                    <div className="flex gap-3">
                      {/* Cobrar via n8n */}
                      {hasPhone ? (
                        <button
                          onClick={() => sendToN8n(row)}
                          disabled={sending === client.id}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                                     bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30
                                     text-[#25D366] text-sm font-semibold transition-all disabled:opacity-60"
                        >
                          {sending === client.id
                            ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando…</>
                            : sent === client.id
                              ? <><Check className="w-4 h-4" />Enviado!</>
                              : <><Send className="w-4 h-4" />Cobrar</>
                          }
                        </button>
                      ) : (
                        <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                                       bg-slate-800/50 border border-white/[0.05] text-slate-300 text-sm cursor-not-allowed">
                          <Phone className="w-4 h-4" />
                          Sem telefone cadastrado
                        </div>
                      )}

                      {/* Copiar */}
                      <button
                        onClick={() => copyMsg(client.id)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                                   bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07]
                                   text-slate-300 hover:text-white transition-all"
                      >
                        {copied === client.id
                          ? <><Check className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">Copiado!</span></>
                          : <><Copy className="w-4 h-4" />Copiar</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
