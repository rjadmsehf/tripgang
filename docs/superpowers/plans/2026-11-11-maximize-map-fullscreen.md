# 지도 극대화 및 풀스크린 와이드 레이아웃 구현 계획 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저 창의 상하좌우를 화면 끝까지 꽉 채우고, 좌우 패널을 슬림화(좌측 210px, 우측 280px)하여 중앙 지도가 화면의 70% 이상을 차지하도록 대폭 확대한다.

**Architecture:** `App.css`에서 타임라인 모드 외부 패딩을 0.4rem 수준으로 줄이고, `TimelineVisualizer.css`에서 컨테이너 높이를 `calc(100vh - 65px)`로 확장하며 좌/우 패널을 슬림화한다.

**Tech Stack:** React 18, Leaflet, CSS Flexbox

## Global Constraints
- React 18 & Vite 빌드 통과 필수
- Vitest 단위 테스트 100% 통과 필수

---

### Task 1: 지도 면적 극대화 및 풀스크린 와이드 스타일 적용

**Files:**
- Modify: `src/App.css`
- Modify: `src/components/TimelineVisualizer.css`

- [ ] **Step 1: Update `src/App.css`**
  - `.app-container.timeline-mode`:
    - `padding: 0.35rem 0.6rem;`
    - `max-width: 100%; width: 100%; box-sizing: border-box;`
- [ ] **Step 2: Update `src/components/TimelineVisualizer.css`**
  - `.timeline-container`:
    - `height: calc(100vh - 65px);`
    - `min-height: 650px;`
    - `width: 100%; max-width: 100%;`
    - `border-radius: 12px;`
  - `.timeline-sidebar`:
    - `width: 210px; min-width: 200px; max-width: 215px;`
    - `padding: 0.75rem 0.6rem;`
    - 내부 제목 및 카드 패딩 슬림화 (`0.6rem 0.5rem`).
  - `.timeline-itinerary-panel`:
    - `width: 280px; min-width: 270px; max-width: 285px;`
    - `padding: 0.75rem 0.6rem;`
  - `.timeline-map-area`:
    - `flex: 1; min-width: 0; width: 100%; height: 100%;`
- [ ] **Step 3: Run tests and build**
  - `npm run test` (100% 통과)
  - `npm run build` (클린 빌드)
- [ ] **Step 4: Commit**
  - `git add src/App.css src/components/TimelineVisualizer.css && git commit -m "style: maximize map area with slim panels and full-bleed screen layout"`

---

### Task 2: 최종 검증 및 GitHub 푸시 (Vercel 배포 최신화)

- [ ] **Step 1: Run full test suite & production build**
- [ ] **Step 2: Push to GitHub main & feature branch**
- [ ] **Step 3: Refresh local Chrome browser**
