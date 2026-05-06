import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Lock, Unlock, Plus, Pencil, Trash2, X, Loader2, Eye, EyeOff,
  Copy, CheckCheck, ShieldAlert, KeyRound, Database, LogIn, Sparkles,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  deriveKey, encryptString, decryptString,
  buildVaultConfig, verifyAndUnlock,
} from '../lib/vaultCrypto'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Categoria = 'api' | 'login' | 'banco' | 'outro'

interface FieldDef {
  label:  string
  value:  string
  secret: boolean
}

interface AcessoRow {
  id:         string
  nome:       string
  categoria:  Categoria
  descricao:  string
  iv:         string
  ciphertext: string
  // Decifrado em memória, opcional:
  fields?: FieldDef[]
  decryptError?: boolean
}

interface VaultConfig {
  salt:        string
  verifier_iv: string
  verifier:    string
}

const CATEGORIA_META: Record<Categoria, { label: string; Icon: typeof KeyRound; color: string; bg: string }> = {
  api:   { label: 'API key',     Icon: KeyRound, color: 'text-indigo-300',  bg: 'bg-indigo-500/15' },
  login: { label: 'Login',       Icon: LogIn,    color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  banco: { label: 'Banco',       Icon: Database, color: 'text-amber-300',   bg: 'bg-amber-500/15' },
  outro: { label: 'Outro',       Icon: Sparkles, color: 'text-slate-300',   bg: 'bg-white/[0.05]' },
}

const TEMPLATE_FIELDS: Record<Categoria, FieldDef[]> = {
  api: [
    { label: 'Chave',    value: '', secret: true  },
    { label: 'Endpoint', value: '', secret: false },
  ],
  login: [
    { label: 'URL',     value: '', secret: false },
    { label: 'Usuário', value: '', secret: false },
    { label: 'Senha',   value: '', secret: true  },
  ],
  banco: [
    { label: 'Host',     value: '', secret: false },
    { label: 'Porta',    value: '', secret: false },
    { label: 'Database', value: '', secret: false },
    { label: 'Usuário',  value: '', secret: false },
    { label: 'Senha',    value: '', secret: true  },
    { label: 'Connection string', value: '', secret: true },
  ],
  outro: [
    { label: 'Campo', value: '', secret: true },
  ],
}

const inputCls = `w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white text-sm
  placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors`
const labelCls = 'block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300 mb-2'

const AUTO_LOCK_MS = 10 * 60 * 1000  // 10 minutos

// ── Componente raiz ───────────────────────────────────────────────────────────

export default function Acessos() {
  const [config, setConfig] = useState<VaultConfig | null | 'loading'>('loading')
  const [key, setKey]       = useState<CryptoKey | null>(null)

  // auto-lock por inatividade
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lock = useCallback(() => setKey(null), [])

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(lock, AUTO_LOCK_MS)
  }, [lock])

  useEffect(() => {
    if (!key) return
    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const
    const handler = () => resetIdleTimer()
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    resetIdleTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, handler))
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [key, resetIdleTimer])

  // tranca ao trocar/fechar a aba
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'hidden') lock() }
    window.addEventListener('beforeunload', lock)
    document.addEventListener('visibilitychange', handler)
    return () => {
      window.removeEventListener('beforeunload', lock)
      document.removeEventListener('visibilitychange', handler)
    }
  }, [lock])

  // carrega config (salt + verifier)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('acesso_config').select('salt, verifier_iv, verifier').limit(1).maybeSingle()
      if (cancelled) return
      setConfig(data ? { salt: data.salt, verifier_iv: data.verifier_iv, verifier: data.verifier } : null)
    })()
    return () => { cancelled = true }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (config === 'loading') return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
    </div>
  )

  if (config === null) {
    // primeira vez — setup
    return <SetupVault onCreated={(cfg, k) => { setConfig(cfg); setKey(k) }} />
  }

  if (!key) {
    return <UnlockVault config={config} onUnlock={k => setKey(k)} />
  }

  return <Vault encryptionKey={key} config={config} onLock={lock} />
}

// ── Setup (primeira vez) ──────────────────────────────────────────────────────

