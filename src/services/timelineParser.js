// Haversine distance in meters
export function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

// Calculate initial bearing in degrees [0, 360) from (lat1, lon1) to (lat2, lon2)
export function calculateBearing(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (theta * 180 / Math.PI + 360) % 360;
}

export function parseLatLng(point) {
  if (!point) return null;

  if (typeof point === 'object') {
    const lat =
      point.lat ??
      point.latitude ??
      (point.latE7 != null ? point.latE7 / 1e7 : null) ??
      (point.latitudeE7 != null ? point.latitudeE7 / 1e7 : null);
    const lng =
      point.lng ??
      point.longitude ??
      (point.lngE7 != null ? point.lngE7 / 1e7 : null) ??
      (point.longitudeE7 != null ? point.longitudeE7 / 1e7 : null);

    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      return { lat: Number(lat), lng: Number(lng) };
    }
    return null;
  }

  if (typeof point === 'string') {
    // Remove "geo:", degree symbol "°", and trim
    const cleaned = point.replace(/[°geo:]/g, '').trim();
    // Split by comma or whitespace
    const parts = cleaned.split(/[\s,]+/);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  }

  return null;
}

function getLocalDateString(timestampVal) {
  try {
    const val = isNaN(timestampVal) ? timestampVal : Number(timestampVal);
    const date = new Date(val);
    if (isNaN(date.getTime())) return 'Unknown';
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (e) {
    return 'Unknown';
  }
}

function mapActivityType(typeStr) {
  const upper = String(typeStr || '').toUpperCase();
  if (upper.includes('WALKING') || upper.includes('FOOT') || upper.includes('RUNNING')) {
    return { type: 'WALKING', label: '걷기' };
  } else if (upper.includes('MOTORCYCLING')) {
    return { type: 'MOTORCYCLING', label: '오토바이' };
  } else if (upper.includes('FLYING') || upper.includes('AIRPLANE')) {
    return { type: 'FLYING', label: '비행기' };
  } else if (upper.includes('CYCLING') || upper.includes('BICYCLE')) {
    return { type: 'CYCLING', label: '자전거' };
  } else if (upper.includes('STILL')) {
    return { type: 'STILL', label: '정지' };
  }
  return { type: 'VEHICLE', label: '자동차' };
}

function getLabelFromType(type) {
  switch (type) {
    case 'WALKING': return '걷기';
    case 'CYCLING': return '자전거';
    case 'MOTORCYCLING': return '오토바이';
    case 'FLYING': return '비행기';
    case 'STILL': return '정지';
    default: return '자동차';
  }
}

export function parseTimelineJson(json) {
  const result = {};

  if (!json) return result;

  // Format 1: semanticSegments (Newer Google Maps on-device export or array format)
  const segments = json.semanticSegments || (Array.isArray(json) ? json : null);
  if (segments && Array.isArray(segments) && segments.length > 0) {
    for (const seg of segments) {
      const startVal = seg.startTime || seg.startTimeMs || seg.duration?.startTimestamp || seg.duration?.startTimestampMs;
      const endVal = seg.endTime || seg.endTimeMs || seg.duration?.endTimestamp || seg.duration?.endTimestampMs || startVal;
      if (!startVal) continue;

      const startDateStr = getLocalDateString(startVal);
      if (startDateStr === 'Unknown') continue;

      if (!result[startDateStr]) {
        result[startDateStr] = { date: startDateStr, activities: [] };
      }

      const stTime = isNaN(startVal) ? new Date(startVal).getTime() : Number(startVal);
      const edTime = isNaN(endVal) ? new Date(endVal).getTime() : Number(endVal);

      // A) Transit / Path
      if (seg.timelinePath && Array.isArray(seg.timelinePath) && seg.timelinePath.length > 0) {
        const path = [];
        for (const ptObj of seg.timelinePath) {
          const coords = parseLatLng(ptObj.point || ptObj);
          if (coords) {
            const ptTimeVal = ptObj.time || ptObj.timestamp || startVal;
            const ptTime = isNaN(ptTimeVal) ? new Date(ptTimeVal).getTime() : Number(ptTimeVal);
            path.push({
              lat: coords.lat,
              lng: coords.lng,
              time: ptTime
            });
          }
        }

        if (path.length > 0) {
          const rawType = seg.activity?.topCandidate?.type || seg.activityType || 'VEHICLE';
          const { type, label } = mapActivityType(rawType);
          result[startDateStr].activities.push({
            type,
            label,
            startTime: stTime,
            endTime: edTime,
            path
          });
        }
      }
      // B) Visit
      else if (seg.visit) {
        const loc = seg.visit.topCandidate?.placeLocation || seg.visit.placeLocation || seg.visit.location;
        const coords = parseLatLng(loc);
        if (coords) {
          result[startDateStr].activities.push({
            type: 'STILL',
            label: seg.visit.topCandidate?.semanticType || seg.visit.topCandidate?.placeId || '방문 장소',
            startTime: stTime,
            endTime: edTime,
            path: [
              { lat: coords.lat, lng: coords.lng, time: stTime },
              { lat: coords.lat, lng: coords.lng, time: edTime }
            ]
          });
        }
      }
    }
  }

  // Format 2: Semantic monthly history (timelineObjects)
  if (json.timelineObjects && Array.isArray(json.timelineObjects)) {
    for (const obj of json.timelineObjects) {
      if (obj.activitySegment) {
        const seg = obj.activitySegment;
        if (!seg.duration) continue;

        const startVal = seg.duration.startTimestamp || seg.duration.startTimestampMs;
        const endVal = seg.duration.endTimestamp || seg.duration.endTimestampMs;
        if (!startVal) continue;

        const startDateStr = getLocalDateString(startVal);
        if (startDateStr === 'Unknown') continue;

        if (!result[startDateStr]) {
          result[startDateStr] = { date: startDateStr, activities: [] };
        }

        const stTime = isNaN(startVal) ? new Date(startVal).getTime() : Number(startVal);
        const edTime = isNaN(endVal) ? new Date(endVal).getTime() : Number(endVal);

        // Extract path points
        let path = [];
        const rawPoints = seg.waypointPath?.waypoints || seg.simplifiedRawPath?.points || [];
        if (rawPoints.length > 0) {
          path = rawPoints.map(p => {
            const ptTimeVal = p.timestampMs || p.timestamp || startVal;
            const ptTime = isNaN(ptTimeVal) ? new Date(ptTimeVal).getTime() : Number(ptTimeVal);
            return {
              lat: (p.latE7 || p.latitudeE7) / 1e7,
              lng: (p.lngE7 || p.longitudeE7) / 1e7,
              time: ptTime
            };
          });
        } else if (seg.startLocation && seg.endLocation) {
          path = [
            { lat: (seg.startLocation.latitudeE7 || seg.startLocation.latE7) / 1e7, lng: (seg.startLocation.longitudeE7 || seg.startLocation.lngE7) / 1e7, time: stTime },
            { lat: (seg.endLocation.latitudeE7 || seg.endLocation.latE7) / 1e7, lng: (seg.endLocation.longitudeE7 || seg.endLocation.lngE7) / 1e7, time: edTime }
          ];
        }

        if (path.length === 0) continue;

        const { type, label } = mapActivityType(seg.activityType);

        result[startDateStr].activities.push({
          type,
          label,
          startTime: stTime,
          endTime: edTime,
          path
        });
      } else if (obj.placeVisit) {
        const pv = obj.placeVisit;
        if (!pv.location || !pv.duration) continue;

        const startVal = pv.duration.startTimestamp || pv.duration.startTimestampMs;
        const endVal = pv.duration.endTimestamp || pv.duration.endTimestampMs;
        if (!startVal) continue;

        const startDateStr = getLocalDateString(startVal);
        if (startDateStr === 'Unknown') continue;

        if (!result[startDateStr]) {
          result[startDateStr] = { date: startDateStr, activities: [] };
        }

        const lat = (pv.location.latitudeE7 || pv.location.latE7) / 1e7;
        const lng = (pv.location.longitudeE7 || pv.location.lngE7) / 1e7;
        const stTime = isNaN(startVal) ? new Date(startVal).getTime() : Number(startVal);
        const edTime = isNaN(endVal) ? new Date(endVal).getTime() : Number(endVal);

        result[startDateStr].activities.push({
          type: 'STILL',
          label: pv.location.name || '방문 장소',
          startTime: stTime,
          endTime: edTime,
          path: [{ lat, lng, time: stTime }, { lat, lng, time: edTime }]
        });
      }
    }
  }

  // Format 3: Raw Records.json locations list
  if (json.locations && Array.isArray(json.locations)) {
    const dateMap = {};
    for (const loc of json.locations) {
      const tsVal = loc.timestamp || loc.timestampMs;
      if (!tsVal) continue;
      const dateStr = getLocalDateString(tsVal);
      if (dateStr === 'Unknown') continue;

      if (!dateMap[dateStr]) {
        dateMap[dateStr] = [];
      }

      const timeMs = isNaN(tsVal) ? new Date(tsVal).getTime() : Number(tsVal);

      dateMap[dateStr].push({
        lat: loc.latitudeE7 / 1e7,
        lng: loc.longitudeE7 / 1e7,
        time: timeMs
      });
    }

    // Process each date's array of points
    for (const [dateStr, points] of Object.entries(dateMap)) {
      points.sort((a, b) => a.time - b.time);

      if (points.length < 2) continue;

      const activities = [];
      let currentSegment = [];
      let currentType = null;

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (currentSegment.length === 0) {
          currentSegment.push(pt);
          continue;
        }

        const prevPt = currentSegment[currentSegment.length - 1];
        const dist = getHaversineDistance(prevPt.lat, prevPt.lng, pt.lat, pt.lng);
        const timeSec = (pt.time - prevPt.time) / 1000;

        let speed = 0;
        if (timeSec > 0) {
          speed = dist / timeSec; // meters per second
        }

        let type = 'VEHICLE';
        if (speed < 2.0) {
          type = 'WALKING';
        } else if (speed >= 2.0 && speed < 8.0) {
          type = 'CYCLING';
        } else if (speed >= 8.0 && speed < 50.0) {
          type = 'VEHICLE';
        } else {
          type = 'FLYING';
        }

        if (currentType === null) {
          currentType = type;
        }

        if (type !== currentType || timeSec > 1800) {
          if (currentSegment.length >= 2) {
            activities.push({
              type: currentType,
              label: getLabelFromType(currentType),
              startTime: currentSegment[0].time,
              endTime: currentSegment[currentSegment.length - 1].time,
              path: [...currentSegment]
            });
          }
          currentSegment = [pt];
          currentType = null;
        } else {
          currentSegment.push(pt);
        }
      }

      if (currentSegment.length >= 2) {
        activities.push({
          type: currentType,
          label: getLabelFromType(currentType),
          startTime: currentSegment[0].time,
          endTime: currentSegment[currentSegment.length - 1].time,
          path: currentSegment
        });
      }

      if (activities.length > 0) {
        if (!result[dateStr]) {
          result[dateStr] = { date: dateStr, activities: [] };
        }
        result[dateStr].activities.push(...activities);
      }
    }
  }

  // Sort activities chronologically per day
  for (const dateKey of Object.keys(result)) {
    result[dateKey].activities.sort((a, b) => a.startTime - b.startTime);
  }

  return result;
}

