// @ts-nocheck
/**
 * 선박 GPS+LTE 궤적 수집. 헤더 X-Device-Ingest-Key = Supabase Secret DEVICE_INGEST_SECRET
 * POST JSON: { "vessel_id": "제3해양살포함", "points": [{ "lat","lng","recorded_at": unix_ms, "speed_kn?","heading_deg?" }] }
 *
 * supabase functions deploy vessel-track-ingest --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-ingest-key",
};

const MAX_BODY_BYTES = 64 * 1024;
const MAX_POINTS = 100;
const RATE_IP_PER_SEC = 15;
const RATE_GLOBAL_PER_SEC = 4000;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff.slice(0, 128);
  return "unknown";
}

type Pt = {
  lat: number;
  lng: number;
  recorded_at: number;
  speed_kn?: number | null;
  heading_deg?: number | null;
};

function isPoint(x: unknown): x is Pt {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.lat !== "number" || typeof o.lng !== "number") return false;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return false;
  if (o.lat < -90 || o.lat > 90 || o.lng < -180 || o.lng > 180) return false;
  if (typeof o.recorded_at !== "number" || !Number.isFinite(o.recorded_at)) return false;
  if (o.recorded_at < 0 || o.recorded_at > 9_000_000_000_000) return false;
  if (o.speed_kn !== undefined && o.speed_kn !== null) {
    if (typeof o.speed_kn !== "number" || !Number.isFinite(o.speed_kn) || o.speed_kn < 0 || o.speed_kn > 120)
      return false;
  }
  if (o.heading_deg !== undefined && o.heading_deg !== null) {
    if (typeof o.heading_deg !== "number" || !Number.isFinite(o.heading_deg)) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  const secret = Deno.env.get("DEVICE_INGEST_SECRET")?.trim();
  if (!secret) return jsonResponse(503, { error: "ingest_not_configured" });

  const supplied = req.headers.get("x-device-ingest-key")?.trim() ?? "";
  if (!supplied || supplied !== secret) return jsonResponse(401, { error: "invalid_device_key" });

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return jsonResponse(413, { error: "payload_too_large" });

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return jsonResponse(413, { error: "payload_too_large" });
    raw = JSON.parse(text);
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  if (!raw || typeof raw !== "object") return jsonResponse(400, { error: "invalid_body" });
  const vessel_id = (raw as { vessel_id?: unknown }).vessel_id;
  if (typeof vessel_id !== "string" || vessel_id.trim().length < 1 || vessel_id.length > 120) {
    return jsonResponse(400, { error: "invalid_vessel_id" });
  }
  const points = (raw as { points?: unknown }).points;
  if (!Array.isArray(points) || points.length === 0 || points.length > MAX_POINTS) {
    return jsonResponse(400, { error: "invalid_points" });
  }
  if (!points.every(isPoint)) return jsonResponse(400, { error: "invalid_point_shape" });

  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !serviceKey) return jsonResponse(503, { error: "supabase_env_missing" });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(req);
  const { data: ipOk, error: ipErr } = await admin.rpc("api_rate_try", {
    p_cell_key: `vessel-track:ip:${ip}`,
    p_max: RATE_IP_PER_SEC,
    p_window_seconds: 1,
  });
  if (ipErr) {
    console.error("[vessel-track-ingest]", ipErr.message);
    return jsonResponse(500, { error: "rate_check_failed" });
  }
  if (ipOk !== true) return jsonResponse(429, { error: "rate_limited_per_ip", retry_after_sec: 1 });

  const { data: gOk, error: gErr } = await admin.rpc("api_rate_try", {
    p_cell_key: "vessel-track:global",
    p_max: RATE_GLOBAL_PER_SEC,
    p_window_seconds: 1,
  });
  if (gErr) {
    console.error("[vessel-track-ingest]", gErr.message);
    return jsonResponse(500, { error: "rate_check_failed" });
  }
  if (gOk !== true) return jsonResponse(429, { error: "rate_limited_global", retry_after_sec: 1 });

  const rows = points.map((p) => ({
    vessel_id: vessel_id.trim(),
    recorded_at: new Date(Math.floor(p.recorded_at)).toISOString(),
    lat: p.lat,
    lng: p.lng,
    speed_kn: p.speed_kn ?? null,
    heading_deg: p.heading_deg ?? null,
    source: "arduino-lte",
  }));

  const { error: insErr } = await admin.from("vessel_track_points").insert(rows);
  if (insErr) {
    console.error("[vessel-track-ingest] insert", insErr.message);
    return jsonResponse(500, { error: "db_write_failed" });
  }

  return jsonResponse(200, { ok: true, accepted: rows.length });
});
