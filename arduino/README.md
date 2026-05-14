# 해상 종자 살포 — 아두이노(GPS·LTE) 폴더

현장 단말을 **현실적인 부품·통신 한계·관제 웹 동작**까지 묶어서 정리한 문서와 **컴파일 가능한 예제 스케치**입니다.

## 문서 (순서대로 읽기)

| 순서 | 파일 | 내용 |
|------|------|------|
| 0 | [../docs/장치-연동-기준서/07-아두이노-GNSS-살포-연동-실무-가이드.md](../docs/장치-연동-기준서/07-아두이노-GNSS-살포-연동-실무-가이드.md) | 센서→`telemetry-ingest`→`seed_drop_records`→웹, BLE·폰 경유 시나리오 (**7장**) |
| 1 | [01-보드와-LTE-모뎀-구매-현실.md](아두이노-스케치-모음/문서/01-보드와-LTE-모뎀-구매-현실.md) | 무엇을 사면 되는지, 대략 사양·가격대 감 |
| 2 | [02-해상-통신-범위-한계.md](아두이노-스케치-모음/문서/02-해상-통신-범위-한계.md) | “몇 km 반경”이 아니라 LTE가 되는 이유·한계 |
| 3 | [03-관제웹-마커-궤적-주기-서버-한도.md](아두이노-스케치-모음/문서/03-관제웹-마커-궤적-주기-서버-한도.md) | 마커가 어떻게 찍히는지, 몇 초마다인지, 서버 제한 |
| 4 | [04-Arduino-IDE-라이브러리-개발-순서.md](아두이노-스케치-모음/문서/04-Arduino-IDE-라이브러리-개발-순서.md) | IDE 설정, 라이브러리 이름, 코딩 순서 |
| 5 | [05-사양-표-요약.md](아두이노-스케치-모음/문서/05-사양-표-요약.md) | 인쇄용 한 장 사양 표 |

## 스케치 (예제 코드)

**Arduino IDE**에서는 스케치 폴더 이름이 `.ino` 파일명과 같아야 하므로, 아래 링크는 **가장 안쪽 영문 폴더**를 가리킵니다. 바깥 `아두이노-스케치-모음`·한글 칸 이름은 정리용이며, **다른 PC로 옮길 때는 한글 경로를 빼고** `esp32-marine-telemetry` 같은 영문 폴더만 복사해도 됩니다.

| 스케치 | 용도 |
|--------|------|
| [esp32_marine_telemetry.ino](아두이노-스케치-모음/해상-궤적-살포-통합/esp32-marine-telemetry/esp32_marine_telemetry.ino) | **기본 통합**: 궤적 주기 POST + 살포 1건 POST (맨 주석에 “스케치 둘로 나누는 경우” 참고) |
| [esp32_marine_telemetry_motor_relay.ino](아두이노-스케치-모음/해상-궤적-살포-모터릴레이/esp32-marine-telemetry-motor-relay/esp32_marine_telemetry_motor_relay.ino) | 통합본에 **모터·릴레이**(`ENABLE_MOTOR_RELAY`, 10·11·12번 등) |
| [esp32_marine_ai_safety.ino](아두이노-스케치-모음/함정-AI-안전-보조/esp32-marine-ai-safety/esp32_marine_ai_safety.ino) | **선택**: `ship_command_logs` 폴링·사이렌·SOS만 **별도 보드**로 둘 때 |

- 한글·영문 전체 구조: [아두이노 스케치 모음 안내](아두이노-스케치-모음/README.md)

- 맨 위 `USE_ESP32_HTTP` 기본 **`0`** (시리얼에만 JSON). 실제 전송 시 **`1`**.
- 역할만 켜고 끄기: `ENABLE_VESSEL_TRACK` , `ENABLE_SEED_DROP` (기본 둘 다 `1`).

> 예전 경로 `examples/arduino-lte-vessel-track/`·`arduino/sketches/` 는 안내만 남기거나 리다이렉트합니다. **스케치·문서 본문은 `arduino/아두이노-스케치-모음/`** 아래를 사용합니다.

## 서버 쪽 (한 번만)

- SQL: `scripts/sql/004_*.sql`, `005_vessel_track_points.sql`
- Edge 배포: `telemetry-ingest`, `vessel-track-ingest`
- Secret: `DEVICE_INGEST_SECRET`

웹 `.env`: `VITE_VESSEL_LTE_POLL_MS`, `VITE_VESSEL_LTE_ID` 등은 [03-관제웹-마커-궤적-주기-서버-한도](아두이노-스케치-모음/문서/03-관제웹-마커-궤적-주기-서버-한도.md) 참고.
