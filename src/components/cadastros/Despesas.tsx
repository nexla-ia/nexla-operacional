import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Receipt, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { maskBRL, parseBRL, numToMask, formatDate } from '../../lib/utils'
import type { Expense } from '../../lib/types'

const EMPTY: Omit<Expense, 'id'> = { descricao: '', valor: '', data: '', categoria: '', tipo: 'avulsa' }

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

  const isFixa = form.tipo === 'fixa'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 ring-1 ring-red-500/25 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-red-400" />
            </div>
            <h2 className="text-white font-semibold text-base">
              {editing ? 'Editar Despesa' : 'Nova Despesa'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-7 py-6 space-y-4">

          {/* Tipo: Avulsa / Fixa */}
          {!editing && (
            <div>
              <label className={labelCls}>Tipo de despesa</label>
              <div className="flex gap-2">
                {(['avulsa', 'fixa'] as const).map(t => (
                  <button key={t} type="button" onClick={() => set('tipo', t)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${form.tipo === t
                        ? t === 'fixa'
                          ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                          : 'bg-red-500/15 border-red-500/30 text-red-300'
                        : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20'}`}>
                    {t === 'fixa' ? 'Fixa' : 'Avulsa'}
                  </button>
                ))}
              </div>
              {isFixa && (
                <p className="mt-1.5 text-[11px] text-slate-600">
                  Despesa recorrente mensal — informe o dia do mês no campo Data.
                </p>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>Descrição *</label>
            <input className={inputCls} placeholder="Ex: Aluguel do escritório"
              value={form.descricao} onChange={e => set('descricao', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Valor (R$)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                <input className={inputCls + ' pl-9'} placeholder="0,00"
                  value={form.valor} onChange={e => set('valor', maskBRL(e.target.value))}
                  inputMode="numeric" required />
              </div>
            </div>
            <div>
              <label className={labelCls}>{isFixa ? 'Dia de referência' : 'Data'}</label>
              <input type="date" className={inputCls + ' cursor-pointer'}
                value={form.data} onChange={e => set('data', e.target.value)}
                style={{ colorScheme: 'dark' }} required />
            </div>
          </div>

          <div>
            <label className={labelCls}>Categoria</label>
            <input className={inputCls} placeholder="Ex: Aluguel, Salários…"
              value={form.categoria} onChange={e => set('categoria', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/25 disabled:opacity-60 hover:-translate-y-0.5 transition-all duration-300">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando…</span>
                : editing ? 'Salvar' : 'Criar'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-slate-400 text-sm bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors">
              Cancelar
            </button>
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
      <div className="flex items-center justify-between mb-5 animate-stagger-1">
        <div>
          <h1 className="text-white font-extrabold text-xl tracking-tight">Despesas</h1>
          <p className="text-slate-600 text-sm mt-0.5 font-medium font-numeric">
            {loading ? 'Carregando…' : `Total: R$ ${numToMask(total)}`}
          </p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all duration-300">
          <Plus className="w-4 h-4" />Nova Despesa
        </button>
      </div>
      {/* Tabs */}
      <div className="flex gap-1.5 mb-5 animate-stagger-2">
        {(['avulsa', 'fixa'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-indigo-500/12 text-indigo-300 border border-indigo-500/20' : 'text-slate-600 hover:text-slate-300 border border-transparent hover:border-white/[0.06]'}`}>
            {t === 'fixa' ? 'Fixas' : 'Avulsas'}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-md font-bold ${tab === t ? 'bg-indigo-500/15 text-indigo-400' : 'bg-white/[0.05] text-slate-600'}`}>
              {items.filter(i => i.tipo === t).length}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 text-sm font-medium">
          {error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center animate-stagger-3">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
            <Receipt className="w-5 h-5 text-slate-700" />
          </div>
          <p className="text-slate-500 font-semibold text-sm">Nenhuma despesa {tab === 'fixa' ? 'fixa' : 'avulsa'}</p>
        </div>
      ) : (
        <div className="space-y-1.5 animate-stagger-3">
          {filtered.map(i => (
            <div key={i.id} className="group flex items-center gap-4 px-5 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.09] hover:bg-white/[0.03] transition-all">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-sm font-semibold truncate">{i.descricao}</p>
                <p className="text-slate-700 text-xs mt-0.5 font-medium">
                  {i.categoria || '—'}{i.data && ` · ${formatDate(i.data)}`}
                </p>
              </div>
              <p className="text-red-400 font-bold text-sm shrink-0 font-numeric">R$ {i.valor}</p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => openEdit(i)} className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(i.id)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal && <ExpenseModal initial={initial} editing={!!editId} tipo={tab} onSave={handleSave} onClose={() => setModal(false)} />}
    </>
  )
}
