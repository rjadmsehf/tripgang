# 여행 일정표 패널, 초슬로우 0.05x 배속 및 대형 와이드 지도 구현 계획 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 0.05x/0.1x 초슬로우 배속을 지원하고, 지도를 400px 이상 대폭 확장하며, 우측 공간에 날짜별 여정 일정표(달력 타임라인)를 제공하여 클릭 시 해당 날짜로 포커스 및 재생 중 실시간 하이라이트를 연동한다.

**Architecture:** `timelineParser.js`의 `getFullPeriodSummary`에서 각 날짜별 방문지(`placesSummary`)와 이동 거리/수단 정보를 담은 `itineraryList`를 산출하고, `TimelineVisualizer.jsx`에서 3단 와이드 레이아웃(좌측 설정, 중앙 대형 지도, 우측 일정표)과 0.05x/0.1x 배속, 카드 클릭 인터랙션을 구현한다.

**Tech Stack:** React 18, Leaflet, Vitest, Lucide React, CSS Grid/Flexbox

## Global Constraints
- React 18 & Vite 빌드 통과 필수
- Vitest 단위 테스트 100% 통과 필수

---

### Task 1: `timelineParser.js`에 일자별 여정 요약(`itineraryList`) 추출 로직 구현 (TDD)

**Files:**
- Modify: `src/services/timelineParser.js`
- Test: `src/services/timelineParser.test.js`

**Interfaces:**
- `getFullPeriodSummary(parsedTimeline)` 반환 객체에 `itineraryList: ItineraryItem[]` 추가:
  ```typescript
  interface ItineraryItem {
    dayNum: number; // 1, 2, 3...
    dateStr: string; // '2026-08-24'
    displayDate: string; // '8월 24일' or '08.24'
    placesSummary: string; // e.g. "시부야 ➔ 신주쿠" or "도보 이동 ➔ 장소 방문"
    distanceKm: number; // 당일 이동 거리 (km, 소수점 1자리)
    modes: string[]; // 당일 사용된 수단 라벨 목록
  }
  ```

- [ ] **Step 1: Write the failing test**
  `src/services/timelineParser.test.js`에 `itineraryList` 추출 검증 테스트 작성:
  - 다중 날짜 및 장소 방문 데이터 입력 시 `dayNum`, `placesSummary`("장소A ➔ 장소B"), `distanceKm` 계산 검증.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/services/timelineParser.test.js`
  Expected: FAIL.
- [ ] **Step 3: Implement `itineraryList` generation in `timelineParser.js`**
  - 각 날짜의 activities를 순회하며 `STILL` 또는 장소 방문이 있는 경우 고유 장소명을 순서대로 수집 (최대 3~4개)하여 ` ➔ `로 연결.
  - 장소명이 없거나 단순 이동인 경우: "도보 Xkm ➔ 차량 Ykm" 또는 당일 주요 활동 요약 반환.
  - 당일 누적 거리(`distanceKm`) 및 수단(`modes`) 집계.
- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/services/timelineParser.test.js`
  Expected: PASS.
- [ ] **Step 5: Commit**
  Run: `git add src/services/timelineParser.js src/services/timelineParser.test.js && git commit -m "feat: extract daily itineraryList with placesSummary in timelineParser"`

---

### Task 2: 0.05x 배속, 3단 와이드 대형 지도 및 우측 여정 일정표 UI 구현

**Files:**
- Modify: `src/components/TimelineVisualizer.jsx`
- Modify: `src/components/TimelineVisualizer.css`
- Modify: `src/components/TimelineVisualizer.test.jsx`

- [ ] **Step 1: 0.05x / 0.1x 초슬로우 배속 옵션 추가**
  - `<option value={0.05}>0.05x (초슬로우 · 20배 느리게)</option>`
  - `<option value={0.1}>0.1x (극슬로우 · 10배 느리게)</option>`
  - `0.25x`, `0.5x`, `1x`, `2x` 유지.

- [ ] **Step 2: 3단 와이드 레이아웃 및 지도 400px 이상 확장**
  - 좌측 사이드바: 250px 슬림화.
  - 중앙 지도 영역: `flex: 1`, 와이드 확장, `.timeline-container`: `height: calc(100vh - 80px); max-width: 100%;`.
  - 우측 패널: 320px 너비의 여정 일정표(`itinerary-panel`) 배치.

- [ ] **Step 3: 우측 "여행 여정 일정표" 카드 리스트 렌더링**
  - 상단: `🗓️ 여행 일정표` 타이틀 & 접기/펼치기 토글 버튼.
  - 본문: `tripSummary.itineraryList` 순회:
    - `Day N (M월 D일)` 헤더.
    - `📍 placesSummary` (예: `시부야 ➔ 신주쿠`).
    - `📏 X.X km · [수단 뱃지들]`.
  - 카드 클릭 이벤트: 클릭한 카드의 `item.dateStr`을 `selectedDayFilter`로 설정하여 지도 즉시 포커스.
  - 재생 중 활성화: 현재 재생 시점의 날짜(`currentPoint.date`)와 일치하는 카드에 `.active-day-card` (에메랄드/청록 Glow) 스타일 자동 부여.

- [ ] **Step 4: Verify build & tests**
  - `npm run test` (100% 통과)
  - `npm run build` (클린 빌드)
- [ ] **Step 5: Commit**
  - `git add src/components/TimelineVisualizer.jsx src/components/TimelineVisualizer.css src/components/TimelineVisualizer.test.jsx && git commit -m "feat: add itinerary timeline panel, ultra-slow 0.05x speed, and 3-column wide map layout"`

---

### Task 3: 최종 검증 및 GitHub 푸시 (Vercel 배포 최신화)

- [ ] **Step 1: Run full test suite & production build**
- [ ] **Step 2: Push to GitHub main and feature branch**
- [ ] **Step 3: Verify live deployment**
