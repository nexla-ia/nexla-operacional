import { useState } from 'react'
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { signIn } from '../lib/auth'
import LogoIcon from '../components/LogoIcon'

export default function LoginPage() {
  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) { setError(error); setLoading(false) }
    else navigate('/dashboard')
  }

  return (
    <div className="grain min-h-screen bg-[#050609] flex overflow-hidden">

      {/* ── Painel esquerdo — branding ── */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden p-12">

        {/* gradientes atmosféricos */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-indigo-700 rounded-full filter blur-[160px] opacity-20 animate-blob" />
        <div className="absolute top-1/2 -right-32 w-[400px] h-[400px] bg-violet-700 rounded-full filter blur-[130px] opacity-15 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-32 left-1/4 w-[500px] h-[500px] bg-blue-800 rounded-full filter blur-[150px] opacity-15 animate-blob animation-delay-4000" />

        {/* grid sutil */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)', backgroundSize: '56px 56px' }} />

        {/* logo */}
        <div className="relative z-10 flex items-center gap-3 animate-stagger-1">
          <div className="w-10 h-10 rounded-xl bg-slate-900/80 ring-1 ring-white/10 flex items-center justify-center">
            <LogoIcon className="w-6 h-6" />
          </div>
          <span className="text-white/80 font-semibold text-sm tracking-tight">Nexla</span>
        </div>

        {/* copy central */}
        <div className="relative z-10 space-y-6 animate-stagger-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Sistema operacional
          </div>
          <h1 className="text-5xl font-extrabold text-white leading-[1.1] tracking-tight">
            Gestão que<br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">
              funciona de verdade.
            </span>
          </h1>
          <p className="text-slate-400 text-base leading-relaxed max-w-sm">
            Controle projetos, finanças, clientes e equipe em um único lugar. Simples, rápido e preciso.
          </p>
        </div>

        {/* depoimentos / stats */}
        <div className="relative z-10 grid grid-cols-3 gap-4 animate-stagger-3">
          {[
            { value: 'Kanban', label: 'Visual' },
            { value: 'Finance', label: 'Controle' },
            { value: '360°', label: 'Visão' },
          ].map(s => (
            <div key={s.value} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
              <p className="text-white font-bold text-lg font-mono">{s.value}</p>
              <p className="text-slate-400 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Painel direito — formulário ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">

        {/* fundo direito */}
        <div className="absolute inset-0 bg-slate-950/60" />
        <div className="absolute inset-0 border-l border-white/[0.05]" />

        {/* logo mobile */}
        <div className="lg:hidden relative z-10 flex items-center gap-3 mb-10 animate-stagger-1">
          <div className="w-10 h-10 rounded-xl bg-slate-900 ring-1 ring-white/10 flex items-center justify-center">
            <LogoIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Nexla</p>
            <p className="text-slate-500 text-xs">Operacional</p>
          </div>
        </div>

        {/* card do form */}
        <div className="relative z-10 w-full max-w-[400px] animate-stagger-2">

          <div className="mb-8">
            <h2 className="text-white font-bold text-2xl tracking-tight">Acessar sistema</h2>
            <p className="text-slate-500 text-sm mt-1.5">Entre com suas credenciais para continuar.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {error && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.09] text-white placeholder-slate-600 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/40 transition-all hover:bg-white/[0.06] hover:border-white/[0.14]"
              />
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Senha
                </label>
                <button type="button" className="text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors font-medium">
                  Esqueci a senha
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.09] text-white placeholder-slate-600 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/40 transition-all hover:bg-white/[0.06] hover:border-white/[0.14] pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors p-0.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Lembrar */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                className="w-4 h-4 rounded-md border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 accent-indigo-500 cursor-pointer"
              />
              <span className="text-sm text-slate-500 group-hover:text-slate-400 transition-colors select-none">
                Lembrar de mim
              </span>
            </label>

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-white text-sm font-semibold btn-shimmer shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando…
                </>
              ) : (
                <>
                  Entrar no sistema
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

          </form>
        </div>

        <p className="relative z-10 text-center text-[11px] text-slate-500 mt-10">
          © {new Date().getFullYear()} Nexla Operacional
        </p>
      </div>
    </div>
  )
}
