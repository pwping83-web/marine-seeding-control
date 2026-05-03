-- 해양 종자 살포 관제 — Supabase SQL Editor 에서 한 번에 실행
-- (7일 예보 테이블은 002_weather_forecast_days.sql 별도 실행)
-- 앱 코드 기준: WorkPlanView(WorkEntry), Dashboard(SeedDrop, SignalEntry), seagrass-map(DropPoint)
-- 테스트용 RLS: anon 도 읽기/쓰기 가능 (운영 전에는 정책 반드시 재설계)

-- ─── 1) 작업 예약 (일정 / 예약날짜·구역·목표·선박·상태) ─────────────────────
create table if not exists public.work_reservations (
  id text primary key,
  work_date date not null,
  zone text not null,
  target_seeds integer not null check (target_seeds > 0),
  vessel text not null default '제3해양살포함',
  status text not null
    check (status in ('scheduled', 'completed', 'weather-hold', 'cancelled')),
  actual integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_work_reservations_work_date on public.work_reservations (work_date);
create index if not exists idx_work_reservations_status on public.work_reservations (status);

-- ─── 2) 관제 대시보드 살포 이력 (지도 마커 / CSV보내기와 동일 필드) ────────
create table if not exists public.seed_drop_records (
  id text primary key,
  label text not null,
  drop_time text not null,
  lat double precision not null,
  lng double precision not null,
  status text not null check (status in ('성공', '실패', '대기')),
  recorded_at bigint not null,
  verification_mismatch boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_seed_drop_records_recorded_at on public.seed_drop_records (recorded_at desc);

-- ─── 3) Seagrass 콘솔 이력 (History / DropPoint — 영문 상태) ────────────────
create table if not exists public.seagrass_drop_records (
  id text primary key,
  time_utc text not null,
  lat double precision not null,
  lng double precision not null,
  map_x double precision,
  map_y double precision,
  status text not null check (status in ('Success', 'Pending', 'Failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_seagrass_drop_records_created on public.seagrass_drop_records (created_at desc);

-- ─── 4) 선박 신호 송신 로그 ─────────────────────────────────────────────────
create table if not exists public.ship_command_logs (
  id uuid primary key default gen_random_uuid(),
  cmd text not null,
  sent_time text not null,
  ack boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ship_command_logs_created on public.ship_command_logs (created_at desc);

-- ─── RLS (테스트: 전체 허용 — 운영 시 authenticated + 소유자 기준으로 교체) ───
alter table public.work_reservations enable row level security;
alter table public.seed_drop_records enable row level security;
alter table public.seagrass_drop_records enable row level security;
alter table public.ship_command_logs enable row level security;

drop policy if exists "dev_work_reservations_all" on public.work_reservations;
create policy "dev_work_reservations_all" on public.work_reservations
  for all using (true) with check (true);

drop policy if exists "dev_seed_drop_records_all" on public.seed_drop_records;
create policy "dev_seed_drop_records_all" on public.seed_drop_records
  for all using (true) with check (true);

drop policy if exists "dev_seagrass_drop_records_all" on public.seagrass_drop_records;
create policy "dev_seagrass_drop_records_all" on public.seagrass_drop_records
  for all using (true) with check (true);

drop policy if exists "dev_ship_command_logs_all" on public.ship_command_logs;
create policy "dev_ship_command_logs_all" on public.ship_command_logs
  for all using (true) with check (true);

-- anon / authenticated 가 테이블에 접근하려면 API 노출 필요 (기본은 이미 public 스키마 노출)
grant usage on schema public to anon, authenticated;
grant all on public.work_reservations to anon, authenticated;
grant all on public.seed_drop_records to anon, authenticated;
grant all on public.seagrass_drop_records to anon, authenticated;
grant all on public.ship_command_logs to anon, authenticated;

-- ─── 샘플 데이터 (WorkPlanView 의 INITIAL_SCHEDULE 일부) ─────────────────────
insert into public.work_reservations (id, work_date, zone, target_seeds, vessel, status, actual, note)
values
  ('w01', '2026-04-21', '제2구역 A', 850, '제3해양살포함', 'completed', 862, null),
  ('w06', '2026-05-07', '제2구역 B', 850, '제3해양살포함', 'weather-hold', null, '풍속 19 kt 초과 — 익일 재예약'),
  ('w07', '2026-05-08', '제2구역 B', 850, '제3해양살포함', 'scheduled', null, null)
on conflict (id) do nothing;

insert into public.seagrass_drop_records (id, time_utc, lat, lng, map_x, map_y, status)
values
  ('1001', '08:12:00', 34.8, 128.5, 420, 220, 'Success'),
  ('1002', '08:16:00', 34.801, 128.501, 460, 250, 'Success')
on conflict (id) do nothing;
