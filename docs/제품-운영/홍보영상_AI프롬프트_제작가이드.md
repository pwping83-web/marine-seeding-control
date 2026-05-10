# 해양 종자 살포 관제 시스템
## 홍보·컨셉 영상 제작을 위한 AI 프롬프트 가이드

---

| 항목 | 내용 |
|------|------|
| **문서 목적** | AI 영상 생성 도구(Gemini, Fal.ai, Runway, Sora 등)에 입력할 프롬프트 모음 |
| **영상 장르** | 기관 납품용 홍보·시연 **컨셉** 영상 (실제 운영 화면·실적과 혼동되지 않게 표기) |
| **권장 길이** | 60초 ~ 90초 |
| **전체 톤** | 첨단 해양 관제 · 전문적 · 신뢰감 · 미래지향 |
| **색감 컨셉** | 딥 네이비 배경 + 청록(Cyan) 발광 포인트 |

---

## 0. 전역 제약 (모든 장면·모든 도구에 공통)

아래는 **요청하신 조건**과 납품·홍보 영상에서 자주 틀어지는 부분을 묶은 것입니다. **한국어·영문 프롬프트 맨 끝에 항상 붙입니다.**

### 0.1 필수 네 가지

| # | 조건 | 프롬프트에 넣을 문구 (복사용) |
|---|------|------------------------------|
| 1 | **한국 배경** | 한국어: `배경은 대한민국 연안·한국 지리에 맞는 풍경만. 해외 항구·외국 간판·비한국 건물 없음.` / 영문: `Setting: South Korea only. Korean coastline geography, no foreign landmarks or non-Korean signage.` |
| 2 | **한국인** | 한국어: `등장 인물이 있으면 성인 한국인, 한국인 얼굴 특징. 서양인·다인종 혼합 없음.` / 영문: `If humans appear: adult Korean people, ethnically Korean appearance, not Western extras.` |
| 3 | **음성 없음** | 한국어: `대사·나레이션·입 모양 말하기 없음. 조용한 영상(무대사). 입술로 말하는 장면 금지.` / 영문: `No dialogue, no voiceover, no speaking or lip-sync talking. Silent footage, muted.` |
| 4 | **같은 인물 유지** | 인물이 나오는 **모든 컷**에 아래 **§ 인물 시트**를 그대로 복사해 넣고, 영문 생성 시에도 동일 블록을 붙입니다. (이미지→영상 도구면 **참조 이미지 1장**을 고정 사용.) |

### 0.2 § 인물 시트 (관제실 담당자 — 장면 3 등)

**한글 (인물이 나오는 프롬프트 상단에 붙임):**
```
[동일 인물 고정] 한국 국적 성인 여성(또는 남성) 담당자 1인만 등장. 
나이대 30대 후반~40대 초반, 짧은 정돈된 흑발, 자연스러운 한국인 피부톤. 
복장: 짙은 남색 또는 차콜 블레이저, 흰색 또는 연한 색 셔츠, 관공서·연구기관 사무 공간에 어울리는 단정한 비즈니스 캐주얼. 
같은 얼굴형·같은 헤어스타일·같은 복장 색상을 모든 관제실 컷에서 유지.
```

**English (paste above any shot with the operator):**
```
[Same character locked] One adult Korean female (or male) operator only.
Age late 30s to early 40s, neat short black hair, natural Korean skin tone.
Outfit: dark navy or charcoal blazer, white or light shirt, neat business-casual fit for a Korean government office.
Keep identical face shape, hairstyle, and clothing colors across all control-room shots.
```

인물 성별은 팀에서 하나로 정한 뒤 **바꾸지 말고** 시리즈 전체에 통일합니다.

### 0.3 기타 주의 (에이전트·제작자 공통)