function SetupVault({ onCreated }: {
  onCreated: (cfg: VaultConfig, key: CryptoKey) => void
}) {
  const [pwd1, setPwd1] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pwd1.length < 12) { setErr('Use uma senha forte (≥ 12 caracteres).'); return }
    if (pwd1 !== pwd2)   { setErr('As senhas não coincidem.'); return }
    setBusy(true); setErr('')
    try {
      const cfg = await buildVaultConfig(pwd1)
      const { error } = await supabase.from('acesso_config').upsert({
        id: 1, salt: cfg.salt, verifier_iv: cfg.verifier_iv, verifier: cfg.verifier,
      })
      if (error) { setErr('Não foi possível salvar a configuração.'); setBusy(false); return }
      const key = await deriveKey(pwd1, cfg.salt)
      // limpa do estado local
      setPwd1(''); setPwd2('')
      onCreated(cfg, key)
    } catch {
      setErr('Erro inesperado durante a criação.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CenteredFrame
      kicker="Cofre · primeiro acesso"
      titulo="Defina a master password"
      sub="essa senha será exigida toda vez que alguém abrir o cofre. ela nunca é armazenada — sem ela, nada decripta. se esquecer, os dados estão perdidos."
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className={labelCls}>Master password</label>
          <input type="password" autoComplete="new-password" autoFocus
            value={pwd1} onChange={e => setPwd1(e.target.value)}
            className={inputCls + ' font-mono'}
            placeholder="mínimo 12 caracteres" />
        </div>
        <div>
          <label className={labelCls}>Confirme</label>
          <input type="password" autoComplete="new-password"
            value={pwd2} onChange={e => setPwd2(e.target.value)}
            className={inputCls + ' font-mono'}
            placeholder="digite novamente" />
        </div>

        {err && <ErrorRow text={err} />}

        <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/15 p-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-amber-100/80 text-[11px] leading-relaxed">
              Anote essa senha em local seguro. <strong className="text-amber-100">Não há recuperação</strong> —
              se a senha for perdida, todos os acessos do cofre ficam permanentemente irrecuperáveis.
            </p>
          </div>
        </div>

        <button type="submit" disabled={busy}
          className="w-full py-3 rounded-full text-slate-900 text-sm font-semibold bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors">
          {busy
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Gerando chave…</span>
            : 'Criar cofre'}
        </button>
      </form>
    </CenteredFrame>
  )
}

// ── Destrancar ────────────────────────────────────────────────────────────────

function UnlockVault({ config, onUnlock }: {
  config: VaultConfig
  onUnlock: (key: CryptoKey) => void
}) {
  const [pwd, setPwd]   = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pwd) return
    setBusy(true); setErr('')
    const k = await verifyAndUnlock(pwd, config.salt, config.verifier_iv, config.verifier)
    if (!k) {
      setErr('Senha incorreta.')
      setPwd('')
      setBusy(false)
      return
    }
    setPwd('')  // limpa imediatamente do estado
    onUnlock(k)
    setBusy(false)
  }

  return (
    <CenteredFrame
      kicker="Cofre · trancado"
      titulo="Master password"
      sub="o cofre se tranca sozinho após 10 minutos sem atividade ou ao trocar de aba."
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className={labelCls}>Senha</label>
          <input type="password" autoComplete="current-password" autoFocus
            value={pwd} onChange={e => setPwd(e.target.value)}
            className={inputCls + ' font-mono'} />
        </div>

        {err && <ErrorRow text={err} />}

        <button type="submit" disabled={busy || !pwd}
          className="w-full py-3 rounded-full text-slate-900 text-sm font-semibold bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors">
          {busy
            ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Verificando…</span>
            : <span className="flex items-center justify-center gap-2"><Unlock className="w-4 h-4" />Destrancar cofre</span>}
        </button>
      </form>
    </CenteredFrame>
  )
}

// ── Cofre destrancado ─────────────────────────────────────────────────────────

