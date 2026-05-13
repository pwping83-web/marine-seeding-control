-- ============================================================
-- vessel_positions 테이블 — 실시간 선박 위치 공유
-- Supabase SQL Editor 또는 마이그레이션으로 실행하세요.
-- ============================================================

CREATE TABLE IF NOT EXISTS vessel_positions (
  vessel_id    TEXT              PRIMARY KEY,
  user_email   TEXT              NOT NULL,
  lat          DOUBLE PRECISION  NOT NULL,
  lng          DOUBLE PRECISION  NOT NULL,
  heading      DOUBLE PRECISION  NOT NULL DEFAULT 0,
  speed_knots  DOUBLE PRECISION  NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE vessel_positions ENABLE ROW LEVEL SECURITY;

-- 인증된 모든 사용자: 읽기 허용
CREATE POLICY "authenticated_read_vessel_positions"
  ON vessel_positions
  FOR SELECT
  TO authenticated
  USING (true);

-- 선박 계정만 자기 레코드 쓰기 허용 (이메일 일치)
CREATE POLICY "vessel_owner_write_vessel_positions"
  ON vessel_positions
  FOR ALL
  TO authenticated
  USING (auth.email() = user_email)
  WITH CHECK (auth.email() = user_email);

-- ── Realtime 활성화 ─────────────────────────────────────────
-- Supabase 대시보드 > Database > Replication 에서
-- vessel_positions 테이블을 supabase_realtime publication에 추가하거나
-- 아래 명령을 실행하세요:
ALTER PUBLICATION supabase_realtime ADD TABLE vessel_positions;
