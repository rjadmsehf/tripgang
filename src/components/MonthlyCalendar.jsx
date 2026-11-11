import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, MapPin, Calendar as CalendarIcon, Check } from 'lucide-react';
import './MonthlyCalendar.css';

const ACTIVITY_EMOJIS = {
  WALKING: '🚶',
  VEHICLE: '🚗',
  MOTORCYCLING: '🏍️',
  FLYING: '✈️',
  CYCLING: '🚲',
  STILL: '📍'
};

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export default function MonthlyCalendar({
  tripSummary,
  selectedRange,
  onRangeSelect,
  selectedDay,
  onDaySelect,
  currentPlayingDate,
  onResetAll,
  onViewRangeMap
}) {
  // Determine initial year and month
  const getInitialYearMonth = () => {
    if (selectedRange?.start) {
      const [y, m] = selectedRange.start.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) return { year: y, month: m };
    }
    if (selectedDay && selectedDay !== 'ALL') {
      const [y, m] = selectedDay.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) return { year: y, month: m };
    }
    if (tripSummary?.startDate) {
      const [y, m] = tripSummary.startDate.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) return { year: y, month: m };
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  };

  const initialYM = getInitialYearMonth();
  const [currentYear, setCurrentYear] = useState(initialYM.year);
  const [currentMonth, setCurrentMonth] = useState(initialYM.month);

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const hasDraggedRef = React.useRef(false);

  // Click-to-select range start
  const [pendingClickStart, setPendingClickStart] = useState(null);

  // Sync calendar view when external selectedRange or selectedDay changes
  useEffect(() => {
    if (selectedRange?.start) {
      const [y, m] = selectedRange.start.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setCurrentYear(y);
        setCurrentMonth(m);
      }
    } else if (selectedDay && selectedDay !== 'ALL') {
      const [y, m] = selectedDay.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setCurrentYear(y);
        setCurrentMonth(m);
      }
    }
  }, [selectedRange?.start, selectedDay]);

  // Compute available years for dropdown
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    yearsSet.add(currentYear);
    if (tripSummary?.dateList) {
      tripSummary.dateList.forEach(d => {
        const y = parseInt(d.split('-')[0], 10);
        if (!isNaN(y)) yearsSet.add(y);
      });
    }
    const sorted = Array.from(yearsSet).sort((a, b) => a - b);
    if (sorted.length === 0) return [currentYear];
    // Pad min-1, max+1 for convenience
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const fullRange = [];
    for (let y = min - 1; y <= max + 1; y++) {
      fullRange.push(y);
    }
    return fullRange;
  }, [tripSummary?.dateList, currentYear]);

  // Calendar month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear(prev => prev - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear(prev => prev + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const handleYearChange = (e) => {
    setCurrentYear(Number(e.target.value));
  };

  const handleMonthChange = (e) => {
    setCurrentMonth(Number(e.target.value));
  };

  // Days in month calculation
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth, 0).getDate();
  }, [currentYear, currentMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(currentYear, currentMonth - 1, 1).getDay();
  }, [currentYear, currentMonth]);

  // Mouse handlers for drag and click selection
  const handleMouseDown = (dateStr) => {
    hasDraggedRef.current = false;
    setIsDragging(true);
    setDragStart(dateStr);
    setDragCurrent(dateStr);
  };

  const handleMouseEnter = (dateStr) => {
    if (isDragging) {
      if (dragStart && dragStart !== dateStr) {
        hasDraggedRef.current = true;
      }
      setDragCurrent(dateStr);
    }
  };

  const handleMouseUp = (dateStr) => {
    if (isDragging) {
      setIsDragging(false);

      if (dragStart && dragStart !== dateStr) {
        // Multi-day drag completed!
        const start = dragStart < dateStr ? dragStart : dateStr;
        const end = dragStart < dateStr ? dateStr : dragStart;
        onRangeSelect?.({ start, end });
        setPendingClickStart(null);
      }

      setDragStart(null);
      setDragCurrent(null);
    }
  };

  const handleDayClick = (dateStr) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    if (!pendingClickStart) {
      setPendingClickStart(dateStr);
      onDaySelect?.(dateStr);
    } else {
      // Second click completes range
      const start = pendingClickStart < dateStr ? pendingClickStart : dateStr;
      const end = pendingClickStart < dateStr ? dateStr : pendingClickStart;
      onRangeSelect?.({ start, end });
      setPendingClickStart(null);
    }
  };
  const handleClick = handleDayClick;

  // Handle global mouseup if released outside calendar cells
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        if (dragStart && dragCurrent && dragStart !== dragCurrent) {
          const start = dragStart < dragCurrent ? dragStart : dragCurrent;
          const end = dragStart < dragCurrent ? dragCurrent : dragStart;
          onRangeSelect?.({ start, end });
          setPendingClickStart(null);
        }
        setIsDragging(false);
        setDragStart(null);
        setDragCurrent(null);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStart, dragCurrent, onRangeSelect]);

  // Range summary calculations
  const rangeSummaryInfo = useMemo(() => {
    if (!selectedRange?.start || !selectedRange?.end) return null;

    let start = selectedRange.start;
    let end = selectedRange.end;
    if (start > end) [start, end] = [end, start];

    const [y1, m1, d1] = start.split('-').map(Number);
    const [y2, m2, d2] = end.split('-').map(Number);
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    const daysCount = Math.max(1, Math.round((utc2 - utc1) / 86400000) + 1);

    // Calculate distance and places from itineraryList
    let totalKm = 0;
    const places = [];
    if (tripSummary?.itineraryList) {
      tripSummary.itineraryList.forEach(item => {
        if (item.dateStr >= start && item.dateStr <= end) {
          totalKm += (item.distanceKm || 0);
          if (item.placesSummary && !places.includes(item.placesSummary)) {
            places.push(item.placesSummary);
          }
        }
      });
    }

    const formattedStart = start.replace(/-/g, '.');
    const formattedEnd = end.replace(/-/g, '.');

    return {
      formattedStart,
      formattedEnd,
      daysCount,
      totalKm,
      placesText: places.length > 0 ? places.join(' · ') : '경유지 정보 없음'
    };
  }, [selectedRange, tripSummary]);

  // Render day cells
  const dayCells = [];
  // 1. Padding days before first day of month
  for (let i = 0; i < firstDayOfWeek; i++) {
    dayCells.push(
      <div key={`pad-${i}`} className="calendar-day-cell pad-cell" aria-hidden="true" />
    );
  }

  // 2. Active days of month
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const dayStr = String(dayNum).padStart(2, '0');
    const monthStr = String(currentMonth).padStart(2, '0');
    const dateStr = `${currentYear}-${monthStr}-${dayStr}`;

    const tripData = tripSummary?.byDate?.[dateStr];
    const hasTrip = Boolean(tripData);

    // Emojis for modes
    let modeEmojis = [];
    if (hasTrip && tripData.activities) {
      const types = [...new Set(tripData.activities.map(a => a.type).filter(Boolean))];
      modeEmojis = types.map(t => ACTIVITY_EMOJIS[t] || '📍');
    }

    // Highlighting conditions
    const isSelectedDay = selectedDay === dateStr;
    const isPlaying = currentPlayingDate === dateStr;

    // Range conditions
    let isRangeStart = false;
    let isRangeEnd = false;
    let isInRange = false;

    if (selectedRange?.start && selectedRange?.end) {
      const minDate = selectedRange.start < selectedRange.end ? selectedRange.start : selectedRange.end;
      const maxDate = selectedRange.start < selectedRange.end ? selectedRange.end : selectedRange.start;
      isRangeStart = (dateStr === minDate);
      isRangeEnd = (dateStr === maxDate);
      isInRange = (dateStr >= minDate && dateStr <= maxDate);
    }

    // Drag preview conditions
    let isDragStart = false;
    let isDragEnd = false;
    let isInDragRange = false;

    if (isDragging && dragStart && dragCurrent) {
      const minDrag = dragStart < dragCurrent ? dragStart : dragCurrent;
      const maxDrag = dragStart < dragCurrent ? dragCurrent : dragStart;
      isDragStart = (dateStr === minDrag);
      isDragEnd = (dateStr === maxDrag);
      isInDragRange = (dateStr >= minDrag && dateStr <= maxDrag);
    }

    const isPendingStart = (pendingClickStart === dateStr);

    const cellClasses = [
      'calendar-day-cell',
      hasTrip ? 'has-trip' : '',
      isSelectedDay ? 'selected-day' : '',
      isPlaying ? 'playing-active' : '',
      isPendingStart ? 'pending-range-start' : '',
      (isRangeStart || isDragStart) ? 'range-start' : '',
      (isRangeEnd || isDragEnd) ? 'range-end' : '',
      (isInRange || isInDragRange) ? 'in-range' : '',
      (isInDragRange) ? 'in-drag-range' : ''
    ].filter(Boolean).join(' ');

    dayCells.push(
      <div
        key={dateStr}
        data-testid={`calendar-day-${dateStr}`}
        className={cellClasses}
        onMouseDown={() => handleMouseDown(dateStr)}
        onMouseEnter={() => handleMouseEnter(dateStr)}
        onMouseUp={() => handleMouseUp(dateStr)}
        onClick={() => handleDayClick(dateStr)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleDayClick(dateStr);
          }
        }}
        title={hasTrip ? `${dateStr} (여행 기록 있음)` : dateStr}
        role="button"
        tabIndex={0}
      >
        <div className="day-number-row">
          <span className="day-number">{dayNum}</span>
          {hasTrip && <span className="trip-indicator-dot" />}
        </div>
        {hasTrip && modeEmojis.length > 0 && (
          <div className="day-mode-emojis">
            {modeEmojis.slice(0, 3).map((emoji, idx) => (
              <span key={idx} className="mode-emoji">{emoji}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="monthly-calendar-container" data-testid="monthly-calendar">
      {/* Calendar Header with Navigation & Dropdowns */}
      <div className="calendar-header">
        <div className="calendar-nav-buttons">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handlePrevMonth}
            title="이전 달"
            aria-label="이전 달"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="calendar-title-selectors">
            <select
              value={currentYear}
              onChange={handleYearChange}
              className="calendar-year-select"
              aria-label="연도 선택"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>

            <select
              value={currentMonth}
              onChange={handleMonthChange}
              className="calendar-month-select"
              aria-label="월 선택"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handleNextMonth}
            title="다음 달"
            aria-label="다음 달"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="calendar-quick-actions">
          {pendingClickStart && (
            <span className="pending-hint-badge">
              🏁 종료일 클릭 또는 드래그
            </span>
          )}
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="calendar-weekdays-row">
        {WEEKDAY_NAMES.map((name, idx) => (
          <div
            key={name}
            className={`calendar-weekday-col ${idx === 0 ? 'sun' : idx === 6 ? 'sat' : ''}`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="calendar-grid">
        {dayCells}
      </div>

      {/* Range Selection Summary Box */}
      {rangeSummaryInfo && (
        <div className="range-summary-card" data-testid="range-summary-card">
          <div className="range-summary-header">
            <span className="range-summary-title">
              🗓️ 선택된 여행 기간: <strong>{rangeSummaryInfo.formattedStart} ~ {rangeSummaryInfo.formattedEnd}</strong> ({rangeSummaryInfo.daysCount}일간)
            </span>
          </div>

          <div className="range-summary-details">
            <span className="range-metric">
              📏 이동 거리: <strong>{rangeSummaryInfo.totalKm.toFixed(1)} km</strong>
            </span>
            {rangeSummaryInfo.placesText && (
              <span className="range-metric places-metric" title={rangeSummaryInfo.placesText}>
                📍 {rangeSummaryInfo.placesText}
              </span>
            )}
          </div>

          <div className="range-summary-actions">
            {onViewRangeMap && (
              <button
                type="button"
                className="range-btn-action primary"
                onClick={onViewRangeMap}
              >
                <MapPin size={16} />
                <span>이 기간 지도 보기 / 재생</span>
              </button>
            )}
            <button
              type="button"
              className="range-btn-action reset"
              onClick={() => {
                setPendingClickStart(null);
                onResetAll ? onResetAll() : onRangeSelect(null);
              }}
            >
              <RotateCcw size={16} />
              <span>전체 보기로 복원</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
