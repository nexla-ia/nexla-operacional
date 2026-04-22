-- App-level settings (single row, singleton pattern)
create table if not exists public.app_settings (
  id                  int primary key default 1 check (id = 1),
  currency_provider   text not null default 'awesomeapi',
  currency_api_key    text,
  usd_brl_rate        numeric(10,4),
  rate_fetched_at     timestamptz,
  updated_at          timestamptz default now(),
  updated_by          uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

create policy "admins_select_app_settings" on public.app_settings
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins_insert_app_settings" on public.app_settings
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "admins_update_app_settings" on public.app_settings
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Seed default row
insert into public.app_settings (id, currency_provider)
values (1, 'awesomeapi')
on conflict (id) do nothing;