function Vault({ encryptionKey, onLock }: {
  encryptionKey: CryptoKey
  config: VaultConfig
  onLock: () => void
}) {
  const [items, setItems]   = useState<AcessoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [modal, setModal]   = useState<{ mode: 'new' | 'edit', item?: AcessoRow } | null>(null)
  const [filter, setFilter] = useState<'todas' | Categoria>('todas')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    const { data, error } = await supabase.from('acessos').select('*').order('nome')
    if (error) { setError('Não foi possível carregar.'); setLoading(false); return }
    const rows: AcessoRow[] = []
    for (const r of data ?? []) {
      const row: AcessoRow = {
        id: r.id, nome: r.nome, categoria: r.categoria as Categoria,
        descricao: r.descricao ?? '',
        iv: r.iv, ciphertext: r.ciphertext,
      }
      try {
        const plain = await decryptString(encryptionKey, r.iv, r.ciphertext)
        row.fields = JSON.parse(plain) as FieldDef[]
      } catch {
        row.decryptError = true
      }
      rows.push(row)
    }
    setItems(rows)
    setLoading(false)
  }

  async function handleSave(input: { nome: string; categoria: Categoria; descricao: string; fields: FieldDef[] }, editingId?: string) {
    const plain = JSON.stringify(input.fields)
    const { iv, ciphertext } = await encryptString(encryptionKey, plain)
    if (editingId) {
      const { error } = await supabase.from('acessos').update({
        nome: input.nome, categoria: input.categoria, descricao: input.descricao || null,
        iv, ciphertext,
      }).eq('id', editingId)
      if (error) { setError('Não foi possível salvar.'); return false }
    } else {
      const { error } = await supabase.from('acessos').insert({
        nome: input.nome, categoria: input.categoria, descricao: input.descricao || null,
        iv, ciphertext,
      })
      if (error) { setError('Não foi possível salvar.'); return false }
    }
    await load()
    return true
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('acessos').delete().eq('id', id)
    if (error) { setError('Não foi possível excluir.'); return }
    setItems(prev => prev.filter(x => x.id !== id))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter(i => filter === 'todas' || i.categoria === filter)
      .filter(i => !q || i.nome.toLowerCase().includes(q) || (i.descricao ?? '').toLowerCase().includes(q))
  }, [items, filter, search])

  const counts = useMemo(() => ({
    todas: items.length,
    api:   items.filter(i => i.categoria === 'api').length,
    login: items.filter(i => i.categoria === 'login').length,
    banco: items.filter(i => i.categoria === 'banco').length,
    outro: items.filter(i => i.categoria === 'outro').length,
  }), [items])

  return (
    <div className="max-w-[1400px] mx-auto pb-16">

      {/* Editorial header */}
      <header className="flex items-end justify-between gap-6 mb-12 pt-2 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-slate-300/70 inline-flex items-center gap-2">
            Cofre <span className="inline-flex items-center gap-1 text-emerald-300/90"><Unlock className="w-3 h-3" /> destrancado</span>
          </p>
          <h1 className="font-display text-white mt-2 leading-[0.95] tracking-tight"
              style={{
                fontSize: 'clamp(48px, 7vw, 88px)',
                fontVariationSettings: '"opsz" 144, "SOFT" 30',
                fontWeight: 400,
              }}>
            Acessos<span className="text-indigo-300/90 italic ml-1" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}>.</span>
          </h1>
          <p className="text-slate-300 text-sm mt-3 max-w-md font-display italic"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
            chaves de api, logins, bancos — tudo cifrado com aes-gcm, nunca em texto puro no servidor.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onLock}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-slate-300 text-xs font-medium bg-white/[0.03] border border-white/[0.08] hover:border-white/20 transition-colors">
            <Lock className="w-3.5 h-3.5" /> Trancar
          </button>
          <button onClick={() => setModal({ mode: 'new' })}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-slate-900 text-sm font-semibold bg-white hover:bg-slate-100 transition-colors">
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Novo acesso
          </button>
        </div>
      </header>

      {error && <ErrorRow text={error} className="mb-6" />}

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou descrição…"
          className="flex-1 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/[0.07] text-white text-sm placeholder-slate-500 focus:outline-none focus:border-white/20 transition-colors"
        />
        <div className="flex flex-wrap gap-1">
          {([
            ['todas', 'Todas'],
            ['api',   'API keys'],
            ['login', 'Logins'],
            ['banco', 'Bancos'],
            ['outro', 'Outros'],
          ] as const).map(([key, label]) => {
            const active = filter === key
            const count  = counts[key]
            return (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-full text-[11px] font-medium tracking-wide transition-all
                  ${active
                    ? 'bg-white text-slate-900'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'}`}>
                {label}
                <span className={`ml-1.5 font-mono ${active ? 'text-slate-500' : 'text-slate-300/50'}`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-slate-300 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-white/[0.06] rounded-3xl">
          <p className="font-display text-3xl text-white tracking-tight"
             style={{ fontVariationSettings: '"opsz" 96, "SOFT" 60' }}>
            {items.length === 0 ? 'Cofre vazio.' : 'Sem resultados.'}
          </p>
          <p className="text-slate-300 text-sm mt-3 max-w-sm font-display italic"
             style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
            {items.length === 0
              ? 'guarde aqui chaves de api, credenciais de banco, logins administrativos.'
              : 'tente outro filtro ou busca.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(item => (
            <AcessoCard key={item.id} item={item}
              onEdit={() => setModal({ mode: 'edit', item })}
              onDelete={() => handleDelete(item.id)} />
          ))}
        </div>
      )}

      {modal && (
        <AcessoModal
          mode={modal.mode}
          initial={modal.item}
          onSave={(data) => handleSave(data, modal.item?.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Card de acesso ────────────────────────────────────────────────────────────

function AcessoCard({ item, onEdit, onDelete }: {
  item: AcessoRow
  onEdit: () => void
  onDelete: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const meta = CATEGORIA_META[item.categoria]
  const Icon = meta.Icon

  return (
    <article className="group bg-[#0a0c11] border border-white/[0.06] hover:border-white/[0.14] rounded-2xl p-6 transition-colors">

      <div className="flex items-start gap-4 mb-4">
        <div className={`shrink-0 w-11 h-11 rounded-xl ring-1 ring-white/[0.06] ${meta.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300/60">
            {meta.label}
          </p>
          <h3 className="font-display text-xl text-white tracking-tight mt-0.5 truncate"
              style={{ fontVariationSettings: '"opsz" 24, "SOFT" 40' }}>
            {item.nome}
          </h3>
          {item.descricao && (
            <p className="text-slate-300/70 text-xs mt-1 line-clamp-2">{item.descricao}</p>
          )}
        </div>
      </div>

      {item.decryptError ? (
        <div className="rounded-xl bg-rose-500/[0.06] border border-rose-500/15 p-3 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          erro ao decriptar — verifique a master password
        </div>
      ) : (
        <>
          <button onClick={() => setRevealed(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.14] transition-colors mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300">
              {revealed ? 'ocultar' : 'revelar'} {item.fields?.length ?? 0} {item.fields?.length === 1 ? 'campo' : 'campos'}
            </span>
            {revealed ? <EyeOff className="w-3.5 h-3.5 text-slate-300" /> : <Eye className="w-3.5 h-3.5 text-slate-300" />}
          </button>

          {revealed && (
            <div className="space-y-2">
              {item.fields?.map((f, i) => (
                <FieldDisplay key={i} field={f} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-1 pt-4 mt-4 border-t border-white/[0.05] opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-2 rounded-full text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  )
}

function FieldDisplay({ field }: { field: FieldDef }) {
  const [show, setShow]     = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(field.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const masked = field.secret && !show
  const display = masked ? '•'.repeat(Math.min(24, field.value.length || 8)) : field.value

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300/60">{field.label}</p>
        <p className={`text-sm mt-0.5 break-all ${field.secret ? 'font-mono' : ''} ${masked ? 'text-slate-300/50 tracking-tight' : 'text-white'}`}>
          {display || <span className="text-slate-300/40 italic">(vazio)</span>}
        </p>
      </div>
      {field.secret && field.value && (
        <button onClick={() => setShow(s => !s)}
          className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors shrink-0"
          title={show ? 'Ocultar' : 'Revelar'}>
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}
      {field.value && (
        <button onClick={copy}
          className={`p-2 rounded-full hover:bg-white/[0.05] transition-colors shrink-0
            ${copied ? 'text-emerald-300' : 'text-slate-300 hover:text-white'}`}
          title="Copiar">
          {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}

// ── Modal novo / editar ───────────────────────────────────────────────────────

function AcessoModal({ mode, initial, onSave, onClose }: {
  mode: 'new' | 'edit'
  initial?: AcessoRow
  onSave: (data: { nome: string; categoria: Categoria; descricao: string; fields: FieldDef[] }) => Promise<boolean>
  onClose: () => void
}) {
  const [nome,      setNome]      = useState(initial?.nome ?? '')
  const [categoria, setCategoria] = useState<Categoria>(initial?.categoria ?? 'api')
  const [descricao, setDescricao] = useState(initial?.descricao ?? '')
  const [fields,    setFields]    = useState<FieldDef[]>(
    initial?.fields ?? TEMPLATE_FIELDS.api,
  )
  const [saving, setSaving] = useState(false)

  function changeCategoria(c: Categoria) {
    setCategoria(c)
    if (mode === 'new') setFields(TEMPLATE_FIELDS[c].map(f => ({ ...f })))
  }

  function updateField(i: number, patch: Partial<FieldDef>) {
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  }

  function addField() {
    setFields(prev => [...prev, { label: '', value: '', secret: true }])
  }

  function removeField(i: number) {
    setFields(prev => prev.filter((_, idx) => idx !== i))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    const ok = await onSave({
      nome: nome.trim(),
      categoria,
      descricao: descricao.trim(),
      fields: fields.filter(f => f.label.trim()),
    })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#0a0c11] border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">

        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.05]">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-indigo-300/80">
              {mode === 'edit' ? 'Editar' : 'Novo'} · acesso
            </p>
            <h2 className="font-display text-2xl text-white tracking-tight mt-1"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
              {mode === 'edit' ? nome || 'Editar' : 'Novo acesso'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-7 py-6 space-y-5 max-h-[75vh] overflow-y-auto">

          {/* Categoria */}
          <div>
            <label className={labelCls}>Categoria</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['api','login','banco','outro'] as const).map(c => {
                const m = CATEGORIA_META[c]
                const active = categoria === c
                return (
                  <button key={c} type="button" onClick={() => changeCategoria(c)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-medium transition-all
                      ${active
                        ? 'bg-white text-slate-900'
                        : 'bg-white/[0.03] text-slate-300 ring-1 ring-white/[0.07] hover:ring-white/20'}`}>
                    <m.Icon className="w-3.5 h-3.5" />
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className={labelCls}>Nome</label>
            <input className={inputCls} placeholder="Ex: Supabase produção, OpenAI key, Servidor X…"
              value={nome} required onChange={e => setNome(e.target.value)} />
          </div>

          {/* Descrição */}
          <div>
            <label className={labelCls}>Descrição (opcional)</label>
            <input className={inputCls} placeholder="onde é usado, observações…"
              value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>

          {/* Fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + ' mb-0'}>Campos secretos</label>
              <button type="button" onClick={addField}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.08] hover:ring-white/20 transition-all">
                <Plus className="w-3 h-3" /> adicionar campo
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <FieldEditor key={i}
                  field={f}
                  onChange={patch => updateField(i, patch)}
                  onRemove={() => removeField(i)}
                />
              ))}
              {fields.length === 0 && (
                <p className="text-slate-300/60 text-xs italic py-3 text-center">
                  adicione pelo menos um campo
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/15 p-3 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
            <p className="text-emerald-100/90 text-[11px] leading-relaxed">
              os campos serão cifrados localmente com aes-gcm 256 antes de subir. o servidor
              só recebe ciphertext.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving || !nome.trim() || fields.length === 0}
              className="flex-1 py-3 rounded-full text-slate-900 text-sm font-semibold bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cifrando…</span>
                : mode === 'edit' ? 'Salvar' : 'Cifrar e guardar'}
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="px-5 py-3 rounded-full text-slate-300 text-sm font-medium bg-transparent border border-white/[0.08] hover:border-white/20 transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FieldEditor({ field, onChange, onRemove }: {
  field: FieldDef
  onChange: (patch: Partial<FieldDef>) => void
  onRemove: () => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="grid grid-cols-12 gap-2 items-stretch">
      <input
        className={inputCls + ' col-span-4 py-2.5'}
        placeholder="rótulo"
        value={field.label}
        onChange={e => onChange({ label: e.target.value })}
      />
      <div className="col-span-7 relative">
        <input
          type={field.secret && !show ? 'password' : 'text'}
          className={inputCls + ' py-2.5 ' + (field.secret ? 'font-mono' : '')}
          placeholder={field.secret ? '•••••' : 'valor'}
          value={field.value}
          onChange={e => onChange({ value: e.target.value })}
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button type="button" onClick={() => onChange({ secret: !field.secret })}
            className={`p-1.5 rounded-full transition-colors text-[10px] font-mono uppercase tracking-wider
              ${field.secret ? 'text-amber-300 hover:bg-amber-500/10' : 'text-slate-300/60 hover:bg-white/[0.05]'}`}
            title={field.secret ? 'campo secreto' : 'campo público'}>
            {field.secret ? '🔒' : '#'}
          </button>
          {field.secret && (
            <button type="button" onClick={() => setShow(s => !s)}
              className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors">
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
      <button type="button" onClick={onRemove}
        className="col-span-1 flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Auxiliares ────────────────────────────────────────────────────────────────

function CenteredFrame({ kicker, titulo, sub, children }: {
  kicker: string
  titulo: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="max-w-md mx-auto pt-8 pb-16">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20 mb-5">
          <Lock className="w-7 h-7 text-indigo-300" />
        </div>
        <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-slate-300/70">{kicker}</p>
        <h1 className="font-display text-white mt-2 leading-tight tracking-tight"
            style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
          {titulo}
        </h1>
        <p className="text-slate-300 text-sm mt-3 font-display italic"
           style={{ fontVariationSettings: '"opsz" 14, "SOFT" 60' }}>
          {sub}
        </p>
      </div>
      <div className="bg-[#0a0c11] border border-white/[0.06] rounded-2xl p-7">
        {children}
      </div>
    </div>
  )
}

function ErrorRow({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/[0.06] border border-rose-500/15 text-rose-200 text-xs ${className}`}>
      <AlertCircle className="w-4 h-4 shrink-0" />
      {text}
    </div>
  )
}
