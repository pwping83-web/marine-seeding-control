-- 운영·심사 대응: API 윈도우 레이트 리밋(서비스 롤 전용 RPC) + 접속 로그 IP당 분당 상한
-- Edge Function(telemetry-ingest)이 service_role 로 rpc 호출 — anon 직접 호출 불가

-- ─── 1) 슬라이딩 윈도 버킷(초 단위 등) ─────────────────────────────────────
create table if not exists public.api_rate_limit_cells (
  cell_key text not null,
  window_id bigint not null,
  hit_count int not null default 0,
  primary key (cell_key, window_id)
);

create index if not exists idx_api_rate_limit_cells_prune
  on public.api_rate_limit_cells (window_id);

revoke all on public.api_rate_limit_cells from public;
revoke all on public.api_rate_limit_cells from anon, authenticated;
grant select, insert, update, delete on public.api_rate_limit_cells to service_role;

-- 윈도 카운터 증가 후 허용 여부 반환 (초과 시 false, 카운터는 증가한 채 유지)
create or replace function public.api_rate_try(
  p_cell_key text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w bigint;
  new_count int;
begin
  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid window';
  end if;
  if p_max < 1 or p_max > 1000000 then
    raise exception 'invalid max';
  end if;

  w := (extract(epoch from clock_timestamp())::bigint / p_window_seconds::bigint);

  insert into public.api_rate_limit_cells (cell_key, window_id, hit_count)
  values (p_cell_key, w, 1)
  on conflict (cell_key, window_id)
  do update set hit_count = public.api_rate_limit_cells.hit_count + 1
  returning hit_count into new_count;

  return new_count <= p_max;
end;
$$;

revoke all on function public.api_rate_try(text, int, int) from public;
grant execute on function public.api_rate_try(text, int, int) to service_role;

-- ─── 2) site_access_events: 동일 IP 분당 삽입 상한(브루트·로그 스팸 완화) ───
create index if not exists idx_site_access_events_ip_visited
  on public.site_access_events (ip, visited_at desc);

create or replace function public.enforce_site_access_insert_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap int := 60;
  scope text;
  recent int;
begin
  scope := coalesce(nullif(trim(new.ip), ''), 'unknown');
  select count(*) into recent
  from public.site_access_events
  where coalesce(nullif(trim(ip), ''), 'unknown') = scope
    and visited_at > now() - interval '1 minute';

  if recent >= cap then
    raise exception 'site_access_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_site_access_insert_cap on public.site_access_events;
create trigger trg_site_access_insert_cap
  before insert on public.site_access_events
  for each row
  execute function public.enforce_site_access_insert_cap();
