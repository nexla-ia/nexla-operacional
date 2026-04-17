-- ============================================================
-- Migration 012 — Trigger de perfil lê role dos metadados
-- Execute no Supabase SQL Editor.
-- ============================================================

-- Atualiza o trigger para também ler o role do metadata (se fornecido pela Edge Function)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'operator')
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        role      = coalesce(excluded.role,      public.profiles.role),
        updated_at = now();
  return new;
end;
$$;
