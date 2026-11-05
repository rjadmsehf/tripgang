import { describe, it, expect } from 'vitest';
import { parseTimelineJson, getFullPeriodSummary, getHaversineDistance } from './timelineParser';

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
        usedModes: []
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

      // Cumulative Haversine distance
      let expectedDist = 0;
      for (let i = 0; i < summary.allPoints.length - 1; i++) {
        expectedDist += getHaversineDistance(
          summary.allPoints[i].lat,
          summary.allPoints[i].lng,
          summary.allPoints[i + 1].lat,
          summary.allPoints[i + 1].lng
        );
      }
      expect(summary.totalDistanceMeters).toBeCloseTo(expectedDist, 5);
      expect(summary.totalDistanceMeters).toBeGreaterThan(0);
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
    });
  });
});
