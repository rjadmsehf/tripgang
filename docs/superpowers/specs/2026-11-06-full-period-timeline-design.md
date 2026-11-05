# 전체 기간 타임라인 일괄 시각화 설계 (Full Period Timeline Visualizer Design)

## 1. 개요 (Overview)
구글 타임라인 JSON(Timeline.json, Records.json, Semantic History 등)을 업로드할 때 개별 날짜 단위로 선택하는 방식을 제거하고, 파일에 포함된 **전체 여행 기간**(예: 3박 4일, 1주일 등)의 모든 이동 데이터를 하나의 연속된 여정으로 자동 통합하여 지도 시각화, 연속 재생 및 애니메이션 내보내기(GIF/MP4)를 지원한다.

---

## 2. 요구사항 및 사용자 경험 (Requirements & UX)
1. **파일 업로드 및 기간 자동 인식**:
   - 업로드된 JSON에서 모든 날짜의 활동 및 좌표 데이터를 수집.
   - 최초 시작 시점과 최종 종료 시점을 추출하여 여행 기간(시작일 ~ 종료일, 총 N일) 자동 표시.
2. **사이드바 UI 개편**:
   - 기존의 "날짜 선택" 단일 드롭다운 제거.
   - "여행 전체 개요" 카드:
     - 🗓️ 기간: `YYYY-MM-DD ~ YYYY-MM-DD (총 N일간)`
     - 📏 총 이동 거리: `X.X km` (Haversine 공식 누적)
     - 🚀 이용된 이동 수단 뱃지: 걷기, 자전거, 자동차, 오토바이, 비행기 등
3. **지도 렌더링 및 애니메이션**:
   - 지도(Leaflet) 상에 전체 기간의 이동 경로를 이동 수단별 색상으로 한 번에 표시하고 전체 바운더리에 맞춤(fitBounds).
   - 하단 재생 바(0% ~ 100%)로 전체 일정 연속 재생 (1x ~ 20x 배속, 카메라 추적 모드 지원).
   - 이동 마커 상단에 현재 시점의 날짜/시간 및 이동 수단 뱃지(예: `05.02 14:30 · ✈️ 비행기`) 실시간 오버레이.
4. **비디오 내보내기 (Export)**:
   - GIF 및 MP4(WebM) 포맷으로 지정된 길이(15초, 30초, 45초, 60초) 동안 여행 전체 일정을 등간격 시간 보간으로 녹화하여 다운로드.

---

## 3. 데이터 구조 및 인터페이스 (Data Structures)

### 3.1 `timelineParser.js` 통합 함수
기존 `parseTimelineJson`의 일자별 맵(`{ [dateStr]: { date, activities } }`) 외에, 전체 통합 객체를 제공하는 헬퍼 함수를 추가하거나 파서 반환값에 메타데이터를 포함:
```javascript
export function getFullPeriodSummary(parsedTimeline) {
  // parsedTimeline: { [dateStr]: { date, activities: [...] } }
  // Returns:
  // {
  //   startDate: '2026-08-20',
  //   endDate: '2026-08-26',
  //   totalDays: 7,
  //   allActivities: [...],
  //   allPoints: [...], // sorted chronologically
  //   totalDistanceMeters: 125400,
  //   usedModes: ['WALKING', 'VEHICLE', 'FLYING']
  // }
}
```

### 3.2 좌표 포인트 포맷 (`allPoints`)
```typescript
interface TimelinePoint {
  lat: number;
  lng: number;
  time: number; // unix ms
  type: 'WALKING' | 'CYCLING' | 'VEHICLE' | 'MOTORCYCLING' | 'FLYING' | 'STILL';
  label: string; // '걷기', '자동차', '비행기' 등
}
```

---

## 4. 컴포넌트 수정 (`TimelineVisualizer.jsx`)
- `selectedDate` state 제거.
- `tripSummary` state 도입: `{ startDate, endDate, totalDays, totalDistanceKm, modes }`.
- `activePoints`: `tripSummary.allPoints`를 기본으로 사용하여 재생 및 폴리라인 렌더링.
- 재생 마커 툴팁: `formatCurrentTimestamp(point.time)` -> `MM.DD HH:mm` 포맷으로 현재 일시 안내.

---

## 5. 테스트 계획 (Testing Strategy)
- `timelineParser.test.js`: `getFullPeriodSummary`에 대한 단위 테스트 작성.
  - 다중 날짜(예: 3일간의 데이터) 전달 시 시작일, 종료일, 총 일수(totalDays), 시간순 정렬된 allPoints 검증.
- `TimelineVisualizer` 브라우저 수동 검증:
  - 파일 업로드 시 전체 기간 카드 정상 노출.
  - 지도에 전체 경로 표시 및 재생 슬라이더 동작 확인.
  - 비디오 내보내기 정상 동작 확인.
