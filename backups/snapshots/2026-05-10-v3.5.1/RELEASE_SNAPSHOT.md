# v3.5.1 릴리스 스냅샷 메타

- **버전**: 3.5.1 (`package.json`)
- **기록일**: 2026-05-10

## 모듈 검토 요약 (앱 핵심)

| 영역 | 경로 | 비고 |
|------|------|------|
| 관제 대시보드 | `src/app/Dashboard.tsx` | 사이드바 `#0c2748` 계열 통일, 종자 살포 이력(틸 액센트·행·스크롤), CSV/날짜·삭제(휴지통), 신호/투하/기상 블록 틴트 |
| 고도화 모달 | `src/app/components/VisionRoadmapModal.tsx` | 5탭 진청록·틸 패널 톤, `WP_PANEL` 등 상수 |
| 작업 AI 보조 | `src/app/components/WorkPlanAiModal.tsx`, `src/lib/groq-work-plan.ts`, `src/lib/work-ai-user-note.ts`, `src/lib/work-recommendation.ts` | 금일 작업 보조·메모·Groq 연동 |
| DB | `src/lib/marine-db.ts` | `deleteSeedDropRecord` (이력 삭제) |
| 로그인·매뉴얼 | `src/app/LoginPage.tsx`, `src/app/ManualModal.tsx`, `src/app/components/login-page.tsx` | 시연 문구 정리 등 |
| 전역 스타일 | `src/styles/index.css` | 사이드바 이력 스크롤바 틸 톤 |

## 복구 방법

이 태그가 있는 커밋으로 되돌리려면:

```bash
git checkout v3.5.1
```

또는 브랜치로:

```bash
git checkout -b restore-v3.5.1 v3.5.1
```
