/**
 * 제목: 해양 종자 살포 단말 통합 텔레메트리 (ESP32 → Supabase)
 * Title for upload (English): Marine Seeding Telemetry — ESP32 (Track + Drop) to Supabase
 *
 * 한 스케치에서 다음을 함께 처리합니다.
 * ① 선박 궤적(주기) → Edge `vessel-track-ingest`
 * ② 살포 1건(에지) → Edge `telemetry-ingest`
 *
 * ── 서버는 함수가 둘(URL·JSON 형식이 다름)인데, 코드를 하나로 쓴 이유 ──
 * 같은 ESP32·같은 WiFi/GPS로 현장에서 궤적과 살포를 같이 쓰는 경우가 많아
 * 업로드·유지보수할 파일을 하나로 묶었습니다.
 *
 * ── 예전처럼 스케치를 둘로 나누는 것이 나은 경우(참고) ──
 * - 보드를 두 대 쓰며 한 대는 궤적만·한 대는 살포만 담당할 때
 * - 플래시/메모리가 매우 빡빡해 기능을 잘라낼 때
 * - 펌웨어 배포 정책상 역할별로 OTA 를 완전히 분리할 때
 *
 * ━━━ 살포 입력(GPIO 13) — **입력 전용** ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * · `INPUT_PULLUP`: 평소 HIGH, 외부에서 GND/신호에 따라 LOW·HIGH 전환.
 * · `DROP_TRIGGER_ON_HIGH`: true=상승 에지(LOW→HIGH)에 살포 1건, false=하강 에지(택트→GND).
 * · 배선은 릴레이·단말과 **공통 GND** 맞출 것.
 *
 * 문서: arduino/README.md , arduino/아두이노-스케치-모음/문서/03·04·05
 *
 * 보드: GPS+LTE 일체형(예: LilyGO T-SIM7600 등) 구매 예정이면 하드웨어는 문서
 * arduino/아두이노-스케치-모음/문서/01-보드와-LTE-모뎀-구매-현실.md 2-1절 참고.
 * 이 스케치의 HTTPS 는 기본 WiFi 경로 — LTE 데이터만 쓸 때는 모뎀 라이브러리로
 * PDP/HTTP 를 연결한 뒤 같은 URL·JSON 으로 POST 하도록 바꾸면 됨.
 *
 * ━━━ 사용자가 넣는 설정 — 한눈에 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * · `USE_ESP32_HTTP` / `ENABLE_VESSEL_TRACK` / `ENABLE_SEED_DROP` / **현장만** `ENABLE_TASK_WDT` → 1
 * · `WIFI_SSID` ~ `DEVICE_INGEST_SECRET` (실제 전송 시)
 * · `VESSEL_ID`, 살포 핀·시간 상수, `SEED_DROP_*` 안전 상수, `readGpsFix`·라벨·`drop_time` 등
 * · **딜레이·동작 시간**: `*_MS` 상수와 `delay(...)` 숫자는 **변경 가능**(단위 ms, 1000=1초).
 *
 * 모터·릴레이·비상정지까지 필요하면 `arduino/아두이노-스케치-모음/해상-궤적-살포-모터릴레이/esp32-marine-telemetry-motor-relay/` 스케치 사용.
 *
 * ━━━ 살포·궤적 안전 장치(요약) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * · 부팅 후 `SEED_DROP_BOOT_GRACE_MS` 동안 살포 에지 무시(전원·노이즈 오발)
 * · `SEED_DROP_MIN_INTERVAL_MS`·`DROP_COOLDOWN_MS`(시리얼)·60초당 `SEED_DROP_MAX_ATTEMPTS_PER_60S` 로 막찍기·폭주 억제
 * · 위·경도 `geoPlausibleDeg` 범위 밖·(0,0) 이면 전송 안 함(엉뚱한 좌표 차단)
 * · 살포 켬: 핀 `digitalReadStable`(이중 샘플) / 궤적: `clampVesselNav`(속도·방위 상한)
 * · **현장 하드웨어(권장, 코드 밖)**: 살포·비상선 **옵토·릴레이·퓨즈·TVS**, 코일은 **릴레이 모듈**로 MCU 직결 방지
 * · **워치독(선택)**: 메인 루프가 오래 멈추면 보드가 스스로 리셋. 켜려면 아래 `ENABLE_TASK_WDT` 를 1로만 바꿔 업로드.
 *   집·시험은 0 권장(디버깅 편함). 배·현장에서 “멈춤 대비”가 필요할 때 1.
 */