- **컨셉 vs 실제**: AI 생성 영상은 **시연·컨셉**입니다. 실제 살포 건수·밀도·구역 코드는 **검증된 수치**로만 자막에 쓰고, 미검증이면 장면 5의 숫자는 **「예시」**로 바꾸거나 자막에서 생략하세요.
- **로고·인장**: 실제 기관·부처 문장·휘장은 **사용 승인 없이** 넣지 않습니다. 가이드의 「기관 느낌의 단순 로고」는 **가상의 심벌**로 이해합니다.
- **화면 속 글자**: AI가 만든 영상 안에 **한글·숫자가 깨지기 쉬움** → 가능하면 프롬프트에서 `no readable text in the generated video` 를 넣고, **구역명·수치·제목은 편집 단계에서 자막·모션그래픽으로 덧씌우기**를 권장합니다. (아래 장면 5 영문 프롬프트의 라벨은 **참고용**이며, 최종은 후반 작업이 안전합니다.)
- **저작권·초상**: 학습 데이터 이슈가 있는 모델은 **상업·납품 용도**인지 각 서비스 약관을 확인합니다. 실사 인물 합성이 부담되면 **등장 인물 없는 컷**으로만 구성하는 방법도 있습니다.
- **개인정보**: 클로징에 연락처·사업자번호를 넣을 때는 **제출 기관 지침**에 맞추고, 공개 불가 시 자막에서 제외합니다.

### 0.4 매 프롬프트 끝에 붙이는 한 줄 (영문 도구용)

```
4K, cinematic, professional, South Korea setting, Korean people if any, no dialogue, no voiceover, silent, no readable on-screen text, concept visualization only.
```

---

## 1. 영상 전체 컨셉 (Executive Brief)

> **한 줄 요약**  
> "대한민국 연안을 지키는 보이지 않는 첨단 관제의 눈 — 해양 종자 살포 관제 시스템"

### 스토리 흐름 (3막 구조)

```
[1막] 문제 제기 (0~15초)
  → 사라져가는 해조류, 황폐해진 바다 연안 (한국 연안으로 한정)

[2막] 솔루션 등장 (15~50초)
  → 관제 시스템 화면 + 선박 + 데이터 시각화

[3막] 결과·신뢰 (50~60초)
  → 되살아나는 바다 + 시스템 타이틀(후반 자막) + 신뢰감 있는 클로징
```

---

## 2. 장면별 AI 영상 프롬프트

각 장면: **영문 / 한국어** 본문 다음에 **§0 전역 제약 + 인물 시트(해당 시)** 를 반드시 추가합니다.

### 🎬 장면 1 — 오프닝 (0~5초)
**[ 바다 항공 드론 — 한국 연안 ]**

```
Cinematic drone shot flying low over the deep blue South Korean coastal sea at dawn,
Jeollanam-do or South Sea style Korean shoreline (no foreign ports),
dark navy water with gentle waves reflecting early morning light,
misty Korean mountains visible on the distant shore,
ultra-wide angle, 4K, cinematic color grade, teal and deep blue tones,
slow motion, atmospheric, professional documentary style,
no people, no boats, no dialogue, silent
```

**한국어 버전 (Gemini/Veo용):**
```
새벽 대한민국 남해 또는 전남 연안 스타일의 드론 항공 촬영.
짙은 네이비빛 바다, 잔잔한 파도, 새벽빛이 반사되는 수면.
멀리 한국식 해안 산지 윤곽, 외국 항만·이국적 건물 없음.
인물·선박 없음, 무대사.
시네마틱 컬러 그레이딩, 청록·남색 톤, 슬로모션, 다큐멘터리 스타일.
4K, 전문 방송 수준.
```

---

### 🎬 장면 2 — 문제 제기 (5~12초)
**[ 황폐한 해저 — 한국 연안 설정 ]**

```
Underwater wide-angle shot of barren Korean coastal seabed,
East China Sea / Korean peninsula coastal ecosystem (not tropical reef),
no seagrass, sparse rocky bottom, murky water,
cold blue-green tones, documentary style, slow camera movement,
environmental message, solitary fish swimming through empty ocean floor,
no human divers, no dialogue, silent
```

