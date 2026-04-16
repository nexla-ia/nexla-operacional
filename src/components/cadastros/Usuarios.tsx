import { useState, useEffect } from 'react'
import { UserCog, Loader2, X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Profile {
  id: string
  full_name: string
  role: 'admin' | 'operator' | 'viewer'
  email?: string
}

const ROLES = [
  { value: 'admin',    label: 'Admin',     desc: 'Acesso total' },
  { value: 'operator', label: 'Operador',  desc: 'Criação e edição' },
  { value: 'viewer',   label: 'Visualizar', desc: 'Somente leitura' },
]

const ROLE_BADGE: Record<string, string> = {
  admin:    'bg-red-500/15 text-red-300 ring-red-500/20',
  operator: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/20',
  viewer:   'bg-slate-500/15 text-slate-300 ring-slate-500/20',
}

export default function Usuarios() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [editId, setEditId]     = useState<string | null>(null)
  const [editRole, setEditRole] = useState<string>('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: profs, error } = await supabase.from('profiles').select('id,full_name,role')
    if (error) { setError('Erro ao carregar usuários.'); setLoading(false); return }

    // Busca emails via auth.users (somente admin tem acesso)
    setProfiles((profs ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      full_name: (p.full_name as string) || 'Sem nome',
      role: (p.role as 'admin' | 'operator' | 'viewer') ?? 'viewer',
    })))
    setLoading(false)
  }

  async function saveRole(id: string) {
    const { error } = await supabase.from('profiles').update({ role: editRole }).eq('id', id)
    if (error) { setError('Erro ao salvar.'); return }
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, role: editRole as Profile['role'] } : p))
    setEditId(null)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white font-bold text-xl">Usuários</h1>
          <p className="text-slate-500 text-sm mt-0.5">{loading ? 'Carregando…' : `${profiles.length} usuário${profiles.length !== 1 ? 's' : ''}`}</p>
        </div>
      </div>
      {error && <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}
      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {profiles.map(p => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-slate-900/70 border border-white/[0.07] hover:border-white/[0.12] transition-all">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center shrink-0">
                <span className="text-indigo-300 text-xs font-bold">{(p.full_name || 'U').slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{p.full_name || 'Sem nome'}</p>
                <p className="text-slate-600 text-xs">{p.id.slice(0, 8)}…</p>
              </div>

              {editId === p.id ? (
                <div className="flex items-center gap-2">
                  <select value={editRole} onChange={e => setEditRole(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-white text-xs focus:outline-none"
                    style={{ colorScheme: 'dark' }}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={() => saveRole(p.id)} className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ${ROLE_BADGE[p.role]}`}>
                    {ROLES.find(r => r.value === p.role)?.label ?? p.role}
                  </span>
                  <button onClick={() => { setEditId(p.id); setEditRole(p.role) }}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors">
                    <UserCog className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-slate-700 text-xs mt-6 text-center">Novos usuários são adicionados via autenticação do Supabase.</p>
    </>
  )
}
