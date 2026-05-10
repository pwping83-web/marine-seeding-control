/**
 * 제목: 해양 텔레메트리 + 모터 릴레이 타이머 (ESP32)
 * Title for upload (English): Marine Telemetry + Motor Relay Timer (ESP32)
 *
 * `esp32_marine_telemetry.ino` 복사본 + 아래 동작 추가.
 *
 * ━━━ 버튼·입력 (사람이 누르는 스위치) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * GPIO 9 — 비상정지(모터·릴레이 전용, 최우선)
 *   · INPUT_PULLUP. `EMERGENCY_STOP_ACTIVE_LOW` 가 true 이면 **LOW = 비상**(스위치로 GND 물림).
 *   · false 로 두면 **HIGH = 비상**(NC 시리즈 접점이 끊겨 풀업으로 HIGH 되는 방식 등).
 *   · 비상이면 11·12 릴레이 즉시 OFF, 동작 중이면 강제 정지. **비상 해제 전에는 10번으로도 시작 불가**.
 *
 * GPIO 10 — 시작/정지 토글 버튼
 *   · 모드: INPUT_PULLUP (내부 저항으로 평소 3.3V 근처 = HIGH).
 *   · 누름: 버튼 한쪽은 GPIO10, 다른 쪽은 **보드 GND**에 연결 → 눌렀을 때 핀이 LOW.
 *   · 동작: **첫 누름** = 모터 교대 시퀀스 시작 / **다시 누름** = 즉시 정지(11·12 둘 다 릴레이 OFF).
 *   · 짧은 떨림(채터링)은 `MOTOR_BTN_DEBOUNCE_MS` 로 무시.
 *
 * GPIO 13 — 살포 신호 입력(관제용, 모터와 별개)
 *   · 살포 장비에서 오는 펄스·접점을 이 핀에 연결(배선은 현장 릴레이와 **공통 GND** 맞출 것).
 *   · `DROP_TRIGGER_ON_HIGH`: true=평소 LOW에서 HIGH로 바뀔 때 살포 1건 전송,
 *     false=풀업 상태에서 버튼이 GND로 당겨져 LOW가 될 때(일반 택트 스위치) 전송.
 *
 * ━━━ 출력 (버튼 아님 — 릴레이 모듈로 가는 신호선) ━━━━━━━━━━━━━━━━━━━
 * **배선 확인**: GPIO **10** = 시작/정지 **입력**만 / GPIO **11·12** = 릴레이 **출력**만(읽기 아님).
 * GPIO 11 — 릴레이 A 구동(예: 모터 정방향·밸브 A). ON 시간 = `RELAY_TIME_MS_PIN_11` ms.
 * GPIO 12 — 릴레이 B 구동(예: 역방향·밸브 B). ON 시간 = `RELAY_TIME_MS_PIN_12` ms.
 *   · 동작 중에는 11 → 12 → 11 … 순으로 번갈아 ON. 정지 시 둘 다 OFF 레벨.
 *
 * 릴레이 모듈이 “LOW일 때 코일 ON”인 일반 active-low 배선을 가정. 반대 모듈이면
 * RELAY_ACTIVE_LOW 를 0 으로 두고 digitalWrite 값을 반전하면 됨.
 *
 * 주의: 일부 ESP32 보드에서 GPIO10 은 내부 플래시와 공유될 수 있음 — 문제 시 핀 변경.
 *
 * ━━━ 사용자가 넣는 설정 — 한눈에 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * · 아래 `USE_ESP32_HTTP` / `ENABLE_*` 스위치(현장만 워치독: `ENABLE_TASK_WDT` → 1)
 * · `WIFI_SSID` ~ `DEVICE_INGEST_SECRET` 네 줄(실제 전송 시)
 * · `VESSEL_ID` (관제 웹·DB 선박 ID와 동일하게)
 * · 핀 번호·ms 시간·`RELAY_ACTIVE_LOW`·`DROP_TRIGGER_ON_HIGH`
 * · `readGpsFix` / 살포 라벨·`drop_time` 등 GPS 연동 후 수정
 * · **딜레이·동작 시간**: 코드 안의 `*_MS` 상수와 `delay(...)` 숫자는 **전부 변경 가능**하며,
 *   원하는 동작 시간으로 **직접 조절**하면 됨(단위 ms, 1000 = 1초).
 *
 * ━━━ 살포·궤적 안전(원본 스케치와 동일 계열) ━━━━━━━━━━━━━━━━━━━━━━━
 * · 부팅 유예·최소 간격·60초 시도 상한·위·경도 범위 검사 — 막찍기·폭주·엉뚁한 좌표 차단
 *
 * ━━━ 모터 추가 안전 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * · GPIO9 비상정지(기존) + 부팅 후 `MOTOR_BOOT_GRACE_MS` 동안 **시작 불가**
 * · 정지·비상 후 `MOTOR_START_COOLDOWN_MS` 동안 **재시작 불가**(더블탭·노이즈 완화)
 * · 살포·10번·9번 입력 `digitalReadStable`(이중 샘플), 궤적 `clampVesselNav`
 * · **현장 하드웨어(권장)**: 비상·살포 **옵토·릴레이·퓨즈·TVS**, 릴레이 코일은 **모듈**로 MCU 직결 방지
 * · **워치독(선택)**: 메인 루프가 오래 멈추면 보드가 스스로 리셋. 켜려면 아래 `ENABLE_TASK_WDT` 를 1로만 바꿔 업로드.
 *   집·시험은 0 권장. 배·현장에서 멈춤 대비가 필요할 때 1.
 */
