// @ts-nocheck — Deno Edge 런타임에서만 타입 해석
/**
 * 기기(아두이노 등) → 관제 DB 삽입 전용 게이트.
 * - 공유 비밀(X-Device-Ingest-Key) 검증
 * - IP·글로벌 윈도우 레이트 리밋(api_rate_try RPC, service_role 전용)
 * - 페이로드 크기·좌표 범위·배열 길이 검증
 *
 * 배포: supabase secrets set DEVICE_INGEST_SECRET=... 후
 *       supabase functions deploy telemetry-ingest --no-verify-jwt
 *
 * 대규모 DDoS(분산 봇넷)는 WAF·CDN·공공망 방화벽과 병행해야 합니다.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-ingest-key",
};

const MAX_BODY_BYTES = 96 * 1024;
const MAX_ITEMS = 80;
const RATE_IP_PER_SEC = 25;
const RATE_GLOBAL_PER_SEC = 8000;

type SeedItem = {
  id: string;
  label: string;
  drop_time: string;
  lat: number;
  lng: number;
  status: "성공" | "실패" | "대기";
  recorded_at: number;
  verification_mismatch?: boolean;
};

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

function isValidItem(x: unknown): x is SeedItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length < 1 || o.id.length > 200) return false;
  if (typeof o.label !== "string" || o.label.length > 500) return false;
  if (typeof o.drop_time !== "string" || o.drop_time.length > 64) return false;
  if (typeof o.lat !== "number" || typeof o.lng !== "number") return false;
  if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return false;
  if (o.lat < -90 || o.lat > 90 || o.lng < -180 || o.lng > 180) return false;
  if (o.status !== "성공" && o.status !== "실패" && o.status !== "대기") return false;
  const ra = o.recorded_at;
  if (typeof ra !== "number" || !Number.isFinite(ra)) return false;
  if (ra < 0 || ra > 9_000_000_000_000) return false;
  if (o.verification_mismatch !== undefined && typeof o.verification_mismatch !== "boolean") return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const secret = Deno.env.get("DEVICE_INGEST_SECRET")?.trim();
  if (!secret) {
    return jsonResponse(503, { error: "ingest_not_configured" });
  }

  const supplied = req.headers.get("x-device-ingest-key")?.trim() ?? "";
  if (!supplied || supplied !== secret) {
    return jsonResponse(401, { error: "invalid_device_key" });
  }

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "payload_too_large" });
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: "payload_too_large" });
    }
    raw = JSON.parse(text);
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  if (!raw || typeof raw !== "object") {
    return jsonResponse(400, { error: "invalid_body" });
  }
  const records = (raw as { records?: unknown }).records;
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_ITEMS) {
    return jsonResponse(400, { error: "invalid_records_array" });
  }
  if (!records.every(isValidItem)) {
    return jsonResponse(400, { error: "invalid_record_shape" });
  }

  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !serviceKey) {
    return jsonResponse(503, { error: "supabase_env_missing" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(req);

  const { data: ipOk, error: ipErr } = await admin.rpc("api_rate_try", {
    p_cell_key: `telemetry:ip:${ip}`,
    p_max: RATE_IP_PER_SEC,
    p_window_seconds: 1,
  });
  if (ipErr) {
    console.error("[telemetry-ingest] rate ip rpc", ipErr.message);
    return jsonResponse(500, { error: "rate_check_failed" });
  }
  if (ipOk !== true) {
    return jsonResponse(429, { error: "rate_limited_per_ip", retry_after_sec: 1 });
  }

  const { data: gOk, error: gErr } = await admin.rpc("api_rate_try", {
    p_cell_key: "telemetry:global",
    p_max: RATE_GLOBAL_PER_SEC,
    p_window_seconds: 1,
  });
  if (gErr) {
    console.error("[telemetry-ingest] rate global rpc", gErr.message);
    return jsonResponse(500, { error: "rate_check_failed" });
  }
  if (gOk !== true) {
    return jsonResponse(429, { error: "rate_limited_global", retry_after_sec: 1 });
  }

  const rows = records.map((d) => ({
    id: d.id,
    label: d.label,
    drop_time: d.drop_time,
    lat: d.lat,
    lng: d.lng,
    status: d.status,
    recorded_at: d.recorded_at,
    verification_mismatch: d.verification_mismatch ?? false,
  }));

  const { error: insErr } = await admin.from("seed_drop_records").upsert(rows, { onConflict: "id" });
  if (insErr) {
    console.error("[telemetry-ingest] upsert", insErr.message);
    return jsonResponse(500, { error: "db_write_failed" });
  }

  return jsonResponse(200, { ok: true, accepted: rows.length });
});
