-- 로그인 페이지 등 접속 기록 (위치·시간). 이메일은 Supabase Webhook/Edge+Resend 등으로 이 테이블 INSERT에 연동
create table if not exists public.site_access_events (
  id uuid primary key default gen_random_uuid(),
  ip text,
  country text,
  region text,
  city text,
  user_agent text,
  path text,
  visited_at timestamptz not null default now()
);

create index if not exists idx_site_access_events_visited on public.site_access_events (visited_at desc);

alter table public.site_access_events enable row level security;

drop policy if exists "dev_site_access_events_all" on public.site_access_events;
create policy "dev_site_access_events_all" on public.site_access_events
  for all using (true) with check (true);

grant all on public.site_access_events to anon, authenticated;
