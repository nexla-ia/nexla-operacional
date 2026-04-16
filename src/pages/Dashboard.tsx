import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { signOut, getUser } from '../lib/auth'

export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()

  function handleLogout() {
    signOut()
    navigate('/')
  }

  return (
    <main className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-6 shadow-lg">
          <span className="text-white text-2xl font-bold">N</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        {user && (
          <p className="text-gray-500 mb-8">
            Logado como <span className="font-medium text-gray-700">{user.email}</span>
          </p>
        )}
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </main>
  )
}
