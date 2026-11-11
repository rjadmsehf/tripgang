import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TimelineVisualizer, { checkIsAirplane, ACTIVITY_COLORS, getPlaybackPointInfo } from './TimelineVisualizer';

vi.mock('leaflet', () => {
  const mapMock = {
    setView: vi.fn().mockReturnThis(),
    invalidateSize: vi.fn(),
    fitBounds: vi.fn(),
    panTo: vi.fn(),
    remove: vi.fn()
  };
  return {
    default: {
      map: vi.fn().mockReturnValue(mapMock),
      tileLayer: vi.fn().mockReturnValue({ addTo: vi.fn() }),
      featureGroup: vi.fn().mockReturnValue({
        addTo: vi.fn().mockReturnThis(),
        clearLayers: vi.fn(),
        getBounds: vi.fn().mockReturnValue({
          isValid: vi.fn().mockReturnValue(true)
        })
      }),
      polyline: vi.fn().mockReturnValue({
        addTo: vi.fn().mockReturnThis()
      }),
      marker: vi.fn().mockReturnValue({
        addTo: vi.fn().mockReturnThis(),
        setLatLng: vi.fn().mockReturnThis(),
        setIcon: vi.fn().mockReturnThis(),
        bindTooltip: vi.fn().mockReturnThis(),
        openTooltip: vi.fn().mockReturnThis(),
        closeTooltip: vi.fn().mockReturnThis(),
        getTooltip: vi.fn().mockReturnValue({}),
        setTooltipContent: vi.fn().mockReturnThis(),
        isTooltipOpen: vi.fn().mockReturnValue(true),
        remove: vi.fn()
      }),
      divIcon: vi.fn((opts) => opts)
    }
  };
});

