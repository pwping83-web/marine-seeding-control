import type { WorkEntry } from "@/app/work-plan-types";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type WorkRow = {
  id: string;
  work_date: string;
  zone: string;
  target_seeds: number;
  vessel: string;
  status: WorkEntry["status"];
  actual: number | null;
  note: string | null;
};

type SeedRow = {
  id: string;
  label: string;
  drop_time: string;
  lat: number;
  lng: number;
  status: "성공" | "실패" | "대기";
  recorded_at: number;
  verification_mismatch: boolean;
};

export function marineDbEnabled(): boolean {
  return isSupabaseConfigured();
}

function rowToWorkEntry(r: WorkRow): WorkEntry {
  return {
    id: r.id,
    date: r.work_date.slice(0, 10),
    zone: r.zone,
    targetSeeds: r.target_seeds,
    vessel: r.vessel,
    status: r.status,
    actual: r.actual ?? undefined,
    note: r.note ?? undefined,
  };
}

export async function fetchWorkReservations(): Promise<WorkEntry[] | null> {
  if (!marineDbEnabled()) return null;
  const { data, error } = await getSupabase()
    .from("work_reservations")
    .select("*")
    .order("work_date", { ascending: true });
  if (error) {
    console.warn("[marine-db] work_reservations", error.message);
    return null;
  }
  return (data as WorkRow[]).map(rowToWorkEntry);
}

export async function insertWorkReservation(entry: WorkEntry): Promise<boolean> {
  if (!marineDbEnabled()) return false;
  const { error } = await getSupabase().from("work_reservations").insert({
    id: entry.id,
    work_date: entry.date,
    zone: entry.zone,
    target_seeds: entry.targetSeeds,
    vessel: entry.vessel,
    status: entry.status,
    actual: entry.actual ?? null,
    note: entry.note ?? null,
  });
  if (error) {
    console.warn("[marine-db] insert work_reservations", error.message);
    return false;
  }
  return true;
}

/** 최초 빈 테이블일 때 데모 일괄 삽입 */
export async function seedWorkReservations(entries: WorkEntry[]): Promise<boolean> {
  if (!marineDbEnabled() || entries.length === 0) return false;
  const rows = entries.map((e) => ({
    id: e.id,
    work_date: e.date,
    zone: e.zone,
    target_seeds: e.targetSeeds,
    vessel: e.vessel,
    status: e.status,
    actual: e.actual ?? null,
    note: e.note ?? null,
  }));
  const { error } = await getSupabase().from("work_reservations").upsert(rows, { onConflict: "id" });
  if (error) {
    console.warn("[marine-db] seed work_reservations", error.message);
    return false;
  }
  return true;
}

export type SeedDropInput = {
  id: string;
  label: string;
  time: string;
  lat: number;
  lng: number;
  status: "성공" | "실패" | "대기";
  recordedAt: number;
  verificationMismatch?: boolean;
};

function rowToSeedDrop(r: SeedRow): SeedDropInput {
  return {
    id: r.id,
    label: r.label,
    time: r.drop_time,
    lat: r.lat,
    lng: r.lng,
    status: r.status,
    recordedAt: Number(r.recorded_at),
    verificationMismatch: r.verification_mismatch,
  };
}

export async function fetchSeedDropRecords(limit = 80): Promise<SeedDropInput[] | null> {
  if (!marineDbEnabled()) return null;
  const { data, error } = await getSupabase()
    .from("seed_drop_records")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[marine-db] seed_drop_records", error.message);
    return null;
  }
  return (data as SeedRow[]).map(rowToSeedDrop).reverse();
}

export async function upsertSeedDropRecord(d: SeedDropInput): Promise<boolean> {
  if (!marineDbEnabled()) return false;
  const { error } = await getSupabase().from("seed_drop_records").upsert(
    {
      id: d.id,
      label: d.label,
      drop_time: d.time,
      lat: d.lat,
      lng: d.lng,
      status: d.status,
      recorded_at: d.recordedAt,
      verification_mismatch: d.verificationMismatch ?? false,
    },
    { onConflict: "id" },
  );
  if (error) {
    console.warn("[marine-db] upsert seed_drop_records", error.message);
    return false;
  }
  return true;
}

export async function seedSeedDropRecords(drops: SeedDropInput[]): Promise<boolean> {
  if (!marineDbEnabled() || drops.length === 0) return false;
  const rows = drops.map((d) => ({
    id: d.id,
    label: d.label,
    drop_time: d.time,
    lat: d.lat,
    lng: d.lng,
    status: d.status,
    recorded_at: d.recordedAt,
    verification_mismatch: d.verificationMismatch ?? false,
  }));
  const { error } = await getSupabase().from("seed_drop_records").upsert(rows, { onConflict: "id" });
  if (error) {
    console.warn("[marine-db] seed seed_drop_records", error.message);
    return false;
  }
  return true;
}

/** 로그인(첫 화면) 접속 시 IP·대략 위치 기록 — 이메일은 DB Webhook/Edge 등으로 별도 연동 */
export async function logSiteAccess(info: {
  ip: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  userAgent: string;
  path: string;
}): Promise<void> {
  if (!marineDbEnabled()) return;
  const { error } = await getSupabase().from("site_access_events").insert({
    ip: info.ip,
    country: info.country ?? null,
    region: info.region ?? null,
    city: info.city ?? null,
    user_agent: info.userAgent.slice(0, 800),
    path: info.path.slice(0, 500),
  });
  if (error) console.warn("[marine-db] site_access_events", error.message);
}

export async function insertShipCommand(cmd: string, sentTime: string): Promise<void> {
  if (!marineDbEnabled()) return;
  const { error } = await getSupabase().from("ship_command_logs").insert({
    cmd,
    sent_time: sentTime,
    ack: false,
  });
  if (error) console.warn("[marine-db] ship_command_logs", error.message);
}

/** WorkPlanView 7일 예보 한 세트 (anchor = 첫째 날짜 로컬 YMD) */
export type ForecastDaySave = {
  date: Date;
  windSpeed: number;
  windDir: number;
  windGust: number;
  waveHeight: number;
  visibility: number;
  precipitation: number;
  temp: number;
  status: "ok" | "caution" | "impossible";
  reasons: string[];
};

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function replaceWeatherForecastDays(
  anchorYmd: string,
  days: ForecastDaySave[],
): Promise<boolean> {
  if (!marineDbEnabled() || days.length === 0) return false;
  const sb = getSupabase();
  const { error: delErr } = await sb.from("weather_forecast_days").delete().eq("anchor_date", anchorYmd);
  if (delErr) {
    console.warn("[marine-db] delete weather_forecast_days", delErr.message);
    return false;
  }
  const rows = days.map((f) => ({
    anchor_date: anchorYmd,
    forecast_date: ymdLocal(f.date),
    day_of_week: f.date.getDay(),
    wind_speed: f.windSpeed,
    wind_dir: f.windDir,
    wind_gust: f.windGust,
    wave_height: f.waveHeight,
    visibility: f.visibility,
    precipitation: f.precipitation,
    temp: f.temp,
    status: f.status,
    reasons: f.reasons,
  }));
  const { error } = await sb.from("weather_forecast_days").insert(rows);
  if (error) {
    console.warn("[marine-db] insert weather_forecast_days", error.message);
    return false;
  }
  return true;
}
