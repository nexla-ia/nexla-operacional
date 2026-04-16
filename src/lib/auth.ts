import { supabase } from './supabase'

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { user: null, error: error.message }

  return { user: data.user, error: null }
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}