**한국어 버전:**
```
대한민국 연안 해저 생태를 연상시키는 광각 수중 촬영(열대 산호초 풍경 아님).
해조류 없는 텅 빈 암초 바닥, 흐린 탁한 물.
차가운 청록 톤, 다큐멘터리, 느린 카메라. 다이버·대사 없음, 무음.
적막한 분위기, 물고기 소수만 등장.
```

---

### 🎬 장면 3 — 관제 화면 등장 (12~25초)
**[ 대시보드 UI + 한국인 담당자 ]**

**인물 컷이 필요할 때만:** 프롬프트 **앞**에 **§0.2 인물 시트 전체**를 붙입니다.

```
Close-up of a high-tech maritime control dashboard on a large monitor,
dark navy interface with glowing cyan and teal data visualizations,
animated radar sweep, real-time vessel tracking on a simplified Korean southern coastal map shape,
abstract glowing dots for seed drop zones (no readable Korean text in the AI output),
professional government control room in South Korea, Korean interior architecture,
sleek cinematic tech aesthetic, blue glow reflections on the Korean operator's face,
the same Korean operator as defined in character sheet, not speaking, silent,
motion graphics style, 4K
```

**한국어 버전:**
```
(위 인물 시트 먼저 붙임)
첨단 해양 관제 시스템 대형 모니터 근접 촬영.
딥 네이비 UI, 청록 데이터 시각화, 레이더 스캔,
한국 남해 연안 윤곽의 단순화된 지도 위에 추상적 궤적·발광 점(한글 자막은 AI에 맡기지 말 것).
대한민국 관공서·연구용 관제실 인테리어.
동일 한국인 담당자, 말하지 않음, 입 움직임 최소, 무대사.
모니터 빛이 얼굴에 반사, 4K 시네마틱.
```

---

### 🎬 장면 4 — 선박 작업 (25~35초)
**[ 해상 살포 선박 — 한국 선박·한국 해역 ]**

```
Cinematic shot of a medium Korean government-style research or service vessel
on calm South Korean coastal waters, Korean flag appropriate if visible,
afternoon golden hour light, vessel leaves white wake trail,
aerial shot transitioning to deck-level,
no foreign navy markings, professional Korean maritime documentary style,
subtle abstract glowing data points overlay (no readable text), no dialogue, silent
```

**한국어 버전:**
```
잔잔한 대한민국 연안을 항해하는 중형 관공서·연구용 어선/작업선 스타일.
외국 해군·외국 선박 표기 없음. 오후 황금빛, 흰 항적.
드론에서 갑판 시점으로 전환. 다큐멘터리 톤.
추상적 데이터 포인트 오버레이만(글자 없음). 무음·무대사.
```

---

### 🎬 장면 5 — 데이터 시각화 (35~45초)
**[ 인포그래픽 — 후반 작업에서 자막·숫자 삽입 권장 ]**

```
Abstract 3D data visualization animation,
glowing cyan data points spreading across a stylized dark blue simplified map of southern Korea,
generic zone markers as abstract glowing badges (no legible letters or numbers in the render),
three broad regions suggested west / center / east of the Korean south coast,
network lines connecting abstract monitoring nodes,
sleek motion graphics, government infographic style,
teal and blue color palette, particle effects, no dialogue, silent
```

**한국어 버전:**
```
추상 3D 데이터 시각화. 한국 남해 윤곽의 스타일화된 짙은 파란 지도.
청록 포인트 확산, 서·중·동부 연안을 암시하는 세 구역(정확한 행정구역명은 후반 자막).
읽을 수 있는 한글·숫자는 생성하지 말 것 — 원형·배지는 무기호 추상 형태로.
네트워크 라인, 파티클. 정부 인포그래픽 느낌. 무음.
```

