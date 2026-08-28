import {
  StickyNote, PhoneCall, MessageCircle, Mail, Users, FileText,
  ArrowRightLeft, CheckSquare, Trophy, XCircle, type LucideIcon,
} from 'lucide-react'
import type { CrmInteractionType } from '../../lib/types'

// ── Temperatura do lead ───────────────────────────────────────────────────────

export const TEMPERATURAS = [
  { key: 'frio',   label: 'Frio',   icon: '❄️', dot: 'bg-sky-400',   chip: 'bg-sky-500/15 text-sky-300 ring-sky-500/25'   },
  { key: 'morno',  label: 'Morno',  icon: '🌤️', dot: 'bg-amber-400', chip: 'bg-amber-500/15 text-amber-300 ring-amber-500/25' },
  { key: 'quente', label: 'Quente', icon: '🔥', dot: 'bg-red-500',   chip: 'bg-red-500/15 text-red-300 ring-red-500/25'   },
] as const

export type Temperatura = (typeof TEMPERATURAS)[number]['key']

export function tempOf(key?: string | null) {
  return TEMPERATURAS.find(t => t.key === key) ?? TEMPERATURAS[1]
}

// ── Listas de apoio ───────────────────────────────────────────────────────────

export const ORIGENS = [
  'Indicação', 'Prospecção ativa', 'Instagram', 'WhatsApp', 'Google',
  'LinkedIn', 'Site', 'Anúncio', 'Evento', 'Outro',
]

export const MOTIVOS_PERDA = [
  'Preço', 'Sem orçamento', 'Escolheu concorrente', 'Sem retorno',
  'Fora do perfil', 'Momento errado', 'Outro',
]

// ── Tipos de interação ────────────────────────────────────────────────────────

export const INTERACTION_META: Record<CrmInteractionType, { label: string; Icon: LucideIcon; tone: string; dot: string }> = {
  nota:     { label: 'Nota',       Icon: StickyNote,     tone: 'bg-violet-500/15 text-violet-300 ring-violet-500/25',   dot: 'bg-violet-500'  },
  ligacao:  { label: 'Ligação',    Icon: PhoneCall,      tone: 'bg-blue-500/15 text-blue-300 ring-blue-500/25',         dot: 'bg-blue-500'    },
  whatsapp: { label: 'WhatsApp',   Icon: MessageCircle,  tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25', dot: 'bg-emerald-500' },
  email:    { label: 'E-mail',     Icon: Mail,           tone: 'bg-sky-500/15 text-sky-300 ring-sky-500/25',            dot: 'bg-sky-500'     },
  reuniao:  { label: 'Reunião',    Icon: Users,          tone: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/25',   dot: 'bg-indigo-500'  },
  proposta: { label: 'Proposta',   Icon: FileText,       tone: 'bg-amber-500/15 text-amber-300 ring-amber-500/25',      dot: 'bg-amber-500'   },
  etapa:    { label: 'Etapa',      Icon: ArrowRightLeft, tone: 'bg-slate-500/15 text-slate-300 ring-slate-500/25',      dot: 'bg-slate-500'   },
  tarefa:   { label: 'Tarefa',     Icon: CheckSquare,    tone: 'bg-teal-500/15 text-teal-300 ring-teal-500/25',         dot: 'bg-teal-500'    },
  ganho:    { label: 'Ganho',      Icon: Trophy,         tone: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25', dot: 'bg-emerald-500' },
  perdido:  { label: 'Perdido',    Icon: XCircle,        tone: 'bg-red-500/15 text-red-300 ring-red-500/25',            dot: 'bg-red-500'     },
}

/** Interações que o vendedor registra manualmente no painel do lead. */
export const INTERACAO_MANUAL: CrmInteractionType[] = ['ligacao', 'whatsapp', 'email', 'reuniao', 'proposta', 'nota']

// ── Etapas padrão de um funil novo ────────────────────────────────────────────

export const DEFAULT_STAGES: { nome: string; cor: string; posicao: number; alerta_dias: number | null; tipo: 'aberto' | 'ganho' | 'perdido' }[] = [
  { nome: 'Novo Lead',       cor: '#64748b', posicao: 0, alerta_dias: 2,    tipo: 'aberto'  },
  { nome: 'Contato Feito',   cor: '#6366f1', posicao: 1, alerta_dias: 4,    tipo: 'aberto'  },
  { nome: 'Qualificado',     cor: '#8b5cf6', posicao: 2, alerta_dias: 7,    tipo: 'aberto'  },
  { nome: 'Proposta Enviada',cor: '#0ea5e9', posicao: 3, alerta_dias: 5,    tipo: 'aberto'  },
  { nome: 'Negociação',      cor: '#f59e0b', posicao: 4, alerta_dias: 7,    tipo: 'aberto'  },
  { nome: 'Ganho',           cor: '#10b981', posicao: 5, alerta_dias: null, tipo: 'ganho'   },
  { nome: 'Perdido',         cor: '#ef4444', posicao: 6, alerta_dias: null, tipo: 'perdido' },
]

export const STAGE_COLORS = [
  '#64748b', '#6366f1', '#8b5cf6', '#0ea5e9', '#14b8a6',
  '#10b981', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

export function diasDesde(iso?: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export function relTime(iso?: string | null): string {
  if (!iso) return ''
  const d = diasDesde(iso)
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 30) return `${d}d atrás`
  const m = Math.floor(d / 30)
  return m === 1 ? '1 mês atrás' : `${m} meses atrás`
}

export function fmtBRL(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtBRLCompact(v: number | null | undefined): string {
  const n = v ?? 0
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return fmtBRL(n)
}

export function iniciais(nome?: string | null): string {
  const n = (nome || '').trim()
  if (!n) return '??'
  const parts = n.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || n.slice(0, 2).toUpperCase()
}

/** Data local no formato yyyy-mm-dd (sem pular dia por fuso, como toISOString faz). */
export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function diasAte(dateISO?: string | null): number | null {
  if (!dateISO) return null
  const hoje = new Date(`${hojeISO()}T00:00:00`)
  const alvo = new Date(`${dateISO.slice(0, 10)}T00:00:00`)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
}

export function fmtDataBR(iso?: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function fmtDataHoraBR(iso?: string | null): string {
  if (!iso) return ''
  const dt = new Date(iso)
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function soDigitos(v?: string | null): string {
  return (v || '').replace(/\D/g, '')
}

/** Link do WhatsApp com DDI 55 quando o número vem só com DDD. */
export function waLink(phone?: string | null): string {
  const d = soDigitos(phone)
  if (!d) return ''
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`
}