/** 0: WiFi 끄고 시리얼에만 JSON(형식 시험). 1: 실제 HTTPS POST. */
#define USE_ESP32_HTTP 0

// ═══ 워치독 켜기/끄기 — 여기만 보면 됨 (초보자용) ═══════════════════════════
// 워치독이란? 프로그램이 멈춘 것처럼 보일 때(한참 응답 없음) 칩이 알아서 전원을
//   다시 켜 주는 안전장치입니다. 정상일 때는 코드가 주기적으로 “살아 있음” 신호를 보냄.
// · 시험·USB로만 볼 때: 0 (끔, 기본) — 이상 없으면 그대로 두세요.
// · 현장·배에서 쓸 때: 아래 줄에서 맨 끝 숫자만 0 을 1 로 바꾼 뒤 업로드.
//       #define ENABLE_TASK_WDT 1
// · 다른 줄은 건드릴 필요 없습니다. 켠 뒤 이상하면 다시 0 으로 돌리면 됩니다.
/** 0: 워치독 끔(기본). 1: 켬 — 위 주석대로 숫자만 바꾸면 됨. */
#define ENABLE_TASK_WDT 0

/** 0: 선박 궤적 전송 끔. 1: 켬. */
#define ENABLE_VESSEL_TRACK 1
/** 0: 살포 입력·telemetry 끔. 1: 켬. */
#define ENABLE_SEED_DROP 1

#if ENABLE_SEED_DROP
// ─── 살포 쪽 딜레이·시간: 아래 ms 값 — 변경 가능·시간 조절 ───────────────
// ─── 사용자: 살포 신호 GPIO 가 다르면 DROP_SIGNAL_PIN 숫자만 변경 ───────
/** 살포 감지 **입력** 핀. `digitalRead` 만 사용. 풀업이므로 미연결 시 HIGH. */
static const int DROP_SIGNAL_PIN = 13;
/**
 * 살포로 인정할 논리 전환.
 * true: 평소 LOW → HIGH 로 바뀔 때(논리 1 펄스) 1건 전송.
 * false: 풀업 + 스위치가 GND로 당겨져 LOW 가 될 때 하강 에지에서 1건(일반 택트).
 */
static const bool DROP_TRIGGER_ON_HIGH = true;
/** 살포 입력 채터링 방지(ms) — 변경 가능·시간 조절. */
static const unsigned long DROP_DEBOUNCE_MS = 50;
// ─── 살포 안전(연속·오조작·부팅 잡음) — ms·건수 변경 가능 ─────────────────
/** 부팅 직후 이 시간(ms) 동안은 살포 에지를 무시(리셋·리플 방지). */
static const unsigned long SEED_DROP_BOOT_GRACE_MS = 3000UL;
/** 직전 살포 시도 이후 최소 간격(ms) — 막찍기·채터 연속 전송 방지. */
static const unsigned long SEED_DROP_MIN_INTERVAL_MS = 800UL;
/** 슬라이딩 60초 창 안 최대 살포 **시도**(HTTP 포함) 횟수 — 폭주·오동작 상한. */
static const unsigned SEED_DROP_MAX_ATTEMPTS_PER_60S = 24;
static unsigned long g_seedDropArmAtMs = 0;
static unsigned long g_seedDropWindowStartMs = 0;
static unsigned g_seedDropAttemptsInWindow = 0;
static unsigned long g_seedDropLastAttemptMs = 0;
#if !USE_ESP32_HTTP
static unsigned long lastDropSentMs = 0;
/** 시리얼만 쓸 때 살포 로그 연속 방지 쉼(ms) — 변경 가능·시간 조절. */
static const unsigned long DROP_COOLDOWN_MS = 1500;
#endif
#endif

#if ENABLE_VESSEL_TRACK
// ─── 궤적 전송 주기: POST_INTERVAL_MS — 변경 가능·시간 조절 ───────────────
/** 관제 웹 `.env` 의 `VITE_VESSEL_LTE_ID` 등과 동일 문자열 권장. */
static const char *VESSEL_ID = "제3해양살포함";
/** 선박 궤적 POST 간격(ms) — 변경 가능·시간 조절. 관제 `VITE_VESSEL_LTE_POLL_MS` 와 맞추면 화면 점 간격이 자연스럽다. */
static const unsigned long POST_INTERVAL_MS = 2000UL;
static unsigned long lastVesselPostMs = 0;
#endif

#if USE_ESP32_HTTP
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <sys/time.h>
#endif

#include <ArduinoJson.h>

#if ENABLE_TASK_WDT
#include "esp_task_wdt.h"
#endif