**[편집 전용] 자막 문구 예시 (영상 렌더에 글자를 박아 넣지 말 것)**  
누적 살포 건수·km²당 점수 등은 **실데이터 확인 후** 자막에만 사용. 미확인 시 「시연용 예시」 표기.

**구역 시각화 프롬프트 (별도 삽입 컷):**
```
Close-up of a maritime monitoring interface with abstract zone tiles,
left center right panels suggesting three regions along Korean south coast,
glowing teal shapes only, no readable text or zone codes in the video render,
dark navy background, professional dashboard style, silent, no voice
```

---

### 🎬 장면 6 — 기상 기능 (45~50초)
**[ 풍향·풍속 시각화 ]**

```
Stylized animation of weather monitoring over Korean coastal sea,
abstract wind compass with glowing needle,
wave height and wind speed as abstract graphs (no readable labels in AI output),
7-day strip as generic colored blocks (green/red) without dates or text,
dark interface with teal glow, professional weather dashboard aesthetic, silent
```

**한국어 버전:**
```
대한민국 연안 상공을 연상시키는 기상 모니터링 추상 애니메이션.
풍향 나침반, 파고·풍속은 기호만(숫자·한글 라벨은 후반 작업).
7일 예보는 색 블록만. 딥 네이비·청록. 무음.
```

---

### 🎬 장면 7 — 해조류 복원 (50~57초)
**[ 희망의 엔딩 — 한국 연안 생태 ]**

```
Underwater time-lapse of seagrass and kelp forest growing and flourishing,
temperate East Asian marine plants (not tropical coral reef),
green and teal marine plants swaying in gentle current,
small fish returning to the ecosystem,
warm hopeful lighting, nature documentary style,
Korean coastal ecosystem restoration visual metaphor, no dialogue, silent
```

**한국어 버전:**
```
온대 해역 해조류·다시마 숲 성장 타임랩스(열대 산호 장면 아님).
청록·녹색 식물, 작은 어류, 희망적 조명.
한국 연안 복원을 연상시키는 메타포. 무음·무대사.
```

---

### 🎬 장면 8 — 로고·클로징 (57~60초)
**[ 엔딩 — 가상 심벌 + 후반 타이포 ]**

```
Clean dark navy background with subtle particle animation,
simple fictional geometric logo mark (not a real government seal),
no readable Korean characters in the AI render — add title in post-production,
teal accent lines, fade to black,
corporate government presentation style, trustworthy, authoritative, silent
```

**한국어 버전:**
```
딥 네이비 배경, 은은한 파티클.
실제 기관 문장·국가 휘장 사용 금지 — 단순 기하 로고만.
한글 제목은 생성 단계에서 넣지 말고, 편집 단계에서 삽입.
청록 라인, 페이드 아웃. 무음.
```

---

## 3. 자막·타이포용 카피 (음성 없음 — 나레이션 녹음 안 함)

**본 영상은 음성·나레이션을 넣지 않습니다.** 아래 문장은 **자막·슬라이드·종료 크레딛**용입니다. 필요 시 **배경만 잔잔한 BGM**(저작권-free)만 얹습니다.

```
[0~5초]   (효과음만: 파도 — 대사 없음)
          자막 예: 「대한민국 연안」

[5~12초]  「풍요를 잃어가던 바다, 해조류가 사라지고 있습니다.」

[12~25초] 「첨단 관제로 바다를 지킵니다.
           해양 종자 살포 관제 시스템」

[25~35초] 「실시간 선박 추적, 살포 이력의 정밀 기록」

[35~45초] 「구역별 데이터로 작업을 투명하게
           ※ 수치는 실제 검증 데이터로만 표기」

[45~50초] 「기상·일정 정보를 한 화면에서」

[50~57초] 「되살아나는 연안 생태」

[57~60초] 「해양 종자 살포 관제 시스템」
          (연락처·사업자번호는 제출처 허용 시에만 표기)
```

