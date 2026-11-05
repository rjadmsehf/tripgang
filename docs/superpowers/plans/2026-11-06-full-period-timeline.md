# 전체 기간 타임라인 일괄 시각화 구현 계획 (Full Period Timeline Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구글 타임라인 파일 업로드 시 개별 날짜 선택 없이, 파일 내 전체 여행 기간의 모든 경로를 시간순으로 자동 통합하여 지도 시각화, 연속 재생 애니메이션 및 비디오 내보내기(GIF/MP4)를 제공한다.

**Architecture:** `timelineParser.js`에 전체 일자 통합 및 요약 집계 함수(`getFullPeriodSummary`)를 추가하고, `TimelineVisualizer.jsx`에서 단일 날짜 선택 state를 제거하고 전체 기간 요약 카드 및 전체 경로 렌더링, 현재 시점 날짜/시간 마커 툴팁을 적용한다.

**Tech Stack:** React 18, Leaflet, Vitest, Lucide React, gifshot, Canvas captureStream

## Global Constraints
- React 18 & Vite 빌드 통과 필수
- Vitest 기존 단위 테스트 및 신규 단위 테스트 100% 통과 필수
- 외부 추가 의존성 없이 기존 Leaflet, gifshot, Canvas 활용

---

### Task 1: `timelineParser.js`에 전체 기간 집계 함수(`getFullPeriodSummary`) 구현 (TDD)

**Files:**
- Modify: `src/services/timelineParser.js`
- Test: `src/services/timelineParser.test.js`

**Interfaces:**
- Produces: `getFullPeriodSummary(parsedTimeline: Record<string, { date: string, activities: Activity[] }>) => TripSummary`
  ```typescript
  interface TripSummary {
    startDate: string; // 'YYYY-MM-DD'
    endDate: string; // 'YYYY-MM-DD'
    totalDays: number;
    allActivities: Activity[];
    allPoints: Array<{ lat: number; lng: number; time: number; type: string; label: string }>;
    totalDistanceMeters: number;
    usedModes: string[];
  }
  ```

- [ ] **Step 1: Write the failing test**
  `src/services/timelineParser.test.js`에 `getFullPeriodSummary`에 대한 단위 테스트 추가:
  - 2일 이상의 다중 일자 데이터 입력 시 시작일, 종료일, totalDays(일수), allPoints(시간순 정렬), totalDistanceMeters, usedModes 검증.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/services/timelineParser.test.js`
  Expected: FAIL with `getFullPeriodSummary is not defined` or similar

- [ ] **Step 3: Implement `getFullPeriodSummary` in `src/services/timelineParser.js`**
  - 모든 일자의 activities를 모아서 시간순 정렬.
  - allPoints를 추출하여 시간순 정렬.
  - Haversine 공식을 사용해 allPoints 간 누적 거리 계산.
  - 시작일(`startDate`), 종료일(`endDate`), 일수(`totalDays`), 고유 이동 수단 목록(`usedModes`) 산출.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/services/timelineParser.test.js`
  Expected: PASS

- [ ] **Step 5: Commit**
  Run: `git add src/services/timelineParser.js src/services/timelineParser.test.js && git commit -m "feat: add getFullPeriodSummary to timelineParser with tests"`

---

### Task 2: `TimelineVisualizer.jsx` 전체 기간 시각화 및 UI 개편

**Files:**
- Modify: `src/components/TimelineVisualizer.jsx`
- Modify: `src/components/TimelineVisualizer.css`

**Interfaces:**
- Consumes: `getFullPeriodSummary` from `src/services/timelineParser.js`

- [ ] **Step 1: Update `TimelineVisualizer.jsx` state and upload handler**
  - `selectedDate` 및 `dates` 관련 단일 날짜 선택 로직을 `tripSummary` 상태로 교체.
  - 파일 업로드 성공 시:
    ```javascript
    const parsed = parseTimelineJson(json);
    const summary = getFullPeriodSummary(parsed);
    setTripSummary(summary);
    ```
  - `activePoints`: `tripSummary ? tripSummary.allPoints : []` 사용.

- [ ] **Step 2: Update Sidebar UI**
  - 개별 날짜 선택 드롭다운 제거.
  - `tripSummary`가 있을 때:
    - 🗓️ 여행 기간: `${tripSummary.startDate} ~ ${tripSummary.endDate} (${tripSummary.totalDays}일간)`
    - 📏 총 이동 거리: `${(tripSummary.totalDistanceMeters / 1000).toFixed(1)} km`
    - 🚗 이용된 이동 수단 뱃지 목록 (`tripSummary.usedModes.map(...)`)

- [ ] **Step 3: Update Map Polylines and Current Marker Tooltip**
  - `polylineGroupRef`에 `tripSummary.allActivities`의 모든 경로를 색상별로 한 번에 그림.
  - 애니메이션 재생 시 마커(`markerRef`)에 현재 포인트의 날짜와 시간(`MM.DD HH:mm · 수단`)을 Leaflet 툴팁 또는 HTML 아이콘 뱃지로 표시.

- [ ] **Step 4: Update Video Export for Full Period**
  - 내보내기 시 파일명: `timeline-${tripSummary.startDate}_to_${tripSummary.endDate}.${exportFormat}`
  - `activePoints` 전체를 대상으로 프레임 보간 및 렌더링.

- [ ] **Step 5: Run tests and build**
  Run: `npm run test` and `npm run build`
  Expected: All tests pass, build succeeds.

- [ ] **Step 6: Commit**
  Run: `git add src/components/TimelineVisualizer.jsx src/components/TimelineVisualizer.css && git commit -m "feat: implement full period visualizer UI and continuous playback"`

---

### Task 3: 최종 검증 및 개발 서버 가동

**Files:** None (검증 작업)

- [ ] **Step 1: Check running Vite server**
  개발 서버(5173 포트) 가동 상태 확인 및 HMR 반영 확인.
- [ ] **Step 2: Final Verification Checklist**
  - 전체 기간 자동 산출 및 표시 확인
  - 지도에 전체 경로 연결 확인
  - 1x~20x 배속 재생 및 마커 상단 일시 뱃지 갱신 확인
  - GIF / MP4 내보내기 확인