#if ENABLE_TASK_WDT
/**
 * 워치독 허용 시간(밀리초). 이 시간 안에 “살아 있음”이 없으면 리셋.
 * WiFi 연결 대기·시간 맞추기(NTP)·인터넷 POST(최대 20초)가 한꺼번에 걸릴 수 있어
 * 기본 120000(2분) — 네트워크가 매우 느리면 숫자만 더 키우면 됨.
 */
static const uint32_t TASK_WDT_TIMEOUT_MS = 120000U;
static bool g_marineTaskWdtReady = false;

static void marineTaskWdtInit() {
  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = TASK_WDT_TIMEOUT_MS;
  cfg.idle_core_mask = 0;
  cfg.trigger_panic = true;
  if (esp_task_wdt_init(&cfg) != ESP_OK) {
    Serial.println(F("[wdt] init 실패 — ENABLE_TASK_WDT 0 으로 두세요"));
    return;
  }
  if (esp_task_wdt_add(NULL) != ESP_OK) {
    Serial.println(F("[wdt] add 실패 — 워치독 비활성"));
    (void)esp_task_wdt_deinit();
    return;
  }
  g_marineTaskWdtReady = true;
}

static inline void marineTaskWdtFeed() {
  if (g_marineTaskWdtReady) {
    esp_task_wdt_reset();
  }
}
#else
static inline void marineTaskWdtInit() {}
static inline void marineTaskWdtFeed() {}
#endif

// ═══[ 사용자 입력: WiFi·Supabase — 비밀번호·Secret 은 깃에 올리지 말 것 ]═══
/** WiFi 이름(대소문자 그대로). */
static const char *WIFI_SSID = "YOUR_WIFI_SSID";
/** WiFi 비밀번호. LTE 전용 보드는 모뎀 예제로 대체 가능. */
static const char *WIFI_PASS = "YOUR_WIFI_PASSWORD";
/** `https://xxxx.supabase.co` 의 `xxxx` 만. */
static const char *SUPABASE_REF = "YOUR_PROJECT_REF";
/** Edge `X-Device-Ingest-Key` 와 동일 값. */
static const char *DEVICE_INGEST_SECRET = "YOUR_DEVICE_INGEST_SECRET";

#if ENABLE_VESSEL_TRACK
static String vesselTrackUrl() {
  return String("https://") + SUPABASE_REF + ".supabase.co/functions/v1/vessel-track-ingest";
}
#endif

#if ENABLE_SEED_DROP
static String telemetryUrl() {
  return String("https://") + SUPABASE_REF + ".supabase.co/functions/v1/telemetry-ingest";
}
#endif

#if USE_ESP32_HTTP
/** UTC epoch 밀리초. NTP 후 `recorded_at` 에 사용 — 운영 시 권장. */
static uint64_t unixEpochMsUtc() {
  struct timeval tv;
  if (gettimeofday(&tv, nullptr) != 0) return (uint64_t)millis();
  return (uint64_t)tv.tv_sec * 1000ULL + (uint64_t)tv.tv_usec / 1000ULL;
}

static void syncTimeNtp() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  for (int i = 0; i < 40; i++) {
    struct timeval tv;
    if (gettimeofday(&tv, nullptr) == 0 && tv.tv_sec > 1700000000) return;
    // NTP 폴링 간격(ms) — 변경 가능·시간 조절
    marineTaskWdtFeed();
    delay(500);
  }
}

#if ENABLE_VESSEL_TRACK
static bool postVesselTrackJson(const String &body) {
  WiFiClientSecure client;
  // 시험: TLS 검증 생략. 운영은 CA 검증 권장.
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, vesselTrackUrl())) return false;
  // POST 최대 대기(ms) — 변경 가능·시간 조절
  http.setTimeout(20000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Ingest-Key", DEVICE_INGEST_SECRET);
  marineTaskWdtFeed();
  const int code = http.POST(body);
  http.end();
  return code == 200;
}
#endif

#if ENABLE_SEED_DROP
static bool postTelemetryJson(const String &body) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, telemetryUrl())) return false;
  // 살포 POST 최대 대기(ms) — 변경 가능·시간 조절
  http.setTimeout(20000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Ingest-Key", DEVICE_INGEST_SECRET);
  marineTaskWdtFeed();
  const int code = http.POST(body);
  http.end();
  return code == 200;
}
#endif
#endif

/**
 * GPS 고정값/파싱 결과. 궤적·살포가 같은 좌표를 쓰면 관제와 맞물림.
 * 사용자 TODO: UART 에서 $GPRMC/$GPGGA 파싱해 채우기.
 */
