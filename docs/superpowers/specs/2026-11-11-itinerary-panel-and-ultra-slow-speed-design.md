# 여행 일정표 패널, 초슬로우 0.05x 배속 및 대형 와이드 지도 설계 (Itinerary Panel, Ultra-Slow Speed & Wide Map Design)

## 1. 개요 (Overview)
기존의 지도 및 사이드바 레이아웃에 우측 **"날짜별 여정 일정표(달력형 타임라인)"** 패널을 추가하여 매일의 이동 요약(예: `도쿄 시부야 ➔ 신주쿠`, 이동 거리 및 수단)을 한눈에 보여주고, 클릭 시 해당 일자로 지도 포커스 및 재생 중 활성화 카드를 하이라이트한다. 또한 `0.05x`, `0.1x` 초슬로우 배속을 추가하고 지도 영역을 400px 이상 대폭 확장한다.

---

## 2. 세부 사양 (Specifications)

### 2.1 초슬로우 배속 옵션 추가
- 속도 옵션:
  - `0.05`: `0.05x (초슬로우 · 20배 느리게)`
  - `0.1`: `0.1x (극슬로우 · 10배 느리게)`
  - `0.25`: `0.25x (매우 느리게)`
  - `0.5`: `0.5x (느리게)`
  - `1`: `1x (보통 · 기본값)`
  - `2`: `2x (빠르게)`

### 2.2 날짜별 여정 일정표 (Itinerary Timeline Panel)
1. **장소 및 이동 경로 요약 생성 알고리즘 (`timelineParser.js`)**:
   - `getFullPeriodSummary`에서 각 날짜별 `dayItinerary: { dayNum, dateStr, displayDate, placesSummary, distanceKm, modes }` 추출:
     - `placesSummary`: 당일 `placeVisit`의 장소명(`label`) 중 중복을 제거하고 순서대로 최대 3~4개를 화살표(`➔`)로 연결 (예: `시부야 ➔ 신주쿠 ➔ 도쿄역`).
     - 장소명이 없거나 단순 이동인 경우: 주요 이동 경로(예: `도보 1.8km ➔ 차량 14km` 또는 출발지/도착지 좌표 기반 대표 지점)로 요약.
2. **우측 일정표 패널 UI**:
   - 상단: `🗓️ 여행 여정 일정표 (총 N일간)` 타이틀 및 접기/펼치기 토글.
   - 본문: 일자별 카드 리스트 (스크롤 지원).
   - 카드 클릭: `selectedDayFilter`를 해당 날짜로 변경하고 지도를 해당 일자 경로로 `fitBounds`.
   - 실시간 하이라이트: 재생 진행 중 현재 마커가 위치한 일자의 카드가 밝은 청록색(Glow)으로 활성화.

### 2.3 3단 와이드 레이아웃 & 대형 지도
- 전체 컨테이너: 가로 최대 너비 제한 해제 및 화면 높이 극대화 (`height: calc(100vh - 80px)`).
- 좌측 사이드바: 250px 슬림 패널 (파일 업로드, 속도 설정, 비디오 내보내기).
- 중앙 지도: `flex: 1`, 기존 대비 가로/세로 400px 이상 시원하게 확장.
- 우측 일정표: 320px 독립 패널 (토글 가능).

---

## 3. 변경 대상 파일
- `src/services/timelineParser.js` & `src/services/timelineParser.test.js`: 일자별 장소 요약(`placesSummary`, `itineraryList`) 집계 함수.
- `src/components/TimelineVisualizer.jsx`: 우측 일정표 컴포넌트, 0.05x 배속, 카드 클릭 연동, 현재 일자 하이라이트.
- `src/components/TimelineVisualizer.css`: 3단 와이드 그리드/플렉스 레이아웃, 일정표 카드 스타일링.
