import type { WorkEntry } from "@/app/work-plan-types";
import { LOCAL_RECORDING_ONLY } from "@/lib/local-recording-mode";
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
  if (LOCAL_RECORDING_ONLY) return false;
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

export async function cancelWorkReservation(id: string): Promise<boolean> {
  if (!marineDbEnabled()) return false;
  const { error } = await getSupabase()
    .from("work_reservations")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) {
    console.warn("[marine-db] cancel work_reservations", error.message);
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

export async function deleteSeedDropRecord(id: string): Promise<boolean> {
  if (!marineDbEnabled()) return false;
  const { error } = await getSupabase().from("seed_drop_records").delete().eq("id", id);
  if (error) {
    console.warn("[marine-db] delete seed_drop_records", error.message);
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

export type VesselTrackPoint = {
  id: string;
  vessel_id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  speed_kn: number | null;
  heading_deg: number | null;
  source: string;
};

type VesselTrackRow = {
  id: string;
  vessel_id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  speed_kn: number | null;
  heading_deg: number | null;
  source: string;
};

/** 선박 LTE 궤적 — 최근 N건(시간 오름차순으로 반환) */
export async function fetchVesselTrackPoints(
  vesselId: string,
  limit = 400,
): Promise<VesselTrackPoint[] | null> {
  if (!marineDbEnabled()) return null;
  const id = vesselId.trim();
  if (!id) return null;
  const { data, error } = await getSupabase()
    .from("vessel_track_points")
    .select("id,vessel_id,recorded_at,lat,lng,speed_kn,heading_deg,source")
    .eq("vessel_id", id)
    .order("recorded_at", { ascending: false })
    .limit(Math.min(2000, Math.max(1, limit)));
  if (error) {
    console.warn("[marine-db] vessel_track_points", error.message);
    return null;
  }
  const rows = (data as VesselTrackRow[] | null) ?? [];
  return rows
    .map((r) => ({
      id: r.id,
      vessel_id: r.vessel_id,
      recorded_at: r.recorded_at,
      lat: r.lat,
      lng: r.lng,
      speed_kn: r.speed_kn,
      heading_deg: r.heading_deg,
      source: r.source,
    }))
    .reverse();
}

/** 선박이 수동으로 현재 위치를 관제 DB에 기록 */
export async function insertVesselTrackPoint(input: {
  vesselId: string;
  lat: number;
  lng: number;
  speedKn?: number | null;
  headingDeg?: number | null;
  source?: string;
}): Promise<boolean> {
  if (!marineDbEnabled()) return false;
  const vid = input.vesselId.trim();
  if (!vid) return false;
  const id = `vt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const { error } = await getSupabase().from("vessel_track_points").insert({
    id,
    vessel_id: vid,
    recorded_at: new Date().toISOString(),
    lat: input.lat,
    lng: input.lng,
    speed_kn: input.speedKn ?? null,
    heading_deg: input.headingDeg ?? null,
    source: input.source ?? "position_report",
  });
  if (error) {
    console.warn("[marine-db] vessel_track_points insert", error.message);
    return false;
  }
  return true;
}

export async function insertShipCommand(
  cmdOrObj: string | { id: string; vesselId: string; cmd: string },
  sentTime?: string,
): Promise<void> {
  if (!marineDbEnabled()) return;
  if (typeof cmdOrObj === "string") {
    const { error } = await getSupabase().from("ship_command_logs").insert({
      cmd: cmdOrObj,
      sent_time: sentTime ?? new Date().toISOString(),
      ack: false,
    });
    if (error) console.warn("[marine-db] ship_command_logs", error.message);
  } else {
    const { error } = await getSupabase().from("ship_command_logs").insert({
      id: cmdOrObj.id,
      vessel_id: cmdOrObj.vesselId,
      cmd: cmdOrObj.cmd,
      sent_time: new Date().toISOString(),
      ack: false,
    });
    if (error) console.warn("[marine-db] ship_command_logs (extended)", error.message);
  }
}

/** 다른 브라우저/탭과 선박 신호 동기화 — Supabase Realtime(INSERT) 구독 */
export function subscribeShipCommandInserts(onCmd: (cmd: string) => void): () => void {
  if (!marineDbEnabled()) return () => {};
  const sb = getSupabase();
  const channel = sb
    .channel("ship-command-logs-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "ship_command_logs" },
      (payload: { new?: Record<string, unknown> }) => {
        const cmd = String(payload.new?.cmd ?? "");
        if (cmd) onCmd(cmd);
      },
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

export type ShipCommandRow = {
  id: string;
  vessel_id: string;
  cmd: string;
  createdAt: string;
  ackedAt: string | null;
};

/** 선박에서 올라온 SOS 등 최근 N건 조회 (vessel_id 기준) */
export async function fetchRecentShipCommands(
  vesselId: string,
  limit = 10,
): Promise<ShipCommandRow[] | null> {
  if (!marineDbEnabled()) return null;
  const { data, error } = await getSupabase()
    .from("ship_command_logs")
    .select("id,vessel_id,cmd,sent_time,ack")
    .eq("vessel_id", vesselId)
    .order("sent_time", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[marine-db] fetchRecentShipCommands", error.message);
    return null;
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id ?? ""),
    vessel_id: String(r.vessel_id ?? ""),
    cmd: String(r.cmd ?? ""),
    createdAt: String(r.sent_time ?? ""),
    ackedAt: r.ack ? String(r.sent_time ?? "") : null,
  }));
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
