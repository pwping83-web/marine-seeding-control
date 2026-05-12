# v3.5.2 릴리스 스냅샷 메타

- **버전**: 3.5.2 (`package.json`)
- **기록일**: 2026-05-12

## 모듈 검토 요약 (앱 핵심)

| 영역 | 경로 | 비고 |
|------|------|------|
| 관제 대시보드 | `src/app/Dashboard.tsx` | 항적 기록 모달·금일 궤적 지도 재생(`Route`), AI 해저 안착·50% 참고·티커, 기상 패널 문구 정리, `liveWeather` pop/pty |
| 항적 기록 모달 | `src/app/components/TodayTrackReportModal.tsx` | 기간·CSV·사후 평가 문구, 테스트 샘플(환경변수로 끔) |
| 항적 샘플·평가 | `src/lib/track-report-test-sample.ts`, `src/lib/seeding-day-eval.ts` | 샘플 LTE·살포, 안착률 휴리스틱 |
| 안착·과제 권고 | `src/lib/seeding-outcome-advisory.ts`, `src/lib/work-recommendation.ts`, `src/lib/groq-work-plan.ts` | 50% 참고선·현장 행동, Groq JSON 확장 |
| 작업 AI 모달 | `src/app/components/WorkPlanAiModal.tsx` | 안착·행동 섹션 |
| 지도 | `src/app/components/MarineLeafletMap.tsx` | `replayTrackPathLatLng` 금일 항적 오버레이 |
| 기상 타임라인 | `src/app/components/WeatherTimelineTracker.tsx` | 지도 하단 중앙 바 UI 톤 통일(Lucide·틸 패널) |
| 사이드바 힌트 | `src/app/components/TrackRecordSidebarHint.tsx` | 항적 기록 행 가운데 미니 경로 시각 |

## 복구 방법

이 태그가 있는 커밋으로 되돌리려면:

```bash
git checkout v3.5.2
```

또는 브랜치로:

```bash
git checkout -b restore-v3.5.2 v3.5.2
```

(태그는 저장소 운영 정책에 따라 별도로 생성하세요.)
