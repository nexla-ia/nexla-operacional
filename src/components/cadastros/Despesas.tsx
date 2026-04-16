import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Receipt, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { maskBRL, parseBRL, numToMask, formatDate } from '../../lib/utils'
import type { Expense } from '../../lib/types'

const EMPTY: Omit<Expense, 'id'> = { descricao: '', valor: '', data: '', categoria: '', tipo: 'avulsa' }

const CATEGORIAS = ['Aluguel','Salários','Fornecedores','Marketing','Tecnologia','Transporte','Alimentação','Impostos','Outros']

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5'

function fromDB(r: Record<string, unknown>): Expense {
  return {
    id: r.id as string, descricao: (r.descricao as string) ?? '',
    valor: numToMask(r.valor as number | null), data: (r.data as string) ?? '',
    categoria: (r.categoria as string) ?? '', tipo: (r.tipo as 'fixa' | 'avulsa') ?? 'avulsa',
  }
}

function ExpenseModal({ initial, editing, tipo, onSave, onClose }: {
  initial: Omit<Expense, 'id'>; editing: boolean; tipo: 'fixa' | 'avulsa'
  onSave: (d: Omit<Expense, 'id'>) => Promise<void>; onClose: () => void
}) {
  const [form, setForm] = useState({ ...initial, tipo })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Omit<Expense, 'id'>, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); await onSave(form); setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 ring-1 ring-red-500/25 flex items-center justify-center"><Receipt className="w-4 h-4 text-red-400" /></div>
            <h2 className="text-white font-semibold text-base">{editing ? 'Editar Despesa' : `Nova Despesa ${tipo === 'fixa' ? 'Fixa' : 'Avulsa'}`}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.07] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="px-7 py-6 space-y-4">
          <div><label className={labelCls}>Descrição *</label>
            <input className={inputCls} placeholder="Ex: Aluguel do escritório" value={form.descricao} onChange={e => set('descricao', e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Valor (R$)</label>
              <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                <input className={inputCls + ' pl-9'} placeholder="0,00" value={form.valor} onChange={e => set('valor', maskBRL(e.target.value))} inputMode="numeric" required /></div></div>
            <div><label className={labelCls}>Data</label>
              <input type="date" className={inputCls + ' cursor-pointer'} value={form.data} onChange={e => set('data', e.target.value)} style={{ colorScheme: 'dark' }} required /></div>
          </div>
          <div><label className={labelCls}>Categoria</label>
            <select className={inputCls + ' cursor-pointer'} value={form.categoria} onChange={e => set('categoria', e.target.value)} style={{ colorScheme: 'dark' }}>
              <option value="">Selecione…</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select></div>
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

export default function Despesas() {
  const [items, setItems]     = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState<'fixa' | 'avulsa'>('avulsa')
  const [modal, setModal]     = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [initial, setInitial] = useState<Omit<Expense, 'id'>>(EMPTY)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('expenses').select('*').order('data', { ascending: false })
    if (error) setError('Erro ao carregar.')
    else if (data) setItems(data.map(fromDB))
    setLoading(false)
  }

  async function handleSave(data: Omit<Expense, 'id'>) {
    setError('')
    const payload = { descricao: data.descricao, valor: parseBRL(data.valor), data: data.data,
      categoria: data.categoria || null, tipo: data.tipo }
    if (editId) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editId)
      if (error) { setError('Erro ao salvar.'); return }
      setItems(is => is.map(i => i.id === editId ? { ...data, id: editId } : i))
    } else {
      const { data: row, error } = await supabase.from('expenses').insert(payload).select().single()
      if (error || !row) { setError('Erro ao criar.'); return }
      setItems(is => [fromDB(row), ...is])
    }
    setModal(false)
  }

  async function del(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { setError('Erro ao excluir.'); return }
    setItems(is => is.filter(i => i.id !== id))
  }

  function openNew() { setInitial({ ...EMPTY, tipo: tab }); setEditId(null); setModal(true) }
  function openEdit(i: Expense) { const { id, ...r } = i; setInitial(r); setEditId(id); setModal(true) }

  const filtered = items.filter(i => i.tipo === tab)
  const total = items.filter(i => i.tipo === tab).reduce((s, i) => s + (parseBRL(i.valor) ?? 0), 0)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">Despesas</h1>
          <p className="text-slate-500 text-sm mt-0.5">{loading ? 'Carregando…' : `Total ${tab}: R$ ${numToMask(total)}`}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all duration-300">
          <Plus className="w-4 h-4" />Nova Despesa
        </button>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['avulsa', 'fixa'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'}`}>
            {t === 'fixa' ? 'Fixas' : 'Avulsas'}
            <span className="ml-2 text-xs bg-white/10 px-1.5 py-0.5 rounded-full">{items.filter(i => i.tipo === t).length}</span>
          </button>
        ))}
      </div>
      {error && <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Receipt className="w-8 h-8 text-slate-700 mb-3" />
          <p className="text-slate-500 text-sm">Nenhuma despesa {tab === 'fixa' ? 'fixa' : 'avulsa'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(i => (
            <div key={i.id} className="group flex items-center gap-4 px-5 py-4 rounded-2xl bg-slate-900/70 border border-white/[0.07] hover:border-white/[0.13] transition-all">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{i.descricao}</p>
                <p className="text-slate-500 text-xs mt-0.5">{i.categoria || '—'} {i.data && `· ${formatDate(i.data)}`}</p>
              </div>
              <p className="text-red-400 font-semibold text-sm shrink-0">R$ {i.valor}</p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => openEdit(i)} className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(i.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && <ExpenseModal initial={initial} editing={!!editId} tipo={tab} onSave={handleSave} onClose={() => setModal(false)} />}
    </>
  )
}
