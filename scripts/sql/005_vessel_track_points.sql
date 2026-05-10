-- 해상 기기(GPS+LTE) 선박 궤적 — Edge `vessel-track-ingest` 가 service_role 로 삽입, 대시보드는 SELECT 만
-- Edge 레이트 리밋 RPC(api_rate_try)를 쓰려면 scripts/sql/004_api_rate_limit_and_site_access_cap.sql 선행 적용
create table if not exists public.vessel_track_points (
  id uuid primary key default gen_random_uuid(),
  vessel_id text not null check (char_length(trim(vessel_id)) between 1 and 120),
  recorded_at timestamptz not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  speed_kn double precision,
  heading_deg double precision,
  source text not null default 'arduino-lte' check (char_length(source) <= 64),
  created_at timestamptz not null default now()
);

create index if not exists idx_vessel_track_vessel_time
  on public.vessel_track_points (vessel_id, recorded_at desc);

alter table public.vessel_track_points enable row level security;

drop policy if exists "vessel_track_select_all" on public.vessel_track_points;
create policy "vessel_track_select_all" on public.vessel_track_points
  for select using (true);

-- anon/authenticated: 읽기만 (삽입은 Edge service_role 전용)
revoke insert, update, delete on public.vessel_track_points from public;
revoke insert, update, delete on public.vessel_track_points from anon, authenticated;
grant select on public.vessel_track_points to anon, authenticated;
