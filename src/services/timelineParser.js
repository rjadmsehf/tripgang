// Haversine distance in meters
function getHaversineDistance(lat1, lon1, lat2, lon2) {
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

function getLocalDateString(timestampStr) {
  try {
    const val = isNaN(timestampStr) ? timestampStr : Number(timestampStr);
    const date = new Date(val);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (e) {
    return 'Unknown';
  }
}

export function parseTimelineJson(json) {
  const result = {};

  if (!json) return result;

  // Format A: Semantic monthly history
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

        // Map activityType
        const typeStr = (seg.activityType || 'STILL').toUpperCase();
        let type = 'VEHICLE';
        let label = '자동차';

        if (typeStr.includes('WALKING') || typeStr.includes('FOOT') || typeStr.includes('RUNNING')) {
          type = 'WALKING';
          label = '걷기';
        } else if (typeStr.includes('MOTORCYCLING')) {
          type = 'MOTORCYCLING';
          label = '오토바이';
        } else if (typeStr.includes('FLYING')) {
          type = 'FLYING';
          label = '비행기';
        } else if (typeStr.includes('CYCLING') || typeStr.includes('BICYCLE')) {
          type = 'CYCLING';
          label = '자전거';
        } else if (typeStr.includes('STILL')) {
          type = 'STILL';
          label = '정지';
        }

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
  // Format B: Raw Records.json locations list
  else if (json.locations && Array.isArray(json.locations)) {
    // Group raw points by date
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
      // Sort chronologically
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

        // Dynamic speed heuristic classification
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

        // If type changes or gap is too large (> 30 mins), flush active segment
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

      // Flush remaining
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
        result[dateStr] = {
          date: dateStr,
          activities
        };
      }
    }
  }

  // Sort activities chronologically per day
  for (const dateKey of Object.keys(result)) {
    result[dateKey].activities.sort((a, b) => a.startTime - b.startTime);
  }

  return result;
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