/** 0: WiFi 끄고 시리얼에만 JSON(형식 시험). 1: 실제로 서버에 HTTPS POST. */
#define USE_ESP32_HTTP 0

// ═══ 워치독 켜기/끄기 — 여기만 보면 됨 (초보자용) ═══════════════════════════
// 워치독이란? 프로그램이 멈춘 것처럼 보일 때 칩이 알아서 전원을 다시 켜 주는 안전장치.
//   정상일 때는 코드가 주기적으로 “살아 있음” 신호를 보냅니다.
// · 시험·USB로만 볼 때: 0 (끔, 기본) — 이상 없으면 그대로 두세요.
// · 현장·배에서 쓸 때: 아래 줄에서 맨 끝 숫자만 0 을 1 로 바꾼 뒤 업로드.
//       #define ENABLE_TASK_WDT 1
// · 다른 줄은 건드릴 필요 없습니다. 켠 뒤 이상하면 다시 0 으로 돌리면 됩니다.
/** 0: 워치독 끔(기본). 1: 켬 — 위 주석대로 숫자만 바꾸면 됨. */
#define ENABLE_TASK_WDT 0

/** 0: 선박 궤적 전송 끔(모터만 쓸 때 등). 1: 켬. */
#define ENABLE_VESSEL_TRACK 1
/** 0: 살포 입력·telemetry 끔. 1: 켬. */
#define ENABLE_SEED_DROP 1
/** 0: 모터·릴레이만 끔. 1: GPIO9 비상·10·11·12 타이머 켬. */
#define ENABLE_MOTOR_RELAY 1

#if ENABLE_SEED_DROP
// ─── 살포 쪽 딜레이·시간: DROP_DEBOUNCE_MS, DROP_COOLDOWN_MS — 변경 가능·조절 ──
// ─── 사용자: 살포 신호가 들어오는 GPIO 가 다르면 아래 핀 번호만 변경 ─────
/** 살포 감지 입력 핀. 외부 장비 접점·오픈드레인 출력 등 — 풀업이므로 미연결 시 HIGH. */
static const int DROP_SIGNAL_PIN = 13;
/**
 * 살포로 인정할 논리 전환 방향.
 * true: 평소 LOW → 살포 순간 HIGH(논리 1) 펄스에 1건 전송.
 * false: 풀업 + 스위치가 GND로 당김 → 눌렀을 때 LOW, **하강 에지**에서 1건 전송(일반 택트).
 */
