import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MonthlyCalendar from './MonthlyCalendar';

describe('MonthlyCalendar Component', () => {
  const mockTripSummary = {
    startDate: '2024-05-02',
    endDate: '2024-05-10',
    totalDays: 9,
    dateList: ['2024-05-02', '2024-05-03', '2024-05-04', '2024-05-10'],
    byDate: {
      '2024-05-02': {
        activities: [
          { type: 'VEHICLE', label: '자동차' },
          { type: 'WALKING', label: '걷기' }
        ],
        points: [{ lat: 35.1, lng: 139.1, time: 1000 }]
      },
      '2024-05-03': {
        activities: [{ type: 'FLYING', label: '비행기' }],
        points: [{ lat: 35.2, lng: 139.2, time: 2000 }]
      },
      '2024-05-04': {
        activities: [{ type: 'VEHICLE', label: '자동차' }],
        points: [{ lat: 35.3, lng: 139.3, time: 3000 }]
      },
      '2024-05-10': {
        activities: [{ type: 'WALKING', label: '걷기' }],
        points: [{ lat: 35.4, lng: 139.4, time: 4000 }]
      }
    },
    itineraryList: [
      { dayNum: 1, dateStr: '2024-05-02', displayDate: '2024년 5월 2일', distanceKm: 25.5, placesSummary: '도쿄역 ➔ 시부야', modes: ['자동차', '걷기'] },
      { dayNum: 2, dateStr: '2024-05-03', displayDate: '2024년 5월 3일', distanceKm: 850.0, placesSummary: '하네다 공항 ➔ 신치토세 공항', modes: ['비행기'] },
      { dayNum: 3, dateStr: '2024-05-04', displayDate: '2024년 5월 4일', distanceKm: 42.0, placesSummary: '삿포로 ➔ 오타루', modes: ['자동차'] },
      { dayNum: 4, dateStr: '2024-05-10', displayDate: '2024년 5월 10일', distanceKm: 5.2, placesSummary: '오사카 성', modes: ['걷기'] }
    ]
  };

  it('renders weekday headers and initial month based on tripSummary', () => {
    render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={null}
        onRangeSelect={vi.fn()}
        selectedDay={null}
        onDaySelect={vi.fn()}
      />
    );

    // Weekdays
    expect(screen.getByText('일')).toBeDefined();
    expect(screen.getByText('월')).toBeDefined();
    expect(screen.getByText('화')).toBeDefined();
    expect(screen.getByText('수')).toBeDefined();
    expect(screen.getByText('목')).toBeDefined();
    expect(screen.getByText('금')).toBeDefined();
    expect(screen.getByText('토')).toBeDefined();

    // Month title or dropdowns
    expect(screen.getByText(/2024년/)).toBeDefined();
    expect(screen.getByText(/5월/)).toBeDefined();

    // Travel emoji on trip days
    const day2Cell = screen.getByTestId('calendar-day-2024-05-02');
    expect(day2Cell).toBeDefined();
    expect(day2Cell.textContent).toContain('2');
    expect(day2Cell.textContent).toContain('🚗');
  });

  it('navigates months using previous (<) and next (>) buttons', () => {
    render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={null}
        onRangeSelect={vi.fn()}
        selectedDay={null}
        onDaySelect={vi.fn()}
      />
    );

    const prevBtn = screen.getByTitle('이전 달');
    const nextBtn = screen.getByTitle('다음 달');

    // Click Next -> June 2024
    fireEvent.click(nextBtn);
    expect(screen.getByText(/6월/)).toBeDefined();
    expect(screen.getByTestId('calendar-day-2024-06-01')).toBeDefined();

    // Click Prev twice -> April 2024
    fireEvent.click(prevBtn);
    fireEvent.click(prevBtn);
    expect(screen.getByText(/4월/)).toBeDefined();
    expect(screen.getByTestId('calendar-day-2024-04-01')).toBeDefined();
  });

  it('allows quick jump via Year and Month dropdowns', () => {
    const { container } = render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={null}
        onRangeSelect={vi.fn()}
        selectedDay={null}
        onDaySelect={vi.fn()}
      />
    );

    const monthSelect = container.querySelector('.calendar-month-select');
    expect(monthSelect).toBeDefined();
    fireEvent.change(monthSelect, { target: { value: '8' } }); // August

    expect(screen.getByText(/8월/)).toBeDefined();
    expect(screen.getByTestId('calendar-day-2024-08-15')).toBeDefined();
  });

  it('selects a range by clicking start date and then end date', () => {
    const handleRangeSelect = vi.fn();
    const handleDaySelect = vi.fn();

    render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={null}
        onRangeSelect={handleRangeSelect}
        selectedDay={null}
        onDaySelect={handleDaySelect}
      />
    );

    const day2 = screen.getByTestId('calendar-day-2024-05-02');
    const day4 = screen.getByTestId('calendar-day-2024-05-04');

    // Click start date
    fireEvent.click(day2);
    expect(handleDaySelect).toHaveBeenCalledWith('2024-05-02');

    // Click end date
    fireEvent.click(day4);
    expect(handleRangeSelect).toHaveBeenCalledWith({
      start: '2024-05-02',
      end: '2024-05-04'
    });
  });

  it('normalizes range order when clicking later date first then earlier date', () => {
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

    const day10 = screen.getByTestId('calendar-day-2024-05-10');
    const day2 = screen.getByTestId('calendar-day-2024-05-02');

    fireEvent.click(day10);
    fireEvent.click(day2);

    expect(handleRangeSelect).toHaveBeenCalledWith({
      start: '2024-05-02',
      end: '2024-05-10'
    });
  });

  it('selects a range by dragging from day A to day B', () => {
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

    const day2 = screen.getByTestId('calendar-day-2024-05-02');
    const day3 = screen.getByTestId('calendar-day-2024-05-03');
    const day4 = screen.getByTestId('calendar-day-2024-05-04');

    // Mouse drag sequence: mousedown on day2 -> mouseenter on day3 -> mouseenter on day4 -> mouseup on day4
    fireEvent.mouseDown(day2);
    fireEvent.mouseEnter(day3);
    fireEvent.mouseEnter(day4);
    fireEvent.mouseUp(day4);

    expect(handleRangeSelect).toHaveBeenCalledWith({
      start: '2024-05-02',
      end: '2024-05-04'
    });
  });

  it('highlights days within selectedRange with range-start, in-range, and range-end classes', () => {
    render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={{ start: '2024-05-02', end: '2024-05-04' }}
        onRangeSelect={vi.fn()}
        selectedDay={null}
        onDaySelect={vi.fn()}
      />
    );

    const day2 = screen.getByTestId('calendar-day-2024-05-02');
    const day3 = screen.getByTestId('calendar-day-2024-05-03');
    const day4 = screen.getByTestId('calendar-day-2024-05-04');
    const day10 = screen.getByTestId('calendar-day-2024-05-10');

    expect(day2.className).toContain('range-start');
    expect(day2.className).toContain('in-range');

    expect(day3.className).toContain('in-range');
    expect(day3.className).not.toContain('range-start');
    expect(day3.className).not.toContain('range-end');

    expect(day4.className).toContain('range-end');
    expect(day4.className).toContain('in-range');

    expect(day10.className).not.toContain('in-range');
  });

  it('highlights playing active date when currentPlayingDate matches', () => {
    render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={null}
        onRangeSelect={vi.fn()}
        selectedDay={null}
        onDaySelect={vi.fn()}
        currentPlayingDate="2024-05-03"
      />
    );

    const day3 = screen.getByTestId('calendar-day-2024-05-03');
    expect(day3.className).toContain('playing-active');
  });

  it('renders range summary card and triggers reset action when selectedRange is set', () => {
    const handleResetAll = vi.fn();
    const handleRangeSelect = vi.fn();

    render(
      <MonthlyCalendar
        tripSummary={mockTripSummary}
        selectedRange={{ start: '2024-05-02', end: '2024-05-04' }}
        onRangeSelect={handleRangeSelect}
        selectedDay={null}
        onDaySelect={vi.fn()}
        onResetAll={handleResetAll}
      />
    );

    // Summary box
    expect(screen.getByText(/선택된 여행 기간/)).toBeDefined();
    expect(screen.getByText(/2024.05.02 ~ 2024.05.04/)).toBeDefined();
    expect(screen.getByText(/3일간/)).toBeDefined();

    // Restore full view button
    const resetBtn = screen.getByRole('button', { name: /전체 보기로 복원/ });
    expect(resetBtn).toBeDefined();
    fireEvent.click(resetBtn);

    expect(handleResetAll).toHaveBeenCalled();
  });
});
