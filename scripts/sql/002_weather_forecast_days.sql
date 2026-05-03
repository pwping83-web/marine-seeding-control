-- 7일 기상 예보 스냅샷 (WorkPlanView buildForecast 결과 저장)
-- SQL Editor 에서 001 실행 후 이 파일 실행

create table if not exists public.weather_forecast_days (
  anchor_date date not null,
  forecast_date date not null,
  day_of_week smallint not null,
  wind_speed double precision not null,
  wind_dir double precision not null,
  wind_gust double precision not null,
  wave_height double precision not null,
  visibility double precision not null,
  precipitation double precision not null,
  temp double precision not null,
  status text not null check (status in ('ok', 'caution', 'impossible')),
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (anchor_date, forecast_date)
);

create index if not exists idx_weather_forecast_anchor on public.weather_forecast_days (anchor_date desc);

alter table public.weather_forecast_days enable row level security;

drop policy if exists "dev_weather_forecast_days_all" on public.weather_forecast_days;
create policy "dev_weather_forecast_days_all" on public.weather_forecast_days
  for all using (true) with check (true);

grant all on public.weather_forecast_days to anon, authenticated;
