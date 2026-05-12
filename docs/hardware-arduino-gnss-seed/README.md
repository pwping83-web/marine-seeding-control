# 아두이노 실제 살포 연동 가이드 (현장 단말 → 관제·DB)

이 문서는 **관제 웹**에서 하는「테스트 살포 1건」기록과, **실제 함정/살포기**에서 **살포가 한 번 일어날 때마다** 동일한 형태로 관제·DB에 남기려면 어떤 구조로 코딩·배선하면 되는지 정리합니다.

**함께 읽기(기획·시나리오)**: [블루투스 살포 거치대 연동 계획](../기획-연동-초안/블루투스-살포-거치대-연동-계획.md) · [투하 연동 제안서 방안1·2](../기획-연동-초안/투하-연동-제안서-방안1-방안2.md)  
**함께 읽기(현장 스케치·주기)**: 저장소 루트 [`arduino/README.md`](../../arduino/README.md) · [`arduino/docs/03-관제웹-마커-궤적-주기-서버-한도.md`](../../arduino/docs/03-관제웹-마커-궤적-주기-서버-한도.md)

---

## 목표와 단계별 로드맵 (시뮬 → 단말 연결 → 센서 실투하)

### 최종 목표(한 줄)

실제로 투하할 때 **센서를 지나가며 나오는 신호**에 따라, 웹에는 **지금 시뮬레이션에서 보이는 것과 같은 빨간 종자 살포 위치(마커)** 가 **투하할 때마다** 찍히고, **같은 규칙으로 저장**되며, **저장값을 CSV 등으로 보내 출력**(다운로드·제출)할 수 있는 상태가 되는 것이다.

### 1단계 — 시뮬레이션 투하로 “찍힘·저장·갱신”만 먼저 검증

| 무엇을 보나 | 하는 일 |
|-------------|-----------|
| 관제 대시보드 | 시뮬 모드의 샘플 점·항적, 또는 **「내 위치 찾기」켠 뒤「테스트 살포 1건」**으로 **빨간 살포 점**이 지도에 하나씩 쌓이는지, 왼쪽 **「종자 살포 이력」** 행이 늘는지 확인한다. |
| 함정 `/mobile` | **「살포 시작」** 후 GPS가 잡힌 상태에서 **「투하 (센서 시뮬)」**를 눌러 **지도에 점·금일 건수**가 맞는지 본다(Supabase를 켠 경우 DB 반영까지). |

이 단계의 통과 기준: **“한 번의 투하 액션 = 지도에 점 1개 + (연동 시) `seed_drop_records` 1행 + 이력 목록 1행”** 이 시뮬에서도 동일하게 느껴진다.

### 2단계 — 아두이노(망 직결) vs 핸드폰(BLE 등) 중 택일 후, 문서대로 연결

- **아두이노·ESP32 → Wi‑Fi/LTE → 서버**: 아래 **§7.1**, [`arduino/sketches/esp32-marine-telemetry/`](../../arduino/sketches/esp32-marine-telemetry/) 스케치, Edge **`telemetry-ingest`**, Secret **`DEVICE_INGEST_SECRET`** 순으로 맞춘다.
- **센서 → 거치대 → 블루투스 → 폰 → 서버**: **§7.2** 및 [블루투스-살포-거치대-연동-계획.md](../기획-연동-초안/블루투스-살포-거치대-연동-계획.md), [투하-연동-제안서-방안1-방안2.md](../기획-연동-초안/투하-연동-제안서-방안1-방안2.md)를 따른다. (살포 **시작/중지**용 `ship_command_logs`와, **투하 1건**용 `seed_drop_records`는 역할이 다르다 — §7.2 참고.)

통과 기준: **물리 센서 없이** POST 한 번(또는 폰 경로 한 번)으로 **1단계와 같은 형태의 점·행**이 서버·웹에 들어온다.

### 3단계(최종) — 센서 실물 연동 후 “시뮬과 같은 표시·저장·출력”

1. **센서**: 투하 1회를 **에지 1번**(또는 합의한 N펄스=1투하)으로 확정하고, 디바운스·최소 간격으로 오발·중복 전송을 막는다.  
2. **좌표**: 그 순간의 **GNSS**를 읽어 §2·§7과 같은 필드(`lat`,`lng`,`recorded_at` 등)로 묶는다.  
3. **저장**: `telemetry-ingest` 등으로 **`seed_drop_records`에 upsert** → 웹은 기존과 같이 **폴링**으로 읽어 **시뮬과 동일한 빨간 마커 스타일**로 그린다(관제 `Dashboard`·Leaflet 쪽 로직).  
4. **출력·보내기**: 관제 화면 사이드바의 **CSV 저장**(현재 구현: `Dashboard.tsx`의 `exportCSV` / 종자 살포 이력 영역의 CSV 버튼)으로 **필터된 목록**을 파일로 받거나, 운영 측에서 Supabase에서 직접 조회·리포트를 병행한다.

정리하면, **1단계 = UI·데이터 모델 검증**, **2단계 = 링크(망 또는 폰) 검증**, **3단계 = 진짜 센서 + 동일 DB 경로 + 출력**이다.

