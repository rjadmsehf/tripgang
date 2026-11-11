# Fullscreen Map, Monthly Calendar & Range Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Timeline Visualizer to 100% full-screen width (providing a 1050px+ wide central map), add year (YYYY) display to itinerary and day badges, introduce a Monthly Calendar interface with drag/click date range extraction, and add date-range filtering to the left sidebar.

**Architecture:**
- CSS Layout Fix: Remove Vite's default `body { display: flex; place-items: center; }` in `index.css` and set `#root` and `.app-container.timeline-mode` to `100vw` so the layout fills 100% of widescreen displays.
- Timeline Parser Helpers: Update `formatDisplayDate` to include the year (`YYYY년 M월 D일`), provide `year`, `month`, `day` fields on itinerary items, and add `filterSummaryByRange(tripSummary, startDate, endDate)` to compute filtered points, activities, and distances.
- Monthly Calendar & Range UI: Build a calendar component in the right panel supporting month-by-month view, active trip indicators, and range selection (start date ~ end date via click/drag), paired with a range filter in the left sidebar.

**Tech Stack:** React 18, Leaflet, Lucide React icons, Vitest, CSS Flexbox/Grid.

## Global Constraints
- Must pass all existing tests (33 tests in `npm test`).
- Must maintain dark-mode glassmorphic theme styling (`Outfit` font, `#121214` background, `--accent-teal`, `--accent-purple`, etc.).
- Must support 2+ years of historical timeline data smoothly.
- Must push all commits to `main` and trigger Vercel deployment cleanly.

---

### Task 1: 100% Fullscreen CSS Fix (Remove Width Constraints)

**Files:**
- Modify: `src/index.css:25-31`
- Modify: `src/App.css:23-45`
- Modify: `src/components/TimelineVisualizer.css:1-55`

**Interfaces:**
- Consumes: Existing CSS classes `.app-container`, `.timeline-container`, `.timeline-sidebar`, `.timeline-map-area`
- Produces: Fullscreen `100vw` and `100%` width layout where sidebar is 250px, map is `flex: 1` (>1050px), and right panel is 380px.

- [ ] **Step 1: Inspect and update `src/index.css` to remove flex centering**

In `src/index.css`, replace:
```css
body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}
```
with:
```css
html, body {
  width: 100%;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  display: block;
  min-width: 320px;
  min-height: 100vh;
}

#root {
  width: 100%;
  min-height: 100vh;
}
```

- [ ] **Step 2: Update `src/App.css` for timeline mode full width**

In `src/App.css`:
```css
.app-container.timeline-mode {
  display: flex;
  flex-direction: column;
  width: 100vw !important;
  max-width: 100vw !important;
  min-height: 100vh !important;
  margin: 0 !important;
  padding: 0.25rem 0.6rem !important;
  box-sizing: border-box;
}
```

- [ ] **Step 3: Update `src/components/TimelineVisualizer.css` panel dimensions**

In `src/components/TimelineVisualizer.css`:
```css
.timeline-container {
  display: flex;
  flex-direction: row;
  height: calc(100vh - 65px);
  min-height: 650px;
  width: 100%;
  max-width: 100%;
  background-color: #121214;
  color: #e4e4e7;
  font-family: 'Outfit', sans-serif;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
  box-sizing: border-box;
}

.timeline-sidebar {
  width: 250px;
  min-width: 240px;
  max-width: 260px;
  padding: 0.85rem 0.75rem;
  background-color: #18181b;
  border-right: 1px solid #27272a;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  box-sizing: border-box;
  flex-shrink: 0;
}

.timeline-map-area {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 100%;
  position: relative;
  background: #18181b;
  margin: 0;
  border-radius: 0;
  overflow: hidden;
}

.itinerary-panel {
  width: 380px;
  min-width: 360px;
  max-width: 400px;
  background-color: #18181b;
  border-left: 1px solid #27272a;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
  transition: width 0.25s ease;
}
```

- [ ] **Step 4: Run existing tests to ensure no regressions**

Run: `npm test`
Expected: 33 passed.

- [ ] **Step 5: Commit full-screen CSS changes**

```bash
git add src/index.css src/App.css src/components/TimelineVisualizer.css
git commit -m "style: expand timeline container and body to 100vw full width"
```

---

### Task 2: Year Display & Range Filter Helper in `timelineParser.js`