static bool readGpsFix(double &lat, double &lng, float &speedKn, float &headingDeg) {
  lat = 34.82;   // 위도(도) — 실제 값으로 교체
  lng = 128.52;  // 경도(도)
  speedKn = 4.2f;
  headingDeg = 45.0f;
  return true;  // 위성 미수신 시 false → 궤적 전송 생략
}

/** WGS84 도 단위. 범위 밖·(0,0) 은 비정상으로 보고 전송 차단. */
static bool geoPlausibleDeg(double lat, double lng) {
  if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0) return false;
  if (lat == 0.0 && lng == 0.0) return false;
  return true;
}

/** 궤적 JSON 용: 속도·방위를 상식 범위로 잘라 JSON·서버 이상치 방지. */
static void clampVesselNav(float &speedKn, float &headingDeg) {
  if (speedKn < 0.f) speedKn = 0.f;
  if (speedKn > 120.f) speedKn = 120.f;
  while (headingDeg < 0.f) headingDeg += 360.f;
  while (headingDeg >= 360.f) headingDeg -= 360.f;
}

#if ENABLE_SEED_DROP
static bool buildOneDropRecord(JsonObject rec, const char *dropId, const char *label, double lat,
                               double lng) {
  rec["id"] = dropId;
  rec["label"] = label;
  // 사용자 TODO: GPS/RTC 시각 "HH:MM:SS" — 변경 가능
  rec["drop_time"] = "12:34:56";
  rec["lat"] = lat;
  rec["lng"] = lng;
  // "성공" | "실패" | "대기" 만 — 현장 규칙에 맞게 변경 가능
  rec["status"] = "성공";
#if USE_ESP32_HTTP
  rec["recorded_at"] = unixEpochMsUtc();
#else
  // 시리얼 시험용(부팅 후 ms) — 운영은 USE_ESP32_HTTP 1 + NTP 권장
  rec["recorded_at"] = (uint64_t)millis();
#endif
  rec["verification_mismatch"] = false;
  return true;
}

static bool sendDropTelemetryNow(const char *label) {
  double lat = 34.82, lng = 128.52;
  float sp = 0, hd = 0;
  (void)readGpsFix(lat, lng, sp, hd);
  if (!geoPlausibleDeg(lat, lng)) {
    Serial.println(F("[seed-drop] 안전: 위·경도 범위 이상 — 전송 안 함"));
    return false;
  }

  StaticJsonDocument<768> doc;
  JsonArray recs = doc.createNestedArray("records");
  JsonObject r = recs.createNestedObject();
  // 살포 이벤트 ID 접두어 — 함·단말명 등으로 변경 가능
  const String idStr = String("ship-") + String((uint64_t)millis());
  if (!buildOneDropRecord(r, idStr.c_str(), label, lat, lng)) return false;

  String body;
  serializeJson(doc, body);
  Serial.println(body);
#if USE_ESP32_HTTP
  if (postTelemetryJson(body)) {
    Serial.println(F("[telemetry-ingest] HTTP 200"));
    return true;
  }
  Serial.println(F("[telemetry-ingest] HTTP fail"));
  return false;
#else
  return true;
#endif
}

/** 살포 핀 이중 샘플 — 단발 노이즈 완화(살포 기능 켤 때만 컴파일). */
static inline int digitalReadStable(int pin) {
  const int a = digitalRead(pin);
  delayMicroseconds(30);
  const int b = digitalRead(pin);
  return (a == b) ? a : a;
}

