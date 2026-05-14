# 해양 종자 살포 관제 시스템 — 장치 연동 기준서

> **목적**: 실제 배에 장치를 연결하여 관제 서버에 위치가 잡히고, 투하가 기록되도록 하기 위한 전체 구조·프로토콜·연결 방법·문제점을 기술한다.  
> **처음이거나 재미나이(Gemini)와 단계별로 진행할 때**는 [00-재미나이-단계별-가이드.md](00-재미나이-단계별-가이드.md)를 먼저 본다.

---

## 문서 분류 (두 줄)

| 구분 | 번호 | 무엇을 다루나 |
|------|------|----------------|
| **규격·프로토콜·현장 절차** | 00~06 | 재미나이 단계 가이드, 부품 사양, HTTP·JSON, 지도·투하·항해, Supabase·배선·트러블슈팅 |
| **웹·DB·telemetry 실무** | **07** | 관제「테스트 살포」와 동일한 DB 한 줄, `telemetry-ingest`, BLE·폰 경유 개념, 코드 파일 위치 |

---

## 문서 목록

| 번호 | 파일 | 내용 요약 |
|------|------|-----------|
| 00 | [00-재미나이-단계별-가이드.md](00-재미나이-단계별-가이드.md) | **재미나이에 폴더 올릴 때** — 파트 0~6, 할 일, 질문 예시 (먼저 읽기) |
| 01 | [01-기기사양-기준서.md](01-기기사양-기준서.md) | GPS·RTK·투하장치·PLC·MCU 기기 사양 및 선택 기준 |
| 02 | [02-신호-프로토콜-명세.md](02-신호-프로토콜-명세.md) | 실제 코딩값(JSON·HTTP) — "어떤 신호를 보내야 서버가 받는가" |
| 03 | [03-선박-지도-표시-구조.md](03-선박-지도-표시-구조.md) | 배 → 서버 → 지도 전체 신호 흐름 |
| 04 | [04-투하-작동-구조.md](04-투하-작동-구조.md) | 투하 트리거 → 서버 기록 메커니즘 |
| 05 | [05-항해경로-시작-종료.md](05-항해경로-시작-종료.md) | 출발·귀환 시 내비게이션 경로 시작·종료 방법 |
| 06 | [06-실제-연동-방법과-문제점.md](06-실제-연동-방법과-문제점.md) | 현장 배선·펌웨어·서버 설정·알려진 문제점 총정리 |
| 07 | [07-아두이노-GNSS-살포-연동-실무-가이드.md](07-아두이노-GNSS-살포-연동-실무-가이드.md) | 웹 테스트 살포·`seed_drop_records`·`telemetry-ingest`·BLE 경로 (구 `hardware-arduino-gnss-seed`) |

---

## 시스템 한눈에 보기

```
[배 위 장치]
  GPS 모듈 (NMEA UART)
  LTE 모듈 (SIM7600 등)
  MCU / ESP32
  투하장치 센서·릴레이 (PLC or 릴레이 모듈)
       │ HTTPS POST (JSON)
       ▼
[Supabase Edge Function]
  vessel-track-ingest   ← 선박 위치 수신
  telemetry-ingest      ← 살포 이벤트 수신
       │ DB 저장
       ▼
[Supabase PostgreSQL DB]
  vessel_track_points   ← 항적 누적
  vessel_positions      ← 현재 위치 (실시간)
  seed_drop_records     ← 살포 기록
       │ Realtime / 폴링
       ▼
[관제 웹 (React + Leaflet)]
  선박 마커, 항적 선, 살포 원형 마커
```

**제품·라이브러리 링크**: [NEO-M8N](https://www.u-blox.com/en/product/neo-m8-series), [SIM7600G-H](https://www.simcom.com/product/SIM7600G-H.html), [ESP32 DevKitC](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/hw-reference/esp32/get-started-devkitc.html), [Leaflet](https://leafletjs.com/) — 모듈·보드 표는 [01-기기사양-기준서.md](01-기기사양-기준서.md).

---

## 최소 연결 체크리스트

- [ ] Supabase 프로젝트 생성 + `DEVICE_INGEST_SECRET` 설정
- [ ] Edge Function 2개 배포 (`vessel-track-ingest`, `telemetry-ingest`)
- [ ] DB 테이블 3개 생성 (SQL 마이그레이션 실행)
- [ ] ESP32 스케치 설정값 5개 입력 (WiFi, Supabase Ref, Secret, VESSEL_ID)
- [ ] GPS UART 파싱 코드 `readGpsFix()` 완성
- [ ] 투하 핀(GPIO 13) 배선 완료
- [ ] `USE_ESP32_HTTP 1`, `ENABLE_TASK_WDT 1` 변경 후 업로드

---

*작성일: 2026-05-14*  
*이 폴더(`docs/장치-연동-기준서/`)에 규격 00~06과 실무 07이 함께 있습니다. **문서 책장 전체**는 [문서 책장](../README.md)을 보세요.*
