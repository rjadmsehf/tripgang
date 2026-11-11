# 지도 극대화 및 풀스크린 와이드 레이아웃 설계 (Maximize Map Fullscreen Design)

## 1. 개요 (Overview)
타임라인 시각화 화면에서 지도가 좁게 느껴지는 문제를 해결하기 위해, 바깥쪽 패딩을 최소화하고 화면 가로/세로를 100% 꽉 채우는 풀 와이드 레이아웃을 구축한다. 좌측 패널(210px)과 우측 일정표(280px)를 컴팩트하게 슬림화하여 중앙 지도가 화면의 70% 이상을 차지하도록 극대화한다.

---

## 2. 세부 사양 (Specifications)

### 2.1 레이아웃 및 여백 최적화
- `App.css`:
  - `.app-container.timeline-mode`:
    - `padding: 0.4rem 0.6rem;` (기존 1.5rem 2rem에서 대폭 축소하여 화면 끝까지 확장).
    - `max-width: 100%; width: 100%; box-sizing: border-box;`
- `TimelineVisualizer.css`:
  - `.timeline-container`:
    - `height: calc(100vh - 65px);` (화면 하단까지 꽉 차도록 세로 확장).
    - `border-radius: 12px;`
    - `width: 100%; max-width: 100%;`

### 2.2 패널 너비 슬림화 및 중앙 지도 면적 극대화
- 좌측 사이드바 (`.timeline-sidebar`):
  - `width: 210px; min-width: 200px; max-width: 215px;`
  - 패딩 `0.85rem 0.65rem;`로 컴팩트화하여 불필요한 공백 제거.
  - 버튼, 셀렉트 박스 폰트 및 패딩을 슬림하게 조정.
- 우측 일정표 (`.timeline-itinerary-panel`):
  - `width: 280px; min-width: 270px; max-width: 290px;`
  - 카드 패딩 `0.65rem 0.75rem;`로 가독성을 유지하면서 컴팩트화.
- 중앙 지도 (`.timeline-map-area`):
  - `flex: 1; min-width: 0; width: 100%; height: 100%;`
  - 좌우 패널 슬림화 및 외부 여백 제거로 지도 너비가 기존 대비 350~450px 이상 대폭 확장됨.
  - 리사이즈 및 마운트 시 `leafletMapInstance.current?.invalidateSize()` 호출.

---

## 3. 변경 대상 파일
- `src/App.css`: `.app-container.timeline-mode` 외부 여백 축소.
- `src/components/TimelineVisualizer.css`: 210px 좌측 사이드바, 280px 우측 일정표, 지도 극대화.
- `src/components/TimelineVisualizer.test.jsx`: 레이아웃 및 렌더링 검증.