**Files:**
- Modify: `src/services/timelineParser.js`
- Test: `src/services/timelineParser.test.js`

**Interfaces:**
- `formatDisplayDate(dateStr)`: returns `YYYY년 M월 D일` (e.g. `2024년 8월 1일`).
- `filterSummaryByRange(tripSummary, startDate, endDate)`:
  - Consumes: `tripSummary` object, `startDate` (string `'YYYY-MM-DD'`), `endDate` (string `'YYYY-MM-DD'`)
  - Produces: `{ startDate, endDate, totalDays, allActivities, allPoints, totalDistanceMeters, usedModes, dateList, byDate, itineraryList }`

- [ ] **Step 1: Write failing unit tests for year format and range filtering in `src/services/timelineParser.test.js`**

```javascript
describe('Year display and Range filtering', () => {
  it('formatDisplayDate should format date with year', () => {
    expect(formatDisplayDate('2024-08-01')).toBe('2024년 8월 1일');
    expect(formatDisplayDate('2023-12-25')).toBe('2023년 12월 25일');
  });

  it('filterSummaryByRange should filter dates and points within range', () => {
    const mockSummary = {
      dateList: ['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04'],
      byDate: {
        '2024-05-01': { activities: [{ type: 'WALKING' }], points: [{ lat: 35.1, lng: 139.1, time: 100 }] },
        '2024-05-02': { activities: [{ type: 'VEHICLE' }], points: [{ lat: 35.2, lng: 139.2, time: 200 }] },
        '2024-05-03': { activities: [{ type: 'FLYING' }], points: [{ lat: 35.3, lng: 139.3, time: 300 }] },
        '2024-05-04': { activities: [{ type: 'WALKING' }], points: [{ lat: 35.4, lng: 139.4, time: 400 }] }
      },
      itineraryList: [
        { dayNum: 1, dateStr: '2024-05-01', displayDate: '2024년 5월 1일', distanceKm: 5 },
        { dayNum: 2, dateStr: '2024-05-02', displayDate: '2024년 5월 2일', distanceKm: 20 },
        { dayNum: 3, dateStr: '2024-05-03', displayDate: '2024년 5월 3일', distanceKm: 500 },
        { dayNum: 4, dateStr: '2024-05-04', displayDate: '2024년 5월 4일', distanceKm: 2 }
      ]
    };

    const filtered = filterSummaryByRange(mockSummary, '2024-05-02', '2024-05-03');
    expect(filtered.dateList).toEqual(['2024-05-02', '2024-05-03']);
    expect(filtered.totalDays).toBe(2);
    expect(filtered.allPoints.length).toBe(2);
    expect(filtered.itineraryList.length).toBe(2);
    expect(filtered.itineraryList[0].dayNum).toBe(1); // relative day numbering in range
    expect(filtered.itineraryList[0].dateStr).toBe('2024-05-02');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because `formatDisplayDate` returns `8월 1일` without year, and `filterSummaryByRange` is not defined.

- [ ] **Step 3: Implement `formatDisplayDate` and `filterSummaryByRange` in `src/services/timelineParser.js`**

```javascript
export function formatDisplayDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!isNaN(month) && !isNaN(day)) {
      return `${year}년 ${month}월 ${day}일`;
    }
  }
  return dateStr;
}