---

## 1. 웹 관제 —「테스트 살포 1건」버튼이 하는 일

- **전제**: 지도 우하단 **「내 위치 찾기」**를 켜 **실시간 GNSS**(브라우저 Geolocation)로 위치가 잡힌 상태.
- **「테스트 살포 1건」**을 누를 때마다:
  - **살포 이력**에 항목이 **1건** 추가됩니다.
  - **위치**: 그 순간의 **GNSS 위경도**(미세 난수 지터 포함 — 지도 점이 겹치지 않게).
  - **시각**: **금일 로컬 시각**이 `recordedAt`(타임스탬프)과 `time`(표시용 문자열)에 기록됩니다.
  - **라벨**: `투하-YYYY-MM-DD-01` 형태로, 같은 날·같은 GNSS 모드 세션에서 **누른 순서**가 2자리로 붙습니다. (「내 위치 찾기」를 끄면 순번은 다음에 켤 때 `01`부터 다시 시작. 예전 데이터는 `GNSS-`·`센서-` 접두사가 있을 수 있습니다.)
  - **지도**: 종자 살포 점(원)이 현재 위치 근처에 **하나씩** 쌓입니다.
  - **사이드바**「종자 살포 이력」에도 동일하게 나타납니다.
- **Supabase 연동**이 켜져 있으면(`marine-db` 사용), 같은 내용이 **`seed_drop_records`** 테이블에 `upsert` 됩니다. 관제의 주기 폴링으로 다른 탭·함정 화면과도 맞춰질 수 있습니다.

관련 코드: `src/app/Dashboard.tsx`의 `handleGpsTestSeedDrop`, 함정 `src/app/MobileDeckView.tsx`의 `recordManualSensorDrop`, `src/lib/marine-db.ts`의 `upsertSeedDropRecord`.

---

## 2. DB에 남기는 한 건의 의미 (필드 대응)

웹의 `SeedDrop` 한 건은 DB 행과 대략 다음처럼 대응합니다.

| 웹 (`SeedDrop`) | Supabase (`seed_drop_records` 개념) |
|-----------------|-------------------------------------|
| `id` | 고유 ID (문자열, 예: `1005`) |
| `label` | 화면·리포트용 라벨 (예: `투하-2026-05-12-01`, 구역 `A01` 등) |
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
   - 아두이노는 **Edge `telemetry-ingest`**(§7.1)에 장비 시크릿을 붙여 POST하는 방식이 이미 스케치에 맞춰져 있습니다. 동일 필드 의미의 JSON을 쓰면 됩니다(세부 URL·헤더는 배포 환경에서만 관리).

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

## 7. 센서 값 → 웹에서 “투하”로 보이기까지 (자동 버튼의 실제 의미)

현장에서는 “센서가 값을 주면 아두이노로 가고, 신호가 웹으로 가서 **투하 버튼이 자동으로 눌린다**”고 말하는 경우가 많습니다. **구현 관점**에서는 보통 아래 둘 중 하나입니다. (화면에서 DOM 버튼을 기계적으로 클릭하는 방식은 쓰지 않습니다.)

| 말하는 이미지 | 실제로 하는 일 |
|----------------|----------------|
| 투하 버튼이 자동으로 눌림 | 웹·서버 입장에서는 **`seed_drop_records`에 살포 1건이 추가**되고, 폴링·상태 갱신으로 지도에 점이 하나 더 찍히는 것과 동일 |
| 아두이노가 웹에 연결 | 브라우저 소켓에 직접 붙는 것이 아니라, **HTTPS로 Supabase Edge Function 등에 POST** 하고, 서버가 DB에 쓰는 형태가 일반적 |

### 7.1 경로 A — 아두이노·ESP32가 센서를 읽고 **망으로 바로 서버** (이 저장소 기본안)

**센서(스위치·펄스·ADC 등) → MCU → Wi‑Fi 또는 LTE → Supabase**

1. **센서**: 살포 1회를 나타내는 **디지털 에지 1번**(디바운스·최소 간격으로 1투하=1이벤트 고정).
2. **MCU**: 그 순간의 **GNSS 위경도**·(선택) 단말 시각을 묶어 JSON 본문 생성.
3. **서버**: Edge Function **`telemetry-ingest`**에 `DEVICE_INGEST_SECRET`을 헤더로 붙여 **HTTPS POST** → 내부에서 **`seed_drop_records` upsert** (구현: `supabase/functions/telemetry-ingest/index.ts`).
4. **웹**: 관제 `Dashboard`·함정 `/mobile`은 주기적으로 `fetchSeedDropRecords` 등으로 DB를 읽어 **지도 마커·금일 건수**를 갱신합니다. 사용자에게는 “투하가 반영됐다”와 동일한 체감입니다.

참고 스케치: `arduino/sketches/esp32-marine-telemetry/esp32_marine_telemetry.ino` — 주석에 **궤적은 `vessel-track-ingest`**, **살포 1건은 `telemetry-ingest`**로 나뉘어 있다고 명시되어 있습니다. **웹과 “직접 소켓 연결”할 항목**은 브라우저가 아니라 **배포된 Edge URL + 시크릿 + JSON 스키마**입니다.

