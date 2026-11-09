import { createClient } from '@supabase/supabase-js'

export const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL as string
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Operações administrativas (criar usuário, listar e-mails) ficam na edge function
// `nexla-usuarios`. Nunca coloque a service role key no front: o banco é compartilhado
// com outros projetos e a chave daria acesso total a todos eles.