export function filterSummaryByRange(tripSummary, startDate, endDate) {
  if (!tripSummary || !tripSummary.dateList) return tripSummary;
  if (!startDate || !endDate) return tripSummary;

  const [sDate, eDate] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  const dateList = tripSummary.dateList.filter(d => d >= sDate && d <= eDate);

  const byDate = {};
  const allActivities = [];
  const allPoints = [];
  const itineraryList = [];
  let totalDistanceMeters = 0;
  const modesSet = new Set();

  dateList.forEach((dateKey, index) => {
    const dayData = tripSummary.byDate?.[dateKey];
    if (dayData) {
      byDate[dateKey] = dayData;
      if (dayData.activities) allActivities.push(...dayData.activities);
      if (dayData.points) allPoints.push(...dayData.points);
    }

    const origItinerary = tripSummary.itineraryList?.find(item => item.dateStr === dateKey);
    if (origItinerary) {
      itineraryList.push({
        ...origItinerary,
        dayNum: index + 1 // Re-index for the selected trip range
      });
      if (origItinerary.distanceKm) {
        totalDistanceMeters += origItinerary.distanceKm * 1000;
      }
      if (origItinerary.modes) {
        origItinerary.modes.forEach(m => modesSet.add(m));
      }
    }
  });

  allActivities.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  allPoints.sort((a, b) => (a.time || 0) - (b.time || 0));

  let totalDays = dateList.length;
  if (dateList.length > 0) {
    const [y1, m1, d1] = dateList[0].split('-').map(Number);
    const [y2, m2, d2] = dateList[dateList.length - 1].split('-').map(Number);
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    if (!isNaN(utc1) && !isNaN(utc2)) {
      totalDays = Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  return {
    startDate: dateList[0] || sDate,
    endDate: dateList[dateList.length - 1] || eDate,
    totalDays,
    allActivities,
    allPoints,
    totalDistanceMeters,
    usedModes: Array.from(modesSet),
    dateList,
    byDate,
    itineraryList
  };
}
```

Also update `getFullPeriodSummary` itinerary item to include `year`, `month`, `day`:
```javascript
itineraryList.push({
  dayNum,
  dateStr,
  year: parseInt(dateKey.split('-')[0], 10),
  month: parseInt(dateKey.split('-')[1], 10),
  day: parseInt(dateKey.split('-')[2], 10),
  displayDate,
  placesSummary,
  distanceKm,
  modes
});
```

- [ ] **Step 4: Update `getPlaybackPointInfo` in `TimelineVisualizer.jsx` for year display**

Update `getPlaybackPointInfo`:
```javascript
const dayBadge = `Day ${dayNum} · ${yyyy}.${mm}.${dd}`;
```

- [ ] **Step 5: Run tests and ensure all tests pass**

Run: `npm test`
Expected: All tests pass (including updated existing tests if displayDate changed).

- [ ] **Step 6: Commit changes**

```bash
git add src/services/timelineParser.js src/services/timelineParser.test.js src/components/TimelineVisualizer.jsx
git commit -m "feat: add year display in dates and implement filterSummaryByRange"
```

---

### Task 3: Monthly Calendar & Range Selection Component

**Files:**
- Create: `src/components/MonthlyCalendar.jsx`
- Create: `src/components/MonthlyCalendar.css`
- Modify: `src/components/TimelineVisualizer.jsx`
- Modify: `src/components/TimelineVisualizer.css`
- Test: `src/components/MonthlyCalendar.test.jsx`

**Interfaces:**
- Component `MonthlyCalendar`:
  - Props:
    - `tripSummary`: Full trip summary object with `dateList`, `byDate`, `itineraryList`
    - `selectedRange`: `{ start: string, end: string } | null`
    - `onRangeSelect`: `(range: { start: string, end: string } | null) => void`
    - `selectedDay`: `string | null`
    - `onDaySelect`: `(dateStr: string) => void`
    - `currentPlayingDate`: `string | null`

- [ ] **Step 1: Write unit tests for `MonthlyCalendar` in `src/components/MonthlyCalendar.test.jsx`**

```javascript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MonthlyCalendar from './MonthlyCalendar';

describe('MonthlyCalendar Component', () => {
  const mockTripSummary = {
    dateList: ['2024-08-01', '2024-08-02', '2024-08-03', '2024-08-15'],
    byDate: {
      '2024-08-01': { activities: [{ type: 'WALKING' }] },
      '2024-08-02': { activities: [{ type: 'VEHICLE' }] },
      '2024-08-03': { activities: [{ type: 'FLYING' }] },
      '2024-08-15': { activities: [{ type: 'WALKING' }] },
    },
    itineraryList: [
      { dateStr: '2024-08-01', displayDate: '2024년 8월 1일', distanceKm: 10, modes: ['도보'] },
      { dateStr: '2024-08-02', displayDate: '2024년 8월 2일', distanceKm: 50, modes: ['자동차'] },
      { dateStr: '2024-08-03', displayDate: '2024년 8월 3일', distanceKm: 500, modes: ['비행기'] },
      { dateStr: '2024-08-15', displayDate: '2024년 8월 15일', distanceKm: 5, modes: ['도보'] }
    ]
  };

  it('renders current month header and days', () => {
    render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={null}
        onRangeSelect={vi.fn()}
        selectedDay={null}
        onDaySelect={vi.fn()}
      />
    );
    expect(screen.getByText(/2024년/)).toBeInTheDocument();
    expect(screen.getByText(/8월/)).toBeInTheDocument();
  });

  it('allows selecting a date range by clicking start then end', () => {
    const handleRangeSelect = vi.fn();
    render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={null}
        onRangeSelect={handleRangeSelect}
        selectedDay={null}
        onDaySelect={vi.fn()}
      />
    );

    const day1Btn = screen.getByRole('button', { name: /2024-08-01/i });
    fireEvent.click(day1Btn);

    const day3Btn = screen.getByRole('button', { name: /2024-08-03/i });
    fireEvent.click(day3Btn);

    expect(handleRangeSelect).toHaveBeenCalledWith({
      start: '2024-08-01',
      end: '2024-08-03'
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/components/MonthlyCalendar.test.jsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/components/MonthlyCalendar.jsx` and `src/components/MonthlyCalendar.css`**

Implement:
- Month navigation controls: Previous (`<`) & Next (`>`) month buttons, year dropdown (all available years in `dateList`), month dropdown (`1월` ~ `12월`).
- Calendar table/grid with weekday labels: `일`, `월`, `화`, `수`, `목`, `금`, `토`.
- Each calendar cell displays:
  - Day number.
  - Trip indicator dot/badge (colored according to mode or teal badge if trip exists on that day).
  - Selected / In-range / Playing highlight styles.
  - Mouse click/drag handlers:
    - Click 1: sets range start.
    - Click 2: sets range end and calls `onRangeSelect({ start, end })`.
    - Drag support (`onMouseDown`, `onMouseEnter`, `onMouseUp`) for smooth range dragging!
- Range Summary Card at bottom of calendar:
  - Shows: "선택된 기간: YYYY.MM.DD ~ YYYY.MM.DD (N일간)"
  - Total distance and visited places in that range.
  - "[전체 기간으로 초기화]" button.
- Tab switcher on top: "[📅 달력 보기]" / "[📋 일정 목록]".

- [ ] **Step 4: Integrate `MonthlyCalendar` into right sidebar of `TimelineVisualizer.jsx`**

In `TimelineVisualizer.jsx`:
- Add `selectedRange` state: `const [selectedRange, setSelectedRange] = useState(null);`
- Compute `activeSummary`:
  ```javascript
  const activeSummary = useMemo(() => {
    if (!tripSummary) return null;
    if (selectedRange && selectedRange.start && selectedRange.end) {
      return filterSummaryByRange(tripSummary, selectedRange.start, selectedRange.end);
    }
    return tripSummary;
  }, [tripSummary, selectedRange]);
  ```
- Use `activeSummary` for `activeActivities`, `activePoints`, and itinerary calculations.
- Also add left sidebar 기간 선택 (Range selection UI):
  - A toggle in left sidebar: "선택 모드: [전체] [날짜별] [기간별]"
  - In "기간별" mode: dropdowns for `시작일` and `종료일` with an "적용" button, synced with `selectedRange`!

- [ ] **Step 5: Run all tests to verify**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit calendar and range filter features**

```bash
git add src/components/MonthlyCalendar.jsx src/components/MonthlyCalendar.css src/components/MonthlyCalendar.test.jsx src/components/TimelineVisualizer.jsx src/components/TimelineVisualizer.css
git commit -m "feat: add monthly calendar with drag/click range selection and sync with left sidebar"
```

---

### Task 4: Map FitBounds & End-to-End Visual Verification

**Files:**
- Modify: `src/components/TimelineVisualizer.jsx`
- Test: Vitest + manual check on Vite dev server (Chrome)

**Interfaces:**
- Leaflet map bounds: When `selectedRange` or `selectedDayFilter` changes, map automatically animates to fit the filtered points with appropriate padding (30px).

- [ ] **Step 1: Ensure `fitBounds` properly responds to `activePoints` changes**

In `TimelineVisualizer.jsx`, ensure the `useEffect` watching `activePoints` calls `map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 })` with smooth bounds update whenever `selectedRange` changes.

- [ ] **Step 2: Run build and tests**

Run: `npm test` and `npm run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Launch Chrome and verify visual presentation**

Run: Verify dev server response, open browser if needed, and confirm 100vw width, 1050px+ center map, year display, monthly calendar navigation, and range selection.

- [ ] **Step 4: Commit and push to origin**

```bash
git push origin main
git push origin feature/timeline-visualizer
```
Expected: Clean push to GitHub, triggering Vercel production deployment.