**구버전 나레이션 스크립트**에 있던 구체적 수치(예: 1,840건, 847점/km²)는 **검증된 실데이터가 있을 때만** 자막에 사용하세요. 없으면 위처럼 일반 문구로 대체합니다.

---

## 4. AI 도구별 사용 방법

### 🤖 Google Gemini / Veo (구글 AI 영상)

**접속:** [gemini.google.com](https://gemini.google.com) 또는 [labs.google/veo](https://labs.google/veo)

**입력 방법:**
1. **§0 전역 제약** + **해당 장면 한국어 프롬프트**를 붙여넣기
2. 인물 컷이면 **§0.2 인물 시트**를 장면 문장보다 **위**에 둠
3. "60초 홍보 **컨셉** 영상. 음성·대사 없음. 다음 장면:" 등으로 조건을 먼저 명시
4. 생성 후 장면별 클립을 편집기에서 연결, **자막·로고·숫자는 후반 삽입**

**팁:** 품질 보조용으로 끝에 `4K, cinematic, professional, South Korea, no dialogue, no on-screen text` 를 유지합니다. (`no text` = AI가 글자를 깨뜨리지 않게)

---

### 🎨 Fal.ai (팔.에이아이)

**접속:** [fal.ai](https://fal.ai) → `video-generation` 또는 `Kling` 모델 선택

**입력 예시 (장면 3):**
```
[Same Korean operator character sheet pasted here]

Close-up of a high-tech maritime control dashboard,
dark navy interface with glowing cyan data visualizations,
animated radar sweep, real-time vessel tracking,
simplified Korean southern coastal map, professional Korean control room,
cinematic 4K, teal glow, no dialogue, silent, no readable text

Duration: 5 seconds
Aspect Ratio: 16:9
```

**권장 모델:**
- `Kling Video 1.6 Pro` — 사실적 영상, 기술 장면에 적합
- `Minimax Video 01` — 긴 영상, 캐릭터 없는 장면에 적합
- `Stable Video Diffusion` — 자연 장면(바다, 해조류)에 적합

---

### 🎬 Runway Gen-4 (런웨이)

**접속:** [runwayml.com](https://runwayml.com) → `Gen-4 Video`

**사용 방법:**
1. 영문 프롬프트 + **§0.4 영문 한 줄** + 인물 시트(해당 시)
2. "Style Reference"에 프로젝트 캡처(`submission-dashboard.png` 등) 첨부 가능 — UI는 **참고용**, 실제 납품 화면과 동일하다고 주장하지 않기
3. Camera Motion: `Slow zoom in` (장면1,8) / `Static` (장면3) / `Aerial` (장면4)

---

### 🌐 Sora (OpenAI, 챗GPT 유료)

**접속:** [sora.com](https://sora.com) 또는 ChatGPT Plus → Sora 탭

**입력 예시:**
```
Create a 10-second cinematic silent video (no dialogue, no voiceover):
A high-tech maritime control room in South Korea.
Large monitors show a dark navy dashboard with glowing cyan abstract data points
over a simplified Korean coastal map. Radar sweep rotates slowly.
One Korean adult operator, same character in every shot, not speaking.
Color: deep navy, teal, electric blue.
Style: professional Korean government documentary concept, 4K
No readable text on screen.
```

---

## 5. 영상 편집 연결 순서 (무료 편집툴: DaVinci Resolve / CapCut)

```
[타임라인 구성]

00:00 ─ 장면1 (드론 바다) ── 5초
00:05 ─ 장면2 (해저)      ── 7초
00:12 ─ 장면3 (대시보드)  ── 13초  ← 핵심 장면, 가장 길게
00:25 ─ 장면4 (선박)      ── 10초
00:35 ─ 장면5 (데이터)    ── 10초
00:45 ─ 장면6 (기상)      ── 5초
00:50 ─ 장면7 (해조류)    ── 7초
00:57 ─ 장면8 (로고)      ── 3초
```

**배경음악 (선택):**  
**대사·나레이션은 사용하지 않습니다.** 필요 시 **저작권-free instrumental**만 낮은 볼륨으로.  
- YouTube Audio Library: `cinematic ocean`, `tech documentary`, `ambient` (보컬 없는 트랙만)  
- Pixabay Music: `deep blue`, `marine`, `inspiring instrumental no vocals`

**믹싱:** 보이스 트랙 없음 → BGM만 있다면 **-14 LUFS** 근처로 맞추거나, **완전 무음**으로 제출처에 맞게 선택.

---

## 5-1. 구역 라벨 시각화 설명 자막 (영상 삽입용)

AI 클립에 글자를 맡기지 말고, **편집에서** 아래를 오버레이합니다.

| 장면 위치 | 표시 자막 | 지속 시간 |
|-----------|-----------|-----------|
| 데이터 시각화 (35~38초) | `A 구역 — 서부 연안` | 3초 |
| 데이터 시각화 (38~41초) | `B 구역 — 중부 연안` | 3초 |
| 데이터 시각화 (41~44초) | `C 구역 — 동부 연안` | 3초 |
| 클로즈업 컷 (42~45초) | `구역별 살포 추적(실데이터 연동 시 표기)` | 3초 |

**자막 스타일 권장:**
- 폰트: 나눔고딕 Bold 또는 고딕 계열
- 색상: `#40E0D0` (청록) 또는 흰색
- 배경: 반투명 검정 박스 (`rgba(0,0,0,0.55)`)
- 위치: 화면 하단 중앙 또는 해당 구역 위

---

## 6. 색상 팔레트 (영상 편집 시 컬러 그레이딩 기준)

| 색상 이름 | HEX 코드 | 용도 |
|-----------|----------|------|
| 딥 네이비 | `#031928` | 배경·기본 톤 |
| 사이언 (청록) | `#40E0D0` | 데이터 발광·포인트 |
| 미드 블루 | `#0e7490` | 그라디언트 중간 |
| 주황 (선박) | `#FF8A1F` | 선박 아이콘·포인트 |
| 흰색 | `#F0F9FF` | 텍스트·하이라이트 |

### 구역 라벨 색상 (살포 시점별 — UI·자막 디자인 참고)

| 구역 라벨 색 | HEX | 의미 |
|-------------|-----|------|
| 진한 빨강 | `#7f1d1d` (테두리 `#fecaca`) | 최근 45일 이내 |
| 주황 | `#c2410c` (테두리 `#fdba74`) | 약 3개월 전 |
| 분홍 | `#be185d` (테두리 `#fbcfe8`) | 약 1년 전 |
| 연분홍 | `#fda4af` | 약 2년 전 |
| 회색 | `#cbd5e1` | 2년 이상 |
| 검정 | `#171717` (테두리 `#a3a3a3`) | 검수 불일치 |

---

## 7. 납품·제출용 영상 스펙

| 항목 | 권장 사양 |
|------|-----------|
| **해상도** | 1920 × 1080 (FHD) 이상 |
| **프레임률** | 30fps 또는 60fps |
| **포맷** | MP4 (H.264 코덱) |
| **파일 크기** | 500MB 이하 권장 |
| **자막** | 한국어 자막(음성 없이 텍스트만) 삽입 권장 |
| **음성** | 없음(무음 또는 BGM만) |
| **음량** | BGM 사용 시 약 **-14 LUFS** 근처; 무음 제출 가능 |

---

*본 문서는 해양 종자 살포 관제 시스템 **컨셉** 홍보 영상 제작을 위한 AI 프롬프트 가이드입니다.*  
*연락처·사업자 정보는 제출 정책에 따라 선택 표기 — 담당: 박원평 · 010-4639-2673 · 사업자 302-47-00920*
