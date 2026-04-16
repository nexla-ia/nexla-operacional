// Mock de autenticação — substitua por Supabase quando tiver o projeto criado

const MOCK_USER = {
  email: 'admin@nexla.com',
  password: '123456',
  name: 'Admin',
}

export async function signIn(email: string, password: string) {
  await new Promise((resolve) => setTimeout(resolve, 800)) // simula latência

  if (email === MOCK_USER.email && password === MOCK_USER.password) {
    localStorage.setItem('mock_user', JSON.stringify({ email: MOCK_USER.email, name: MOCK_USER.name }))
    return { user: { email: MOCK_USER.email, name: MOCK_USER.name }, error: null }
  }

  return { user: null, error: 'E-mail ou senha incorretos.' }
}

export function signOut() {
  localStorage.removeItem('mock_user')
}

export function getUser() {
  const raw = localStorage.getItem('mock_user')
  return raw ? JSON.parse(raw) : null
}
