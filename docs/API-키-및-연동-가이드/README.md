# 공공데이터포털(data.go.kr) — 신청·환경변수 적용 가이드

> **폴더 경로:** `docs/API-키-및-연동-가이드/` (구 `docs/공공데이터포털-신청가이드/` — [`docs/README.md`](../README.md))

이 문서는 **나중에 실제 운영·연동이 필요할 때** 공공데이터포털에서 무엇을 발급받고, 레포의 어디에 넣는지 한곳에 정리한 것입니다.  
(크롤링이 아니라 **활용신청 기반 OpenAPI**만 다룹니다.)

---

## 1. 코드베이스 재검토 요약 (2026-05 기준)

| 구분 | 내용 |
|------|------|
| **이미 `data.go.kr` API와 연결된 기능** | **기상청 단기예보** — `src/lib/kma-weather.ts`의 `getVilageFcst` 호출. `WeatherAIPanel` → `Dashboard` 기상·타임라인·안전 판정과 동기화됨. |
| **별도 포털 키가 필요한 Node 스크립트** | **나라장터 입찰공고** — `scripts/g2b-bid-watch.mjs` (`BidPublicInfoService`). 환경변수 `DATA_GO_KR_SERVICE_KEY`. |
| **공공데이터포털이 아닌 키** | Supabase, Groq(`console.groq.com`), Kakao, EmailJS, 기업마당/중소벤처24(`BIZINFO24_*`, `SMES_EXT_PBLANC_KEY` 등) — 각 서비스 정책에 따름. |
| **HTML 파싱 스크립트** | `gov-announce-watch.m` 등 — 포털 OpenAPI가 아니며, 사이트 구조 변경 시 스크립트 수정이 필요함. |
| **중기예보** | `WorkPlanView` 달력은 **중기예보 API**(육상·해상·기온)로 D+3~D+10 구간을 반영합니다. 포털에서 **「기상청_중기예보 조회서비스」** 별도 활용신청이 필요할 수 있습니다. **양식 채우기 예시**(활용목적 문구·상세기능 체크)는 [중기예보-활용신청-양식예시.md](./중기예보-활용신청-양식예시.md) 참고. |
| **초단기실황/초단기예보** | `kma-weather.ts` 주석에 언급만 있고, 현재 구현은 **단기예보 + 중기예보** 중심입니다. |

**결론:** 관제 대시보드의 **실시간·슬롯 기반 기상**은 `VITE_KMA_*`만 설정하면 됩니다. **작업 계획 일별 예보**까지 쓰려면 **중기예보 데이터셋** 활용신청을 추가하세요. 입찰 모니터링은 `DATA_GO_KR_SERVICE_KEY`입니다.

---

## 2. 신청할 데이터셋(활용) 목록

### 2-1. 기상청_단기예보 ((구)동네예보) 조회서비스 — **관제 웹 필수에 가깝게 권장**