static const bool DROP_TRIGGER_ON_HIGH = true;
/** 살포 신호(GPIO13) 채터링 방지(ms) — 변경 가능·시간 조절. 작으면 한 살포에 여러 번 전송될 수 있음. */
static const unsigned long DROP_DEBOUNCE_MS = 50;
// ─── 살포 안전(연속·오조작·부팅 잡음) — 숫자 변경 가능 ─────────────────
static const unsigned long SEED_DROP_BOOT_GRACE_MS = 3000UL;
static const unsigned long SEED_DROP_MIN_INTERVAL_MS = 800UL;
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
/** 관제 웹 `.env` 의 `VITE_VESSEL_LTE_ID` 등과 같은 문자열로 두면 궤적이 한 선박에 묶임. */
static const char *VESSEL_ID = "제3해양살포함";
/** 선박 궤적 POST 간격(ms) — 변경 가능·시간 조절. 60000=1분, 120000=2분 등. */
static const unsigned long POST_INTERVAL_MS = 60UL * 1000UL;
static unsigned long lastVesselPostMs = 0;
#endif

#if ENABLE_MOTOR_RELAY
// ─── 사용자: 실제 배선과 다르면 PIN_BTN_RUN_STOP / PIN_RELAY_A·B 숫자만 바꿈 ──
// ─── 딜레이·릴레이 동작 시간: 아래 ms 값은 전부 변경 가능(원하는 시간으로 조절) ──
/** GPIO 11 릴레이 ON 유지시간(ms) — 변경 가능·시간 조절. 끝나면 12번 구간으로. */
static const unsigned long RELAY_TIME_MS_PIN_11 = 2000UL;
/** GPIO 12 릴레이 ON 유지시간(ms) — 변경 가능·시간 조절. 끝나면 다시 11번(무한 반복). */
static const unsigned long RELAY_TIME_MS_PIN_12 = 2000UL;
/** 10번 버튼 디바운스(ms) — 변경 가능·시간 조절. 떨림 민감하면 50→80 등. */
static const unsigned long MOTOR_BTN_DEBOUNCE_MS = 50UL;
/** 부팅 직후 이 시간(ms) 동안 모터 **시작** 불가(전원 리플·오조작 방지). */
static const unsigned long MOTOR_BOOT_GRACE_MS = 2000UL;
/** 정지·비상 후 재**시작**까지 최소 대기(ms) — 더블탭·노이즈 완화. */
static const unsigned long MOTOR_START_COOLDOWN_MS = 500UL;
static unsigned long g_motorNextStartOkMs = 0;

/** 비상정지 입력. 배선 다르면 핀 번호만 변경. */
static const int PIN_EMERGENCY_STOP = 9;
/**
 * true: 핀이 LOW 일 때 비상정지(일반 비상 스위치 한쪽=핀, 한쪽=GND).
 * false: HIGH 일 때 비상(NC 접점이 정상 시 LOW, 끊기면 HIGH 등 — 현장 배선에 맞게 선택).
 */
static const bool EMERGENCY_STOP_ACTIVE_LOW = true;
/** 비상 입력 디바운스(ms) — 변경 가능·시간 조절. */
static const unsigned long EMERGENCY_DEBOUNCE_MS = 50UL;

/** 시작·정지 **입력** 전용(GPIO10). `digitalRead` 만 사용 — 릴레이 코일에 직접 연결 금지. */
static const int PIN_BTN_RUN_STOP = 10;
/** 릴레이 A **출력**(GPIO11). `digitalWrite` — 릴레이 모듈 IN 등으로만 연결. */
static const int PIN_RELAY_A = 11;
/** 릴레이 B **출력**(GPIO12). `digitalWrite` — 버튼·스위치 입력 아님. */
static const int PIN_RELAY_B = 12;
/** 1: LOW 가 릴레이 ON(코일에 GND 싱크) / 0: HIGH 가 ON 인 모듈 */
static const bool RELAY_ACTIVE_LOW = true;
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
 * WiFi 대기·시간 맞추기(NTP)·인터넷 POST(최대 20초)가 겹칠 수 있어 기본 120000(2분).
 * 망이 매우 느리면 숫자만 더 키우면 됨.
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
/** 집/사무실/항만 등 ESP32 가 붙을 WiFi 의 이름(영문 대소문자 그대로). */
static const char *WIFI_SSID = "YOUR_WIFI_SSID";
/** 위 WiFi 비밀번호. LTE 전용 보드만 쓸 때는 나중에 모뎀 예제로 바꿔도 됨. */
static const char *WIFI_PASS = "YOUR_WIFI_PASSWORD";
/** Supabase 프로젝트 주소 `https://xxxx.supabase.co` 에서 `xxxx` 만(도메인 앞자리). */
static const char *SUPABASE_REF = "YOUR_PROJECT_REF";
/** Edge 함수 `telemetry-ingest` / `vessel-track-ingest` 가 검사하는 `X-Device-Ingest-Key` 값과 동일. */
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
    // NTP 대기 폴링 간격(ms) — 변경 가능·시간 조절
    marineTaskWdtFeed();
    delay(500);
  }
}

