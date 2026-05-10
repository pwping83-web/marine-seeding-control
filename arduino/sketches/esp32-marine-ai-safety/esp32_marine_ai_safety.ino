/**
 * 제목: 해양 AI 안전 시스템 (ESP32) — 긴급 회항 명령 수신 + 사이렌 릴레이 + SOS 버튼
 * Title (English): Marine AI Safety — Emergency Return Receiver + Siren Relay + SOS Button
 *
 * ━━━ 이 스케치가 하는 일 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 1. 관제탑(웹 `Dashboard`)에서 저장한 `cmd` 문자열(예: emergency_return, siren_on, siren_off)을
 *    Supabase `ship_command_logs` 에서 `CMD_POLL_INTERVAL_MS` 마다 폴링 → 수신 시
 *    GPIO14 릴레이 ON → 물리 사이렌(부저) 울림
 *
 * 2. 선박 내 SOS 버튼(GPIO15) 눌림 → 관제 웹 DB에 sos_vessel 명령 기록
 *    → 관제 패널 실시간 알람 표시
 *
 * 3. 기존 기능(궤적·살포·모터 릴레이) 은 기존 스케치에서 유지.
 *    이 스케치는 AI 안전 기능만 추가한 독립 스케치(병행 사용 가능).
 *
 * ━━━ 핀 배치 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * GPIO 14 — 사이렌(부저) 릴레이 출력
 *   · 릴레이 IN 핀에 연결. 사이렌 전원은 별도 DC 라인에서.
 *   · SIREN_ACTIVE_LOW=true → LOW 신호로 릴레이 코일 ON(일반 모듈).
 *
 * GPIO 15 — SOS 버튼 입력 (선박 → 관제탑)
 *   · INPUT_PULLUP. 버튼 한쪽=GPIO15, 다른쪽=GND.
 *   · 누르면 LOW → Supabase에 sos_vessel 기록.
 *
 * GPIO 16 — 수신 확인 LED (선택)
 *   · 명령 수신 + 처리 완료 시 1초 점등.
 *
 * ━━━ 사용자 설정 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * · WIFI_SSID / WIFI_PASS / SUPABASE_REF / DEVICE_INGEST_SECRET
 * · VESSEL_ID — 관제 웹·DB vessel_id/vessel 칼럼과 동일 값
 * · 사이렌 지속시간: SIREN_AUTO_OFF_MS (기본 30초, 0=수동해제만)
 * · 폴링 주기: CMD_POLL_INTERVAL_MS (기본 30초)
 *
 * ━━━ 라이브러리 (Arduino IDE 라이브러리 매니저) ━━━━━━━━━━━━━━━━━━
 * · ArduinoJson (Benoit Blanchon)
 * · Arduino_JSON 아님 — 반드시 "ArduinoJson" 검색
 *
 * ━━━ 보안 주의 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * WiFi 비밀번호·Supabase 키를 깃허브에 올리지 마세요.
 * 배포 전 secrets.h 분리 또는 NVS 암호화 저장 권장.
 */

// ═══ 기능 스위치 ══════════════════════════════════════════════════════════════
/** 0: WiFi 끄고 시리얼에만(형식 시험). 1: 실제 Supabase POST/GET. */
#define USE_ESP32_HTTP 0
/** 0: 사이렌 릴레이 끔. 1: GPIO14 사이렌 켬. */
#define ENABLE_SIREN_RELAY 1
/** 0: SOS 버튼 끔. 1: GPIO15 → Supabase sos_vessel 기록. */
#define ENABLE_SOS_BTN 1
/** 0: LED 끔. 1: GPIO16 수신 확인 LED. */
#define ENABLE_ACK_LED 1

// ═══ 사용자 설정 ══════════════════════════════════════════════════════════════
static const char *WIFI_SSID            = "YOUR_WIFI_SSID";
static const char *WIFI_PASS            = "YOUR_WIFI_PASSWORD";
/** Supabase 프로젝트 REF (xxxx.supabase.co 의 xxxx 부분). */
static const char *SUPABASE_REF         = "YOUR_PROJECT_REF";
/** 관제 웹 .env 의 DEVICE_INGEST_SECRET 값과 동일. */
static const char *DEVICE_INGEST_SECRET = "YOUR_DEVICE_INGEST_SECRET";
/** 관제 웹·DB vessel_id 칼럼 값과 동일. */
static const char *VESSEL_ID            = "제3해양살포함";

