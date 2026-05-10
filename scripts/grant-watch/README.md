# grant-watch — 지원사업 통합 수집

IRIS(접수중) · NTIS · SMES(선택)를 돌린 뒤 키워드·마감 필터로 `artifacts/grant-watch/grant-hub-last-run.json`과 `문서/지원사업/99_공고-모니터링-최근결과.md`를 갱신합니다.

## 실행

저장소 루트에서:

```bash
npm run grant:watch
```

- `npm run grant:watch:cache` — 직전 JSON으로 마감·리포트만 재계산(네트워크 없음)
- `GRANT_WATCH_SKIP_NTIS=1` — NTIS 생략
- `GRANT_WATCH_SKIP_SMES=1` — SMES 생략
- `HEADED=1` + `npm run grant:watch:headed` — Playwright 브라우저 표시

## 수동 공고(대화·공고문 기준)

`config/manual-support-notices.json`에 마감·자격·이유를 두고, 기준일·가정 플래그로 요약합니다.

```bash
npm run grant:manual
npm run grant:manual:json
npm run grant:manual -- --as-of=2026-05-10 --gyeongbuk-sme --partner-daegu-gyeongbuk
```

- 환경변수 `MANUAL_NOTICES_JSON` — 기본값 대신 다른 JSON 경로(레포 루트 기준 상대 가능)

## 설정·비밀

- `config.json` — 키워드, IRIS/NTIS/SMES, 출력 경로
- 루트 `.env`의 `SMES_EXT_PBLANC_KEY` — 공고정보 연계 API **token** (없으면 SMES 생략)

## 에이전트·반복 질문

Cursor 규칙: `.cursor/rules/grant-watch-on-request.mdc`  
같은 레포에서 「지원사업 검색」류 질문이 오면 **SOP + 추천 티어(S/A/B/C)** 를 적용한다. **중소·해상 현장형** 기본값에서는 대형 컨소시엄·NIST 전제 공고를 1·2순위로 두지 않는다.