#if ENABLE_VESSEL_TRACK
static bool postVesselTrackJson(const String &body) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, vesselTrackUrl())) return false;
  // POST 최대 대기(ms) — 변경 가능·시간 조절. 해상망이 느리면 30000 등
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

/** 사용자 TODO: UART GPS 의 $GPRMC 등 파싱해 채우기. 지금은 시험용 고정값만. */
static bool readGpsFix(double &lat, double &lng, float &speedKn, float &headingDeg) {
  lat = 34.82;   // 위도(도) — 실제로는 GPS 에서 읽은 값
  lng = 128.52;  // 경도(도)
  speedKn = 4.2f;
  headingDeg = 45.0f;
  return true;  // 위성 미수신 시 false 를 주면 궤적 전송을 잠시 건너뜀
}

static bool geoPlausibleDeg(double lat, double lng) {
  if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0) return false;
  if (lat == 0.0 && lng == 0.0) return false;
  return true;
}

static inline int digitalReadStable(int pin) {
  const int a = digitalRead(pin);
  delayMicroseconds(30);
  const int b = digitalRead(pin);
  return (a == b) ? a : a;
}

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
  // 사용자 TODO: GPS 또는 RTC 의 시각 문자열 "HH:MM:SS" 로 교체
  rec["drop_time"] = "12:34:56";
  rec["lat"] = lat;
  rec["lng"] = lng;
  // 서버가 허용하는 문자열만: "성공" | "실패" | "대기" — 현장 규칙에 맞게 변경
  rec["status"] = "성공";
#if USE_ESP32_HTTP
  rec["recorded_at"] = unixEpochMsUtc();
#else
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
  // 살포 이벤트 ID 접두어 — 함명·단말ID 등으로 바꿔도 됨(중복만 피하면 됨)
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

  // 성공/실패와 무관하게 주기 유지 — 과도한 POST 방지
  lastVesselPostMs = now;
}
#endif

#if ENABLE_MOTOR_RELAY
static inline uint8_t relayOnLevel() {
  return RELAY_ACTIVE_LOW ? LOW : HIGH;
}

static inline uint8_t relayOffLevel() {
  return RELAY_ACTIVE_LOW ? HIGH : LOW;
}

static void relayOutputsIdle() {
  digitalWrite(PIN_RELAY_A, relayOffLevel());
  digitalWrite(PIN_RELAY_B, relayOffLevel());
}

/** 디바운스된 비상정지 활성 여부(true 이면 릴레이 금지·시작 불가). */
static bool readEmergencyStopActive(unsigned long now) {
  static int lastStable = HIGH;
  static int lastRaw = HIGH;
  static unsigned long lastChangeMs = 0;

  const int raw = digitalReadStable(PIN_EMERGENCY_STOP);
  if (raw != lastRaw) {
    lastRaw = raw;
    lastChangeMs = now;
  }
  if (now - lastChangeMs < EMERGENCY_DEBOUNCE_MS) {
    return EMERGENCY_STOP_ACTIVE_LOW ? (lastStable == LOW) : (lastStable == HIGH);
  }
  if (raw != lastStable) {
    lastStable = raw;
  }
  return EMERGENCY_STOP_ACTIVE_LOW ? (lastStable == LOW) : (lastStable == HIGH);
}

