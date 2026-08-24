import { describe, it, expect } from 'vitest';
import { parseTimelineJson } from './timelineParser';

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
});
