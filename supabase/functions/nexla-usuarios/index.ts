// Edge Function: nexla-usuarios
// Operações administrativas de usuários da Nexla, executadas no servidor para que
// a service role key nunca vá para o navegador (o banco Supabase é compartilhado
// com outros projetos — vazar essa chave exporia todos eles).
//
// Ações (POST JSON):
//   { action: 'create', email, password, full_name, role }  → cria usuário + perfil
//   { action: 'list_emails' }                               → { emails: { [id]: email } }
//                                                             apenas de quem está em nexla_profiles
// Somente admins da Nexla (nexla_profiles.role = 'admin') podem chamar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado.' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Valida o token do chamador e exige que seja admin da Nexla
    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (callerErr || !caller) return json({ error: 'Token inválido.' }, 401)

    const { data: callerProfile } = await admin
      .from('nexla_profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return json({ error: 'Apenas admins podem gerenciar usuários.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action ?? 'create'

    // ── Lista e-mails da equipe Nexla ────────────────────────────────────────
    if (action === 'list_emails') {
      const { data: profs, error: pErr } = await admin.from('nexla_profiles').select('id')
      if (pErr) return json({ error: pErr.message }, 500)

      const emails: Record<string, string> = {}
      await Promise.all((profs ?? []).map(async (p: { id: string }) => {
        const { data } = await admin.auth.admin.getUserById(p.id)
        if (data?.user?.email) emails[p.id] = data.user.email
      }))
      return json({ emails })
    }

    // ── Cria usuário ─────────────────────────────────────────────────────────
    if (action === 'create') {
      const { email, password, full_name, role } = body
      if (!email || !password || !full_name || !role) {
        return json({ error: 'Campos obrigatórios: email, password, full_name, role.' }, 400)
      }
      if (!['admin', 'operator'].includes(role)) return json({ error: 'Cargo inválido.' }, 400)

      const { data, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      })
      if (createErr || !data.user) {
        return json({ error: createErr?.message ?? 'Erro ao criar usuário.' }, 400)
      }

      const { error: profileErr } = await admin
        .from('nexla_profiles')
        .upsert({ id: data.user.id, full_name, role }, { onConflict: 'id' })

      if (profileErr) {
        return json({ error: 'Usuário criado, mas perfil não salvo: ' + profileErr.message }, 500)
      }
      return json({ user: { id: data.user.id, email: data.user.email } })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
