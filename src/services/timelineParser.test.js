import { describe, it, expect } from 'vitest';
import { parseTimelineJson, getFullPeriodSummary, getHaversineDistance, calculateBearing, formatDisplayDate, filterSummaryByRange } from './timelineParser';

describe('timelineParser', () => {
  it('should parse semantic location monthly history JSON', () => {
    const mockJson = {
      timelineObjects: [
        {
          activitySegment: {
            activityType: 'IN_PASSENGER_VEHICLE',
            duration: { startTimestamp: '2026-08-24T10:00:00.000Z', endTimestamp: '2026-08-24T10:10:00.000Z' },
            waypointPath: {
              waypoints: [
                { latE7: 375665000, lngE7: 126978000 },
                { latE7: 375685000, lngE7: 126998000 }
              ]
            }
          }
        },
        {
          placeVisit: {
            location: { latitudeE7: 375685000, longitudeE7: 126998000, name: 'Seoul Station' },
            duration: { startTimestamp: '2026-08-24T10:10:00.000Z', endTimestamp: '2026-08-24T11:00:00.000Z' }
          }
        }
      ]
    };
    
    const parsed = parseTimelineJson(mockJson);
    expect(parsed['2026-08-24']).toBeDefined();
    expect(parsed['2026-08-24'].activities.length).toBe(2);
    expect(parsed['2026-08-24'].activities[0].type).toBe('VEHICLE');
    expect(parsed['2026-08-24'].activities[0].path.length).toBe(2);
    expect(parsed['2026-08-24'].activities[1].type).toBe('STILL');
    expect(parsed['2026-08-24'].activities[1].label).toBe('Seoul Station');
  });

  it('should parse raw Records.json and classify speed heuristics', () => {
    const mockJson = {
      locations: [
        // Walking speed segment (approx 1.5 m/s)
        { latitudeE7: 375665000, longitudeE7: 126978000, timestamp: '2026-08-24T12:00:00.000Z' },
        { latitudeE7: 375666000, longitudeE7: 126978100, timestamp: '2026-08-24T12:01:00.000Z' },
        // Flying speed segment (approx 200 m/s)
        { latitudeE7: 375666000, longitudeE7: 126978100, timestamp: '2026-08-24T13:00:00.000Z' },
        { latitudeE7: 395666000, longitudeE7: 128978100, timestamp: '2026-08-24T13:20:00.000Z' }
      ]
    };
    
    const parsed = parseTimelineJson(mockJson);
    expect(parsed['2026-08-24']).toBeDefined();
    const acts = parsed['2026-08-24'].activities;
    expect(acts.length).toBe(2);
    expect(acts[0].type).toBe('WALKING');
    expect(acts[1].type).toBe('FLYING');
  });

  it('should classify speeds up to 250 km/h (70 m/s) as VEHICLE and above 250 km/h as FLYING', () => {
    const mockJson = {
      locations: [
        // 150 km/h (~41.7 m/s): lat diff 0.03752 deg in 100s -> VEHICLE
        { latitudeE7: 370000000, longitudeE7: 127000000, timestamp: '2026-08-24T10:00:00.000Z' },
        { latitudeE7: 370375200, longitudeE7: 127000000, timestamp: '2026-08-24T10:01:40.000Z' },
        // 200 km/h (~55.6 m/s): high-speed train/car, was FLYING under old 50 m/s limit -> now VEHICLE
        { latitudeE7: 371000000, longitudeE7: 127000000, timestamp: '2026-08-24T11:00:00.000Z' },
        { latitudeE7: 371500270, longitudeE7: 127000000, timestamp: '2026-08-24T11:01:40.000Z' },
        // 300 km/h (~83.3 m/s): airplane speed -> FLYING
        { latitudeE7: 372000000, longitudeE7: 127000000, timestamp: '2026-08-24T12:00:00.000Z' },
        { latitudeE7: 372750000, longitudeE7: 127000000, timestamp: '2026-08-24T12:01:40.000Z' }
      ]
    };

    const parsed = parseTimelineJson(mockJson);
    expect(parsed['2026-08-24']).toBeDefined();
    const acts = parsed['2026-08-24'].activities;
    expect(acts.length).toBe(3);
    expect(acts[0].type).toBe('VEHICLE');
    expect(acts[1].type).toBe('VEHICLE');
    expect(acts[2].type).toBe('FLYING');
  });

  it('should parse timestampMs and startTimestampMs format variations', () => {
    const mockJson = {
      locations: [
        { latitudeE7: 375665000, longitudeE7: 126978000, timestampMs: '1787572800000' }, // 2026-08-24T12:00:00Z
        { latitudeE7: 375666000, longitudeE7: 126978100, timestampMs: '1787572860000' }  // 2026-08-24T12:01:00Z
      ]
    };
    const parsed = parseTimelineJson(mockJson);
    expect(parsed['2026-08-24']).toBeDefined();
    expect(parsed['2026-08-24'].activities[0].type).toBe('WALKING');
  });

  it('should parse modern on-device semanticSegments format with point string coordinates', () => {
    const mockJson = {
      semanticSegments: [
        {
          startTime: '2026-08-24T08:00:00.000Z',
          endTime: '2026-08-24T08:30:00.000Z',
          timelinePath: [
            { point: '37.5665°, 126.9780°', time: '2026-08-24T08:05:00.000Z' },
            { point: 'geo:37.5685,126.9980', time: '2026-08-24T08:15:00.000Z' }
          ],
          activity: {
            topCandidate: {
              type: 'MOTORCYCLING'
            }
          }
        },
        {
          startTime: '2026-08-24T08:30:00.000Z',
          endTime: '2026-08-24T09:00:00.000Z',
          visit: {
            topCandidate: {
              placeLocation: '37.5685°, 126.9980°',
              semanticType: 'TYPE_WORK'
            }
          }
        }
      ]
    };
    const parsed = parseTimelineJson(mockJson);
    expect(parsed['2026-08-24']).toBeDefined();
    expect(parsed['2026-08-24'].activities.length).toBe(2);
    expect(parsed['2026-08-24'].activities[0].type).toBe('MOTORCYCLING');
    expect(parsed['2026-08-24'].activities[0].path.length).toBe(2);
    expect(parsed['2026-08-24'].activities[0].path[0].lat).toBeCloseTo(37.5665);
    expect(parsed['2026-08-24'].activities[0].path[1].lat).toBeCloseTo(37.5685);
    expect(parsed['2026-08-24'].activities[1].type).toBe('STILL');
  });

  describe('getFullPeriodSummary', () => {
    it('should return empty summary object when given null, undefined, or empty object', () => {
      const defaultStructure = {
        startDate: null,
        endDate: null,
        totalDays: 0,
        allActivities: [],
        allPoints: [],
        totalDistanceMeters: 0,
        usedModes: [],
        dateList: [],
        byDate: {},
        itineraryList: []
      };

      expect(getFullPeriodSummary(null)).toEqual(defaultStructure);
      expect(getFullPeriodSummary(undefined)).toEqual(defaultStructure);
      expect(getFullPeriodSummary({})).toEqual(defaultStructure);
    });

    it('should compute summary correctly for single-day timeline', () => {
      const mockParsedTimeline = {
        '2026-08-20': {
          date: '2026-08-20',
          activities: [
            {
              type: 'WALKING',
              label: '걷기',
              startTime: 1787220000000,
              endTime: 1787221000000,
              path: [
                { lat: 37.5665, lng: 126.9780, time: 1787220000000 },
                { lat: 37.5685, lng: 126.9980, time: 1787221000000 }
              ]
            }
          ]
        }
      };

      const summary = getFullPeriodSummary(mockParsedTimeline);
      expect(summary.startDate).toBe('2026-08-20');
      expect(summary.endDate).toBe('2026-08-20');
      expect(summary.totalDays).toBe(1);
      expect(summary.allActivities.length).toBe(1);
      expect(summary.allPoints.length).toBe(2);
      expect(summary.allPoints[0]).toEqual({
        lat: 37.5665,
        lng: 126.9780,
        time: 1787220000000,
        type: 'WALKING',
        label: '걷기'
      });
      expect(summary.totalDistanceMeters).toBeGreaterThan(0);
      expect(summary.usedModes).toEqual(['WALKING']);
      expect(summary.dateList).toEqual(['2026-08-20']);
      expect(summary.byDate['2026-08-20']).toBeDefined();
      expect(summary.byDate['2026-08-20'].date).toBe('2026-08-20');
      expect(summary.byDate['2026-08-20'].activities.length).toBe(1);
      expect(summary.byDate['2026-08-20'].points.length).toBe(2);
    });

    it('should compute multi-day summary with calendar day differences and sorted activities', () => {
      // Intentionally insert out of order
      const mockParsedTimeline = {
        '2026-08-22': {
          date: '2026-08-22',
          activities: [
            {
              type: 'FLYING',
              label: '비행기',
              startTime: 1787392800000,
              endTime: 1787400000000,
              path: [
                { lat: 35.0, lng: 128.0, time: 1787392800000 },
                { lat: 33.5, lng: 126.5, time: 1787400000000 }
              ]
            }
          ]
        },
        '2026-08-20': {
          date: '2026-08-20',
          activities: [
            {
              type: 'WALKING',
              label: '걷기',
              startTime: 1787220000000,
              endTime: 1787221000000,
              path: [
                { lat: 37.5665, lng: 126.9780, time: 1787220000000 },
                { lat: 37.5685, lng: 126.9980, time: 1787221000000 }
              ]
            },
            {
              type: 'VEHICLE',
              label: '자동차',
              startTime: 1787225000000,
              endTime: 1787230000000,
              path: [
                { lat: 37.5685, lng: 126.9980, time: 1787225000000 },
                { lat: 37.5000, lng: 127.0000, time: 1787230000000 }
              ]
            }
          ]
        },
        '2026-08-21': {
          date: '2026-08-21',
          activities: [
            {
              type: 'WALKING',
              label: '걷기',
              startTime: 1787306400000,
              endTime: 1787310000000,
              path: [
                { lat: 37.5000, lng: 127.0000, time: 1787306400000 },
                { lat: 37.5050, lng: 127.0050, time: 1787310000000 }
              ]
            }
          ]
        }
      };

      const summary = getFullPeriodSummary(mockParsedTimeline);
      expect(summary.startDate).toBe('2026-08-20');
      expect(summary.endDate).toBe('2026-08-22');
      expect(summary.totalDays).toBe(3); // 20th, 21st, 22nd = 3 days

      // Activities sorted chronologically
      expect(summary.allActivities.length).toBe(4);
      expect(summary.allActivities[0].startTime).toBe(1787220000000);
      expect(summary.allActivities[1].startTime).toBe(1787225000000);
      expect(summary.allActivities[2].startTime).toBe(1787306400000);
      expect(summary.allActivities[3].startTime).toBe(1787392800000);

      // Points flattened and sorted chronologically
      expect(summary.allPoints.length).toBe(8);
      for (let i = 0; i < summary.allPoints.length - 1; i++) {
        expect(summary.allPoints[i].time).toBeLessThanOrEqual(summary.allPoints[i + 1].time);
      }

      // Modes deduplicated
      expect(summary.usedModes).toEqual(['WALKING', 'VEHICLE', 'FLYING']);
      expect(summary.dateList).toEqual(['2026-08-20', '2026-08-21', '2026-08-22']);
      expect(Object.keys(summary.byDate)).toEqual(['2026-08-20', '2026-08-21', '2026-08-22']);
      expect(summary.byDate['2026-08-20'].activities.length).toBe(2);
      expect(summary.byDate['2026-08-20'].points.length).toBe(4);
      expect(summary.byDate['2026-08-21'].activities.length).toBe(1);
      expect(summary.byDate['2026-08-21'].points.length).toBe(2);
      expect(summary.byDate['2026-08-22'].activities.length).toBe(1);
      expect(summary.byDate['2026-08-22'].points.length).toBe(2);

      // Cumulative Haversine distance within each activity (no inter-activity jump)
      let expectedDist = 0;
      for (const act of summary.allActivities) {
        for (let i = 0; i < act.path.length - 1; i++) {
          expectedDist += getHaversineDistance(
            act.path[i].lat,
            act.path[i].lng,
            act.path[i + 1].lat,
            act.path[i + 1].lng
          );
        }
      }
      expect(summary.totalDistanceMeters).toBeCloseTo(expectedDist, 5);
      expect(summary.totalDistanceMeters).toBeGreaterThan(0);
    });

    it('should calculate distance within activities and not jump across disjoint activities', () => {
      const mockTimeline = {
        '2026-08-20': {
          date: '2026-08-20',
          activities: [
            {
              type: 'WALKING',
              startTime: 1000,
              endTime: 2000,
              path: [
                { lat: 37.5000, lng: 127.0000, time: 1000 },
                { lat: 37.5010, lng: 127.0010, time: 2000 }
              ]
            },
            {
              type: 'WALKING',
              startTime: 3000,
              endTime: 4000,
              path: [
                { lat: 35.1000, lng: 129.0000, time: 3000 }, // Far away in Busan (disjoint gap)
                { lat: 35.1010, lng: 129.0010, time: 4000 }
              ]
            }
          ]
        }
      };
      const summary = getFullPeriodSummary(mockTimeline);
      const d1 = getHaversineDistance(37.5000, 127.0000, 37.5010, 127.0010);
      const d2 = getHaversineDistance(35.1000, 129.0000, 35.1010, 129.0010);
      const gapDistance = getHaversineDistance(37.5010, 127.0010, 35.1000, 129.0000);

      expect(summary.totalDistanceMeters).toBeCloseTo(d1 + d2, 4);
      expect(summary.totalDistanceMeters).not.toBeCloseTo(d1 + d2 + gapDistance, 1);
    });

    it('should calculate inclusive calendar days correctly across date gaps', () => {
      const mockParsedTimeline = {
        '2026-08-20': {
          date: '2026-08-20',
          activities: []
        },
        '2026-08-25': {
          date: '2026-08-25',
          activities: []
        }
      };

      const summary = getFullPeriodSummary(mockParsedTimeline);
      expect(summary.startDate).toBe('2026-08-20');
      expect(summary.endDate).toBe('2026-08-25');
      expect(summary.totalDays).toBe(6); // 20, 21, 22, 23, 24, 25 = 6 days
      expect(summary.totalDistanceMeters).toBe(0);
      expect(summary.allActivities).toEqual([]);
      expect(summary.allPoints).toEqual([]);
      expect(summary.usedModes).toEqual([]);
      expect(summary.dateList).toEqual(['2026-08-20', '2026-08-25']);
      expect(summary.byDate['2026-08-20'].date).toBe('2026-08-20');
      expect(summary.byDate['2026-08-25'].date).toBe('2026-08-25');
    });

    it('should generate itineraryList with placesSummary for multi-day timeline', () => {
      const mockParsedTimeline = {
        '2026-08-20': {
          date: '2026-08-20',
          activities: [
            {
              type: 'WALKING',
              label: '걷기',
              startTime: 1000,
              endTime: 2000,
              path: [
                { lat: 35.6580, lng: 139.7016, time: 1000 },
                { lat: 35.6590, lng: 139.7026, time: 2000 }
              ]
            },
            {
              type: 'STILL',
              label: '시부야',
              startTime: 2000,
              endTime: 3000,
              path: [
                { lat: 35.6590, lng: 139.7026, time: 2000 },
                { lat: 35.6590, lng: 139.7026, time: 3000 }
              ]
            },
            {
              type: 'VEHICLE',
              label: '자동차',
              startTime: 3000,
              endTime: 4000,
              path: [
                { lat: 35.6590, lng: 139.7026, time: 3000 },
                { lat: 35.6900, lng: 139.7000, time: 4000 }
              ]
            },
            {
              type: 'STILL',
              label: '신주쿠',
              startTime: 4000,
              endTime: 5000,
              path: [
                { lat: 35.6900, lng: 139.7000, time: 4000 },
                { lat: 35.6900, lng: 139.7000, time: 5000 }
              ]
            }
          ]
        },
        '2026-08-21': {
          date: '2026-08-21',
          activities: [
            {
              type: 'STILL',
              label: '도쿄 타워',
              startTime: 10000,
              endTime: 11000,
              path: [
                { lat: 35.6586, lng: 139.7454, time: 10000 },
                { lat: 35.6586, lng: 139.7454, time: 11000 }
              ]
            }
          ]
        }
      };

      const summary = getFullPeriodSummary(mockParsedTimeline);
      expect(summary.itineraryList).toBeDefined();
      expect(summary.itineraryList.length).toBe(2);

      const day1 = summary.itineraryList[0];
      expect(day1.dayNum).toBe(1);
      expect(day1.dateStr).toBe('2026-08-20');
      expect(day1.year).toBe(2026);
      expect(day1.month).toBe(8);
      expect(day1.day).toBe(20);
      expect(day1.displayDate).toBe('2026년 8월 20일');
      expect(day1.placesSummary).toBe('시부야 ➔ 신주쿠');
      expect(day1.distanceKm).toBeGreaterThan(0);
      expect(day1.modes).toContain('걷기');
      expect(day1.modes).toContain('자동차');

      const day2 = summary.itineraryList[1];
      expect(day2.dayNum).toBe(2);
      expect(day2.dateStr).toBe('2026-08-21');
      expect(day2.year).toBe(2026);
      expect(day2.month).toBe(8);
      expect(day2.day).toBe(21);
      expect(day2.displayDate).toBe('2026년 8월 21일');
      expect(day2.placesSummary).toBe('도쿄 타워');
      expect(day2.distanceKm).toBe(0);
      expect(day2.modes).toEqual([]);
    });

    it('should deduplicate consecutive places and filter generic place names in placesSummary', () => {
      const mockParsedTimeline = {
        '2026-08-24': {
          date: '2026-08-24',
          activities: [
            { type: 'STILL', label: 'Unknown' },
            { type: 'STILL', label: '시부야' },
            { type: 'STILL', label: '시부야' },
            { type: 'STILL', label: '정지' },
            { type: 'STILL', label: '신주쿠' },
            { type: 'STILL', label: '신주쿠' }
          ]
        }
      };

      const summary = getFullPeriodSummary(mockParsedTimeline);
      expect(summary.itineraryList[0].placesSummary).toBe('시부야 ➔ 신주쿠');
    });

    it('should generate movement summary when no named places exist', () => {
      const mockParsedTimeline = {
        '2026-08-25': {
          date: '2026-08-25',
          activities: [
            {
              type: 'WALKING',
              label: '걷기',
              path: [
                { lat: 37.5000, lng: 127.0000 },
                { lat: 37.5180, lng: 127.0000 }
              ]
            },
            {
              type: 'VEHICLE',
              label: '자동차',
              path: [
                { lat: 37.5180, lng: 127.0000 },
                { lat: 37.6080, lng: 127.0000 }
              ]
            }
          ]
        },
        '2026-08-26': {
          date: '2026-08-26',
          activities: [
            {
              type: 'WALKING',
              label: '걷기',
              path: [
                { lat: 37.5000, lng: 127.0000 },
                { lat: 37.5010, lng: 127.0000 }
              ]
            }
          ]
        }
      };

      const summary = getFullPeriodSummary(mockParsedTimeline);
      expect(summary.itineraryList[0].placesSummary).toMatch(/도보 \d+(\.\d+)?km ➔ 차량 이동 \d+(\.\d+)?km/);
      expect(summary.itineraryList[1].placesSummary).toBe('주요 이동: 걷기');
    });
  });

  describe('calculateBearing', () => {
    it('should return 0 when start and end coordinates are identical', () => {
      expect(calculateBearing(37.5665, 126.9780, 37.5665, 126.9780)).toBe(0);
    });

    it('should calculate bearing heading North (~0 deg)', () => {
      const bearing = calculateBearing(0, 0, 10, 0);
      expect(bearing).toBeCloseTo(0, 5);
    });

    it('should calculate bearing heading East (~90 deg)', () => {
      const bearing = calculateBearing(0, 0, 0, 10);
      expect(bearing).toBeCloseTo(90, 5);
    });

    it('should calculate bearing heading South (~180 deg)', () => {
      const bearing = calculateBearing(10, 0, 0, 0);
      expect(bearing).toBeCloseTo(180, 5);
    });

    it('should calculate bearing heading West (~270 deg)', () => {
      const bearing = calculateBearing(0, 10, 0, 0);
      expect(bearing).toBeCloseTo(270, 5);
    });

    it('should calculate bearing heading North-East (~45 deg from equator)', () => {
      const bearing = calculateBearing(0, 0, 10, 10);
      expect(bearing).toBeGreaterThan(44);
      expect(bearing).toBeLessThan(46);
    });

    it('should always return a value in [0, 360)', () => {
      const testCases = [
        [37.5665, 126.9780, 35.1796, 129.0756],
        [35.1796, 129.0756, 37.5665, 126.9780],
        [37.5, 127.0, 37.5001, 126.9999],
        [-33.8688, 151.2093, 37.5665, 126.9780]
      ];
      for (const [lat1, lon1, lat2, lon2] of testCases) {
        const bearing = calculateBearing(lat1, lon1, lat2, lon2);
        expect(bearing).toBeGreaterThanOrEqual(0);
        expect(bearing).toBeLessThan(360);
      }
    });
  });

  describe('Year display and Range filtering', () => {
    it('formatDisplayDate should format date with year', () => {
      expect(formatDisplayDate('2024-08-01')).toBe('2024년 8월 1일');
      expect(formatDisplayDate('2023-12-25')).toBe('2023년 12월 25일');
      expect(formatDisplayDate('')).toBe('');
      expect(formatDisplayDate(null)).toBe('');
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
      expect(filtered.itineraryList[0].dayNum).toBe(1);
      expect(filtered.itineraryList[0].dateStr).toBe('2024-05-02');
      expect(filtered.itineraryList[1].dayNum).toBe(2);
      expect(filtered.itineraryList[1].dateStr).toBe('2024-05-03');
      expect(filtered.startDate).toBe('2024-05-02');
      expect(filtered.endDate).toBe('2024-05-03');
    });

    it('filterSummaryByRange should handle edge cases like null summary or empty range', () => {
      const emptyFiltered = filterSummaryByRange(null, '2024-05-01', '2024-05-02');
      expect(emptyFiltered.totalDays).toBe(0);
      expect(emptyFiltered.dateList).toEqual([]);
      expect(emptyFiltered.itineraryList).toEqual([]);
    });
  });
});
