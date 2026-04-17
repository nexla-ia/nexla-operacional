import { useState, useEffect } from 'react'
import { UserCog, Loader2, X, Check, Plus, UserPlus } from 'lucide-react'
import { supabase, supabaseAdmin } from '../../lib/supabase'

interface Profile {
  id: string
  full_name: string
  role: 'admin' | 'operator'
}

const ROLES = [
  { value: 'admin',    label: 'Admin',    desc: 'Acesso total' },
  { value: 'operator', label: 'Operador', desc: 'Criação e edição' },
]

const ROLE_BADGE: Record<string, string> = {
  admin:    'bg-red-500/15 text-red-300 ring-red-500/20',
  operator: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/20',
}

const inputCls = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm
  placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
  focus:border-indigo-500/40 transition-all hover:border-white/20`
const labelCls = 'block text-xs font-medium text-slate-300 mb-1.5'

// ── Modal Novo Usuário ────────────────────────────────────────────────────────

function NovoUsuarioModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [nome, setNome]     = useState('')
  const [role, setRole]     = useState<'admin' | 'operator'>('operator')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validações locais
    if (nome.trim().length < 2)  { setError('Nome deve ter ao menos 2 caracteres.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('E-mail inválido.'); return }
    if (senha.length < 6)        { setError('Senha deve ter ao menos 6 caracteres.'); return }

    // Garante que a chave admin está disponível
    if (!import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
      setError('Configuração incompleta: VITE_SUPABASE_SERVICE_ROLE_KEY não definida.')
      return
    }

    setSaving(true)

    const { data, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: nome.trim() },
    })

    if (createErr || !data.user) {
      const msg = createErr?.message ?? ''
      if (msg.includes('already registered') || msg.includes('already been registered'))
        setError('Este e-mail já está cadastrado.')
      else if (msg.includes('password'))
        setError('Senha inválida: ' + msg)
      else if (msg.includes('Database error'))
        setError('Erro no banco de dados. Verifique se a migration 012 foi executada.')
      else
        setError(msg || 'Erro ao criar usuário.')
      setSaving(false)
      return
    }

    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: data.user.id, full_name: nome.trim(), role }, { onConflict: 'id' })

    if (profileErr) {
      setError('Usuário criado, mas perfil não salvo: ' + profileErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-white font-semibold text-base">Novo Usuário</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-7 py-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}
          <div>
            <label className={labelCls}>Nome completo *</label>
            <input className={inputCls} placeholder="João Silva" value={nome} onChange={e => setNome(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>E-mail *</label>
            <input type="email" className={inputCls} placeholder="joao@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Senha temporária *</label>
            <input type="password" className={inputCls} placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} minLength={6} required />
          </div>
          <div>
            <label className={labelCls}>Cargo</label>
            <div className="flex gap-2 mt-1">
              {ROLES.map(r => (
                <button key={r.value} type="button" onClick={() => setRole(r.value as typeof role)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${role === r.value ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/25 disabled:opacity-60 hover:-translate-y-0.5 transition-all duration-300">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Criando…</span>
                : 'Criar Usuário'}
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

export default function Usuarios() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [editId, setEditId]     = useState<string | null>(null)
  const [editRole, setEditRole] = useState<string>('')
  const [modal, setModal]       = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('id,full_name,role')
    if (error) { setError('Erro ao carregar usuários.'); setLoading(false); return }
    setProfiles((data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      full_name: (p.full_name as string) || 'Sem nome',
      role: (p.role as Profile['role']) ?? 'viewer',
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
      <div className="flex items-center justify-between mb-6 animate-stagger-1">
        <div>
          <h1 className="text-white font-extrabold text-xl tracking-tight">Usuários</h1>
          <p className="text-slate-300 text-sm mt-0.5 font-medium">
            {loading ? 'Carregando…' : `${profiles.length} usuário${profiles.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all duration-300">
          <Plus className="w-4 h-4" />Novo Usuário
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-900/80 ring-1 ring-white/10 flex items-center justify-center mb-4">
            <UserCog className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-slate-300 font-medium text-sm">Nenhum usuário cadastrado</p>
          <p className="text-slate-300 text-xs mt-1">Clique em "Novo Usuário" para começar</p>
        </div>
      ) : (
        <div className="space-y-1.5 animate-stagger-2">
          {profiles.map(p => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.09] hover:bg-white/[0.03] transition-all">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center shrink-0">
                <span className="text-indigo-300 text-xs font-bold">{(p.full_name || 'U').slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{p.full_name}</p>
                <p className="text-slate-300 text-xs">{p.id.slice(0, 8)}…</p>
              </div>
              {editId === p.id ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {ROLES.map(r => (
                      <button key={r.value} type="button" onClick={() => setEditRole(r.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${editRole === r.value ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => saveRole(p.id)} className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 ${ROLE_BADGE[p.role]}`}>
                    {ROLES.find(r => r.value === p.role)?.label ?? p.role}
                  </span>
                  <button onClick={() => { setEditId(p.id); setEditRole(p.role) }}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors">
                    <UserCog className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && <NovoUsuarioModal onCreated={load} onClose={() => setModal(false)} />}
    </>
  )
}
