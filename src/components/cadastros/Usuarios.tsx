import { useState, useEffect } from 'react'
import { UserCog, Loader2, X, Plus, UserPlus, Mail, Shield, Pencil } from 'lucide-react'
import { supabase, supabaseAdmin } from '../../lib/supabase'

interface Profile {
  id:        string
  full_name: string
  role:      'admin' | 'operator'
  email?:    string
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

// ── Modal Editar Usuário ──────────────────────────────────────────────────────

function EditUserModal({ profile, onSaved, onClose }: {
  profile:  Profile
  onSaved:  (updated: Partial<Profile>) => void
  onClose:  () => void
}) {
  const [nome, setNome]     = useState(profile.full_name)
  const [role, setRole]     = useState<'admin' | 'operator'>(profile.role)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (nome.trim().length < 2) { setError('Nome deve ter ao menos 2 caracteres.'); return }
    setSaving(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: nome.trim(), role })
      .eq('id', profile.id)
    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    onSaved({ full_name: nome.trim(), role })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25 flex items-center justify-center">
              <UserCog className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base leading-none">Editar Perfil</h2>
              {profile.email && (
                <p className="text-slate-500 text-xs mt-0.5">{profile.email}</p>
              )}
            </div>
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

          {/* Avatar preview */}
          <div className="flex items-center gap-4 pb-2">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center shrink-0">
              <span className="text-indigo-300 text-xl font-bold">
                {(nome || profile.full_name || 'U').slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{nome || '—'}</p>
              {profile.email && (
                <p className="text-slate-400 text-xs truncate mt-0.5 flex items-center gap-1">
                  <Mail className="w-3 h-3 shrink-0" />{profile.email}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Nome completo *</label>
            <input className={inputCls} value={nome} onChange={e => setNome(e.target.value)} required />
          </div>

          <div>
            <label className={labelCls}>Cargo</label>
            <div className="flex gap-2">
              {ROLES.map(r => (
                <button key={r.value} type="button" onClick={() => setRole(r.value as typeof role)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all flex flex-col items-center gap-0.5
                    ${role === r.value
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'}`}>
                  <span>{r.label}</span>
                  <span className={`text-[10px] font-normal ${role === r.value ? 'text-indigo-400/70' : 'text-slate-500'}`}>{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/25 disabled:opacity-60 hover:-translate-y-0.5 transition-all duration-300">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Salvando…</span>
                : 'Salvar'}
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

    if (nome.trim().length < 2)  { setError('Nome deve ter ao menos 2 caracteres.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('E-mail inválido.'); return }
    if (senha.length < 6)        { setError('Senha deve ter ao menos 6 caracteres.'); return }

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
  const [profiles, setProfiles]   = useState<Profile[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [newModal, setNewModal]   = useState(false)
  const [editProfile, setEditProfile] = useState<Profile | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    // Fetch profiles
    const { data: profileData, error: profileErr } = await supabase
      .from('profiles')
      .select('id,full_name,role')

    if (profileErr) { setError('Erro ao carregar usuários.'); setLoading(false); return }

    const base: Profile[] = (profileData ?? []).map((p: Record<string, unknown>) => ({
      id:        p.id as string,
      full_name: (p.full_name as string) || 'Sem nome',
      role:      (p.role as Profile['role']) ?? 'operator',
    }))

    // Try to enrich with emails via admin API
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })
      if (usersData?.users) {
        const emailMap = new Map(usersData.users.map(u => [u.id, u.email]))
        setProfiles(base.map(p => ({ ...p, email: emailMap.get(p.id) })))
      } else {
        setProfiles(base)
      }
    } catch {
      setProfiles(base)
    }

    setLoading(false)
  }

  function handleSaved(id: string, updated: Partial<Profile>) {
    setProfiles(ps => ps.map(p => p.id === id ? { ...p, ...updated } : p))
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6 animate-stagger-1">
        <div>
          <h1 className="text-white font-extrabold text-xl tracking-tight">Usuários</h1>
          <p className="text-slate-400 text-sm mt-0.5 font-medium">
            {loading ? 'Carregando…' : `${profiles.length} usuário${profiles.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => setNewModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all duration-300">
          <Plus className="w-4 h-4" />Novo Usuário
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-900/80 ring-1 ring-white/10 flex items-center justify-center mb-4">
            <UserCog className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-300 font-medium text-sm">Nenhum usuário cadastrado</p>
          <p className="text-slate-500 text-xs mt-1">Clique em "Novo Usuário" para começar</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden animate-stagger-2">
          {profiles.map((p, idx) => (
            <div key={p.id}
              className={`group flex items-center gap-4 px-5 py-4 transition-all duration-150 hover:bg-white/[0.03]
                ${idx < profiles.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center shrink-0">
                <span className="text-indigo-300 text-sm font-bold">
                  {(p.full_name || 'U').slice(0, 2).toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate leading-snug">{p.full_name}</p>
                {p.email ? (
                  <p className="text-slate-500 text-xs truncate mt-0.5 flex items-center gap-1">
                    <Mail className="w-3 h-3 shrink-0" />{p.email}
                  </p>
                ) : (
                  <p className="text-slate-600 text-xs mt-0.5">{p.id.slice(0, 8)}…</p>
                )}
              </div>

              {/* Role badge */}
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ring-1 flex items-center gap-1 ${ROLE_BADGE[p.role] ?? 'bg-white/5 text-slate-400 ring-white/10'}`}>
                  <Shield className="w-2.5 h-2.5" />
                  {ROLES.find(r => r.value === p.role)?.label ?? p.role}
                </span>

                {/* Edit button */}
                <button
                  onClick={() => setEditProfile(p)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors opacity-0 group-hover:opacity-100">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {newModal && (
        <NovoUsuarioModal onCreated={load} onClose={() => setNewModal(false)} />
      )}

      {editProfile && (
        <EditUserModal
          profile={editProfile}
          onSaved={updated => handleSaved(editProfile.id, updated)}
          onClose={() => setEditProfile(null)}
        />
      )}
    </>
  )
}