export function getFullPeriodSummary(parsedTimeline) {
  const defaultSummary = {
    startDate: null,
    endDate: null,
    totalDays: 0,
    allActivities: [],
    allPoints: [],
    totalDistanceMeters: 0,
    usedModes: []
  };

  if (!parsedTimeline || typeof parsedTimeline !== 'object') {
    return defaultSummary;
  }

  const dateKeys = Object.keys(parsedTimeline)
    .filter(k => parsedTimeline[k] != null)
    .sort();

  if (dateKeys.length === 0) {
    return defaultSummary;
  }

  const startDate = dateKeys[0];
  const endDate = dateKeys[dateKeys.length - 1];

  let totalDays = 0;
  if (startDate && endDate) {
    const [y1, m1, d1] = startDate.split('-').map(Number);
    const [y2, m2, d2] = endDate.split('-').map(Number);
    const utc1 = Date.UTC(y1, m1 - 1, d1);
    const utc2 = Date.UTC(y2, m2 - 1, d2);
    if (!isNaN(utc1) && !isNaN(utc2)) {
      const msPerDay = 1000 * 60 * 60 * 24;
      totalDays = Math.max(0, Math.round((utc2 - utc1) / msPerDay) + 1);
    }
  }

  const allActivities = [];
  for (const dateKey of dateKeys) {
    const dayObj = parsedTimeline[dateKey];
    if (dayObj && Array.isArray(dayObj.activities)) {
      allActivities.push(...dayObj.activities);
    }
  }
  allActivities.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

  const allPoints = [];
  for (const activity of allActivities) {
    if (activity.path && Array.isArray(activity.path)) {
      for (const pt of activity.path) {
        allPoints.push({
          lat: pt.lat,
          lng: pt.lng,
          time: pt.time,
          type: activity.type,
          label: activity.label
        });
      }
    }
  }
  allPoints.sort((a, b) => (a.time || 0) - (b.time || 0));

  let totalDistanceMeters = 0;
  for (const activity of allActivities) {
    if (activity.path && Array.isArray(activity.path) && activity.path.length >= 2) {
      for (let i = 0; i < activity.path.length - 1; i++) {
        const p1 = activity.path[i];
        const p2 = activity.path[i + 1];
        if (p1 && p2 && p1.lat != null && p1.lng != null && p2.lat != null && p2.lng != null) {
          totalDistanceMeters += getHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
        }
      }
    }
  }

  const usedModes = [...new Set(allActivities.map(a => a.type).filter(Boolean))];

  return {
    startDate,
    endDate,
    totalDays,
    allActivities,
    allPoints,
    totalDistanceMeters,
    usedModes
  };
}
