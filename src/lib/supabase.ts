import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getSupabasePublicKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL?.trim() && getSupabasePublicKey());
}

/** 브라우저용 단일 Supabase 클라이언트. 환경 변수가 없으면 호출 시 예외. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publicKey = getSupabasePublicKey();
  if (!url || !publicKey) {
    throw new Error(
      "VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY(또는 VITE_SUPABASE_PUBLISHABLE_KEY)를 .env에 설정하세요.",
    );
  }
  client = createClient(url, publicKey);
  return client;
}
