# 아두이노 실제 살포 연동 가이드 (현장 단말 → 관제·DB)

이 문서는 **관제 웹**에서 하는「테스트 살포 1건」기록과, **실제 함정/살포기**에서 **살포가 한 번 일어날 때마다** 동일한 형태로 관제·DB에 남기려면 어떤 구조로 코딩·배선하면 되는지 정리합니다.

---

## 1. 웹 관제 —「테스트 살포 1건」버튼이 하는 일

- **전제**: 지도 우하단 **「내 위치 찾기」**를 켜 **실시간 GNSS**(브라우저 Geolocation)로 위치가 잡힌 상태.
- **「테스트 살포 1건」**을 누를 때마다:
  - **살포 이력**에 항목이 **1건** 추가됩니다.
  - **위치**: 그 순간의 **GNSS 위경도**(미세 난수 지터 포함 — 지도 점이 겹치지 않게).
  - **시각**: **금일 로컬 시각**이 `recordedAt`(타임스탬프)과 `time`(표시용 문자열)에 기록됩니다.
  - **라벨**: `GNSS-YYYY-MM-DD-01` 형태로, 같은 날·같은 GNSS 모드 세션에서 **누른 순서**가 2자리로 붙습니다. (「내 위치 찾기」를 끄면 순번은 다음에 켤 때 `01`부터 다시 시작.)
  - **지도**: 종자 살포 점(원)이 현재 위치 근처에 **하나씩** 쌓입니다.
  - **사이드바**「종자 살포 이력」에도 동일하게 나타납니다.
- **Supabase 연동**이 켜져 있으면(`marine-db` 사용), 같은 내용이 **`seed_drop_records`** 테이블에 `upsert` 됩니다. 관제의 주기 폴링으로 다른 탭·함정 화면과도 맞춰질 수 있습니다.

관련 코드: `src/app/Dashboard.tsx`의 `handleGpsTestSeedDrop`, `src/lib/marine-db.ts`의 `upsertSeedDropRecord`.

---

## 2. DB에 남기는 한 건의 의미 (필드 대응)

웹의 `SeedDrop` 한 건은 DB 행과 대략 다음처럼 대응합니다.

| 웹 (`SeedDrop`) | Supabase (`seed_drop_records` 개념) |
|-----------------|-------------------------------------|
| `id` | 고유 ID (문자열, 예: `1005`) |
| `label` | 화면·리포트용 라벨 (예: `GNSS-2026-05-12-01`) |
| `time` | `drop_time` — 사람이 읽는 시각 문자열 |
| `lat`, `lng` | WGS84 위도·경도 |
| `status` | `성공` / `실패` / `대기` |
| `recordedAt` | `recorded_at` — 밀리초 타임스탬프 |
| `verificationMismatch` | (선택) 검증 불일치 플래그 |

**실제 장비**에서는「살포 1회」가 발생한 **그 순간의 GPS 좌표**와 **그 순간의 시각**을 넣는 것이 웹 테스트 버튼과 동일한 의미입니다.

---

## 3. 실제 시스템에서의 권장 데이터 흐름

현장에서는 브라우저가 아니라 **MCU(아두이노 등) + GNSS + 통신(LTE·위성·LoRa 등)** 이 조합인 경우가 많습니다.

```text
[살포기/밸브/스크류 한 회전 센서] ──> [아두이노] ──> [LTE·Wi‑Fi 모듈] ──> [서버]
                                              ^
[GPS/GNSS 모듈] ──────────────────────────────┘
```

- **살포 1회**를 감지하는 신호(디지털 펄스, 근접 스위치, 모터 엔코더 1스텝 등)마다 **한 레코드**를 올립니다.
- **위경도**는 가능하면 **살포 직전 또는 직후**에 읽은 GNSS 값을 사용합니다(지연·캐시 주의).
- **시각**은 MCU의 RTC가 부정확할 수 있으므로, 가능하면 **서버 수신 시각**을 canonical로 쓰고, 단말 시각은 참고 필드로 두는 설계도 흔합니다.

---

## 4. 아두이노 쪽에서 구현할 때의 핵심

### 4.1 살포 1회 감지 (입력)

- **기계 스위치·리미트 스위치**: 채터링이 있으므로 **하드웨어 RC + 소프트웨어 디바운스**(예: 20~50ms 안정 후 엣지 1회만 인정).
- **회전체/펄스**: 인터럽트로 카운트하되, **한 번의 물리 살포 = N펄스**인지 먼저 정하고, 관제에는 **「살포 1건」= 1회만 전송**으로 맞춥니다.
- **아날로그 센서**: 임계값 + 히스테리시스로 **한 사이클당 1이벤트**만.

