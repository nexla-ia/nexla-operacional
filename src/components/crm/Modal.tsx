import { X, type LucideIcon } from 'lucide-react'

const TONES = {
  indigo:  'bg-indigo-500/15 ring-indigo-500/25 text-indigo-400',
  emerald: 'bg-emerald-500/15 ring-emerald-500/25 text-emerald-400',
  red:     'bg-red-500/15 ring-red-500/25 text-red-400',
}

export default function Modal({ titulo, subtitulo, Icon, tone = 'indigo', largura = 'max-w-2xl', onClose, children }: {
  titulo:     string
  subtitulo?: string
  Icon:       LucideIcon
  tone?:      keyof typeof TONES
  largura?:   string
  onClose:    () => void
  children:   React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${largura} max-h-[88vh] overflow-y-auto bg-slate-900 border border-white/[0.09] rounded-3xl shadow-2xl shadow-black/60 animate-fade-in-up`}>
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07] sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl ring-1 flex items-center justify-center ${TONES[tone]}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base leading-none">{titulo}</h2>
              {subtitulo && <p className="text-slate-500 text-xs mt-1">{subtitulo}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-7 py-6">{children}</div>
      </div>
    </div>
  )
}
