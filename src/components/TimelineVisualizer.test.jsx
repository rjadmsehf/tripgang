import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TimelineVisualizer from './TimelineVisualizer';

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

  it('renders playback controls and options when timeline data is uploaded', async () => {
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

    // Verify export duration options and default value = 60
    const exportDurationSelect = container.querySelectorAll('.timeline-select')[1];
    expect(exportDurationSelect.value).toBe('60');
    const durationOptions = Array.from(exportDurationSelect.querySelectorAll('option')).map(o => o.value);
    expect(durationOptions).toEqual(['30', '60', '90', '120']);

    // Verify speed options and default value = 1
    const speedSelect = container.querySelectorAll('.timeline-select')[2];
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

    // Verify layout shift prevention in current-playback-indicator
    const indicator = container.querySelector('.current-playback-indicator');
    expect(indicator).toBeDefined();
    expect(indicator.className).toContain('fixed-width-display');
    expect(indicator.querySelector('.indicator-date')).toBeDefined();
    expect(indicator.querySelector('.indicator-time')).toBeDefined();
    expect(indicator.querySelector('.indicator-mode')).toBeDefined();
  });
});