| 항목 | 내용 |
|------|------|
| **용도** | 풍속·풍향·파고·기온·강수확률·하늘상태 등 시간별 예보 → 출항·기상 경고·AI 요약 입력. |
| **코드 위치** | `src/lib/kma-weather.ts` (`fetchKmaForecast` → `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`) |
| **포털 검색 키워드** | `단기예보` `기상청` `VilageFcstInfoService` 등 |
| **대표 안내 페이지** | [기상청_단기예보 ((구)동네예보) 조회서비스](https://www.data.go.kr/data/15084084/openapi.do) (포털에서 데이터셋 ID·URL은 갱신될 수 있음 — 검색으로 확인) |
| **`.env` 변수** | `VITE_KMA_SERVICE_KEY` — **일반 인증키(Encoding)** 를 그대로 넣는 방식이 일반적(이미 URL 인코딩된 값). 디코딩 키만 있으면 포털 안내에 따라 인코딩 후 사용. |
| **격자 좌표** | `VITE_KMA_NX`, `VITE_KMA_NY` — 조회 지점의 **기상청 격자 X/Y**. 기본값은 코드에 남해안 권역 예시(`58`, `74`). 실제 작업 해역은 포털 해당 API **활용가이드**의 격자 변환 안내 또는 기상청 **동네예보 격자점** 자료로 맞춘다. |
| **중기예보 지점코드** | `VITE_KMA_MIDLAND_REGION`, `VITE_KMA_MIDTA_REGION`, `VITE_KMA_MIDSEA_REGION` — 중기육상·기온·해상예보 각각. 기본 남해안(`11H20000`, `12B20000`). **단기예보와 동일 키** 사용 가능(포털에서 중기예보 데이터셋도 활용신청 필요). |

**적용 후 확인**

1. `.env` 저장 후 **개발 서버 재시작** (`Vite`는 빌드 시점에 `VITE_*`를 고정함).
2. 브라우저 개발자 도구 **Network**에서 `apis.data.go.kr` 호출이 나가는지, 응답 `resultCode`가 `00`인지 확인.
3. 키가 없을 때는 **목업 예보**로 동작(시연 모드).

**보안 참고:** `VITE_*`는 **프론트 번들에 포함**됩니다. 운영에서 키 노출을 피하려면 나중에 **백엔드 프록시**로 API 키를 서버에만 두는 방식을 검토하세요.

---

### 2-1-보. 기상청_중기예보 조회서비스 (활용신청 화면)

- **포털 검색:** `중기예보` `MidFcstInfoService` `기상청`
- **활용목적·상세기능 체크·위치기반 첨부 안내:** [중기예보-활용신청-양식예시.md](./중기예보-활용신청-양식예시.md)

---

### 2-2. 조달청 나라장터 입찰공고정보서비스 — **입찰 알림 스크립트용**

| 항목 | 내용 |
|------|------|
| **용도** | `npm run g2b:watch` — 용역·물품·공사 입찰공고 목록 조회 후 웹훅/ntfy 알림. |
| **코드 위치** | `scripts/g2b-bid-watch.mjs` — 기본 `https://apis.data.go.kr/1230000/BidPublicInfoService` |
| **End Point 주의** | 마이페이지에 **`.../1230000/ad/BidPublicInfoService`** 로 표시되면 `.env`에 `G2B_API_BASE` 로 동일 URL을 넣으세요(미설정 시 `/ad/` 없는 주소 사용). |
| **포털 검색 키워드** | `나라장터` `입찰공고` `BidPublicInfoService` |
| **`.env` 변수** | `DATA_GO_KR_SERVICE_KEY` — **`VITE_` 접두사 금지**(Node 전용, 브라우저에 넣지 않음). |

같은 **공공데이터포털 일반 인증키**로 여러 API를 쓸 수 있는 경우가 많지만, **데이터셋마다 활용신청**이 필요할 수 있으므로 포털의 **마이페이지 → 활용신청 현황**에서 해당 API가 **승인** 상태인지 확인합니다.

---

## 3. `.env` 체크리스트 (복사용)

```env
# ─── 기상청 단기예보 (브라우저/Vite) ───
VITE_KMA_SERVICE_KEY=
VITE_KMA_NX=58
VITE_KMA_NY=74

# ─── 기상청 중기예보 (선택, WorkPlanView 일별) — .env.example 참고
# VITE_KMA_MIDLAND_REGION=11H20000
# VITE_KMA_MIDTA_REGION=11H20000
# VITE_KMA_MIDSEA_REGION=12B20000

# ─── 나라장터 입찰공고 (Node 스크립트만) ───
DATA_GO_KR_SERVICE_KEY=

# (선택) g2b-bid-watch 알림·필터 — .env.example 참고
# G2B_NOTIFY_WEBHOOK_URL=
# G2B_KEYWORDS=
```

---

## 4. 적용 순서 (처음 한 번)

1. [공공데이터포털](https://www.data.go.kr) 회원가입·로그인.
2. 위 **2-1(단기)**, **2-1-보(중기·필요 시)**, **2-2(나라장터)** 각 데이터셋에 대해 **활용신청** → 승인 대기(당일~수일 소요될 수 있음).
3. **개발계 인증키** 발급·복사(Encoding / Decoding 안내는 포털 도움말 준수).
4. 프로젝트 루트 `.env`에 변수 붙여넣기(저장소에 **커밋하지 말 것** — `.gitignore` 확인).
5. 기상: `npm run dev` 재시작 후 관제 화면에서 예보 갱신 동작 확인.  
6. 입찰: `node --env-file=.env scripts/g2b-bid-watch.mjs` 또는 `npm run g2b:watch`로 스모크 테스트.

---

## 5. 관련 파일 빠른 링크 (레포 내부)

| 파일 | 설명 |
|------|------|
| `.env.example` | 전체 환경변수 샘플·주석. |
| `src/lib/kma-weather.ts` | 단기·**중기** 예보 API, 슬롯 정렬·현재 시각 슬롯 선택. |
| `src/app/WorkPlanView.tsx` | 작업 계획 달력 — 중기예보 반영. |
| `src/app/components/WeatherAIPanel.tsx` | 예보 폴링·긴급 판정·Groq 연동 트리거. |
| `src/vite-env.d.ts` | `VITE_KMA_*` 타입 선언. |
| `scripts/g2b-bid-watch.mjs` | 나라장터 OpenAPI 조회. |

---

## 6. 문의·변경 시

- API URL·파라미터·트래픽 제한은 **기상청·행정안전부·조달청 공지**가 우선입니다.
- 포털에서 데이터셋이 **폐기·통합**되면 이 문서의 링크만으로는 부족할 수 있으니, 반드시 포털 검색으로 **최신 데이터셋명**을 확인하세요.