describe('TimelineVisualizer Component', () => {
  it('renders initial state with empty guide message', () => {
    render(<TimelineVisualizer />);
    expect(screen.getByText('🗺️ 타임라인 시각화')).toBeDefined();
    expect(screen.getByText('구글 타임라인 JSON 파일을 등록해 주세요')).toBeDefined();
  });

  it('renders playback controls, day selection filter, and options when timeline data is uploaded', async () => {
    const { container } = render(<TimelineVisualizer />);

    // Upload mock timeline file
    const mockData = {
      timelineObjects: [
        {
          activitySegment: {
            activityType: 'IN_PASSENGER_VEHICLE',
            duration: {
              startTimestamp: '2026-08-24T10:00:00.000Z',
              endTimestamp: '2026-08-24T10:30:00.000Z'
            },
            waypointPath: {
              waypoints: [
                { latE7: 375665000, lngE7: 126978000 },
                { latE7: 375685000, lngE7: 126998000 }
              ]
            }
          }
        }
      ]
    };

    const file = new File([JSON.stringify(mockData)], 'timeline.json', { type: 'application/json' });
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeDefined();

    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait for file read & summary to render
    expect(await screen.findByText('재생하기')).toBeDefined();

    // Verify Day Selection Filter dropdown exists with ALL and Day 1
    const dayFilterSelect = container.querySelector('.day-filter-select');
    expect(dayFilterSelect).toBeDefined();
    expect(dayFilterSelect.value).toBe('ALL');
    const dayOptions = Array.from(dayFilterSelect.querySelectorAll('option')).map(o => o.value);
    expect(dayOptions).toContain('ALL');
    expect(dayOptions).toContain('2026-08-24');

    // Test changing day filter
    fireEvent.change(dayFilterSelect, { target: { value: '2026-08-24' } });
    expect(dayFilterSelect.value).toBe('2026-08-24');

    // Verify export duration options and default value = 60
    const exportDurationSelect = container.querySelector('.export-duration-select');
    expect(exportDurationSelect.value).toBe('60');
    const durationOptions = Array.from(exportDurationSelect.querySelectorAll('option')).map(o => o.value);
    expect(durationOptions).toEqual(['30', '60', '90', '120']);

    // Verify speed options and default value = 1
    const speedSelect = container.querySelector('.playback-speed-select');
    expect(speedSelect.value).toBe('1');
    const speedOptions = Array.from(speedSelect.querySelectorAll('option')).map(o => o.value);
    expect(speedOptions).toEqual(['0.05', '0.1', '0.25', '0.5', '1', '2', '4']);

    // Test selecting ultra-slow speed (0.05x)
    fireEvent.change(speedSelect, { target: { value: '0.05' } });
    expect(speedSelect.value).toBe('0.05');

    // Verify right itinerary panel is rendered with MonthlyCalendar by default
    const itineraryPanel = container.querySelector('.timeline-itinerary-panel');
    expect(itineraryPanel).toBeDefined();
    expect(screen.getByTestId('monthly-calendar')).toBeDefined();

    // Switch to itinerary card list tab
    const listTabBtn = screen.getByRole('button', { name: /일정 목록/ });
    fireEvent.click(listTabBtn);
    expect(screen.getByText('🗓️ 여행 여정 일정표')).toBeDefined();

    const day1Card = container.querySelector('[data-testid="itinerary-card-1"]');
    expect(day1Card).toBeDefined();
    expect(day1Card.textContent).toContain('Day 1');
    expect(day1Card.textContent).toContain('8월 24일');
    expect(day1Card.textContent).toContain('자동차');
    expect(day1Card.className).toContain('itinerary-card');
    expect(day1Card.className).toContain('active-playing-card');

    // Verify Play button toggling to "일시정지"
    const playBtn = screen.getByTitle('재생하기');
    expect(playBtn.className).toContain('timeline-play-btn paused');
    fireEvent.click(playBtn);
    expect(screen.getByText('일시정지')).toBeDefined();
    expect(playBtn.className).toContain('timeline-play-btn playing');

    // Verify Rewind button
    const rewindBtn = screen.getByTitle('처음으로 되감기');
    expect(rewindBtn.className).toContain('timeline-rewind-btn');
    fireEvent.click(rewindBtn);
    expect(screen.getByText('재생하기')).toBeDefined();

    // Verify Day badge & fixed-width layout in current-playback-indicator
    const indicator = container.querySelector('.current-playback-indicator');
    expect(indicator).toBeDefined();
    expect(indicator.className).toContain('fixed-width-display');
    expect(indicator.querySelector('.indicator-day-badge')).toBeDefined();
    expect(indicator.querySelector('.indicator-mode')).toBeDefined();
    expect(indicator.textContent).toContain('Day 1');
    expect(indicator.textContent).toContain('08.24');
    expect(indicator.textContent).toContain('🚗 자동차');
  });

  it('correctly detects airplane based on 250km/h threshold and 100km distance', () => {
    // 1. Explicit FLYING type
    expect(checkIsAirplane({ type: 'FLYING', lat: 37.5, lng: 127.0 }, null)).toBe(true);

    // 2. High speed (> 70 m/s = 252 km/h) -> e.g. 80,000 meters in 500 seconds = 160 m/s
    const pt1 = { lat: 37.5665, lng: 126.9780, time: 1000000, type: 'VEHICLE' };
    const ptFast = { lat: 38.0000, lng: 127.5000, time: 1000000 + 500 * 1000, type: 'VEHICLE' };
    expect(checkIsAirplane(pt1, ptFast)).toBe(true);

    // 3. Distance > 100km (> 100,000 meters)
    const ptFar = { lat: 35.1796, lng: 129.0756, time: 1000000 + 7200 * 1000, type: 'VEHICLE' }; // Seoul to Busan (~320km)
    expect(checkIsAirplane(pt1, ptFar)).toBe(true);

    // 4. Normal car speed (e.g. 1000 meters in 60 seconds = 16.7 m/s = 60 km/h)
    const ptCar = { lat: 37.5750, lng: 126.9800, time: 1000000 + 60 * 1000, type: 'VEHICLE' };
    expect(checkIsAirplane(pt1, ptCar)).toBe(false);

    // 5. Walking (100 meters in 60 seconds)
    const ptWalk = { lat: 37.5670, lng: 126.9785, time: 1000000 + 60 * 1000, type: 'WALKING' };
    expect(checkIsAirplane(pt1, ptWalk)).toBe(false);
  });

  it('uses vivid emerald/mint color #2dd4bf for walking paths', () => {
    expect(ACTIVITY_COLORS.WALKING).toBe('#2dd4bf');
    expect(ACTIVITY_COLORS.VEHICLE).toBe('#3b82f6');
    expect(ACTIVITY_COLORS.FLYING).toBe('#ec4899');
    expect(ACTIVITY_COLORS.CYCLING).toBe('#f59e0b');
    expect(ACTIVITY_COLORS.MOTORCYCLING).toBe('#8b5cf6');
  });

  it('formats playback point info with Day badges cleanly', () => {
    const tripSummary = {
      dateList: ['2026-08-24', '2026-08-25'],
      totalDays: 2
    };

    const pt = {
      lat: 37.5665,
      lng: 126.9780,
      time: Date.parse('2026-08-25T14:30:00.000Z'),
      type: 'WALKING'
    };

    const info = getPlaybackPointInfo(pt, null, 0, tripSummary, 'ALL');
    expect(info.dayNum).toBe(2);
    expect(info.emoji).toBe('🚶');
    expect(info.label).toBe('걷기');
    expect(info.dayBadge).toBe('Day 2 · 2026.08.25');
    expect(info.fullText).toBe('Day 2 · 2026.08.25 · 🚶 걷기');
  });

  it('renders ultra-slow speed options 0.05x and 0.1x correctly', async () => {
    const { container } = render(<TimelineVisualizer />);
    // Upload 1 mock segment so playback controls appear
    const mockData = {
      semanticSegments: [
        {
          startTime: '2026-08-24T10:00:00.000Z',
          endTime: '2026-08-24T10:30:00.000Z',
          timelinePath: [
            { point: 'geo:37.5665,126.9780', time: '2026-08-24T10:00:00.000Z' }
          ]
        }
      ]
    };
    const file = new File([JSON.stringify(mockData)], 'timeline.json', { type: 'application/json' });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });

    await screen.findByText('재생하기');

    const speedSelect = container.querySelector('.playback-speed-select');
    expect(speedSelect).toBeDefined();

    const options = Array.from(speedSelect.querySelectorAll('option'));
    const opt005 = options.find(o => o.value === '0.05');
    const opt01 = options.find(o => o.value === '0.1');

    expect(opt005).toBeDefined();
    expect(opt005.textContent).toContain('0.05x (초슬로우 · 20배 느리게)');
    expect(opt01).toBeDefined();
    expect(opt01.textContent).toContain('0.1x (극슬로우 · 10배 느리게)');
  });

  it('supports 3-column wide layout, panel toggle collapse/expand, and card selection', async () => {
    const { container } = render(<TimelineVisualizer />);

    // Multi-day mock dataset (Day 1 & Day 2)
    const mockData = {
      semanticSegments: [
        {
          startTime: '2026-08-24T09:00:00.000Z',
          endTime: '2026-08-24T10:00:00.000Z',
          activityType: 'WALKING',
          timelinePath: [
            { point: 'geo:37.5665,126.9780', time: '2026-08-24T09:00:00.000Z' },
            { point: 'geo:37.5700,126.9800', time: '2026-08-24T10:00:00.000Z' }
          ]
        },
        {
          startTime: '2026-08-25T09:00:00.000Z',
          endTime: '2026-08-25T11:00:00.000Z',
          activityType: 'IN_PASSENGER_VEHICLE',
          timelinePath: [
            { point: 'geo:37.5700,126.9800', time: '2026-08-25T09:00:00.000Z' },
            { point: 'geo:37.6000,127.0000', time: '2026-08-25T11:00:00.000Z' }
          ]
        }
      ]
    };

    const file = new File([JSON.stringify(mockData)], 'multi-day.json', { type: 'application/json' });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });

    // Switch to itinerary card list tab
    const listTabBtn = await screen.findByRole('button', { name: /일정 목록/ });
    fireEvent.click(listTabBtn);

    // Wait for cards to render
    const day1Card = await screen.findByTestId('itinerary-card-1');
    const day2Card = screen.getByTestId('itinerary-card-2');
    expect(day1Card).toBeDefined();
    expect(day2Card).toBeDefined();

    // Verify 3 columns exist
    expect(container.querySelector('.timeline-sidebar')).toBeDefined();
    expect(container.querySelector('.timeline-map-area')).toBeDefined();
    expect(container.querySelector('.timeline-itinerary-panel')).toBeDefined();

    // Verify card content
    expect(day1Card.textContent).toContain('Day 1');
    expect(day1Card.textContent).toContain('8월 24일');
    expect(day2Card.textContent).toContain('Day 2');
    expect(day2Card.textContent).toContain('8월 25일');

    // Click Day 2 card -> should select 2026-08-25
    fireEvent.click(day2Card);
    expect(day2Card.className).toContain('selected');

    // Verify day selection filter dropdown also synced
    const dayFilterSelect = container.querySelector('.day-filter-select');
    expect(dayFilterSelect.value).toBe('2026-08-25');

    // Click "전체 일정 보기" button
    const allDaysBtn = container.querySelector('.itinerary-all-btn');
    expect(allDaysBtn).toBeDefined();
    fireEvent.click(allDaysBtn);
    expect(dayFilterSelect.value).toBe('ALL');

    // Test collapsing the itinerary panel
    const collapseBtn = container.querySelector('.itinerary-toggle-btn');
    expect(collapseBtn).toBeDefined();
    fireEvent.click(collapseBtn);

    // Right panel should now be closed, floating button visible
    expect(container.querySelector('.timeline-itinerary-panel')).toBeNull();
    const floatingExpandBtn = container.querySelector('.itinerary-expand-floating-btn');
    expect(floatingExpandBtn).toBeDefined();

    // Click floating expand button to reopen
    fireEvent.click(floatingExpandBtn);
    expect(container.querySelector('.timeline-itinerary-panel')).toBeDefined();
  });

  it('supports selecting range via MonthlyCalendar and synchronizes with active summary', async () => {
    const { container } = render(<TimelineVisualizer />);

    const mockData = {
      semanticSegments: [
        {
          startTime: '2026-08-24T09:00:00.000Z',
          endTime: '2026-08-24T10:00:00.000Z',
          activityType: 'WALKING',
          timelinePath: [
            { point: 'geo:37.5665,126.9780', time: '2026-08-24T09:00:00.000Z' },
            { point: 'geo:37.5700,126.9800', time: '2026-08-24T10:00:00.000Z' }
          ]
        },
        {
          startTime: '2026-08-25T09:00:00.000Z',
          endTime: '2026-08-25T11:00:00.000Z',
          activityType: 'IN_PASSENGER_VEHICLE',
          timelinePath: [
            { point: 'geo:37.5700,126.9800', time: '2026-08-25T09:00:00.000Z' },
            { point: 'geo:37.6000,127.0000', time: '2026-08-25T11:00:00.000Z' }
          ]
        },
        {
          startTime: '2026-08-26T09:00:00.000Z',
          endTime: '2026-08-26T11:00:00.000Z',
          activityType: 'IN_PASSENGER_VEHICLE',
          timelinePath: [
            { point: 'geo:37.6000,127.0000', time: '2026-08-26T09:00:00.000Z' },
            { point: 'geo:37.6200,127.0200', time: '2026-08-26T11:00:00.000Z' }
          ]
        }
      ]
    };

    const file = new File([JSON.stringify(mockData)], '3days.json', { type: 'application/json' });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });

    // Calendar is displayed
    const cal = await screen.findByTestId('monthly-calendar');
    expect(cal).toBeDefined();

    // Select range on calendar: 2026-08-24 to 2026-08-25
    const day24 = screen.getByTestId('calendar-day-2026-08-24');
    const day25 = screen.getByTestId('calendar-day-2026-08-25');
    fireEvent.click(day24);
    fireEvent.click(day25);

    // Range summary card on calendar should appear
    const rangeSummaryCard = await screen.findByTestId('range-summary-card');
    expect(rangeSummaryCard).toBeDefined();
    expect(rangeSummaryCard.textContent).toContain('2026.08.24 ~ 2026.08.25');

    // Sidebar summary should also reflect selected range
    const summaryCard = container.querySelector('.trip-summary-card');
    expect(summaryCard.textContent).toContain('선택된 기간 일정 요약');
    expect(summaryCard.textContent).toContain('2026-08-24 ~ 2026-08-25');

    // Switch to itinerary card list tab -> should show filtered 2 days
    const listTabBtn = screen.getByRole('button', { name: /일정 목록/ });
    fireEvent.click(listTabBtn);

    expect(screen.getByTestId('itinerary-card-1')).toBeDefined();
    expect(screen.getByTestId('itinerary-card-2')).toBeDefined();
    expect(screen.queryByTestId('itinerary-card-3')).toBeNull();

    // Restore full view
    const restoreBtn = container.querySelector('.active-range-reset-btn');
    fireEvent.click(restoreBtn);

    // After restore, all 3 cards should be present
    expect(screen.getByTestId('itinerary-card-1')).toBeDefined();
    expect(screen.getByTestId('itinerary-card-2')).toBeDefined();
    expect(screen.getByTestId('itinerary-card-3')).toBeDefined();
  });

  it('supports selecting range via left sidebar range dropdowns and applying it', async () => {
    const { container } = render(<TimelineVisualizer />);

    const mockData = {
      semanticSegments: [
        {
          startTime: '2026-08-24T09:00:00.000Z',
          endTime: '2026-08-24T10:00:00.000Z',
          timelinePath: [
            { point: 'geo:37.5665,126.9780', time: '2026-08-24T09:00:00.000Z' }
          ]
        },
        {
          startTime: '2026-08-25T09:00:00.000Z',
          endTime: '2026-08-25T11:00:00.000Z',
          timelinePath: [
            { point: 'geo:37.5700,126.9800', time: '2026-08-25T09:00:00.000Z' }
          ]
        },
        {
          startTime: '2026-08-26T09:00:00.000Z',
          endTime: '2026-08-26T11:00:00.000Z',
          timelinePath: [
            { point: 'geo:37.6000,127.0000', time: '2026-08-26T09:00:00.000Z' }
          ]
        }
      ]
    };

    const file = new File([JSON.stringify(mockData)], '3days.json', { type: 'application/json' });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });

    await screen.findByTestId('monthly-calendar');

    // Click "기간 선택 (각출)" in sidebar
    const rangeModeBtn = screen.getByRole('button', { name: /기간 선택/ });
    fireEvent.click(rangeModeBtn);

    // Select start: 2026-08-25, end: 2026-08-26
    const startSelect = container.querySelector('.range-start-select');
    const endSelect = container.querySelector('.range-end-select');
    expect(startSelect).toBeDefined();
    expect(endSelect).toBeDefined();

    fireEvent.change(startSelect, { target: { value: '2026-08-25' } });
    fireEvent.change(endSelect, { target: { value: '2026-08-26' } });

    // Click "기간 적용"
    const applyBtn = screen.getByRole('button', { name: '기간 적용' });
    fireEvent.click(applyBtn);

    // Switch to itinerary card list
    const listTabBtn = screen.getByRole('button', { name: /일정 목록/ });
    fireEvent.click(listTabBtn);

    // Day 1 (2026-08-24) should not be in the filtered list
    expect(screen.queryByText(/8월 24일/)).toBeNull();
    // 25 and 26 should be present
    expect(screen.getByText(/8월 25일/)).toBeDefined();
    expect(screen.getByText(/8월 26일/)).toBeDefined();
  });
});
