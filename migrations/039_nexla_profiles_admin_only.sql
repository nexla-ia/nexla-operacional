-- ============================================================
-- Migration 039 — Endurece nexla_profiles (auditoria de segurança)
--
-- Antes: qualquer membro podia UPDATE/INSERT em nexla_profiles, então um
-- operador conseguia se promover a admin ou adicionar qualquer conta do auth
-- compartilhado (ex.: aluno de outro app) como membro da Nexla.
-- Agora: só admins inserem/alteram perfis. Criação de usuário continua
-- funcionando pela edge function nexla-usuarios (service role).
-- ============================================================

create or replace function public.nexla_is_admin()
returns boolean language plpgsql stable security definer
set search_path = public as $$
begin
  return exists (select 1 from public.nexla_profiles where id = auth.uid() and role = 'admin');
end;
$$;

drop policy if exists "profiles_insert" on public.nexla_profiles;
create policy "profiles_insert" on public.nexla_profiles
  for insert with check (public.nexla_is_admin());

drop policy if exists "profiles_update" on public.nexla_profiles;
create policy "profiles_update" on public.nexla_profiles
  for update using (public.nexla_is_admin()) with check (public.nexla_is_admin());

-- Função security definer sem search_path fixo é vulnerável a sequestro de search_path
alter function public.nexla_set_user_id() set search_path = public;
