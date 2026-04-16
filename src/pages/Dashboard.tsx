import { useEffect, useState } from 'react'
import { LogOut, Menu, LayoutGrid, FolderKanban, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'
import LogoIcon from '../components/LogoIcon'
import KanbanBoard from '../components/KanbanBoard'
import Projects from '../components/Projects'
import type { User } from '@supabase/supabase-js'

interface NavItem {
  id: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'kanban',   label: 'Kanban',   icon: LayoutGrid   },
  { id: 'projetos', label: 'Projetos', icon: FolderKanban },
]

const SECTION_TITLES: Record<string, string> = {
  kanban:   'Kanban',
  projetos: 'Projetos',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser]                 = useState<User | null>(null)
  const [activeSection, setActiveSection] = useState('kanban')
  const [sidebarOpen, setSidebarOpen]   = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate('/')
      else setUser(data.user)
    })
  }, [navigate])

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  const userInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '??'

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30
          flex flex-col w-64 shrink-0
          bg-slate-900/80 backdrop-blur-2xl
          border-r border-white/[0.07]
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
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
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => { setActiveSection(item.id); setSidebarOpen(false) }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-150
                  ${active
                    ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/20'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }
                `}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
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
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                       text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Topbar */}
        <header className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-white font-semibold text-base">
            {SECTION_TITLES[activeSection] ?? 'Dashboard'}
          </h2>
        </header>

        {/* Page area */}
        <main className="flex-1 overflow-auto p-6 relative">

          {/* Blobs de fundo */}
          <div className="pointer-events-none fixed -top-32 -right-32 w-[500px] h-[500px] bg-indigo-700 rounded-full mix-blend-screen filter blur-[140px] opacity-10" />
          <div className="pointer-events-none fixed bottom-0 left-1/3 w-[400px] h-[400px] bg-violet-700 rounded-full mix-blend-screen filter blur-[140px] opacity-10" />

          {/* Grade sutil */}
          <div
            className="pointer-events-none fixed inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />

          <div className="relative z-10 animate-fade-in-up h-full">
            {activeSection === 'kanban'   && <KanbanBoard />}
            {activeSection === 'projetos' && <Projects />}
          </div>
        </main>
      </div>
    </div>
  )
}
