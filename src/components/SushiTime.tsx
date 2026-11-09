import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, Search, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Tela Sushi Time — mostra se a solicitação de avaliação Google foi enviada.
// Somente leitura: dados da função nexla_sushi_review_requests()
// (liberada por nexla_tela_acesso).

interface ReviewRequest {
  id:            number
  phone:         string
  customer_name: string | null
  order_id:      string | null
  send_at:       string
  status:        string
  skip_reason:   string | null
  sent_at:       string | null
}

type Filtro = 'todos' | 'sent' | 'pending' | 'skipped'

const STATUS: Record<string, { label: string; cls: string }> = {
  sent:    { label: 'Enviada',  cls: 'bg-emerald-500/10 text-emerald-300' },
  pending: { label: 'Pendente', cls: 'bg-amber-500/10 text-amber-200' },
  skipped: { label: 'Pulada',   cls: 'bg-white/[0.06] text-slate-300' },
}

const SKIP_REASON: Record<string, string> = {
  asked_last_30d: 'já pediu nos últimos 30 dias',
}

function fmtDataHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const soDigitos = (p: string) => p.replace(/\D/g, '')

function fmtTelefone(p: string) {
  const d = soDigitos(p)
  if (d.length === 13 && d.startsWith('55')) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 12 && d.startsWith('55')) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  if (d.length === 11 && d.startsWith('1'))  return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  return p
}

export default function SushiTime() {
  const [rows, setRows]       = useState<ReviewRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filtro, setFiltro]   = useState<Filtro>('todos')
  const [busca, setBusca]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.rpc('nexla_sushi_review_requests')
    if (err) setError(err.code === '42501' ? 'Você não tem acesso a esta tela.' : 'Erro ao carregar: ' + err.message)
    else setRows((data ?? []) as ReviewRequest[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const contagem = useMemo(() => ({
    todos:   rows.length,
    sent:    rows.filter(r => r.status === 'sent').length,
    pending: rows.filter(r => r.status === 'pending').length,
    skipped: rows.filter(r => r.status === 'skipped').length,
  }), [rows])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const qd = soDigitos(q)
    return rows.filter(r =>
      (filtro === 'todos' || r.status === filtro) &&
      (!q || (r.customer_name ?? '').toLowerCase().includes(q)
          || (r.order_id ?? '').toLowerCase().includes(q)
          || (qd.length > 0 && soDigitos(r.phone).includes(qd))))
  }, [rows, filtro, busca])

  const filtros: { id: Filtro; label: string }[] = [
    { id: 'todos',   label: 'Todas' },
    { id: 'sent',    label: 'Enviadas' },
    { id: 'pending', label: 'Pendentes' },
    { id: 'skipped', label: 'Puladas' },
  ]

  return (
    <div className="max-w-[1200px] mx-auto pb-12">

      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-white text-xl font-semibold">Sushi Time</h1>
          <p className="text-slate-400 text-sm">Envio das solicitações de avaliação no Google</p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-slate-300 text-xs bg-white/[0.04] border border-white/[0.08] hover:border-white/20 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-rose-500/[0.08] border border-rose-500/20 text-rose-200 text-sm">{error}</div>
      )}

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {filtros.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${filtro === f.id ? 'bg-white text-slate-900' : 'text-slate-300 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
              {f.label} <span className="opacity-60">{contagem[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, telefone ou pedido"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder-slate-500 focus:outline-none focus:border-white/20" />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-[#0a0c11] overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : visiveis.length === 0 ? (
          <p className="text-center py-16 text-slate-400 text-sm">Nada encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-white/[0.06]">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Telefone</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Enviado em</th>
                  <th className="px-4 py-2.5 font-medium hidden md:table-cell">Agendado para</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(r => {
                  const st = STATUS[r.status] ?? { label: r.status, cls: 'bg-white/[0.06] text-slate-300' }
                  return (
                    <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-2.5 text-white">{r.customer_name || <span className="text-slate-500">Sem nome</span>}</td>
                      <td className="px-4 py-2.5 text-slate-300 text-xs whitespace-nowrap">{fmtTelefone(r.phone)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-md text-xs whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        {r.status === 'skipped' && r.skip_reason && (
                          <span className="block text-[11px] text-slate-500 mt-1">{SKIP_REASON[r.skip_reason] ?? r.skip_reason}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-slate-300">{fmtDataHora(r.sent_at)}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-slate-500 hidden md:table-cell">{fmtDataHora(r.send_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