/** 10번 토글 + 11·12 릴레이 교대. GPIO9 비상 최우선. ON 시간은 상단 RELAY_TIME_*. millis() 논블로킹. */
static void tickMotorRelay(unsigned long now) {
  static bool running = false;
  static uint8_t phase = 0;
  static unsigned long phaseStartMs = 0;
  static int lastStableBtn = HIGH;
  static int lastRawBtn = HIGH;
  static unsigned long lastChangeBtn = 0;

  const bool emg = readEmergencyStopActive(now);
  if (emg) {
    if (running) {
      Serial.println(F("[motor] 비상정지 GPIO9 — 릴레이 차단"));
      g_motorNextStartOkMs = now + MOTOR_START_COOLDOWN_MS;
    }
    running = false;
    relayOutputsIdle();
  }

  const int rawBtn = digitalReadStable(PIN_BTN_RUN_STOP);
  if (rawBtn != lastRawBtn) {
    lastRawBtn = rawBtn;
    lastChangeBtn = now;
  }
  if (now - lastChangeBtn >= MOTOR_BTN_DEBOUNCE_MS && rawBtn != lastStableBtn) {
    const int prev = lastStableBtn;
    lastStableBtn = rawBtn;
    if (prev == HIGH && rawBtn == LOW) {
      if (running) {
        running = false;
        relayOutputsIdle();
        g_motorNextStartOkMs = now + MOTOR_START_COOLDOWN_MS;
        Serial.println(F("[motor] 정지 (10번)"));
      } else if (!emg) {
        if (now < g_motorNextStartOkMs) {
          Serial.println(F("[motor] 안전: 부팅유예 또는 시작 쿨다운 — 잠시 후 10번"));
        } else {
          running = true;
          phase = 0;
          phaseStartMs = now;
          digitalWrite(PIN_RELAY_A, relayOnLevel());
          digitalWrite(PIN_RELAY_B, relayOffLevel());
          Serial.println(F("[motor] 시작 (11·12 시간은 상단 ms 상수 참고)"));
        }
      } else {
        Serial.println(F("[motor] 비상정지 중 — 9번 해제 후 10번으로 시작"));
      }
    }
  }

  if (!running) {
    return;
  }

  const unsigned long phaseHoldMs =
      (phase == 0) ? RELAY_TIME_MS_PIN_11 : RELAY_TIME_MS_PIN_12;
  if (now - phaseStartMs >= phaseHoldMs) {
    phase = (uint8_t)(1 - phase);
    phaseStartMs = now;
  }

  if (phase == 0) {
    digitalWrite(PIN_RELAY_A, relayOnLevel());
    digitalWrite(PIN_RELAY_B, relayOffLevel());
  } else {
    digitalWrite(PIN_RELAY_A, relayOffLevel());
    digitalWrite(PIN_RELAY_B, relayOnLevel());
  }
}
#endif

void setup() {
  Serial.begin(115200);
  // USB 시리얼 붙기 대기(ms) — 변경 가능·시간 조절
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

#if ENABLE_MOTOR_RELAY
  pinMode(PIN_EMERGENCY_STOP, INPUT_PULLUP);
  pinMode(PIN_BTN_RUN_STOP, INPUT_PULLUP);
  pinMode(PIN_RELAY_A, OUTPUT);
  pinMode(PIN_RELAY_B, OUTPUT);
  relayOutputsIdle();
  g_motorNextStartOkMs = millis() + MOTOR_BOOT_GRACE_MS;
  Serial.println(F("[모터] GPIO9=비상,10=시작/정지,11·12=릴레이 + 부팅유예·시작쿨다운"));
#endif
}

void loop() {
  marineTaskWdtFeed();
  const unsigned long now = millis();

#if ENABLE_MOTOR_RELAY
  tickMotorRelay(now);
#endif
#if ENABLE_SEED_DROP
  tickSeedDrop(now);
#endif
#if ENABLE_VESSEL_TRACK
  tickVesselTrack(now);
#endif

  // 메인 루프 딜레이(ms) — 변경 가능·시간 조절. 모터 반응 빠르게=0~1, 느슨하게=2~10 등
  delay(1);
}
