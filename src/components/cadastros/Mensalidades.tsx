import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, RefreshCw, Loader2, CheckCircle, PauseCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { maskBRL, parseBRL, numToMask, formatDate } from '../../lib/utils'
import type { Mensalidade } from '../../lib/types'

const EMPTY: Omit<Mensalidade, 'id'> = {
  cliente_nome: '', descricao: '', valor: '', dia_vencimento: '', status: 'ativo', data_inicio: '',
}

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

function fromDB(r: Record<string, unknown>): Mensalidade {
  return {
    id: r.id as string, cliente_nome: (r.cliente_nome as string) ?? '',
    descricao: (r.descricao as string) ?? '', valor: numToMask(r.valor as number | null),
    dia_vencimento: String(r.dia_vencimento ?? ''), status: (r.status as 'ativo' | 'inativo') ?? 'ativo',
    data_inicio: (r.data_inicio as string) ?? '',
  }
}

function MensalidadeModal({ initial, editing, onSave, onClose }: {
  initial: Omit<Mensalidade, 'id'>; editing: boolean
  onSave: (d: Omit<Mensalidade, 'id'>) => Promise<void>; onClose: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Omit<Mensalidade, 'id'>, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); await onSave(form); setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 ring-1 ring-violet-500/25 flex items-center justify-center"><RefreshCw className="w-4 h-4 text-violet-400" /></div>
            <h2 className="text-white font-semibold text-base">{editing ? 'Editar Mensalidade' : 'Nova Mensalidade'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.07] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="px-7 py-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Cliente *</label>
              <input className={inputCls} placeholder="Nome do cliente" value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} required /></div>
            <div><label className={labelCls}>Descrição *</label>
              <input className={inputCls} placeholder="Ex: Manutenção mensal" value={form.descricao} onChange={e => set('descricao', e.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Valor (R$)</label>
              <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                <input className={inputCls + ' pl-9'} placeholder="0,00" value={form.valor} onChange={e => set('valor', maskBRL(e.target.value))} inputMode="numeric" required /></div></div>
            <div><label className={labelCls}>Dia de Vencimento</label>
              <input type="number" min={1} max={31} className={inputCls} placeholder="Ex: 10" value={form.dia_vencimento} onChange={e => set('dia_vencimento', e.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Data de Início</label>
              <input type="date" className={inputCls + ' cursor-pointer'} value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} style={{ colorScheme: 'dark' }} /></div>
            <div><label className={labelCls}>Status</label>
              <div className="flex gap-2 mt-1">
                {(['ativo', 'inativo'] as const).map(s => (
                  <button key={s} type="button" onClick={() => set('status', s)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${form.status === s ? (s === 'ativo' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-500/20 border-slate-500/40 text-slate-300') : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20'}`}>
                    {s === 'ativo' ? 'Ativo' : 'Inativo'}
                  </button>
                ))}
              </div></div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/25 disabled:opacity-60 hover:-translate-y-0.5 transition-all duration-300">
              {saving ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando…</span> : editing ? 'Salvar' : 'Criar'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-400 text-sm bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Mensalidades() {
  const [items, setItems]     = useState<Mensalidade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [modal, setModal]     = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [initial, setInitial] = useState<Omit<Mensalidade, 'id'>>(EMPTY)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('mensalidades').select('*').order('cliente_nome')
    if (error) setError('Erro ao carregar.')
    else if (data) setItems(data.map(fromDB))
    setLoading(false)
  }

  async function handleSave(data: Omit<Mensalidade, 'id'>) {
    setError('')
    const payload = { cliente_nome: data.cliente_nome, descricao: data.descricao,
      valor: parseBRL(data.valor), dia_vencimento: parseInt(data.dia_vencimento),
      status: data.status, data_inicio: data.data_inicio || null }
    if (editId) {
      const { error } = await supabase.from('mensalidades').update(payload).eq('id', editId)
      if (error) { setError('Erro ao salvar.'); return }
      setItems(is => is.map(i => i.id === editId ? { ...data, id: editId } : i))
    } else {
      const { data: row, error } = await supabase.from('mensalidades').insert(payload).select().single()
      if (error || !row) { setError('Erro ao criar.'); return }
      setItems(is => [...is, fromDB(row)])
    }
    setModal(false)
  }

  async function del(id: string) {
    const { error } = await supabase.from('mensalidades').delete().eq('id', id)
    if (error) { setError('Erro ao excluir.'); return }
    setItems(is => is.filter(i => i.id !== id))
  }

  async function toggleStatus(item: Mensalidade) {
    const next = item.status === 'ativo' ? 'inativo' : 'ativo'
    const { error } = await supabase.from('mensalidades').update({ status: next }).eq('id', item.id)
    if (!error) setItems(is => is.map(i => i.id === item.id ? { ...i, status: next } : i))
  }

  const totalAtivo = items.filter(i => i.status === 'ativo').reduce((s, i) => s + (parseBRL(i.valor) ?? 0), 0)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">Mensalidades</h1>
          <p className="text-slate-500 text-sm mt-0.5">{loading ? 'Carregando…' : `Recorrente mensal: R$ ${numToMask(totalAtivo)}`}</p>
        </div>
        <button onClick={() => { setInitial(EMPTY); setEditId(null); setModal(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all duration-300">
          <Plus className="w-4 h-4" />Nova Mensalidade
        </button>
      </div>
      {error && <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <RefreshCw className="w-8 h-8 text-slate-700 mb-3" /><p className="text-slate-500 text-sm">Nenhuma mensalidade cadastrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(i => (
            <div key={i.id} className="group flex items-center gap-4 px-5 py-4 rounded-2xl bg-slate-900/70 border border-white/[0.07] hover:border-white/[0.13] transition-all">
              <button onClick={() => toggleStatus(i)} className="shrink-0">
                {i.status === 'ativo' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <PauseCircle className="w-5 h-5 text-slate-600" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{i.cliente_nome}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                {i.descricao} · vence dia {i.dia_vencimento}
                {i.data_inicio && ` · desde ${formatDate(i.data_inicio)}`}
              </p>
              </div>
              <p className={`font-semibold text-sm shrink-0 ${i.status === 'ativo' ? 'text-emerald-400' : 'text-slate-500'}`}>R$ {i.valor}</p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => { const { id, ...r } = i; setInitial(r); setEditId(id); setModal(true) }} className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(i.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && <MensalidadeModal initial={initial} editing={!!editId} onSave={handleSave} onClose={() => setModal(false)} />}
    </>
  )
}