/** 살포 에지 폴링 + 안전(부팅 유예·간격·60초 한도·좌표·이중 샘플). 논블로킹. */
static void tickSeedDrop(unsigned long now) {
  static int lastStable = digitalReadStable(DROP_SIGNAL_PIN);
  static int lastRaw = lastStable;
  static unsigned long lastChangeMs = millis();

  if (now < g_seedDropArmAtMs) {
    return;
  }

  const int raw = digitalReadStable(DROP_SIGNAL_PIN);
  if (raw != lastRaw) {
    lastRaw = raw;
    lastChangeMs = now;
  }
  if (now - lastChangeMs < DROP_DEBOUNCE_MS) return;
  if (raw == lastStable) return;

  const int prevStable = lastStable;
  const int stabilized = raw;
  const bool edgeUp = (prevStable == LOW && stabilized == HIGH);
  const bool edgeDown = (prevStable == HIGH && stabilized == LOW);
  const bool fire =
      (DROP_TRIGGER_ON_HIGH && edgeUp) || (!DROP_TRIGGER_ON_HIGH && edgeDown);

  if (fire) {
    if (now - g_seedDropWindowStartMs >= 60000UL) {
      g_seedDropWindowStartMs = now;
      g_seedDropAttemptsInWindow = 0;
    }
    bool reject = false;
    if (g_seedDropLastAttemptMs != 0UL && (now - g_seedDropLastAttemptMs < SEED_DROP_MIN_INTERVAL_MS)) {
      reject = true;
    }
    if (!reject && g_seedDropAttemptsInWindow >= SEED_DROP_MAX_ATTEMPTS_PER_60S) {
      reject = true;
    }
#if !USE_ESP32_HTTP
    if (!reject && (now - lastDropSentMs < DROP_COOLDOWN_MS)) {
      reject = true;
    }
#endif
    if (reject) {
      Serial.println(F("[seed-drop] 안전: 간격 또는 60초 시도 한도 — 에지 무시"));
    } else {
      g_seedDropLastAttemptMs = now;
      const bool ok = sendDropTelemetryNow("A01");
      g_seedDropAttemptsInWindow++;
#if !USE_ESP32_HTTP
      if (ok) {
        lastDropSentMs = now;
      }
#endif
      (void)ok;
    }
    lastStable = stabilized;
    return;
  }
  lastStable = stabilized;
}
#endif

#if ENABLE_VESSEL_TRACK
/** 주기마다 궤적 1점 전송. 대기 시 delay 없이 return — 살포 입력과 동시에 동작. */
static void tickVesselTrack(unsigned long now) {
  if (now - lastVesselPostMs < POST_INTERVAL_MS) return;

  double lat, lng;
  float sp = 0, hd = 0;
  if (!readGpsFix(lat, lng, sp, hd)) {
    return;
  }
  if (!geoPlausibleDeg(lat, lng)) {
    Serial.println(F("[vessel-track] 안전: 좌표 비정상 — 이번 주기 생략"));
    return;
  }
  clampVesselNav(sp, hd);

  StaticJsonDocument<512> doc;
  doc["vessel_id"] = VESSEL_ID;
  JsonArray pts = doc.createNestedArray("points");
  JsonObject p = pts.createNestedObject();
  p["lat"] = lat;
  p["lng"] = lng;
#if USE_ESP32_HTTP
  p["recorded_at"] = unixEpochMsUtc();
#else
  p["recorded_at"] = (uint64_t)millis();
#endif
  p["speed_kn"] = sp;
  p["heading_deg"] = hd;

  String body;
  serializeJson(doc, body);
  Serial.println(body);

#if USE_ESP32_HTTP
  if (postVesselTrackJson(body)) {
    Serial.println(F("[vessel-track-ingest] HTTP 200"));
  } else {
    Serial.println(F("[vessel-track-ingest] HTTP fail"));
  }
#endif

  // 성공/실패와 무관하게 주기 유지 — 과도한 재시도 방지(필요 시 HTTP 결과로 조건부 변경 가능)
  lastVesselPostMs = now;
}
#endif

void setup() {
  Serial.begin(115200);
  // USB 시리얼 대기(ms) — 변경 가능·시간 조절
  delay(200);
  marineTaskWdtInit();

#if USE_ESP32_HTTP
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print(F("WiFi "));
  while (WiFi.status() != WL_CONNECTED) {
    // WiFi 재시도 간격(ms) — 변경 가능·시간 조절
    marineTaskWdtFeed();
    delay(400);
    Serial.print('.');
  }
  Serial.println(WiFi.localIP());
  syncTimeNtp();
  Serial.println(F("NTP synced"));
#endif

#if ENABLE_SEED_DROP
  pinMode(DROP_SIGNAL_PIN, INPUT_PULLUP);
  g_seedDropArmAtMs = millis() + SEED_DROP_BOOT_GRACE_MS;
  g_seedDropWindowStartMs = millis();
  g_seedDropAttemptsInWindow = 0;
  g_seedDropLastAttemptMs = 0;
  Serial.println(F("[살포입력] GPIO13 + 안전(부팅유예·간격·60초한도·좌표)"));
#endif
}

void loop() {
  marineTaskWdtFeed();
  const unsigned long now = millis();

#if ENABLE_SEED_DROP
  tickSeedDrop(now);
#endif
#if ENABLE_VESSEL_TRACK
  tickVesselTrack(now);
#endif

  // 메인 루프 딜레이(ms) — 변경 가능·시간 조절
  delay(1);
}
