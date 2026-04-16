import { useEffect, useState } from 'react'
import {
  LogOut, Menu, LayoutGrid, FolderKanban, ChevronDown,
  Users, UserCog, TrendingUp, CalendarDays, Receipt, RefreshCw, ArrowDownCircle, MessageCircle,
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
import type { User } from '@supabase/supabase-js'
import type { Project } from '../lib/types'

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
  { type: 'leaf',  id: 'kanban',   label: 'Kanban',   icon: LayoutGrid   },
  { type: 'leaf',  id: 'projetos', label: 'Projetos', icon: FolderKanban },
  { type: 'leaf',  id: 'cobranca', label: 'Cobranças', icon: MessageCircle },
  {
    type: 'group', id: 'cadastros', label: 'Cadastros', icon: Users,
    children: [
      { type: 'leaf', id: 'clientes',  label: 'Clientes',             icon: Users            },
      { type: 'leaf', id: 'usuarios',  label: 'Usuários',             icon: UserCog          },
      { type: 'leaf', id: 'financeiro',label: 'Financeiro',           icon: TrendingUp       },
      { type: 'leaf', id: 'calendario',label: 'Calendário',           icon: CalendarDays     },
      { type: 'leaf', id: 'despesas',  label: 'Despesas',             icon: Receipt          },
      { type: 'leaf', id: 'mensalidades', label: 'Mensalidades',      icon: RefreshCw        },
      { type: 'leaf', id: 'entradas',  label: 'Entradas de Projetos', icon: ArrowDownCircle  },
    ],
  },
]

const SECTION_LABELS: Record<string, string> = {
  kanban: 'Kanban', projetos: 'Projetos', cobranca: 'Cobranças', clientes: 'Clientes',
  usuarios: 'Usuários', financeiro: 'Financeiro', calendario: 'Calendário',
  despesas: 'Despesas', mensalidades: 'Mensalidades', entradas: 'Entradas de Projetos',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser]                   = useState<User | null>(null)
  const [activeSection, setActiveSection] = useState('kanban')
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const [openGroups, setOpenGroups]       = useState<Set<string>>(new Set(['cadastros']))
  const [pendingKanbanTask, setPendingKanbanTask] = useState<{ title: string; subtitle?: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate('/')
      else setUser(data.user)
    })
  }, [navigate])

  async function handleLogout() { await signOut(); navigate('/') }

  function handleProjectCreated(project: Project) {
    setPendingKanbanTask({
      title: project.nome_projeto,
      subtitle: project.nome_cliente || undefined,
    })
  }

  function toggleGroup(id: string) {
    setOpenGroups(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function selectLeaf(id: string) { setActiveSection(id); setSidebarOpen(false) }

  const userInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??'

  const leafCls = (id: string) => `
    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
    transition-all duration-150
    ${activeSection === id
      ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/20'
      : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
    }
  `

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">

      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 flex flex-col w-64 shrink-0
        bg-slate-900/80 backdrop-blur-2xl border-r border-white/[0.07]
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/[0.07]">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800 ring-1 ring-white/10 shrink-0">
            <LogoIcon className="w-6 h-6" />
          </div>
          <div className="leading-tight">
            <p className="text-white font-semibold text-sm tracking-tight">Nexla</p>
            <p className="text-slate-500 text-xs">Operacional</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map(item => {
            if (item.type === 'leaf') {
              const Icon = item.icon
              return (
                <button key={item.id} onClick={() => selectLeaf(item.id)} className={leafCls(item.id)}>
                  <Icon className="w-4 h-4 shrink-0" />{item.label}
                </button>
              )
            }

            // Group
            const group = item as NavGroup
            const isOpen = openGroups.has(group.id)
            const GroupIcon = group.icon
            const hasActive = group.children.some(c => c.id === activeSection)

            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                    ${hasActive ? 'text-indigo-300' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'}`}
                >
                  <GroupIcon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="mt-1 ml-3 pl-3 border-l border-white/[0.07] space-y-0.5">
                    {group.children.map(child => {
                      const ChildIcon = child.icon
                      return (
                        <button key={child.id} onClick={() => selectLeaf(child.id)} className={leafCls(child.id)}>
                          <ChildIcon className="w-3.5 h-3.5 shrink-0" />{child.label}
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
        <div className="px-3 py-4 border-t border-white/[0.07] space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30 flex items-center justify-center shrink-0">
              <span className="text-indigo-300 text-[10px] font-bold">{userInitials}</span>
            </div>
            <span className="text-slate-400 text-xs truncate flex-1">{user?.email}</span>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150">
            <LogOut className="w-4 h-4 shrink-0" />Sair
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors lg:hidden">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-white font-semibold text-base">{SECTION_LABELS[activeSection] ?? 'Dashboard'}</h2>
        </header>

        <main className="flex-1 overflow-auto p-6 relative">
          <div className="pointer-events-none fixed -top-32 -right-32 w-[500px] h-[500px] bg-indigo-700 rounded-full mix-blend-screen filter blur-[140px] opacity-10" />
          <div className="pointer-events-none fixed bottom-0 left-1/3 w-[400px] h-[400px] bg-violet-700 rounded-full mix-blend-screen filter blur-[140px] opacity-10" />
          <div className="pointer-events-none fixed inset-0 opacity-[0.025]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

          <div className="relative z-10 animate-fade-in-up h-full">
            {activeSection === 'kanban'       && <KanbanBoard pendingTask={pendingKanbanTask} onPendingTaskConsumed={() => setPendingKanbanTask(null)} />}
            {activeSection === 'projetos'     && <Projects onProjectCreated={handleProjectCreated} />}
            {activeSection === 'cobranca'     && <Cobranca />}
            {activeSection === 'clientes'     && <Clientes />}
            {activeSection === 'usuarios'     && <Usuarios />}
            {activeSection === 'financeiro'   && <Financeiro />}
            {activeSection === 'calendario'   && <Calendario />}
            {activeSection === 'despesas'     && <Despesas />}
            {activeSection === 'mensalidades' && <Mensalidades />}
            {activeSection === 'entradas'     && <EntradasProjetos />}
          </div>
        </main>
      </div>
    </div>
  )
}