/** 명령 폴링 주기(ms). 30초. */
static const unsigned long CMD_POLL_INTERVAL_MS = 30UL * 1000UL;
/** 사이렌 자동 OFF까지 시간(ms). 0=수동 해제까지 계속. */
static const unsigned long SIREN_AUTO_OFF_MS    = 30UL * 1000UL;
/** SOS 버튼 채터링 방지(ms). */
static const unsigned long SOS_DEBOUNCE_MS      = 100UL;
/** SOS 쿨다운: 이 시간 안에 두 번 보내지 않음(ms). */
static const unsigned long SOS_COOLDOWN_MS      = 10UL * 1000UL;

// ═══ 핀 정의 ══════════════════════════════════════════════════════════════════
#if ENABLE_SIREN_RELAY
/** 사이렌 릴레이 출력 핀. */
static const int PIN_SIREN_RELAY = 14;
/** true: LOW 가 릴레이 ON(코일 GND 싱크). false: HIGH 가 ON. */
static const bool SIREN_ACTIVE_LOW = true;
#endif

#if ENABLE_SOS_BTN
/** SOS 버튼 입력 핀. INPUT_PULLUP. */
static const int PIN_SOS_BTN = 15;
#endif

#if ENABLE_ACK_LED
/** 수신 확인 LED 핀. */
static const int PIN_ACK_LED = 16;
#endif

// ═══ 라이브러리 ════════════════════════════════════════════════════════════════
#include <ArduinoJson.h>

#if USE_ESP32_HTTP
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <sys/time.h>
#endif

// ═══ 상태 변수 ════════════════════════════════════════════════════════════════
#if ENABLE_SIREN_RELAY
static bool     g_sirenOn        = false;
static unsigned long g_sirenOnMs = 0;
#endif

static unsigned long g_lastCmdPollMs   = 0;
static String   g_lastProcessedCmdId   = "";   // 중복 처리 방지

#if ENABLE_SOS_BTN
static int      g_sosBtnStable         = HIGH;
static int      g_sosBtnRaw            = HIGH;
static unsigned long g_sosBtnChangeMs  = 0;
static unsigned long g_sosLastSentMs   = 0;
#endif

// ═══ 유틸리티 함수 ════════════════════════════════════════════════════════════
static inline int digitalReadStable(int pin) {
  const int a = digitalRead(pin);
  delayMicroseconds(30);
  const int b = digitalRead(pin);
  return (a == b) ? a : a;
}

#if USE_ESP32_HTTP
static String supabaseUrl(const char *path) {
  return String("https://") + SUPABASE_REF + ".supabase.co" + path;
}

/** Supabase REST GET (JSON 결과 반환. 실패 시 빈 String). */
static String supabaseGet(const char *path, const char *query = "") {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = supabaseUrl(path);
  if (strlen(query) > 0) { url += "?"; url += query; }
  if (!http.begin(client, url)) return "";
  http.setTimeout(15000);
  http.addHeader("apikey",        DEVICE_INGEST_SECRET);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_INGEST_SECRET);
  const int code = http.GET();
  String body = (code == 200) ? http.getString() : "";
  http.end();
  return body;
}

/** Supabase REST POST. */
static bool supabasePost(const char *path, const String &body) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, supabaseUrl(path))) return false;
  http.setTimeout(15000);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        DEVICE_INGEST_SECRET);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_INGEST_SECRET);
  http.addHeader("Prefer",        "return=minimal");
  const int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}
#endif

// ═══ 사이렌 제어 ══════════════════════════════════════════════════════════════
#if ENABLE_SIREN_RELAY
static inline uint8_t sirenOnLevel()  { return SIREN_ACTIVE_LOW ? LOW  : HIGH; }
static inline uint8_t sirenOffLevel() { return SIREN_ACTIVE_LOW ? HIGH : LOW;  }