### 4.2 GNSS 좌표

- 시리얈로 **NMEA**를 파싱하거나, **UBX** 바이너리를 쓰는 모듈이면 라이브러리로 `fix` 여부·`lat`/`lng`를 읽습니다.
- **Fix 없음**일 때는 레코드를 올리지 않거나, `status`를 `대기`로 두고 좌표는 마지막 유효값/0으로 정책을 문서화하세요.

### 4.3 통신으로 서버에 넣는 방법 (개념)

1. **Supabase REST**  
   - 클라이언트에 **anon 키를 박아 넣는 것은 비권장**입니다(분실 시 테이블 전체가 위험).  
   - **Edge Function** 또는 **전용 ingest 서버**에 **장비별 API 키**만 보내고, 서버가 Service Role로 `seed_drop_records`에 insert 하는 패턴을 권장합니다.

2. **이 저장소와 맞추려면**  
   - 브라우저는 `src/lib/marine-db.ts`의 `upsertSeedDropRecord`를 사용합니다.  
   - 아두이노는 동일 필드를 JSON으로 POST하면 됩니다(실제 URL·키는 배포 환경에서만 관리).

3. **ID·라벨 생성**

   - `id`: 단말에서 UUID를 쓰거나, `타임스탬프 + 단말 시리얼`처럼 **전역 유일**이 되게 합니다. 웹의 숫자 4자리와 충돌하지 않게 하려면 접두사를 다르게 해도 됩니다(예: `ARD-1704067200000`).
   - `label`: 현장 식별용 (`함정1-20260512-003` 등).

---

## 5. 아두이노 의사 코드 예시 (구조만)

의존 라이브러리·핀 번호는 하드웨어에 맞게 바꿉니다.

```cpp
// 의사 코드: 살포 펄스 1회당 1건 전송 (디바운스·GNSS는 실제 코드로 보강)

volatile unsigned long lastPulseMs = 0;
const unsigned long DEBOUNCE_MS = 40;

void onDispensePulse() {
  unsigned long now = millis();
  if (now - lastPulseMs < DEBOUNCE_MS) return;
  lastPulseMs = now;

  double lat, lng;
  bool fix = readGnssFixAndLatLng(&lat, &lng);
  if (!fix) return;

  char body[384];
  // JSON: id, label, drop_time, lat, lng, status, recorded_at(ms)
  buildSeedDropJson(body, sizeof(body), lat, lng);

  httpPostIngestEndpoint(body);  // Edge Function URL 등
}
```

- `readGnssFixAndLatLng`: TinyGPS++ / SparkFun u-blox 등으로 구현.
- `httpPostIngestEndpoint`: **WiFiClientSecure** / **LTE 모듈 AT**(`AT+CHTTPPOST` 등)로 구현.

---

## 6. 관제 웹이 DB를 다시 읽는 경로

Supabase를 켠 빌드에서는 `VITE_SEED_DROP_POLL_MS` 주기로 `fetchSeedDropRecords`가 호출되어, **아두이노가 넣은 행**도 지도·이력에 반영될 수 있습니다. (환경 변수는 배포 문서를 참고하세요.)

---

## 7. 보안·운영 체크리스트

- [ ] 단말에 **Service Role 키를 넣지 않는다**.
- [ ] **HTTPS**만 사용한다.
- [ ] 장비별 **API 키 회전**·폐기 절차가 있다.
- [ ] 살포 **중복 전송**(재시도) 시 같은 `id`로 upsert할지, 멱등 키를 쓸지 정한다.
- [ ] 오프라인 버퍼(큐)와 **백오프 재전송**을 고려한다.

---

## 8. 요약

| 구분 | 내용 |
|------|------|
| 웹 테스트 | GNSS 모드에서 **버튼 1클릭 = 살포 1건** 기록, 금일 시각·좌표 반영 |
| 실제 단말 | **살포 1회 감지**마다 동일 스키마로 서버에 1건 적재 + **그 순간 GNSS** |
| 아두이노 역할 | 입력 디바운스, GNSS 읽기, **안전한 ingest 경로**로 HTTP POST |
| 이 저장소 참고 | `Dashboard.tsx` (`handleGpsTestSeedDrop`), `marine-db.ts` (`upsertSeedDropRecord`) |

추가로 **회로도·커넥터·전원·방수**는 선박 전장 설계 문서에서 다루고, 본 문서는 **소프트웨어·데이터 연계**에 초점을 맞춥니다.
