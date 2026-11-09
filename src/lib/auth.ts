import { supabase } from './supabase'

// O auth do Supabase é COMPARTILHADO com outros sistemas (ex.: plataforma de cursos),
// então uma senha válida não basta: a conta precisa estar cadastrada em nexla_profiles.
// O bloqueio real dos dados é feito pela RLS (nexla_is_member) no banco; esta checagem
// impede que a pessoa sequer entre na interface.
export const NO_ACCESS_MSG = 'Esta conta não tem acesso ao Nexla Operacional.'

export async function isNexlaMember(): Promise<boolean> {
  const { data, error } = await supabase.rpc('nexla_is_member')
  return !error && data === true
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { user: null, error: error.message }

  if (!(await isNexlaMember())) {
    await supabase.auth.signOut()
    return { user: null, error: NO_ACCESS_MSG }
  }

  return { user: data.user, error: null }
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}