static void sirenStart(unsigned long now) {
  if (g_sirenOn) return;
  g_sirenOn    = true;
  g_sirenOnMs  = now;
  digitalWrite(PIN_SIREN_RELAY, sirenOnLevel());
  Serial.println(F("[SIREN] ON — 긴급 회항 사이렌 작동"));
}

static void sirenStop() {
  if (!g_sirenOn) return;
  g_sirenOn = false;
  digitalWrite(PIN_SIREN_RELAY, sirenOffLevel());
  Serial.println(F("[SIREN] OFF"));
}

static void tickSiren(unsigned long now) {
  if (!g_sirenOn) return;
  if (SIREN_AUTO_OFF_MS > 0 && now - g_sirenOnMs >= SIREN_AUTO_OFF_MS) {
    sirenStop();
  }
}
#endif

// ═══ 관제 명령 폴링 ════════════════════════════════════════════════════════════
/**
 * Supabase ship_command_logs 에서 최신 미확인 명령을 가져와 처리.
 * 명령: emergency_return, siren_on, siren_off
 */
static void pollCommands(unsigned long now) {
  if (now - g_lastCmdPollMs < CMD_POLL_INTERVAL_MS) return;
  g_lastCmdPollMs = now;

  Serial.println(F("[CMD] 폴링 시작…"));

#if USE_ESP32_HTTP
  // ship_command_logs 에서 vessel_id=VESSEL_ID, ack=false 최신 1건
  String q = String("vessel_id=eq.") + VESSEL_ID +
             "&ack=eq.false&order=sent_time.desc&limit=1";
  String body = supabaseGet("/rest/v1/ship_command_logs", q.c_str());
  if (body.length() == 0) {
    Serial.println(F("[CMD] 응답 없음 또는 빈 배열"));
    return;
  }

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    Serial.println(F("[CMD] JSON 파싱 실패"));
    return;
  }
  JsonArray arr = doc.as<JsonArray>();
  if (arr.size() == 0) {
    Serial.println(F("[CMD] 미처리 명령 없음"));
    return;
  }

  const char *cmdId  = arr[0]["id"]  | "";
  const char *cmd    = arr[0]["cmd"] | "";

  if (String(cmdId) == g_lastProcessedCmdId) {
    Serial.println(F("[CMD] 이미 처리된 명령 — 건너뜀"));
    return;
  }
  g_lastProcessedCmdId = String(cmdId);

  Serial.print(F("[CMD] 수신: "));
  Serial.println(cmd);
#else
  // 시리얼 시험 모드: "emergency_return" 시뮬레이션 (30초마다 한 번)
  static int mockCount = 0;
  const char *cmd = (mockCount++ % 3 == 0) ? "emergency_return" : "none";
  Serial.print(F("[CMD-SIM] "));
  Serial.println(cmd);
#endif

  // ─── 명령 실행 ─────────────────────────────────────────────────────────
  const String cmdStr(cmd);

  if (cmdStr == "emergency_return" || cmdStr == "siren_on") {
#if ENABLE_SIREN_RELAY
    sirenStart(now);
#endif
#if ENABLE_ACK_LED
    digitalWrite(PIN_ACK_LED, HIGH);
    delay(1000);
    digitalWrite(PIN_ACK_LED, LOW);
#endif

#if USE_ESP32_HTTP
    // ack 업데이트
    StaticJsonDocument<64> upd;
    upd["ack"] = true;
    String updBody;
    serializeJson(upd, updBody);
    String patchPath = String("/rest/v1/ship_command_logs?id=eq.") + cmdId;
    // Supabase REST PATCH
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;
    if (http.begin(client, supabaseUrl(patchPath.c_str()))) {
      http.setTimeout(10000);
      http.addHeader("Content-Type",  "application/json");
      http.addHeader("apikey",        DEVICE_INGEST_SECRET);
      http.addHeader("Authorization", String("Bearer ") + DEVICE_INGEST_SECRET);
      http.addHeader("Prefer",        "return=minimal");
      http.sendRequest("PATCH", updBody);
      http.end();
    }
#endif

  } else if (cmdStr == "siren_off") {
#if ENABLE_SIREN_RELAY
    sirenStop();
#endif
  }
}

