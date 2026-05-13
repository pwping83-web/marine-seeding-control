# Gemini 이미지 생성 프롬프트 — 특허 도면용

> **사용법:**  
> 각 장의 프롬프트를 [Gemini](https://gemini.google.com/) 또는 Google AI Studio 이미지 생성에 **그대로 붙여넣기**한다.  
> **공통 Negative prompt**를 매 장마다 추가하면 잡음이 줄어든다.  
> 생성 후 한글 부호 설명(10 해상 단말, 20 엣지 함수…)은 **PowerPoint·Inkscape에서 덧입력**하고 PNG로 내보낸다.
>
> **필요 장수:** 필수 3장(도 1~3) + 선택 2장(도 4~5) = 최대 5장

---

## 공통 Negative prompt (모든 장에 동일 적용)

```
photorealistic, 3D render, photo, blurry text, illegible characters, watermark,
logo, decorative icons, gradient background, shadows, artistic style, cluttered,
low resolution, Korean characters inside image
```

---

## 도 1 — 시스템 전체 구성도 【필수】

> 저장 파일명: `fig01_system_architecture.png`

```
Technical patent-style system block diagram, pure white background, black thin
lines only, very light gray (#F5F5F5) fills inside boxes only, high resolution
print quality, landscape orientation 16:9, clean vector-like flat diagram,
no perspective, no shadows, no artistic elements.

Layout: five columns arranged left to right with all boxes center-aligned
horizontally on the same baseline.

Column 1 — Far left:
  Rounded rectangle, label inside "10  Marine Terminal" (larger text, bold),
  three sub-lines below in smaller text: "GPIO seed-drop input",
  "HTTPS POST only (no DB key)", "GNSS / optional NMEA".
  A minimal single-stroke antenna symbol on top of the box (3 arcs + vertical
  line, line art only).

Column 2 — Two vertically stacked boxes (upper + lower), separated by 20 px gap:
  Upper box: "20  Edge: telemetry-ingest"
    Bullet list inside (small text, 3 lines):
      · verify X-Device-Ingest-Key
      · schema + size validation
      · rate limit (per-IP & global)
  Lower box: "30  Edge: vessel-track-ingest"
    Bullet list inside (small text, 3 lines):
      · verify X-Device-Ingest-Key
      · schema + size validation
      · rate limit (per-IP & global, different threshold)

  Arrows from Column 1 box to Column 2 upper box: solid arrow, label "HTTPS POST
  seed JSON" (above arrow).
  Arrows from Column 1 box to Column 2 lower box: solid arrow, label "HTTPS POST
  track JSON" (below arrow).

Column 3 — Center:
  Single taller rounded rectangle "40  Database" internally divided by a thin
  horizontal line at 50% height:
    Upper half text: "seed_drop_records"
    Lower half text: "vessel_track_points"
  Arrow from Column 2 upper box to upper half of Column 3: label "upsert".
  Arrow from Column 2 lower box to lower half of Column 3: label "insert".

Column 4 — Right of database:
  Rounded rectangle "50  Control Web (Dashboard)"
  Two lines inside: "map + age-colored markers", "route / seeding-plan panels".
  Bidirectional dashed arrow between Column 3 and Column 4:
    rightward label "query / subscribe", leftward implied by arrowhead.

Column 5 — Top-right, above and slightly right of Column 4:
  Smaller rounded rectangle "60  Weather Server (KMA API)".
  Dashed arrow from Column 5 downward to Column 4 box, label "weather fetch".

Reference numerals 10, 20, 30, 40, 50, 60: each in a small black circle placed
at the top-left corner of its respective box.

Empty margin 5% on all sides. No title text in the image. All text English only.
```

---

## 도 2 — 관제 대시보드 화면 (지도·마커·궤적) 【필수】

> 저장 파일명: `fig02_dashboard_map.png`

```
Flat UI wireframe mockup for a marine seeding control dashboard, patent figure
style, white background, thin black outlines everywhere, no color fills except
the specific colors noted, no photorealism, landscape 16:9, high clarity, all
text in English.

Overall three-column layout separated by thin vertical divider lines:

LEFT COLUMN (18% width) — "Side panel":
  Title bar at top: small bold text "Dashboard".
  Three stacked section blocks, each as a thin-outlined rectangle:
    Block A — "Seed history": contains 4 rows of placeholder text
              (gray horizontal bars of varying width, no real words).
    Block B — "Track toggle": a simple toggle-style switch outline +
              label "vessel track on/off".
    Block C — "Legend":
              Four rows, each with a filled circle and a label:
                ● green circle  "0 – 45 days"
                ● yellow circle "46 – 120 days"
                ● orange circle "121 – 400 days"
                ● gray circle   "401 + days"

CENTER (64% width) — "Map area":
  Light blue (#D6EAF8) filled large rectangle representing the sea.
  Very faint grid lines (latitude / longitude, dotted, light gray) at
  every 20 px visually.
  A smooth black curve on the left edge representing a simplified coastline;
  the coastline creates a small bay shape at center-left.

  Seed-drop markers: 8 filled circles placed on the sea area (not touching
  coastline):
    3 green circles (recent), 2 yellow circles (mid-age),
    2 orange circles (old-ish), 1 gray circle (oldest).
  Each marker circle: 10 px radius, black 1 px stroke.

  Vessel track: a continuous thin polyline (dark green, 1.5 px, solid) passing
  through 6 of the 8 marker positions in order, with small filled arrowheads
  every other segment showing direction of movement.

  Computed route overlay: a dashed purple polyline (dash 6 px gap 4 px)
  from a square labeled "S" (start) at top-left sea area to a square labeled
  "G" (goal) at bottom-right sea area, with 4 waypoint circles labeled
  W1, W2, W3, W4 (small white circles with black stroke and tiny bold text
  inside) placed along the dashed line.

  One convex-hull polygon drawn as a thin red dashed closed polygon enclosing
  the 8 markers, with a leader line extending to a small tooltip box outside
  the hull labeled "est. area: 12.4 ha (ref.)".

RIGHT COLUMN (18% width) — "Info panel":
  Title "Route info" in small bold text.
  Stacked label-value rows:
    "Waypoints: 4"
    "Total dist: 8.3 km"
    "Est. time: 57 min"
    "Speed assumed: 4.5 kt"
  Divider line.
  Below divider: "Seeding plan" block with 2 gray placeholder rows.

TOP HEADER BAR (full width, 5% height): uniform light gray (#EEEEEE) fill,
  three minimal monochrome line icons on the right (gear, user, bell shapes).
  Left side: plain text "Marine Seeding Control" (small, bold).

No real map tiles, no satellite imagery, no brand logos.
```

---

## 도 3 — 살포 계획·항로 생성 화면 (A*, 웨이포인트) 【필수】

> 저장 파일명: `fig03_route_planning.png`

```
Flat UI wireframe for a marine seeding route-planning panel, patent figure style,
white background, thin black outlines, no photorealism, landscape 16:9, English
only, clean vector appearance.

TOP BAR (full width, 6% height): plain outline bar. Right side contains two
outlined rectangle buttons: "Compute Route" and "Export Waypoints" (small
sans-serif text inside). Left side: plain text "Seeding Plan / Route".

MAIN AREA below top bar: split into LEFT PANEL (32% width) and RIGHT PANEL
(68% width) by a thin vertical divider.

LEFT PANEL — "Plan Inputs":
  Three grouped sections, each surrounded by a thin rounded rectangle with a
  small section-title label at top-left (small caps style):

  Section 1 "Obstacles":
    Two rows, each: label text on left + narrow outlined input-box on right:
      Row 1: "Reef radius (km)"    [___]
      Row 2: "Protected zone (km)" [___]

  Section 2 "Weather":
    Three rows:
      Row 1: "Wind direction (°)"  [___]
      Row 2: "Wind speed (m/s)"    [___]
      Row 3: "Gust delta (m/s)"    [___]

  Section 3 "Grid / A* settings":
    Three rows:
      Row 1: "Step size (deg)"     [___]
      Row 2: "Max iterations"      [___]
      Row 3: "Vessel speed (kt)"   [___]
    Small italic note below: "haversine × weather multiplier (max ×2.8)"

RIGHT PANEL — "Route Output":
  Upper 55% height — mini map:
    Light blue (#D6EAF8) background rectangle representing the sea.
    Two dashed red circles representing obstacle exclusion zones (one large
    top-right, one smaller bottom-left).
    Faint dotted grid pattern over the whole mini map (implied grid cells).
    Inside obstacle circles: dense cross-hatching (///) indicating excluded
    cells, no path passes through them.
    Start square "S" (white fill, black stroke, bold "S" inside) top-left of
    map.
    Goal square "G" (white fill, black stroke, bold "G" inside) bottom-right
    of map.
    Computed A* path: thick black polyline (2 px) from S to G, curving around
    both obstacle circles, with small forward arrowheads every 3rd segment.
    Six waypoint circles W1–W6 placed along the path (small white circles,
    black 1 px stroke, bold number inside).
    Wind direction indicator: a single thick arrow in the top-right corner of
    the map panel pointing in one direction, labeled "wind →" in tiny text.

  Lower 45% height — waypoint table:
    Table with header row (gray #EEEEEE fill) and 6 data rows.
    Columns: "Seq" | "Lat" | "Lng" | "Dist (km)" | "Weather ×"
    Header text bold, column separator lines thin.
    Data rows (representative placeholder numbers, monospaced style):
      1 | 35.120 | 129.080 | —      | 1.00
      2 | 35.112 | 129.091 | 1.34   | 1.42
      3 | 35.103 | 129.103 | 1.58   | 1.87
      4 | 35.096 | 129.118 | 1.72   | 1.20
      5 | 35.088 | 129.129 | 1.45   | 1.05
      6 | 35.079 | 129.140 | 1.61   | 1.00
    Bottom row (no border): "Total: 8.3 km  |  Est. time: 57 min  |
    assumed speed: 4.5 kt"

No Korean text anywhere in the image.
```

---

## 도 4 — 살포 이력 연령 색 비교 【선택 권장】

> 저장 파일명: `fig04_marker_age_bands.png`

```
Patent-style explanatory diagram comparing seed-drop marker age-band coloring,
white background, black lines, landscape 4:3 ratio, flat, crisp, English only.

TITLE LINE at top-center (small caps): "MARKER AGE VISUALIZATION"

TWO SIDE-BY-SIDE MAP PANELS with a thin divider between them:

Left panel — "Panel A: recent seeding event":
  Light blue rectangle (sea).
  6 seed-drop markers, 5 green filled circles + 1 yellow filled circle.
  Label below panel (outside rectangle): "Panel A — recent drop"

Right panel — "Panel B: multi-year record":
  Light blue rectangle (sea).
  8 seed-drop markers: 2 green, 2 yellow, 2 orange, 2 gray circles.
  Label below panel: "Panel B — mixed age layers"

LEGEND STRIP below both panels, centered, titled "Age bands":
  Four swatches in a row (each: filled circle + short label):
    ● green  "0 – 45 days (recent)"
    ● yellow "46 – 120 days"
    ● orange "121 – 400 days"
    ● gray   "401 + days (oldest)"

TIMELINE AXIS below legend:
  Horizontal arrow line labeled "Time" on the right end.
  Five tick marks labeled: "T-800d", "T-400d", "T-120d", "T-45d", "Now".
  Thin vertical dashed lines from each tick rising upward toward a
  corresponding color swatch to visually link time range to band color.

All fills use only the named colors. No gradients. No decorative elements.
```

---

## 도 5 — 데이터 흐름 시퀀스 【선택, 변리사 요청 시】

> 저장 파일명: `fig05_sequence_data_flow.png`

```
Classic UML sequence diagram, patent technical figure style, monochrome (black
lines on pure white), portrait orientation 3:4, very clean thin lines, English
only, no color fills except very light gray (#F0F0F0) on activation bars.

LIFELINES (4 vertical dashed lines, left to right, evenly spaced, each with a
box at the top containing the lifeline name in bold):
  1. "Marine Terminal"
  2. "Edge (ingest)"
  3. "Database"
  4. "Control Web"

MESSAGES (horizontal arrows between lifelines, labeled, numbered with small
circled numerals 1–8 on the far-left margin):

① Terminal → Edge:        solid arrow, label "POST /telemetry-ingest  { seed JSON }"
② Edge → Edge (self):     small arc returning to same lifeline,
                          label "verify key + validate schema + check rate limit"
③ Edge → Database:        solid arrow, label "UPSERT seed_drop_records"
④ Database → Edge:        dashed return arrow, label "200 OK"
⑤ Terminal → Edge:        solid arrow (slightly below ③),
                          label "POST /vessel-track-ingest  { track points }"
⑥ Edge → Database:        solid arrow, label "INSERT vessel_track_points"
⑦ Database → Edge:        dashed return arrow, label "200 OK"
⑧ Control Web → Database: solid arrow, label "SELECT seed_drop_records WHERE ..."
   Database → Control Web: dashed return arrow, label "rows []"

ACTIVATION BARS: thin light-gray filled rectangles on the lifelines during
active processing steps (Edge active during ①–④, Database active during ③–④
and ⑥–⑦).

STEP NUMBERS: small black circles with white bold number inside, placed at the
left margin aligned with each outgoing arrow.

No Korean text. No color fills other than the gray activation bars. No decorative
elements.
```

---

## 작업 순서 요약

| 순서 | 할 일 |
|------|-------|
| 1 | Gemini에서 **도 1** 먼저 생성 → 부호·한글 라벨 PPT에서 추가 → PNG 저장 |
| 2 | **도 2·3** 생성 (실제 `npm run dev` 캡처로 대체해도 됨) |
| 3 | **도 4** 생성 (한 장짜리라 빠름) |
| 4 | **도 5** 는 변리사 요청 시에만 |
| 5 | 완성 PNG를 이 폴더(`figures/`)에 저장 후 변리사 패키지 ZIP에 포함 |

---

*작성 기준: `출원-명세-합본-초안-복사용.md`, `발명의-구체적-실시예-전문.md`, `04-도면-캡처-첨부-안내.md`*
