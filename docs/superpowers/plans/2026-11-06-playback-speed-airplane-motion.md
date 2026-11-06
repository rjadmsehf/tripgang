# 타임라인 재생 속도 감속, 비행기 비행 모션 및 UI 안정화 구현 계획 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타임라인 재생 기본 속도를 천천히 감속하고(1배속 기본, 0.25x~4x), 비행기 장거리 이동 시 방향 회전 모션 및 비행 감속을 적용하며, 텍스트 변경 시 칸 밀림을 방지하는 고정폭 레이아웃과 감각적인 재생/정지 버튼을 구축한다.

**Architecture:** `timelineParser.js`에 Bearing(방위각) 계산 유틸리티를 추가하고, `TimelineVisualizer.jsx`와 그 스타일시트에서 재생 배속 팩터 조정, 비행기 마커 회전, 고정 너비 인디케이터, 영상 내보내기 30~120초 옵션을 반영한다.

**Tech Stack:** React 18, Leaflet, Vitest, Lucide React, CSS Grid/Flexbox

## Global Constraints
- React 18 & Vite 빌드 통과
- Vitest 단위 테스트 100% 통과
- 외부 라이브러리 추가 없이 기존 스택 활용

---

### Task 1: `timelineParser.js`에 방위각(`calculateBearing`) 유틸리티 구현 (TDD)

**Files:**
- Modify: `src/services/timelineParser.js`
- Test: `src/services/timelineParser.test.js`

**Interfaces:**
- Produces: `calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number` (returns degrees 0..360, where 0 is North, 90 is East, etc.)

- [ ] **Step 1: Write the failing test**
  `src/services/timelineParser.test.js`에 `calculateBearing` 테스트 작성:
  - 북쪽 이동 (0도), 동쪽 이동 (90도), 남쪽 이동 (180도), 서쪽 이동 (270도).
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/services/timelineParser.test.js`
  Expected: FAIL with `calculateBearing is not defined`.
- [ ] **Step 3: Implement `calculateBearing` in `src/services/timelineParser.js`**
  ```javascript
  export function calculateBearing(lat1, lon1, lat2, lon2) {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    const theta = Math.atan2(y, x);
    return (theta * 180 / Math.PI + 360) % 360;
  }
  ```
- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/services/timelineParser.test.js`
  Expected: PASS.
- [ ] **Step 5: Commit**
  Run: `git add src/services/timelineParser.js src/services/timelineParser.test.js && git commit -m "feat: add calculateBearing utility with tests"`

---

### Task 2: 재생 속도 감속, 비행기 비행 모션, 버튼 비주얼 및 고정폭 레이아웃 적용

**Files:**
- Modify: `src/components/TimelineVisualizer.jsx`
- Modify: `src/components/TimelineVisualizer.css`

- [ ] **Step 1: 재생 속도 및 배속 옵션 개편**
  - `speedMultiplier` 기본값을 `1`로 설정.
  - 재생 속도 옵션 변경:
    - `0.25`: `0.25x (매우 느리게)`
    - `0.5`: `0.5x (느리게)`
    - `1`: `1x (보통 · 기본)`
    - `2`: `2x (빠르게)`
    - `4`: `4x (매우 빠르게)`
  - 재생 진척도 스케일: 기본 1배속 기준 전체 완주 시간을 70초 수준으로 여유 있게 설정:
    `const next = prev + (delta / 1000 * speedMultiplier) / 70;`
  - 비디오 내보내기 시간 옵션: `30초`, `60초`, `90초`, `120초(2분)`로 확장 (기본값: 60초).

- [ ] **Step 2: 비행기 장거리 모션 및 감속 연출**
  - 현재 포인트와 다음 포인트의 거리 및 타입 확인:
    만약 타입이 `FLYING`이거나 두 지점 간 거리가 50km 이상이면 `isAirplane = true`.
  - 비행기인 경우:
    - `calculateBearing(prevPt.lat, prevPt.lng, nextPt.lat, nextPt.lng)`로 비행 각도 산출.
    - 마커 아이콘: 비행기 이모지 `✈️`를 진행 각도로 회전:
      `<div class="airplane-marker" style="transform: rotate(${bearing - 45}deg); font-size: 28px;">✈️</div>`
    - 비행 구간 자동 감속: 비행 구간에서는 delta에 0.4를 곱하여 부드럽고 여유롭게 하늘을 날아가도록 감속.

- [ ] **Step 3: 재생 / 일시정지 버튼 비주얼 디자인 강화**
  - 단순 회색 원형 버튼에서 시각적 라벨과 테마 그라데이션이 들어간 매력적인 버튼으로 개편:
    - 재생 중: `[ ⏸ 일시 정지 ]` (인디고/보라 그라데이션)
    - 일시 정지 중: `[ ▶ 재생하기 ]` (에메랄드/그린 그라데이션)
  - 되감기 버튼도 깔끔한 아이콘 + 라벨 툴팁 스타일 적용.

- [ ] **Step 4: 고정폭 레이아웃(Tabular Numbers)으로 칸 밀림 원천 차단**
  - `current-playback-indicator` 구조 개편:
    ```jsx
    <div className="current-playback-indicator fixed-width-display">
      <span className="indicator-date">{dateStr}</span>
      <span className="indicator-divider">·</span>
      <span className="indicator-time">{timeStr}</span>
      <span className="indicator-divider">·</span>
      <span className="indicator-mode">{modeBadge}</span>
    </div>
    ```
  - CSS에 `font-variant-numeric: tabular-nums`, `min-width`, `display: flex; align-items: center; justify-content: center;`를 적용하여 텍스트가 바뀔 때 주변 요소가 절대 흔들리지 않도록 고정.

- [ ] **Step 5: Verify build & tests**
  - `npm run test` (100% 통과)
  - `npm run build` (클린 빌드)
- [ ] **Step 6: Commit**
  - `git add src/components/TimelineVisualizer.jsx src/components/TimelineVisualizer.css && git commit -m "feat: enhance playback speed, airplane flight motion, button visuals, and layout stability"`

---

### Task 3: 최종 검증 및 GitHub / Vercel 배포 최신화

- [ ] **Step 1: Full verification**
  - 모든 단위 테스트 및 프로덕션 번들 빌드 검증.
- [ ] **Step 2: Push to GitHub main branch**
  - `git push origin main` 실행으로 Vercel 자동 배포 트리거.
- [ ] **Step 3: Verify live deployment**
