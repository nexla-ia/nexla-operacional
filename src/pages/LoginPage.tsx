import { useState } from 'react'
import { Eye, EyeOff, Loader2, Zap, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { signIn } from '../lib/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await signIn(email, password)

    if (error) {
      setError(error)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">

      {/* Blobs de fundo animados */}
      <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-indigo-700 rounded-full mix-blend-screen filter blur-[120px] opacity-25 animate-blob" />
      <div className="absolute -top-16 -right-32 w-[450px] h-[450px] bg-violet-700 rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] bg-blue-700 rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-blob animation-delay-4000" />

      {/* Grade sutil de fundo */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Conteúdo */}
      <div className="w-full max-w-md relative z-10 animate-fade-in-up">

        {/* Logo e título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mb-5 shadow-2xl shadow-indigo-500/50 ring-1 ring-white/10">
            <Zap className="w-9 h-9 text-white drop-shadow" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Nexla{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Operacional
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Faça login para acessar o sistema
          </p>
        </div>

        {/* Card principal */}
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-8 shadow-2xl ring-1 ring-inset ring-white/[0.05]">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Erro */}
            {error && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/70 focus:border-indigo-500/50 transition-all duration-200 hover:border-white/20"
              />
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                  Senha
                </label>
                <button
                  type="button"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                >
                  Esqueci a senha
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/70 focus:border-indigo-500/50 transition-all duration-200 hover:border-white/20 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Lembrar */}
            <div className="flex items-center gap-2.5">
              <input
                id="remember"
                type="checkbox"
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer accent-indigo-500"
              />
              <label htmlFor="remember" className="text-sm text-slate-400 cursor-pointer select-none">
                Lembrar de mim
              </label>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3 px-4 rounded-xl text-white text-sm font-semibold transition-all duration-300 shadow-lg shadow-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden btn-shimmer hover:shadow-indigo-500/50 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </span>
              ) : (
                'Entrar no sistema'
              )}
            </button>
          </form>

          {/* Separador */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/[0.07]" />
            <span className="text-xs text-slate-600 font-medium uppercase tracking-widest">Acesso demo</span>
            <div className="flex-1 h-px bg-white/[0.07]" />
          </div>

          {/* Credenciais de teste */}
          <button
            type="button"
            onClick={() => { setEmail('admin@nexla.com'); setPassword('123456') }}
            className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-200 text-center group"
          >
            <span className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors font-mono">
              admin@nexla.com
              <span className="mx-2 text-slate-700">/</span>
              123456
            </span>
          </button>
        </div>

        <p className="text-center text-xs text-slate-700 mt-6">
          © {new Date().getFullYear()} Nexla Operacional. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
