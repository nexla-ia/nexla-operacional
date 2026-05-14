import { useEffect, useState } from 'react'
import {
  LogOut, Menu, LayoutGrid, FolderKanban, ChevronDown,
  Users, UserCog, CalendarDays, Receipt, RefreshCw, ArrowDownCircle, MessageCircle,
  LayoutDashboard, AlertTriangle, Wallet, FileText, Activity, Heart, Lock, Clock,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'
import LogoIcon from '../components/LogoIcon'
import KanbanBoard from '../components/KanbanBoard'
import Projects from '../components/Projects'
import Clientes from '../components/cadastros/Clientes'
import Usuarios from '../components/cadastros/Usuarios'
import Financeiro from '../components/cadastros/Financeiro'
import Calendario from '../components/cadastros/Calendario'
import Despesas from '../components/cadastros/Despesas'
import Mensalidades from '../components/cadastros/Mensalidades'
import EntradasProjetos from '../components/cadastros/EntradasProjetos'
import Cobranca from '../components/Cobranca'
import Propostas from '../components/Propostas'
import FluxoCaixa from '../components/FluxoCaixa'
import NPS from '../components/NPS'
import Acessos from '../components/Acessos'
import Ponto from '../components/Ponto'
import DashboardHome from '../components/DashboardHome'
import ErrosN8n from '../components/ErrosN8n'
import Configuracoes from '../components/Configuracoes'
import type { User } from '@supabase/supabase-js'
import type { Project, Client } from '../lib/types'

// ── Nav types ─────────────────────────────────────────────────────────────────

interface NavLeaf {
  type:  'leaf'
  id:    string
  label: string
  icon:  LucideIcon
}

interface NavGroup {
  type:     'group'
  id:       string
  label:    string
  icon:     LucideIcon
  children: NavLeaf[]
}

type NavItem = NavLeaf | NavGroup

// ── Nav structure ─────────────────────────────────────────────────────────────

const NAV: NavItem[] = [
  { type: 'leaf', id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { type: 'leaf', id: 'calendario', label: 'Calendários', icon: CalendarDays    },
  { type: 'leaf', id: 'ponto',      label: 'Ponto',       icon: Clock           },
  { type: 'leaf', id: 'nps',        label: 'NPS',         icon: Heart           },
  { type: 'leaf', id: 'acessos',    label: 'Acessos',     icon: Lock            },
  {
    type: 'group', id: 'grp-projetos', label: 'Projetos', icon: FolderKanban,
    children: [
      { type: 'leaf', id: 'projetos',  label: 'Projetos',  icon: FolderKanban },
      { type: 'leaf', id: 'propostas', label: 'Propostas', icon: FileText     },
      { type: 'leaf', id: 'kanban',    label: 'Kanban',    icon: LayoutGrid   },
      { type: 'leaf', id: 'erros-n8n', label: 'Erros N8N', icon: AlertTriangle },
    ],
  },
  {
    type: 'group', id: 'cadastros', label: 'Cadastros', icon: Users,
    children: [
      { type: 'leaf', id: 'clientes', label: 'Clientes', icon: Users   },
      { type: 'leaf', id: 'usuarios', label: 'Usuários', icon: UserCog },
    ],
  },
  {
    type: 'group', id: 'financeiro', label: 'Financeiro', icon: Wallet,
    children: [
      { type: 'leaf', id: 'fluxo-caixa',  label: 'Fluxo de Caixa',       icon: Activity        },
      { type: 'leaf', id: 'despesas',     label: 'Despesas',             icon: Receipt         },
      { type: 'leaf', id: 'mensalidades', label: 'Mensalidades',         icon: RefreshCw       },
      { type: 'leaf', id: 'entradas',     label: 'Entradas de Projetos', icon: ArrowDownCircle },
      { type: 'leaf', id: 'cobranca',     label: 'Cobranças',            icon: MessageCircle   },
    ],
  },
]

const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', projetos: 'Projetos', propostas: 'Propostas', calendario: 'Calendários',
  kanban: 'Kanban', 'erros-n8n': 'Erros N8N', nps: 'NPS', acessos: 'Acessos', ponto: 'Ponto',
  clientes: 'Clientes', usuarios: 'Usuários',
  'fluxo-caixa': 'Fluxo de Caixa',
  despesas: 'Despesas', mensalidades: 'Mensalidades',
  entradas: 'Entradas de Projetos', cobranca: 'Cobranças',
}

// ── Component ─────────────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null

function playAlert() {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext()
    const ctx = _audioCtx

    const doPlay = () => {
      const t = ctx.currentTime
      ;[
        { freq: 880, start: 0,    dur: 0.12 },
        { freq: 660, start: 0.15, dur: 0.12 },
        { freq: 880, start: 0.30, dur: 0.18 },
      ].forEach(({ freq, start, dur }) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, t + start)
        gain.gain.setValueAtTime(0.25, t + start)
        gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur)
        osc.start(t + start); osc.stop(t + start + dur)
      })
    }

    if (ctx.state === 'suspended') ctx.resume().then(doPlay)
    else doPlay()
  } catch { /* navegador sem suporte */ }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser]                   = useState<User | null>(null)
  const [role, setRole]                   = useState<'admin' | 'operator' | null>(null)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [openGroups, setOpenGroups]       = useState<Set<string>>(new Set())
  const [pendingKanbanTask, setPendingKanbanTask] = useState<{ title: string; subtitle?: string; project_id?: string } | null>(null)
  const [pendingProjectClient, setPendingProjectClient] = useState<Client | null>(null)
  const [unreadErrors, setUnreadErrors]   = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { navigate('/'); return }
      setUser(data.user)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
      const r = (profile?.role as 'admin' | 'operator') ?? 'operator'
      setRole(r)
      if (r === 'operator') setActiveSection('dashboard')
    })
  }, [navigate])

  // Atualiza título da aba com contagem de erros
  useEffect(() => {
    if (unreadErrors > 0)
      document.title = `(${unreadErrors}) Nexla Operacional`
    else
      document.title = 'Nexla Operacional'
  }, [unreadErrors])

  // Realtime: badge + som ao chegar novo erro n8n
  useEffect(() => {
    // contagem inicial de erros abertos
    supabase.from('n8n_errors').select('id', { count: 'exact', head: true })
      .eq('resolved', false)
      .then(({ count }) => setUnreadErrors(count ?? 0))

    const ch = supabase.channel('dashboard_n8n_badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'n8n_errors' }, () => {
        setUnreadErrors(n => n + 1)
        playAlert()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'n8n_errors' }, payload => {
        if (payload.new.resolved) setUnreadErrors(n => Math.max(0, n - 1))
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  async function handleLogout() { await signOut(); navigate('/') }

  function handleClientCreated(client: Client) {
    setPendingProjectClient(client)
    setActiveSection('projetos')
  }

  function handleProjectCreated(project: Project) {
    if (!project.client_id) return
    setPendingKanbanTask({
      title:      project.nome_projeto,
      subtitle:   project.nome_cliente || undefined,
      project_id: project.id,
    })
  }

  function toggleGroup(id: string) {
    setOpenGroups(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function selectLeaf(id: string) {
    setActiveSection(id)
    setSidebarOpen(false)
    if (id === 'erros-n8n') setUnreadErrors(0)
  }

  const OPERATOR_NAV: NavItem[] = [
    { type: 'leaf', id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
    { type: 'leaf', id: 'calendario', label: 'Calendários', icon: CalendarDays },
    { type: 'leaf', id: 'ponto',      label: 'Ponto',       icon: Clock },
    {
      type: 'group', id: 'grp-projetos', label: 'Projetos', icon: FolderKanban,
      children: [
        { type: 'leaf', id: 'projetos',  label: 'Projetos',  icon: FolderKanban  },
        { type: 'leaf', id: 'kanban',    label: 'Kanban',    icon: LayoutGrid    },
        { type: 'leaf', id: 'erros-n8n', label: 'Erros N8N', icon: AlertTriangle },
      ],
    },
    { type: 'leaf', id: 'clientes', label: 'Clientes',  icon: Users         },
    { type: 'leaf', id: 'cobranca', label: 'Cobranças', icon: MessageCircle },
  ]
  const visibleNav = role === 'operator' ? OPERATOR_NAV : NAV

  const userInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??'

  const leafCls = (id: string) => `
    relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
    transition-all duration-150
    ${activeSection === id
      ? 'nav-active bg-indigo-500/10 text-indigo-300'
      : 'text-slate-300 hover:bg-white/[0.04] hover:text-slate-200'
    }
  `

  return (
    <div className="grain flex h-screen bg-[#060709] overflow-hidden">

      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 flex flex-col w-60 shrink-0
        bg-[#080a0f]/95 backdrop-blur-2xl border-r border-white/[0.05]
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 pt-6 pb-5 border-b border-white/[0.05]">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20 shrink-0">
            <LogoIcon className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <p className="text-white font-bold text-sm tracking-tight">Nexla</p>
            <p className="text-slate-300 text-[11px] font-medium">Operacional</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-0.5">
          {visibleNav.map(item => {
            if (item.type === 'leaf') {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button key={item.id} onClick={() => selectLeaf(item.id)} className={leafCls(item.id)}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors
                    ${isActive ? 'bg-indigo-500/20' : 'bg-transparent group-hover:bg-white/5'}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === 'erros-n8n' && unreadErrors > 0 && (
                    <span className="ml-auto flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
                      {unreadErrors > 99 ? '99+' : unreadErrors}
                    </span>
                  )}
                </button>
              )
            }

            const group = item as NavGroup
            const isOpen = openGroups.has(group.id)
            const GroupIcon = group.icon
            const hasActive = group.children.some(c => c.id === activeSection)

            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-150 mt-3 mb-1
                    ${hasActive ? 'text-indigo-400' : 'text-slate-300 hover:text-slate-300'}`}
                >
                  <GroupIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="space-y-0.5">
                    {group.children.map(child => {
                      const ChildIcon = child.icon
                      const isActive = activeSection === child.id
                      return (
                        <button key={child.id} onClick={() => selectLeaf(child.id)} className={leafCls(child.id)}>
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors
                            ${isActive ? 'bg-indigo-500/20' : ''}`}>
                            <ChildIcon className="w-3.5 h-3.5" />
                          </div>
                          {child.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* User / Logout */}
        <div className="px-2.5 py-4 border-t border-white/[0.05]">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/20 ring-1 ring-indigo-500/20 flex items-center justify-center shrink-0">
              <span className="text-indigo-200 text-[10px] font-bold">{userInitials}</span>
            </div>
            <span className="text-slate-300 text-xs truncate flex-1 font-medium">{user?.email}</span>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-red-500/8 hover:text-red-400 transition-all duration-150">
            <LogOut className="w-3.5 h-3.5 shrink-0" />Sair
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-3 px-6 py-3.5 border-b border-white/[0.05] shrink-0 bg-[#080a0f]/60 backdrop-blur-sm">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors lg:hidden">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-white font-semibold text-sm tracking-tight">{SECTION_LABELS[activeSection] ?? 'Dashboard'}</h2>
        </header>

        <main className="flex-1 overflow-auto p-6 relative">
          <div className="pointer-events-none fixed -top-32 -right-32 w-[600px] h-[600px] bg-indigo-800 rounded-full mix-blend-screen filter blur-[160px] opacity-8" />
          <div className="pointer-events-none fixed bottom-0 left-1/3 w-[500px] h-[500px] bg-violet-800 rounded-full mix-blend-screen filter blur-[160px] opacity-8" />
          <div className="pointer-events-none fixed inset-0 opacity-[0.018]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />

          <div className="relative z-10 animate-fade-in-up h-full">
            {activeSection === 'dashboard'    && <DashboardHome />}
            {activeSection === 'kanban'       && <KanbanBoard pendingTask={pendingKanbanTask} onPendingTaskConsumed={() => setPendingKanbanTask(null)} />}
            {activeSection === 'projetos'     && <Projects onProjectCreated={handleProjectCreated} pendingClient={pendingProjectClient} onPendingClientConsumed={() => setPendingProjectClient(null)} />}
            {activeSection === 'propostas'    && <Propostas />}
            {activeSection === 'fluxo-caixa'  && <FluxoCaixa />}
            {activeSection === 'nps'          && <NPS />}
            {activeSection === 'acessos'      && <Acessos />}
            {activeSection === 'ponto'        && <Ponto />}
            {activeSection === 'cobranca'     && <Cobranca />}
            {activeSection === 'clientes'     && <Clientes readOnly={role === 'operator'} onClientCreated={role !== 'operator' ? handleClientCreated : undefined} />}
            {activeSection === 'usuarios'     && <Usuarios />}
            {activeSection === 'financeiro'   && <Financeiro />}
            {activeSection === 'calendario'   && <Calendario />}
            {activeSection === 'despesas'     && <Despesas />}
            {activeSection === 'mensalidades' && <Mensalidades />}
            {activeSection === 'entradas'     && <EntradasProjetos />}
            {activeSection === 'erros-n8n'    && <ErrosN8n />}
            {activeSection === 'configuracoes' && <Configuracoes />}
          </div>
        </main>
      </div>
    </div>
  )
}
