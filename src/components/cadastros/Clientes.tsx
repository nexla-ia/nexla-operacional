import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, X, Users, Loader2, Phone, Mail, FileText, ChevronDown, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { maskPhone, maskCPF, maskCNPJ } from '../../lib/utils'
import type { Client } from '../../lib/types'

async function fetchCNPJData(cnpj: string): Promise<{ nome?: string; cidade?: string; estado?: string; telefone?: string; email?: string } | null> {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return null
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      nome:     data.razao_social || data.nome_fantasia || undefined,
      cidade:   data.municipio    || undefined,
      estado:   data.uf           || undefined,
      telefone: data.ddd_telefone_1
        ? data.ddd_telefone_1.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')
        : undefined,
      email:    data.email        || undefined,
    }
  } catch {
    return null
  }
}

const EMPTY: Omit<Client, 'id'> = {
  nome: '', email: '', telefone: '', cpf_cnpj: '',
  tipo: 'PF', cidade: '', estado: '', observacoes: '',
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

function UFSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/40 transition-all hover:border-white/20 flex items-center justify-between">
        <span className={value ? 'text-white' : 'text-slate-300'}>{value || 'UF'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-white/10 rounded-xl shadow-2xl max-h-44 overflow-y-auto scrollbar-thin">
          <button type="button" onClick={() => { onChange(''); setOpen(false) }}
            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 transition-colors">
            Selecione...
          </button>
          {ESTADOS.map(uf => (
            <button key={uf} type="button" onClick={() => { onChange(uf); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-white/10 ${value === uf ? 'text-indigo-300' : 'text-slate-300'}`}>
              {uf}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-300 mb-1.5'

function fromDB(r: Record<string, unknown>): Client {
  return {
    id: r.id as string, nome: (r.nome as string) ?? '',
    email: (r.email as string) ?? '', telefone: (r.telefone as string) ?? '',
    cpf_cnpj: (r.cpf_cnpj as string) ?? '', tipo: (r.tipo as 'PF' | 'PJ') ?? 'PF',
    cidade: (r.cidade as string) ?? '', estado: (r.estado as string) ?? '',
    observacoes: (r.observacoes as string) ?? '',
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ClientModal({ initial, editing, onSave, onClose }: {
  initial: Omit<Client, 'id'>
  editing: boolean
  onSave: (d: Omit<Client, 'id'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm]         = useState(initial)
  const [saving, setSaving]     = useState(false)
  const [cnpjLookup, setCnpjLookup] = useState<'idle' | 'loading' | 'error'>('idle')
  const set = (k: keyof Omit<Client, 'id'>, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleCNPJLookup() {
    setCnpjLookup('loading')
    const result = await fetchCNPJData(form.cpf_cnpj)
    if (!result) { setCnpjLookup('error'); return }
    setForm(f => ({
      ...f,
      nome:     result.nome     || f.nome,
      cidade:   result.cidade   || f.cidade,
      estado:   result.estado   || f.estado,
      telefone: result.telefone ? maskPhone(result.telefone) : f.telefone,
      email:    result.email    || f.email,
    }))
    setCnpjLookup('idle')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-white font-semibold text-base">{editing ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="px-7 py-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Tipo */}
          <div className="flex gap-3">
            {(['PF', 'PJ'] as const).map(t => (
              <button key={t} type="button" onClick={() => set('tipo', t)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all
                  ${form.tipo === t ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              </button>
            ))}
          </div>
          {/* Nome | CPF/CNPJ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Nome *</label>
              <input className={inputCls} placeholder="Nome completo ou razão social" value={form.nome} onChange={e => set('nome', e.target.value)} required /></div>
            <div>
              <label className={labelCls}>{form.tipo === 'PF' ? 'CPF' : 'CNPJ'}</label>
              <div className="flex gap-2">
                <input className={inputCls} placeholder={form.tipo === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'}
                  value={form.cpf_cnpj} inputMode="numeric"
                  onChange={e => { set('cpf_cnpj', form.tipo === 'PF' ? maskCPF(e.target.value) : maskCNPJ(e.target.value)); setCnpjLookup('idle') }} />
                {form.tipo === 'PJ' && (
                  <button
                    type="button"
                    onClick={handleCNPJLookup}
                    disabled={cnpjLookup === 'loading' || form.cpf_cnpj.replace(/\D/g, '').length !== 14}
                    title="Buscar dados do CNPJ"
                    className="shrink-0 px-3 py-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-300
                               hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {cnpjLookup === 'loading'
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Search className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {cnpjLookup === 'error' && (
                <p className="text-red-400 text-[10px] mt-1">CNPJ não encontrado ou inválido.</p>
              )}
            </div>
          </div>
          {/* Email | Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>E-mail</label>
              <input type="email" className={inputCls} placeholder="email@exemplo.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <div><label className={labelCls}>Telefone</label>
              <input type="tel" className={inputCls} placeholder="(11) 99999-9999"
                value={form.telefone} inputMode="numeric"
                onChange={e => set('telefone', maskPhone(e.target.value))} /></div>
          </div>
          {/* Cidade | Estado */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="col-span-2"><label className={labelCls}>Cidade</label>
              <input className={inputCls} placeholder="São Paulo" value={form.cidade} onChange={e => set('cidade', e.target.value)} /></div>
            <div><label className={labelCls}>Estado</label>
              <UFSelect value={form.estado} onChange={v => set('estado', v)} /></div>
          </div>
          {/* Observações */}
          <div><label className={labelCls}>Observações</label>
            <textarea rows={2} className={inputCls + ' resize-none'} placeholder="Notas adicionais…" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} /></div>
          {/* Ações */}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/25 disabled:opacity-60 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300">
              {saving ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando…</span> : editing ? 'Salvar' : 'Criar Cliente'}
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-slate-300 text-sm font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Clientes({ readOnly = false, onClientCreated }: { readOnly?: boolean; onClientCreated?: (client: Client) => void }) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [modal, setModal]     = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [initial, setInitial] = useState<Omit<Client, 'id'>>(EMPTY)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('clients').select('*').order('nome')
    if (error) setError('Erro ao carregar clientes.')
    else if (data) setClients(data.map(fromDB))
    setLoading(false)
  }

  async function handleSave(data: Omit<Client, 'id'>) {
    setError('')
    const payload = { nome: data.nome, email: data.email || null, telefone: data.telefone || null,
      cpf_cnpj: data.cpf_cnpj || null, tipo: data.tipo, cidade: data.cidade || null,
      estado: data.estado || null, observacoes: data.observacoes || null }
    if (editId) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editId)
      if (error) { setError('Erro ao salvar.'); return }
      setClients(cs => cs.map(c => c.id === editId ? { ...data, id: editId } : c))
    } else {
      const { data: row, error } = await supabase.from('clients').insert(payload).select().single()
      if (error || !row) { setError('Erro ao criar.'); return }
      const newClient = fromDB(row)
      setClients(cs => [...cs, newClient])
      setModal(false)
      onClientCreated?.(newClient)
      return
    }
    setModal(false)
  }

  async function del(id: string) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) { setError('Erro ao excluir.'); return }
    setClients(cs => cs.filter(c => c.id !== id))
  }

  function openNew() { setInitial(EMPTY); setEditId(null); setModal(true) }
  function openEdit(c: Client) { const { id, ...r } = c; setInitial(r); setEditId(id); setModal(true) }

  return (
    <>
      <div className="flex items-center justify-between mb-6 animate-stagger-1">
        <div>
          <h1 className="text-white font-extrabold text-xl tracking-tight">Clientes</h1>
          <p className="text-slate-300 text-sm mt-0.5 font-medium">
            {loading ? 'Carregando…' : `${clients.length} cliente${clients.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {!readOnly && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300">
            <Plus className="w-4 h-4" />Novo Cliente
          </button>
        )}
      </div>
      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 text-sm font-medium">
          {error}<button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-300 transition-colors"><X className="w-4 h-4" /></button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center animate-stagger-2">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
            <Users className="w-5 h-5 text-slate-300" />
          </div>
          <p className="text-slate-300 font-semibold text-sm">Nenhum cliente cadastrado</p>
          <p className="text-slate-300 text-xs mt-1 font-medium">Clique em "Novo Cliente" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 animate-stagger-2">
          {clients.map(c => (
            <div key={c.id} className="group flex flex-col gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.10] hover:bg-white/[0.03] transition-all duration-200">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/10 flex items-center justify-center shrink-0">
                    <span className="text-indigo-300 text-xs font-bold">{c.nome.slice(0,2).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold text-sm truncate">{c.nome}</h3>
                    {c.cpf_cnpj && <p className="text-slate-300 text-xs mt-0.5 font-medium font-mono">{c.cpf_cnpj}</p>}
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${c.tipo === 'PJ' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/15' : 'bg-blue-500/10 text-blue-400 border border-blue-500/15'}`}>{c.tipo}</span>
              </div>
              <div className="space-y-1">
                {c.email && <div className="flex items-center gap-2 text-slate-300 text-xs font-medium"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{c.email}</span></div>}
                {c.telefone && <div className="flex items-center gap-2 text-slate-300 text-xs font-medium"><Phone className="w-3 h-3 shrink-0" /><span>{c.telefone}</span></div>}
                {(c.cidade || c.estado) && <div className="flex items-center gap-2 text-slate-300 text-xs font-medium"><FileText className="w-3 h-3 shrink-0" /><span>{[c.cidade, c.estado].filter(Boolean).join(' · ')}</span></div>}
              </div>
              {!readOnly && (
                <div className="flex gap-1.5 pt-2 border-t border-white/[0.04] opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(c)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300 hover:text-indigo-300 hover:bg-indigo-500/10 text-xs font-semibold transition-colors"><Pencil className="w-3 h-3" />Editar</button>
                  <button onClick={() => del(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors"><Trash2 className="w-3 h-3" />Excluir</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {modal && <ClientModal initial={initial} editing={!!editId} onSave={handleSave} onClose={() => setModal(false)} />}
    </>
  )
}