### 7.2 경로 B — 블루투스로 **스마트폰**을 경유 (거치대·함정 폰)

**센서 → (거치대) MCU → BLE(또는 USB 시리얼) → 폰 앱·웹 → Supabase**

- **개념**: 물리 “투하”는 MCU가 알아채고, 폰은 **게이트웨이**로서 수신 후 **`upsertSeedDropRecord`와 동일한 API**로 한 줄을 올립니다. 화면의 「투하」버튼을 로봇이 누르는 것이 아니라, **버튼을 눌렀을 때와 같은 DB·필드 조합**을 코드로 한 번 호출하는 것입니다.
- **웹만(브라우저)**: [Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)는 **Chrome/Android 위주**, **iOS Safari는 미지원**입니다. iOS까지 필요하면 Capacitor·React Native 등 **네이티브 BLE** 쪽이 현실적입니다(제안: [블루투스-살포-거치대-연동-계획.md](../기획-연동-초안/블루투스-살포-거치대-연동-계획.md)).
- **살포 시작/중지**와 구분: 거치대 문서의 `0xA1`/`0xA2` 같은 바이트는 주로 **`ship_command_logs`** (`seed_start` / `seed_stop`) 파이프라인을 가리킵니다. **투하 1건**은 별도로 **`seed_drop_records`**(또는 동일 스키마의 ingest)로 올리는 설계가 맞습니다. 한 신호로 둘 다 하지 말고, **역할을 나누는 것**을 권장합니다.

### 7.3 경로 C — 개발·시연 (수동 “센서 시뮬”)

- **관제 대시보드**: GNSS 모드에서 **「테스트 살포 1건」** → `handleGpsTestSeedDrop` → `upsertSeedDropRecord` (코드: `src/app/Dashboard.tsx`).
- **함정 `/mobile`**: **「투하 (센서 시뮬)」** → 살포 중·위치 수신 전제 하에 동일하게 1건 적재·지도 표시 (코드: `src/app/MobileDeckView.tsx`의 `recordManualSensorDrop`).

운영 단말을 만들 때는 **경로 A 또는 B**로 같은 **DB 한 줄**이 생기게 맞추면, 관제·함정 화면은 추가 수정 없이 같은 방식으로 점이 찍힙니다.

### 7.4 “웹에 뭘 연결하면 되나?” 체크리스트

| 단계 | 할 일 |
|------|--------|
| 1 | Supabase에 `seed_drop_records` 테이블·RLS·연동 SQL 적용 (저장소 `scripts/sql/` 등 기존 절차). |
| 2 | Edge **`telemetry-ingest`** 배포, Secret **`DEVICE_INGEST_SECRET`** 설정. |
| 3 | MCU 펌웨어에 **Edge의 HTTPS URL** + **시크릿** + **JSON 필드**(`id`, `label`, `drop_time`, `lat`, `lng`, `status`, `recorded_at` 등 실제 함수 스펙에 맞게) 반영. |
| 4 | 웹 `.env`에 Supabase URL/anon 키·`VITE_SEED_DROP_POLL_MS` 등 설정 → 빌드 후 지도에서 **폴링 간격** 안에 점이 뜨는지 확인. |
| 5 | (BLE 경로) 폰 쪽에서 위 POST를 대신 호출할 **네이티브 또는 Web Bluetooth 수신 레이어** 구현 · 중복 SEQ 방지. |

---

## 8. 보안·운영 체크리스트

- [ ] 단말에 **Service Role 키를 넣지 않는다**.
- [ ] **HTTPS**만 사용한다.
- [ ] 장비별 **API 키 회전**·폐기 절차가 있다.
- [ ] 살포 **중복 전송**(재시도) 시 같은 `id`로 upsert할지, 멱등 키를 쓸지 정한다.
- [ ] 오프라인 버퍼(큐)와 **백오프 재전송**을 고려한다.

---

## 9. 요약

| 구분 | 내용 |
|------|------|
| 웹 테스트 | GNSS 모드에서 **버튼 1클릭 = 살포 1건** 기록, 금일 시각·좌표 반영 |
| 실제 단말 | **살포 1회 감지**마다 동일 스키마로 서버에 1건 적재 + **그 순간 GNSS** |
| 아두이노 역할 | 입력 디바운스, GNSS 읽기, **`telemetry-ingest` 등 안전한 ingest**로 HTTP POST |
| BLE·폰 경로 | 센서는 거치대 MCU가 보고, 폰은 **DB에 1건 쓰기**까지 담당 (브라우저 직결은 제약 많음) |
| 이 저장소 참고 | `Dashboard.tsx` (`handleGpsTestSeedDrop`), `MobileDeckView.tsx` (`recordManualSensorDrop`), `marine-db.ts` (`upsertSeedDropRecord`), `supabase/functions/telemetry-ingest/` |

추가로 **회로도·커넥터·전원·방수**는 선박 전장 설계 문서에서 다루고, 본 문서는 **소프트웨어·데이터 연계**에 초점을 맞춥니다.
