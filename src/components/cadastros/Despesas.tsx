import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Receipt, Loader2, CalendarClock, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { maskBRL, parseBRL, numToMask, formatDate } from '../../lib/utils'
import type { Expense } from '../../lib/types'
import { SearchableSelect } from '../SearchableSelect'

const EMPTY: Omit<Expense, 'id'> = {
  descricao: '', valor: '', data: '', categoria: '', tipo: 'avulsa', dia_vencimento: undefined,
}

const DIAS = Array.from({ length: 31 }, (_, i) => i + 1)

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-300 mb-1.5'

function fromDB(r: Record<string, unknown>): Expense {
  return {
    id:             r.id as string,
    descricao:      (r.descricao as string) ?? '',
    valor:          numToMask(r.valor as number | null),
    data:           (r.data as string) ?? '',
    categoria:      (r.categoria as string) ?? '',
    tipo:           (r.tipo as 'fixa' | 'avulsa') ?? 'avulsa',
    dia_vencimento: (r.dia_vencimento as number) || undefined,
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ExpenseModal({ initial, editing, tipo, onSave, onClose }: {
  initial: Omit<Expense, 'id'>
  editing: boolean
  tipo: 'fixa' | 'avulsa'
  onSave: (d: Omit<Expense, 'id'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm]     = useState({ ...initial, tipo })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Omit<Expense, 'id'>, v: string | number | undefined) =>
    setForm(f => ({ ...f, [k]: v }))

  const isFixa = form.tipo === 'fixa'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (isFixa && !form.dia_vencimento) return
    if (!isFixa && !form.data) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">

        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl ring-1 flex items-center justify-center
              ${isFixa ? 'bg-violet-500/15 ring-violet-500/25' : 'bg-red-500/15 ring-red-500/25'}`}>
              {isFixa
                ? <CalendarClock className="w-4 h-4 text-violet-400" />
                : <Receipt className="w-4 h-4 text-red-400" />}
            </div>
            <h2 className="text-white font-semibold text-base">
              {editing ? 'Editar Despesa' : 'Nova Despesa'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-7 py-6 space-y-4">

          {/* Tipo */}
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
                        : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                    {t === 'fixa' ? '🔁 Fixa' : '📌 Avulsa'}
                  </button>
                ))}
              </div>
              {isFixa && (
                <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
                  Cobrança mensal automática — escolha apenas o dia do mês.
                </p>
              )}
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className={labelCls}>Descrição *</label>
            <input className={inputCls} placeholder="Ex: Aluguel do escritório"
              value={form.descricao} onChange={e => set('descricao', e.target.value)} required />
          </div>

          {/* Valor + Data/Dia */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Valor (R$) *</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none">R$</span>
                <input className={inputCls + ' pl-9'} placeholder="0,00"
                  value={form.valor} onChange={e => set('valor', maskBRL(e.target.value))}
                  inputMode="numeric" required />
              </div>
            </div>

            {isFixa ? (
              <div>
                <label className={labelCls}>Dia do mês *</label>
                <SearchableSelect
                  required
                  value={form.dia_vencimento ? String(form.dia_vencimento) : ''}
                  onChange={v => set('dia_vencimento', v ? Number(v) : undefined)}
                  placeholder="Dia…"
                  accentColor="violet"
                  options={DIAS.map(d => ({ value: String(d), label: `Todo dia ${d}` }))}
                />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Data *</label>
                <input type="date" className={inputCls + ' cursor-pointer'}
                  value={form.data} onChange={e => set('data', e.target.value)}
                  style={{ colorScheme: 'dark' }} required />
              </div>
            )}
          </div>

          {/* Categoria */}
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
              className="px-5 py-2.5 rounded-xl text-slate-300 text-sm bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Despesas() {
  const [items, setItems]     = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState<'todos' | 'fixa' | 'avulsa'>('todos')
  const [modal, setModal]     = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [initial, setInitial] = useState<Omit<Expense, 'id'>>(EMPTY)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('expenses').select('*').order('created_at', { ascending: false })
    if (error) setError('Erro ao carregar.')
    else if (data) setItems(data.map(fromDB))
    setLoading(false)
  }

  async function handleSave(data: Omit<Expense, 'id'>) {
    setError('')
    const payload = {
      descricao:      data.descricao,
      valor:          parseBRL(data.valor),
      data:           data.tipo === 'avulsa' ? (data.data || null) : null,
      categoria:      data.categoria || null,
      tipo:           data.tipo,
      dia_vencimento: data.tipo === 'fixa' ? (data.dia_vencimento ?? null) : null,
    }
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

  function openNew()       { setInitial({ ...EMPTY, tipo: tab === 'todos' ? 'avulsa' : tab }); setEditId(null); setModal(true) }
  function openEdit(i: Expense) { const { id, ...r } = i; setInitial(r); setEditId(id); setModal(true) }

  const filtered = tab === 'todos' ? items : items.filter(i => i.tipo === tab)

  function dataLabel(i: Expense) {
    if (i.tipo === 'fixa') {
      // novo campo
      if (i.dia_vencimento) return `Todo dia ${i.dia_vencimento}`
      // fallback para registros antigos
      if (i.data) return `Todo dia ${new Date(i.data + 'T12:00:00').getDate()}`
      return '—'
    }
    return i.data ? formatDate(i.data) : '—'
  }

  const fixasTotal  = items.filter(i => i.tipo === 'fixa').reduce((s, i) => s + (parseBRL(i.valor) ?? 0), 0)
  const avulsasTotal = items.filter(i => i.tipo === 'avulsa').reduce((s, i) => s + (parseBRL(i.valor) ?? 0), 0)
  const fixasCount  = items.filter(i => i.tipo === 'fixa').length
  const avulsasCount = items.filter(i => i.tipo === 'avulsa').length
  const grandTotal  = fixasTotal + avulsasTotal
  const fixasPct    = grandTotal > 0 ? (fixasTotal / grandTotal) * 100 : 50

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 animate-stagger-1">
        <div>
          <h1 className="text-white font-extrabold text-xl tracking-tight">Despesas</h1>
          <p className="text-slate-400 text-xs mt-0.5 font-medium">
            {loading ? 'Carregando…' : `Total geral · R$ ${numToMask(grandTotal)}`}
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300">
          <Plus className="w-4 h-4" />Nova Despesa
        </button>
      </div>

      {/* ── Cards seletores ── */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 mb-5 animate-stagger-2">

          {/* Todos */}
          <button onClick={() => setTab('todos')}
            className={`relative overflow-hidden text-left rounded-2xl p-4 border transition-all duration-200
              ${tab === 'todos'
                ? 'bg-indigo-500/10 border-indigo-500/30 shadow-lg shadow-indigo-500/10'
                : 'bg-white/[0.02] border-white/[0.06] hover:border-indigo-500/20 hover:bg-indigo-500/5'}`}>
            {tab === 'todos' && (
              <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-indigo-500 blur-2xl opacity-15 pointer-events-none" />
            )}
            <div className="relative flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors
                    ${tab === 'todos' ? 'bg-indigo-500/20' : 'bg-white/[0.05]'}`}>
                    <Receipt className={`w-3.5 h-3.5 transition-colors ${tab === 'todos' ? 'text-indigo-400' : 'text-slate-400'}`} />
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-widest transition-colors
                    ${tab === 'todos' ? 'text-indigo-400' : 'text-slate-400'}`}>
                    Todos
                  </span>
                </div>
                <p className={`text-lg font-extrabold font-numeric leading-none transition-colors
                  ${tab === 'todos' ? 'text-white' : 'text-slate-300'}`}>
                  R$ {numToMask(grandTotal)}
                </p>
                <p className="text-slate-500 text-[11px] mt-1 font-medium">
                  {items.length} {items.length === 1 ? 'despesa' : 'despesas'}
                </p>
              </div>
              <span className={`text-3xl font-black tabular-nums transition-colors
                ${tab === 'todos' ? 'text-indigo-500/25' : 'text-white/[0.04]'}`}>
                {items.length}
              </span>
            </div>
            {tab === 'todos' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500/0 via-indigo-500/60 to-indigo-500/0" />
            )}
          </button>

          {/* Fixas */}
          <button onClick={() => setTab('fixa')}
            className={`relative overflow-hidden text-left rounded-2xl p-4 border transition-all duration-200
              ${tab === 'fixa'
                ? 'bg-violet-500/10 border-violet-500/30 shadow-lg shadow-violet-500/10'
                : 'bg-white/[0.02] border-white/[0.06] hover:border-violet-500/20 hover:bg-violet-500/5'}`}>
            {tab === 'fixa' && (
              <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-violet-500 blur-2xl opacity-15 pointer-events-none" />
            )}
            <div className="relative flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors
                    ${tab === 'fixa' ? 'bg-violet-500/20' : 'bg-white/[0.05]'}`}>
                    <CalendarClock className={`w-3.5 h-3.5 transition-colors ${tab === 'fixa' ? 'text-violet-400' : 'text-slate-400'}`} />
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-widest transition-colors
                    ${tab === 'fixa' ? 'text-violet-400' : 'text-slate-400'}`}>
                    Fixas
                  </span>
                </div>
                <p className={`text-lg font-extrabold font-numeric leading-none transition-colors
                  ${tab === 'fixa' ? 'text-white' : 'text-slate-300'}`}>
                  R$ {numToMask(fixasTotal)}
                </p>
                <p className="text-slate-500 text-[11px] mt-1 font-medium">
                  {fixasCount} {fixasCount === 1 ? 'despesa' : 'despesas'} · /mês
                </p>
              </div>
              <span className={`text-3xl font-black tabular-nums transition-colors
                ${tab === 'fixa' ? 'text-violet-500/25' : 'text-white/[0.04]'}`}>
                {fixasCount}
              </span>
            </div>
            {tab === 'fixa' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500/0 via-violet-500/60 to-violet-500/0" />
            )}
          </button>

          {/* Avulsas */}
          <button onClick={() => setTab('avulsa')}
            className={`relative overflow-hidden text-left rounded-2xl p-4 border transition-all duration-200
              ${tab === 'avulsa'
                ? 'bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/10'
                : 'bg-white/[0.02] border-white/[0.06] hover:border-red-500/20 hover:bg-red-500/5'}`}>
            {tab === 'avulsa' && (
              <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-red-500 blur-2xl opacity-15 pointer-events-none" />
            )}
            <div className="relative flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors
                    ${tab === 'avulsa' ? 'bg-red-500/20' : 'bg-white/[0.05]'}`}>
                    <Receipt className={`w-3.5 h-3.5 transition-colors ${tab === 'avulsa' ? 'text-red-400' : 'text-slate-400'}`} />
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-widest transition-colors
                    ${tab === 'avulsa' ? 'text-red-400' : 'text-slate-400'}`}>
                    Avulsas
                  </span>
                </div>
                <p className={`text-lg font-extrabold font-numeric leading-none transition-colors
                  ${tab === 'avulsa' ? 'text-white' : 'text-slate-300'}`}>
                  R$ {numToMask(avulsasTotal)}
                </p>
                <p className="text-slate-500 text-[11px] mt-1 font-medium">
                  {avulsasCount} {avulsasCount === 1 ? 'despesa' : 'despesas'} · pontuais
                </p>
              </div>
              <span className={`text-3xl font-black tabular-nums transition-colors
                ${tab === 'avulsa' ? 'text-red-500/25' : 'text-white/[0.04]'}`}>
                {avulsasCount}
              </span>
            </div>
            {tab === 'avulsa' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500/0 via-red-500/60 to-red-500/0" />
            )}
          </button>
        </div>
      )}

      {/* ── Barra de proporção ── */}
      {!loading && grandTotal > 0 && (
        <div className="mb-5 animate-stagger-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Fixas {fixasPct.toFixed(0)}%</span>
            <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">{(100 - fixasPct).toFixed(0)}% Avulsas</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden flex">
            <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-700"
              style={{ width: `${fixasPct}%` }} />
            <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-700 flex-1" />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 text-sm font-medium">
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Lista ── */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center animate-stagger-3">
          <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-4
            ${tab === 'fixa' ? 'bg-violet-500/8 border-violet-500/15'
            : tab === 'avulsa' ? 'bg-red-500/8 border-red-500/15'
            : 'bg-indigo-500/8 border-indigo-500/15'}`}>
            {tab === 'fixa'
              ? <CalendarClock className="w-5 h-5 text-violet-400/60" />
              : <Receipt className={`w-5 h-5 ${tab === 'avulsa' ? 'text-red-400/60' : 'text-indigo-400/60'}`} />}
          </div>
          <p className="text-slate-300 font-semibold text-sm">
            {tab === 'todos' ? 'Nenhuma despesa cadastrada' : `Nenhuma despesa ${tab === 'fixa' ? 'fixa' : 'avulsa'}`}
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {tab === 'fixa' ? 'Repetem todo mês no mesmo dia.' : tab === 'avulsa' ? 'Despesas pontuais.' : 'Clique em "Nova Despesa" para começar.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden animate-stagger-3">
          {filtered.map((i, idx) => (
            <div key={i.id}
              className={`group relative flex items-center gap-4 px-5 py-4 transition-all duration-150 hover:bg-white/[0.03]
                ${idx < filtered.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>

              {/* Accent lateral */}
              <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity
                ${i.tipo === 'fixa' ? 'bg-violet-500' : 'bg-red-500'}`} />

              {/* Ícone */}
              <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center transition-colors
                ${i.tipo === 'fixa'
                  ? 'bg-violet-500/10 group-hover:bg-violet-500/15'
                  : 'bg-red-500/10 group-hover:bg-red-500/15'}`}>
                {i.tipo === 'fixa'
                  ? <CalendarClock className="w-4 h-4 text-violet-400" />
                  : <Receipt className="w-4 h-4 text-red-400" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-slate-100 text-sm font-semibold truncate leading-snug">{i.descricao}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {i.categoria && (
                    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md
                      ${i.tipo === 'fixa'
                        ? 'bg-violet-500/10 text-violet-400'
                        : 'bg-red-500/10 text-red-400'}`}>
                      {i.categoria}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                    {i.tipo === 'fixa'
                      ? <CalendarClock className="w-3 h-3 shrink-0" />
                      : <Calendar className="w-3 h-3 shrink-0" />}
                    {dataLabel(i)}
                  </span>
                </div>
              </div>

              {/* Valor */}
              <p className={`font-extrabold text-sm shrink-0 font-numeric tabular-nums
                ${i.tipo === 'fixa' ? 'text-violet-300' : 'text-red-300'}`}>
                R$ {i.valor}
              </p>

              {/* Ações */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => openEdit(i)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => del(i.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ExpenseModal
          initial={initial}
          editing={!!editId}
          tipo={tab === 'todos' ? 'avulsa' : tab}
          onSave={handleSave}
          onClose={() => setModal(false)}
        />
      )}
    </>
  )
}
