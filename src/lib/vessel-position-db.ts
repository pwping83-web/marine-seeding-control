/**
 * vessel-position-db.ts
 *
 * 실시간 선박 위치 공유 — Supabase vessel_positions 테이블 연동
 *  · 지정 계정(VESSEL_USER_EMAIL)이 실제 모드 진입 시 GPS→Supabase upsert
 *  · 모든 로그인 사용자가 Realtime 구독으로 vessel 마커를 지도에서 확인
 */

import { getSupabase, isSupabaseConfigured } from "./supabase";

/** 선박 운용 계정 — 이 이메일로 로그인하면 GPS 발행 권한이 부여됨 */
export const VESSEL_USER_EMAIL = "123456@gmail.com";

/** 선박 고유 ID (vessel_positions 테이블 PK) */
export const VESSEL_ID = "vessel-01";

export type VesselPositionRow = {
  vessel_id: string;
  user_email: string;
  lat: number;
  lng: number;
  heading: number;
  speed_knots: number;
  updated_at: string;
};

/** 선박 위치 upsert — vessel user 전용 */
export async function upsertVesselPosition(
  vesselId: string,
  userEmail: string,
  lat: number,
  lng: number,
  heading = 0,
  speedKnots = 0,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabase()
    .from("vessel_positions")
    .upsert(
      {
        vessel_id: vesselId,
        user_email: userEmail,
        lat,
        lng,
        heading,
        speed_knots: speedKnots,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "vessel_id" },
    );
  if (error) console.warn("[vessel-pos] upsert 오류:", error.message);
}

/** 선박 위치 초기 조회 + Realtime 구독. 반환값 = unsubscribe 함수 */
export function subscribeVesselPositions(
  onUpdate: (rows: VesselPositionRow[]) => void,
): () => void {
  if (!isSupabaseConfigured()) return () => {};

  const sb = getSupabase();

  // 초기 데이터 조회
  void sb
    .from("vessel_positions")
    .select("*")
    .then(({ data }) => {
      if (data) onUpdate(data as VesselPositionRow[]);
    });

  // Realtime: INSERT / UPDATE / DELETE 모두 감지 → 전체 재조회
  const channel = sb
    .channel("vessel-positions-global")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vessel_positions" },
      () => {
        void sb
          .from("vessel_positions")
          .select("*")
          .then(({ data }) => {
            if (data) onUpdate(data as VesselPositionRow[]);
          });
      },
    )
    .subscribe();

  return () => {
    void sb.removeChannel(channel);
  };
}

/** 연결 해제 시 위치 레코드 삭제 (선박 오프라인 표시용, 선택적) */
export async function removeVesselPosition(vesselId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().from("vessel_positions").delete().eq("vessel_id", vesselId);
}