// ═══ SOS 버튼 (선박 → 관제탑) ═════════════════════════════════════════════════
#if ENABLE_SOS_BTN
static void tickSosBtn(unsigned long now) {
  const int raw = digitalReadStable(PIN_SOS_BTN);
  if (raw != g_sosBtnRaw) {
    g_sosBtnRaw = raw;
    g_sosBtnChangeMs = now;
  }
  if (now - g_sosBtnChangeMs < SOS_DEBOUNCE_MS) return;
  if (raw == g_sosBtnStable) return;

  const int prev = g_sosBtnStable;
  g_sosBtnStable = raw;

  // 하강 에지(누름)
  if (prev == HIGH && raw == LOW) {
    if (g_sosLastSentMs != 0 && now - g_sosLastSentMs < SOS_COOLDOWN_MS) {
      Serial.println(F("[SOS] 쿨다운 중 — 무시"));
      return;
    }
    g_sosLastSentMs = now;
    Serial.println(F("[SOS] 버튼 눌림 → 관제탑 전송"));

#if USE_ESP32_HTTP
    StaticJsonDocument<256> doc;
    String sosId = String("sos-") + String((uint32_t)now);
    doc["id"]        = sosId;
    doc["vessel_id"] = VESSEL_ID;
    doc["cmd"]       = "sos_vessel";
    doc["ack"]       = false;
    // sent_time 은 서버 defaultValueExpression 으로 채워도 됨
    String body;
    serializeJson(doc, body);
    if (supabasePost("/rest/v1/ship_command_logs", body)) {
      Serial.println(F("[SOS] 전송 성공"));
    } else {
      Serial.println(F("[SOS] 전송 실패"));
    }
#else
    Serial.println(F("[SOS-SIM] ship_command_logs 에 sos_vessel 기록 (시리얼 모드)"));
#endif
  }
}
#endif

// ═══ setup / loop ═════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(200);

#if ENABLE_SIREN_RELAY
  pinMode(PIN_SIREN_RELAY, OUTPUT);
  digitalWrite(PIN_SIREN_RELAY, sirenOffLevel());
  Serial.println(F("[SIREN] GPIO14 초기화 — 꺼짐"));
#endif

#if ENABLE_SOS_BTN
  pinMode(PIN_SOS_BTN, INPUT_PULLUP);
  Serial.println(F("[SOS] GPIO15 INPUT_PULLUP 초기화"));
#endif

#if ENABLE_ACK_LED
  pinMode(PIN_ACK_LED, OUTPUT);
  digitalWrite(PIN_ACK_LED, LOW);
#endif

#if USE_ESP32_HTTP
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print(F("WiFi 연결 중"));
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry++ < 40) {
    delay(500);
    Serial.print('.');
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print(F("연결됨: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("\nWiFi 연결 실패 — 오프라인 모드"));
  }
#else
  Serial.println(F("=== 시리얼 시험 모드 (USE_ESP32_HTTP=0) ==="));
  Serial.println(F("Supabase 연결 없음. 시리얼 모니터로 동작 확인."));
#endif

  // 부팅 직후 첫 폴링 강제 실행을 위해 타이머를 한참 전 값으로
  g_lastCmdPollMs = millis() - CMD_POLL_INTERVAL_MS;
  Serial.println(F("=== AI 안전 시스템 준비 완료 ==="));
}

void loop() {
  const unsigned long now = millis();

  // 관제탑 → 선박 명령 폴링
  pollCommands(now);

  // 사이렌 자동 OFF 타이머
#if ENABLE_SIREN_RELAY
  tickSiren(now);
#endif

  // SOS 버튼 감지
#if ENABLE_SOS_BTN
  tickSosBtn(now);
#endif

  // 메인 루프 딜레이 — 버튼 반응·CPU 절약
  delay(10);
}
