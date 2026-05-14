# 04. Arduino IDE · 라이브러리 · 코딩 순서 (꼼꼼히)

---

## 1. 설치할 프로그램

1. **Arduino IDE 2.x** (arduino.cc 에서 다운로드)  
2. USB 드라이버: 보드 칩(CH340, CP2102 등)에 맞는 드라이버(판매처 안내)

---

## 2. ESP32 보드 추가 (가장 많이 쓰는 방법)

1. IDE → **파일 → 환경설정** → “추가 보드 관리자 URLs”에 Espressif 주소 추가  
   - 공식 안내: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. **도구 → 보드 → 보드 관리자** → **esp32** 검색 → **esp32 by Espressif Systems** 설치
3. **도구 → 보드** 에서 본인 보드 선택 (예: `ESP32 Dev Module`, `ESP32S3 Dev Module`)

---

## 3. 라이브러리 관리자에서 설치할 것

**도구 → 라이브러리 관리**에서 검색하여 설치:

| 라이브러리 이름 | 용도 |
|-----------------|------|
| **ArduinoJson** by Benoit Blanchon | JSON 만들기/파싱 (6.x 대 버전 많음) |
| (선택) **TinyGSM** | SIM7600 등 **모뎀 AT 명령**으로 GPRS/LTE 데이터 붙일 때 |
| (선택) **NTPClient** 또는 ESP 내장 시간 API | `recorded_at` 을 **실제 UTC**로 맞출 때 |

**HTTPS(중요)**  

- ESP32는 기본으로 **WiFiClientSecure** 가 포함되어 있습니다 (`#include <WiFiClientSecure.h>`).  
- 예제에서는 시연 편의상 `setInsecure()` 를 쓸 수 있으나, **운영에서는 루트 CA 인증서를 넣고 검증**하는 것이 맞습니다.

---

## 4. 스케치 열고 처음 할 일

1. `arduino/아두이노-스케치-모음/해상-궤적-살포-통합/esp32-marine-telemetry/esp32_marine_telemetry.ino` 열기  
2. 상단 `#define USE_ESP32_HTTP 0` 을 **`1`** 로 변경 (실제 전송 시험 시)  
3. 다음 상수를 **본인 값**으로 수정:
   - `WIFI_SSID` / `WIFI_PASS` (또는 나중에 LTE만 쓸 때는 모뎀 예제 쪽으로 이전)
   - `SUPABASE_REF` — 프로젝트 URL의 `xxxx.supabase.co` 의 `xxxx`
   - `DEVICE_INGEST_SECRET` — Supabase Secret에 넣은 값과 **동일**
   - `VESSEL_ID` — DB·웹 `.env` 의 `VITE_VESSEL_LTE_ID` 와 **동일 문자열**
4. **도구 → 시리얼 모니터** 열고 보드레이트 **115200**
5. **스케치 → 업로드**

`USE_ESP32_HTTP 0` 인 채로는 **JSON만 시리얼에 출력**합니다 (WiFi 없이 형식 검증용).

---

## 5. GPS(NMEA) 붙이는 큰 흐름

1. 하드웨어: GPS TX → ESP32 RX (크로스), GND 공통, **전압 3.3V 호환** 확인  
2. `Serial2.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);` 같이 **두 번째 UART** 사용 권장  
3. `loop` 에서 `Serial2.readStringUntil('\n')` 또는 문자 단위로 `$GPRMC` / `$GPGGA` 파싱  
4. **유효 fix** 일 때만 `lat`/`lng` 채워서 HTTP 전송 함수 호출  
5. **시간**: 가능하면 **GPS UTC** 또는 **WiFi 연 시 NTP** 로 `recorded_at` (Unix ms) 맞추기 — `millis()`만 쓰면 **부팅 후 상대시간**이라 서버와 안 맞습니다.

---

## 6. LTE만 쓸 때 (WiFi 없음)

- **한 장 보드**(LilyGO T-SIM7600 등): 보드 제조사가 제공하는 **Arduino 예제·핀맵**을 우선 따르세요.  
- **TinyGSM** 으로 PDP 컨텍스트 연 뒤, TCP/SSL 예제가 모뎀마다 다릅니다.  
- **가장 단순한 경로**: 보드가 **이미 인터넷에 붙은 뒤** `HTTPClient` + `WiFiClientSecure` 대신 **모뎀 라이브러리가 주는 Client 객체**로 동일한 POST를 보내는 패턴을 제조사 예제에서 찾습니다.

이 저장소의 예제는 **“WiFi로 인터넷 된 ESP32”** 기준으로 먼저 검증하기 쉽게 작성했습니다. LTE 통합은 **보드별 예제를 합치는 작업**입니다.

---

## 7. 배포 전 체크리스트

- [ ] Supabase SQL `005` + (선택) `004` 적용  
- [ ] `DEVICE_INGEST_SECRET` 설정 후 Edge 배포  
- [ ] 브라우저에서 관제 웹 로그인 → **「해상 기기(LTE) 궤적」** 켜기  
- [ ] 아두이노에서 POST 성공(시리얼에 200 또는 `[lte] ok`)  
- [ ] 지도에 **주황 선**이 보이는지 확인  

---

## 8. 관련 파일 (저장소 루트)

- Edge: `supabase/functions/vessel-track-ingest/`, `telemetry-ingest/`  
- SQL: `scripts/sql/005_vessel_track_points.sql`  
- 웹 폴링: `src/app/Dashboard.tsx`, `.env.example`  

상위 안내: [../README.md](../README.md)
