# 여행 하이라이트 요약 재생 및 대형 지도 구현 계획 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 24시간 실시간 정지 공백을 압축하여 실제 이동 경로 중심의 매끄러운 여행 하이라이트 애니메이션을 제공하고, 비행기 250km/h 기준, 날짜 선택 필터(전체/Day N), 도보 뚜렷한 표시, 대형 와이드 지도 뷰를 구축한다.

**Architecture:** `timelineParser.js`에서 속도 250km/h 이상 또는 100km 이상 도시간 점프를 비행기로 분류하고, `TimelineVisualizer.jsx`에서 날짜 선택 필터(`selectedDayFilter`), 거리 기반 하이라이트 보간 재생 로직, 날짜 단위 배너, 슬림 사이드바 및 대형 지도 레이아웃을 구현한다.

**Tech Stack:** React 18, Leaflet, Vitest, Lucide React, CSS Grid/Flexbox

## Global Constraints
- React 18 & Vite 빌드 통과 필수
- Vitest 단위 테스트 100% 통과 필수

---

### Task 1: `timelineParser.js`에 비행기 250km/h 기준 및 도보 판정 보강 (TDD)

**Files:**
- Modify: `src/services/timelineParser.js`
- Test: `src/services/timelineParser.test.js`

**Interfaces:**
- Speed heuristic:
  - `< 2.0 m/s` (~7 km/h): `WALKING` (걷기)
  - `2.0 ~ 8.0 m/s`: `CYCLING` (자전거)
  - `8.0 ~ 70.0 m/s` (~250 km/h): `VEHICLE` (자동차/기차 등)
  - `> 70.0 m/s` (> 250 km/h) or distance > 100km: `FLYING` (비행기)
- `getFullPeriodSummary`: 각 날짜별 `dateList: string[]` (`['2024-05-01', '2024-05-02', ...]`) 배열을 반환 객체에 포함하여 UI에서 Day 1, Day 2로 쉽게 매핑할 수 있도록 함.

- [ ] **Step 1: Write the failing test**
  `src/services/timelineParser.test.js`에:
  - 150km/h 속도는 VEHICLE(자동차/기차)로 분류되는지 검증 (기존에는 비행기로 가던 것 방지).
  - 300km/h (> 250km/h) 속도는 FLYING(비행기)으로 분류되는지 검증.
  - `getFullPeriodSummary` 결과에 `dateList`가 정렬된 배열로 들어있는지 검증.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/services/timelineParser.test.js`
  Expected: FAIL
- [ ] **Step 3: Implement 250km/h threshold and `dateList` in `timelineParser.js`**
- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/services/timelineParser.test.js`
  Expected: PASS
- [ ] **Step 5: Commit**
  Run: `git add src/services/timelineParser.js src/services/timelineParser.test.js && git commit -m "feat: adjust airplane speed threshold to 250km/h and provide dateList in summary"`

---

### Task 2: 날짜 선택기, 대형 와이드 지도, 부드러운 하이라이트 재생 및 비행 모션 구현

**Files:**
- Modify: `src/components/TimelineVisualizer.jsx`
- Modify: `src/components/TimelineVisualizer.css`
- Modify: `src/components/TimelineVisualizer.test.jsx`

- [ ] **Step 1: 날짜 선택 필터 (`selectedDayFilter`) state 및 UI 추가**
  - 옵션: `ALL` (전체 일정 요약 보기), 그리고 `tripSummary.dateList`를 순회하며 `Day 1 (05.01)`, `Day 2 (05.02)` 옵션 제공.
  - `activePoints`: `selectedDayFilter === 'ALL'`이면 `tripSummary.allPoints`, 특정 날짜면 해당 날짜의 포인트만 필터링.
  - 날짜 변경 시: 지도에 해당 날짜의 경로만 그리고 `fitBounds`를 다시 맞춰서 어지러움 완벽 해소.

- [ ] **Step 2: 24시간 공백 없는 '부드러운 이동 하이라이트 재생' 엔진**
  - 수면이나 몇 시간 동안 멈춰있는 시간 공백을 억지로 기다리지 않고, 이동 궤적(Points)을 따라 유려하고 균일하게 나아가도록 보간.
  - 마커 상단 및 재생 바: 복잡한 시/분/초 시계 대신 **"Day 1 · 05.01"**, **"Day 2 · 05.02"** 처럼 날짜 중심의 큼직하고 세련된 배너 표시.
  - 도보(형광 민트), 자동차(블루), 비행기(핑크/마젠타) 표시.

- [ ] **Step 3: 비행기 회전 모션 및 감속 연출 강화**
  - 비행기 구간일 때:
    - ✈️ 마커 크기 36px, 진행 방향 각도로 회전.
    - 비행 구간에서는 재생 속도를 0.25x로 자동 감속하여 하늘을 날아가는 모습이 뚜렷하게 관찰되도록 처리.

- [ ] **Step 4: 대형 와이드 지도 레이아웃 개편**
  - 사이드바 폭을 290px로 슬림화.
  - `.timeline-container`: `height: calc(100vh - 100px); width: 100%;` 화면 대부분을 지도가 차지하도록 확장.
  - 지도 우측에 약간의 시각적 여백을 두어 안정감 제공.

- [ ] **Step 5: Run tests and build**
  - `npm run test` (100% 통과)
  - `npm run build` (클린 빌드)
- [ ] **Step 6: Commit**
  - `git add src/components/TimelineVisualizer.jsx src/components/TimelineVisualizer.css src/components/TimelineVisualizer.test.jsx && git commit -m "feat: add date selection filter, expanded wide map layout, and smooth highlight playback"`

---

### Task 3: 최종 검증 및 GitHub 푸시 (Vercel 자동 배포 트리거)

- [ ] **Step 1: Run full test suite & production build**
- [ ] **Step 2: Push to GitHub main branch (`git push origin main`)**
- [ ] **Step 3: Verify deployment**
