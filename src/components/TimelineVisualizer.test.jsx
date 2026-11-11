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
    expect(speedOptions).toEqual(['0.25', '0.5', '1', '2', '4']);

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
    expect(info.fullText).toContain('Day 2');
    expect(info.fullText).toContain('🚶 걷기');
  });
});
