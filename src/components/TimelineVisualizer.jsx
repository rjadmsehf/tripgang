import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { Play, Pause, RotateCcw, Download, Upload, Eye, PanelRightClose, PanelRightOpen, Calendar } from 'lucide-react';
import { parseTimelineJson, getFullPeriodSummary, getHaversineDistance, calculateBearing } from '../services/timelineParser';
import './TimelineVisualizer.css';
import gifshot from 'gifshot';

export const ACTIVITY_COLORS = {
  WALKING: '#2dd4bf',      // Vibrant Mint
  VEHICLE: '#3b82f6',      // Blue
  MOTORCYCLING: '#8b5cf6', // Purple
  FLYING: '#ec4899',       // Pink
  CYCLING: '#f59e0b',      // Amber
  STILL: '#6b7280'         // Gray
};

export const ACTIVITY_EMOJIS = {
  WALKING: '🚶',
  VEHICLE: '🚗',
  MOTORCYCLING: '🏍️',
  FLYING: '✈️',
  CYCLING: '🚲',
  STILL: '📍'
};

export const ACTIVITY_LABELS = {
  WALKING: '걷기',
  VEHICLE: '자동차',
  MOTORCYCLING: '오토바이',
  FLYING: '비행기',
  CYCLING: '자전거',
  STILL: '정지'
};

export function checkIsAirplane(pt, nextPt) {
  if (!pt) return false;
  if (pt.type === 'FLYING') return true;
  if (!nextPt) return false;
  const dist = getHaversineDistance(pt.lat, pt.lng, nextPt.lat, nextPt.lng);
  const timeDelta = (nextPt.time != null && pt.time != null) ? Math.abs(nextPt.time - pt.time) / 1000 : 0;
  return dist > 100000 || (timeDelta > 0 && (dist / timeDelta) > 70);
}

export function getPlaybackPointInfo(pt, nextPt, remainder, tripSummary, selectedDayFilter) {
  if (!pt) {
    return {
      dayNum: 1,
      mmDd: '--.--',
      dayBadge: 'Day 1 · --.--',
      dateStr: '--.--',
      dateKey: null,
      date: null,
      timeStr: '--:--',
      emoji: '📍',
      label: '대기',
      effectiveType: 'STILL',
      fullText: 'Day 1 · --.-- · 📍 대기'
    };
  }

  let timeVal = pt.time;
  if (remainder > 0 && nextPt && nextPt.time != null && timeVal != null) {
    timeVal = timeVal + (nextPt.time - timeVal) * remainder;
  }

  const isAirplane = checkIsAirplane(pt, nextPt);
  const effectiveType = isAirplane ? 'FLYING' : pt.type;
  const emoji = ACTIVITY_EMOJIS[effectiveType] || '📍';
  const label = ACTIVITY_LABELS[effectiveType] || effectiveType || '이동';

  let dayNum = 1;
  let mmDd = '--.--';
  let timeStr = '--:--';
  let dateKey = null;
  let yyyyVal = null;
  let mmVal = null;
  let ddVal = null;

  if (timeVal != null) {
    const d = new Date(timeVal);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      dateKey = `${yyyy}-${mm}-${dd}`;
      yyyyVal = String(yyyy);
      mmVal = mm;
      ddVal = dd;
      mmDd = `${mm}.${dd}`;
      timeStr = `${hh}:${min}`;

      if (tripSummary?.dateList && tripSummary.dateList.length > 0) {
        const idx = tripSummary.dateList.indexOf(dateKey);
        if (idx >= 0) {
          dayNum = idx + 1;
        } else if (dateKey < tripSummary.dateList[0]) {
          dayNum = 1;
        } else if (dateKey > tripSummary.dateList[tripSummary.dateList.length - 1]) {
          dayNum = tripSummary.dateList.length;
        } else {
          let closestIdx = 0;
          for (let i = 0; i < tripSummary.dateList.length; i++) {
            if (tripSummary.dateList[i] <= dateKey) {
              closestIdx = i;
            }
          }
          dayNum = closestIdx + 1;
        }
      }
    }
  }

  if (mmDd === '--.--' && selectedDayFilter && selectedDayFilter !== 'ALL') {
    const idx = tripSummary?.dateList ? tripSummary.dateList.indexOf(selectedDayFilter) : 0;
    dayNum = idx >= 0 ? idx + 1 : 1;
    mmDd = selectedDayFilter.slice(5).replace('-', '.');
  }

  if (!dateKey && selectedDayFilter && selectedDayFilter !== 'ALL') {
    dateKey = selectedDayFilter;
  }
  if (!dateKey && tripSummary?.dateList && tripSummary.dateList.length > 0) {
    dateKey = tripSummary.dateList[dayNum - 1] || tripSummary.dateList[0];
  }

  if ((!yyyyVal || !mmVal || !ddVal) && dateKey && typeof dateKey === 'string' && dateKey.includes('-')) {
    const parts = dateKey.split('-');
    if (parts.length === 3) {
      yyyyVal = parts[0];
      mmVal = parts[1].padStart(2, '0');
      ddVal = parts[2].padStart(2, '0');
    }
  }

  const formattedDate = (yyyyVal && mmVal && ddVal)
    ? `${yyyyVal}.${mmVal}.${ddVal}`
    : mmDd;

  const dayBadge = `Day ${dayNum} · ${formattedDate}`;
  const fullText = `${dayBadge} · ${emoji} ${label}`;

  return {
    dayNum,
    mmDd,
    dayBadge,
    dateStr: mmDd,
    dateKey,
    date: dateKey,
    timeStr,
    emoji,
    label,
    effectiveType,
    fullText
  };
}

export default function TimelineVisualizer() {
  const [timelineData, setTimelineData] = useState(null);
  const [tripSummary, setTripSummary] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [selectedDayFilter, setSelectedDayFilter] = useState('ALL');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [cameraMode, setCameraMode] = useState('fit'); // 'fit' or 'follow'
  const [isItineraryOpen, setIsItineraryOpen] = useState(true);
  
  // Export Settings
  const [exportFormat, setExportFormat] = useState('gif'); // 'gif' or 'mp4'
  const [exportDuration, setExportDuration] = useState(60); // 30, 60, 90, 120
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFrameImg, setExportFrameImg] = useState('');

  const mapRef = useRef(null);
  const leafletMapInstance = useRef(null);
  const markerRef = useRef(null);
  const polylineGroupRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(null);

  // Filtered Activities & Points based on selectedDayFilter
  const activeActivities = useMemo(() => {
    if (!tripSummary) return [];
    if (selectedDayFilter === 'ALL') {
      return tripSummary.allActivities || [];
    }
    return tripSummary.byDate?.[selectedDayFilter]?.activities || [];
  }, [tripSummary, selectedDayFilter]);

  const activePoints = useMemo(() => {
    if (!tripSummary) return [];
    if (selectedDayFilter === 'ALL') {
      return tripSummary.allPoints || [];
    }
    return tripSummary.byDate?.[selectedDayFilter]?.points || [];
  }, [tripSummary, selectedDayFilter]);

  // Handle File upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const parsed = parseTimelineJson(json);
        const summary = getFullPeriodSummary(parsed);
        if (!summary || summary.allPoints.length === 0) {
          alert('선택하신 JSON 파일에서 날짜별 이동 기록을 찾지 못했습니다.\n\n지원되는 구글 타임라인 파일 형식:\n1. 모바일 Google Maps 내보내기 (Timeline.json - semanticSegments)\n2. Google Takeout 월별 기록 (*_JANUARY.json 등)\n3. Google Takeout 원시 위치 기록 (Records.json)');
          return;
        }
        setSelectedDayFilter('ALL');
        setTimelineData(parsed);
        setTripSummary(summary);
      } catch (err) {
        console.error('File parsing error:', err);
        alert('JSON 파일 형식이 올바르지 않거나 파싱에 실패했습니다.\n' + err.message);
      }
    };
    reader.onerror = () => {
      alert('파일을 읽는 도중 오류가 발생했습니다.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDayFilterChange = (e) => {
    const newFilter = e.target.value;
    setSelectedDayFilter(newFilter);
    setProgress(0);
    setIsPlaying(false);
  };

  const toggleItinerary = () => {
    setIsItineraryOpen(prev => {
      const next = !prev;
      setTimeout(() => {
        leafletMapInstance.current?.invalidateSize();
      }, 200);
      return next;
    });
  };

  const handleCardClick = (dateStr) => {
    setSelectedDayFilter(dateStr);
    setProgress(0);
    setIsPlaying(false);
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletMapInstance.current) return;

    const map = L.map(mapRef.current).setView([37.5665, 126.978], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    leafletMapInstance.current = map;
    polylineGroupRef.current = L.featureGroup().addTo(map);

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      map.remove();
      leafletMapInstance.current = null;
    };
  }, []);

  // Listen to window resize to invalidate map size
  useEffect(() => {
    const handleResize = () => {
      if (leafletMapInstance.current) {
        leafletMapInstance.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Draw filtered paths onto polylineGroupRef and adjust fitBounds
  useEffect(() => {
    if (!leafletMapInstance.current || !polylineGroupRef.current) return;

    leafletMapInstance.current.invalidateSize();

    // Clear previous paths
    polylineGroupRef.current.clearLayers();

    // Clear previous marker
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (!activeActivities || activeActivities.length === 0) {
      setProgress(0);
      setIsPlaying(false);
      return;
    }

    // Draw paths colored by activity type
    activeActivities.forEach(act => {
      if (act.path && act.path.length > 0) {
        const polyLatLngs = act.path.map(p => [p.lat, p.lng]);
        L.polyline(polyLatLngs, {
          color: ACTIVITY_COLORS[act.type] || '#3b82f6',
          weight: 4,
          opacity: 0.85
        }).addTo(polylineGroupRef.current);
      }
    });

    // Fit map boundary
    const bounds = polylineGroupRef.current.getBounds();
    if (bounds.isValid()) {
      leafletMapInstance.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }

    setProgress(0);
    setIsPlaying(false);
  }, [tripSummary, selectedDayFilter]);

  // Animate marker in real-time along waypoints (smooth highlight playback)
  useEffect(() => {
    if (!isPlaying || activePoints.length === 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const animate = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      setProgress(prev => {
        const totalIndex = (activePoints.length - 1) * prev;
        const index = Math.min(Math.floor(totalIndex), activePoints.length - 1);
        const pt = activePoints[index];
        const nextPt = index < activePoints.length - 1 ? activePoints[index + 1] : null;

        let flightFactor = 1.0;
        if (pt) {
          const isAirplane = checkIsAirplane(pt, nextPt);
          if (isAirplane) {
            flightFactor = 0.25; // Scenic slowdown during flights
          }
        }

        const next = prev + (delta / 1000 * speedMultiplier * flightFactor) / 60;
        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      lastTimeRef.current = null;
    };
  }, [isPlaying, activePoints, speedMultiplier]);

  // Update marker location and tooltip based on progress slider/value
  useEffect(() => {
    if (activePoints.length === 0 || !leafletMapInstance.current) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const totalIndex = (activePoints.length - 1) * progress;
    const index = Math.min(Math.floor(totalIndex), activePoints.length - 1);
    const remainder = totalIndex - index;

    let currentLat = activePoints[index].lat;
    let currentLng = activePoints[index].lng;
    const pt = activePoints[index];
    const nextPt = index < activePoints.length - 1 ? activePoints[index + 1] : null;

    if (remainder > 0 && nextPt) {
      currentLat = currentLat + (nextPt.lat - currentLat) * remainder;
      currentLng = currentLng + (nextPt.lng - currentLng) * remainder;
    }

    const isAirplane = checkIsAirplane(pt, nextPt);
    const effectiveType = isAirplane ? 'FLYING' : pt.type;
    const emoji = ACTIVITY_EMOJIS[effectiveType] || '📍';

    let markerHtml = '';
    if (isAirplane) {
      let bearing = 0;
      if (nextPt) {
        bearing = calculateBearing(currentLat, currentLng, nextPt.lat, nextPt.lng);
      } else if (index > 0) {
        bearing = calculateBearing(activePoints[index - 1].lat, activePoints[index - 1].lng, currentLat, currentLng);
      }
      markerHtml = `<div style="font-size: 36px; transform: translate(-18px, -18px) rotate(${bearing - 45}deg); filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)); transform-origin: center center; display: inline-block;">✈️</div>`;
    } else {
      markerHtml = `<div style="font-size: 24px; transform: translate(-12px, -22px); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${emoji}</div>`;
    }

    const customIcon = L.divIcon({
      html: markerHtml,
      className: 'custom-emoji-icon',
      iconSize: isAirplane ? [36, 36] : [24, 24],
      iconAnchor: isAirplane ? [18, 18] : [12, 12]
    });

    const pointInfo = getPlaybackPointInfo(pt, nextPt, remainder, tripSummary, selectedDayFilter);
    const tooltipContent = pointInfo.fullText;
    const hasTooltip = Boolean(tooltipContent && tooltipContent.trim());

    if (!markerRef.current) {
      const marker = L.marker([currentLat, currentLng], { icon: customIcon }).addTo(leafletMapInstance.current);
      markerRef.current = marker;
      if (hasTooltip) {
        marker.bindTooltip(tooltipContent, {
          permanent: true,
          direction: 'top',
          offset: [0, -20],
          className: 'timeline-marker-tooltip'
        }).openTooltip();
      }
    } else {
      markerRef.current.setLatLng([currentLat, currentLng]);
      markerRef.current.setIcon(customIcon);
      if (hasTooltip) {
        if (markerRef.current.getTooltip()) {
          markerRef.current.setTooltipContent(tooltipContent);
          if (!markerRef.current.isTooltipOpen()) {
            markerRef.current.openTooltip();
          }
        } else {
          markerRef.current.bindTooltip(tooltipContent, {
            permanent: true,
            direction: 'top',
            offset: [0, -20],
            className: 'timeline-marker-tooltip'
          }).openTooltip();
        }
      } else if (markerRef.current.getTooltip() && markerRef.current.isTooltipOpen()) {
        markerRef.current.closeTooltip();
      }
    }

    // Camera track
    if (cameraMode === 'follow') {
      leafletMapInstance.current.panTo([currentLat, currentLng]);
    }
  }, [progress, cameraMode, activePoints, tripSummary, selectedDayFilter]);

  // Canvas Frame Rendering and Encoder Pipeline
  const runExport = async () => {
    if (activePoints.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const width = 800;
      const height = 600;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // FPS configuration: GIF=10fps, MP4=20fps
      const fps = exportFormat === 'gif' ? 10 : 20;
      const totalFrames = exportDuration * fps;
      const frames = [];

      // Bounding Box Calculation
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      activePoints.forEach(p => {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
      });

      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;

      // Helper: Latitude/Longitude to Canvas Coordinate Converter (Web Mercator projection)
      const latToY = (lat, zoom) => {
        const latRad = (lat * Math.PI) / 180;
        const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
        return y * Math.pow(2, zoom) * 256;
      };

      const lngToX = (lng, zoom) => {
        return ((lng + 180) / 360) * Math.pow(2, zoom) * 256;
      };

      // Auto-calculate zoom level based on bounding box
      let zoom = 14;
      for (let z = 18; z >= 2; z--) {
        const wDiff = Math.abs(lngToX(maxLng, z) - lngToX(minLng, z));
        const hDiff = Math.abs(latToY(minLat, z) - latToY(maxLat, z));
        if (wDiff < width - 100 && hDiff < height - 100) {
          zoom = z;
          break;
        }
      }

      // Helper: Async load map tile images
      const loadTile = (x, y, z) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous'; // Avoid canvas tainting
          img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
        });
      };

      // Helper: Pre-load all tiles for the trip bounding box
      const tileCache = {};
      const centerTileX = Math.floor(lngToX(centerLng, zoom) / 256);
      const centerTileY = Math.floor(latToY(centerLat, zoom) / 256);
      
      const promises = [];
      const tilesToFetch = [];
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const tx = centerTileX + dx;
          const ty = centerTileY + dy;
          tilesToFetch.push({ tx, ty });
          promises.push(loadTile(tx, ty, zoom));
        }
      }

      const loadedTiles = await Promise.all(promises);
      tilesToFetch.forEach((item, idx) => {
        if (loadedTiles[idx]) {
          tileCache[`${item.tx}_${item.ty}`] = loadedTiles[idx];
        }
      });

      // Animate & Capture each frame
      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        const frameProgress = frameIdx / (totalFrames - 1);
        
        // Clear canvas
        ctx.fillStyle = '#121214';
        ctx.fillRect(0, 0, width, height);

        // Determine center position based on mode
        let activeCenterLat = centerLat;
        let activeCenterLng = centerLng;

        const totalIndex = (activePoints.length - 1) * frameProgress;
        const index = Math.min(Math.floor(totalIndex), activePoints.length - 1);
        const remainder = totalIndex - index;

        let currentLat = activePoints[index].lat;
        let currentLng = activePoints[index].lng;
        const pt = activePoints[index];
        const nextPt = index < activePoints.length - 1 ? activePoints[index + 1] : null;

        if (remainder > 0 && nextPt) {
          currentLat = currentLat + (nextPt.lat - currentLat) * remainder;
          currentLng = currentLng + (nextPt.lng - currentLng) * remainder;
        }

        if (cameraMode === 'follow') {
          activeCenterLat = currentLat;
          activeCenterLng = currentLng;
        }

        // Draw map tiles
        const mapCenterPixelX = lngToX(activeCenterLng, zoom);
        const mapCenterPixelY = latToY(activeCenterLat, zoom);
        const screenCenterX = width / 2;
        const screenCenterY = height / 2;

        const currentCenterTileX = Math.floor(mapCenterPixelX / 256);
        const currentCenterTileY = Math.floor(mapCenterPixelY / 256);

        for (let tx = currentCenterTileX - 3; tx <= currentCenterTileX + 3; tx++) {
          for (let ty = currentCenterTileY - 3; ty <= currentCenterTileY + 3; ty++) {
            const tileImg = tileCache[`${tx}_${ty}`];
            if (tileImg) {
              const tilePixelX = tx * 256;
              const tilePixelY = ty * 256;
              const drawX = screenCenterX + (tilePixelX - mapCenterPixelX);
              const drawY = screenCenterY + (tilePixelY - mapCenterPixelY);
              ctx.drawImage(tileImg, drawX, drawY, 256, 256);
            }
          }
        }

        // Draw historical path up to current index
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let lastScreenX = null;
        let lastScreenY = null;

        for (let j = 0; j <= index; j++) {
          const p = activePoints[j];
          const screenX = screenCenterX + (lngToX(p.lng, zoom) - mapCenterPixelX);
          const screenY = screenCenterY + (latToY(p.lat, zoom) - mapCenterPixelY);

          ctx.strokeStyle = ACTIVITY_COLORS[p.type] || '#3b82f6';
          if (lastScreenX !== null && lastScreenY !== null) {
            ctx.beginPath();
            ctx.moveTo(lastScreenX, lastScreenY);
            ctx.lineTo(screenX, screenY);
            ctx.stroke();
          }
          lastScreenX = screenX;
          lastScreenY = screenY;
        }

        // Draw current path segment to current interpolation position
        if (index < activePoints.length - 1) {
          const screenX = screenCenterX + (lngToX(currentLng, zoom) - mapCenterPixelX);
          const screenY = screenCenterY + (latToY(currentLat, zoom) - mapCenterPixelY);
          ctx.strokeStyle = ACTIVITY_COLORS[pt.type] || '#3b82f6';
          if (lastScreenX !== null && lastScreenY !== null) {
            ctx.beginPath();
            ctx.moveTo(lastScreenX, lastScreenY);
            ctx.lineTo(screenX, screenY);
            ctx.stroke();
          }
        }

        // Draw Moving Emoji Marker
        const markerX = screenCenterX + (lngToX(currentLng, zoom) - mapCenterPixelX);
        const markerY = screenCenterY + (latToY(currentLat, zoom) - mapCenterPixelY);
        
        const isAirplane = checkIsAirplane(pt, nextPt);
        const effectiveType = isAirplane ? 'FLYING' : pt.type;
        const emoji = ACTIVITY_EMOJIS[effectiveType] || '📍';

        ctx.save();
        ctx.translate(markerX, markerY);
        if (isAirplane) {
          let bearing = 0;
          if (nextPt) {
            bearing = calculateBearing(currentLat, currentLng, nextPt.lat, nextPt.lng);
          } else if (index > 0) {
            bearing = calculateBearing(activePoints[index - 1].lat, activePoints[index - 1].lng, currentLat, currentLng);
          }
          ctx.rotate(((bearing - 45) * Math.PI) / 180);
          ctx.font = '36px sans-serif';
        } else {
          ctx.font = '28px sans-serif';
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 0, 0);
        ctx.restore();

        // Overlay time text with date and mode
        const pointInfo = getPlaybackPointInfo(pt, nextPt, remainder, tripSummary, selectedDayFilter);
        const overlayText = pointInfo.fullText;
        if (overlayText && overlayText.trim()) {
          ctx.font = 'bold 15px sans-serif';
          const textMetrics = ctx.measureText(overlayText);
          const boxWidth = Math.max(180, textMetrics.width + 24);

          ctx.fillStyle = 'rgba(24, 24, 27, 0.85)';
          ctx.fillRect(10, 10, boxWidth, 38);
          ctx.strokeStyle = 'rgba(63, 63, 70, 0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(10, 10, boxWidth, 38);

          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(overlayText, 20, 29);
        }

        // Record frames
        const dataUrl = canvas.toDataURL('image/png');
        frames.push(dataUrl);
        setExportFrameImg(dataUrl);
        setExportProgress((frameIdx + 1) / totalFrames * 0.7);
        
        await new Promise(r => setTimeout(r, 5));
      }

      const baseFileName = selectedDayFilter !== 'ALL'
        ? `timeline-${selectedDayFilter}`
        : (tripSummary?.startDate && tripSummary?.endDate
            ? `timeline-${tripSummary.startDate}_to_${tripSummary.endDate}`
            : 'timeline-export');

      // Process file export
      if (exportFormat === 'gif') {
        const downloadFileName = `${baseFileName}.gif`;
        await new Promise((resolve, reject) => {
          gifshot.createGIF({
            images: frames,
            gifWidth: width,
            gifHeight: height,
            interval: 1 / fps,
            numWorkers: 2
          }, (obj) => {
            try {
              if (!obj.error) {
                const link = document.createElement('a');
                link.download = downloadFileName;
                link.href = obj.image;
                link.click();
                resolve();
              } else {
                reject(new Error(obj.errorMsg || 'GIF 생성 도중 에러가 발생했습니다.'));
              }
            } catch (err) {
              reject(err);
            }
          });
        });
      } else {
        let mimeType = 'video/webm';
        let extension = 'webm';

        if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
          if (MediaRecorder.isTypeSupported('video/mp4')) {
            mimeType = 'video/mp4';
            extension = 'mp4';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            mimeType = 'video/webm;codecs=vp9';
            extension = 'webm';
          } else if (MediaRecorder.isTypeSupported('video/webm')) {
            mimeType = 'video/webm';
            extension = 'webm';
          }
        }

        const downloadFileName = `${baseFileName}.${extension}`;

        await new Promise((resolve, reject) => {
          try {
            const recordedChunks = [];
            const stream = canvas.captureStream(fps);
            const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

            mediaRecorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
              }
            };

            mediaRecorder.onerror = (e) => {
              reject(e.error || new Error('MediaRecorder recording error'));
            };

            mediaRecorder.onstop = () => {
              try {
                const blob = new Blob(recordedChunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = downloadFileName;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
                resolve();
              } catch (err) {
                reject(err);
              }
            };

            mediaRecorder.start();

            const playCanvasStream = async () => {
              try {
                const tempImg = new Image();
                for (let i = 0; i < frames.length; i++) {
                  await new Promise((resolveImg, rejectImg) => {
                    tempImg.src = frames[i];
                    tempImg.onload = () => {
                      ctx.drawImage(tempImg, 0, 0);
                      setExportProgress(0.7 + (i / frames.length) * 0.3);
                      resolveImg();
                    };
                    tempImg.onerror = rejectImg;
                  });
                  await new Promise(r => setTimeout(r, 1000 / fps));
                }
                mediaRecorder.stop();
              } catch (err) {
                if (mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                reject(err);
              }
            };

            playCanvasStream();
          } catch (err) {
            reject(err);
          }
        });
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('내보내기 중 오류가 발생했습니다: ' + (err?.message || err));
    } finally {
      setIsExporting(false);
    }
  };

  const currentPointData = useMemo(() => {
    if (activePoints.length === 0) {
      return {
        dayNum: 1,
        mmDd: '--.--',
        dayBadge: 'Day 1 · --.--',
        dateStr: '--.--',
        timeStr: '--:--',
        emoji: '📍',
        label: '대기',
        effectiveType: 'STILL',
        fullText: 'Day 1 · --.-- · 📍 대기'
      };
    }
    const totalIdx = (activePoints.length - 1) * progress;
    const idx = Math.min(Math.floor(totalIdx), activePoints.length - 1);
    const remainder = totalIdx - idx;
    const pt = activePoints[idx];
    const nextPt = idx < activePoints.length - 1 ? activePoints[idx + 1] : null;

    return getPlaybackPointInfo(pt, nextPt, remainder, tripSummary, selectedDayFilter);
  }, [activePoints, progress, tripSummary, selectedDayFilter]);

  const currentFilterDistanceMeters = useMemo(() => {
    if (selectedDayFilter === 'ALL') {
      return tripSummary?.totalDistanceMeters || 0;
    }
    let dist = 0;
    for (const act of activeActivities) {
      if (act.path && Array.isArray(act.path) && act.path.length >= 2) {
        for (let i = 0; i < act.path.length - 1; i++) {
          const p1 = act.path[i];
          const p2 = act.path[i + 1];
          if (p1 && p2 && p1.lat != null && p1.lng != null && p2.lat != null && p2.lng != null) {
            dist += getHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
          }
        }
      }
    }
    return dist;
  }, [tripSummary, selectedDayFilter, activeActivities]);

  const currentFilterModes = useMemo(() => {
    if (selectedDayFilter === 'ALL') {
      return tripSummary?.usedModes || [];
    }
    return [...new Set(activeActivities.map(a => a.type).filter(Boolean))];
  }, [tripSummary, selectedDayFilter, activeActivities]);

  return (
    <div className="timeline-container">
      <aside className="timeline-sidebar">
        <h2>🗺️ 타임라인 시각화</h2>
        
        <div className="glass-input-card">
          <h3>파일 업로드</h3>
          <label style={{ display: 'flex', gap: '0.5rem', cursor: 'pointer', background: '#3f3f46', padding: '0.6rem', borderRadius: '8px', justifyContent: 'center', fontWeight: 'bold' }}>
            <Upload size={18} />
            Google JSON 파일 선택
            <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
          {uploadedFileName && (
            <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--accent-teal, #2dd4bf)', wordBreak: 'break-all' }}>
              📄 <strong>선택된 파일:</strong> {uploadedFileName}
            </div>
          )}
        </div>

        {tripSummary && (
          <div className="glass-input-card trip-filter-card">
            <h3>일정 선택</h3>
            <select
              value={selectedDayFilter}
              onChange={handleDayFilterChange}
              className="timeline-select day-filter-select"
              aria-label="일정 선택"
            >
              <option value="ALL">
                🌟 전체 일정 요약 ({tripSummary.totalDays}일간)
              </option>
              {tripSummary.dateList && tripSummary.dateList.map((d, idx) => (
                <option key={d} value={d}>
                  Day {idx + 1} ({d.slice(5).replace('-', '.')})
                </option>
              ))}
            </select>
          </div>
        )}

        {tripSummary && (
          <div className="glass-input-card trip-summary-card">
            <h3>{selectedDayFilter === 'ALL' ? '전체 여행 일정 요약' : `Day ${tripSummary.dateList ? tripSummary.dateList.indexOf(selectedDayFilter) + 1 : 1} 일정 요약`}</h3>
            <div className="summary-field">
              <span className="summary-title">🗓️ {selectedDayFilter === 'ALL' ? '여행 기간:' : '선택 날짜:'}</span>
              <span className="summary-content">
                {selectedDayFilter === 'ALL'
                  ? `${tripSummary.startDate} ~ ${tripSummary.endDate} (총 ${tripSummary.totalDays}일간)`
                  : `${selectedDayFilter} (Day ${tripSummary.dateList ? tripSummary.dateList.indexOf(selectedDayFilter) + 1 : 1})`}
              </span>
            </div>
            <div className="summary-field">
              <span className="summary-title">📏 이동 거리:</span>
              <span className="summary-content">
                {(currentFilterDistanceMeters / 1000).toFixed(1)} km
              </span>
            </div>
            <div className="summary-field">
              <span className="summary-title">🚗 이용된 이동 수단:</span>
              <div className="mode-badges-container">
                {currentFilterModes.map(mode => (
                  <span
                    key={mode}
                    className="mode-badge"
                    style={{
                      borderColor: ACTIVITY_COLORS[mode] || '#3f3f46'
                    }}
                  >
                    <span>{ACTIVITY_EMOJIS[mode] || '📍'}</span>
                    <span>{ACTIVITY_LABELS[mode] || mode}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {activePoints.length > 0 && (
          <div className="glass-input-card">
            <h3>비디오 내보내기 설정</h3>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>출력 형식</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="timeline-select export-format-select"
            >
              <option value="gif">GIF 이미지</option>
              <option value="mp4">
                {typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/mp4')
                  ? 'MP4 동영상'
                  : '동영상 (WebM / MP4)'}
              </option>
            </select>

            <label style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>영상 재생 길이</label>
            <select
              value={exportDuration}
              onChange={(e) => setExportDuration(Number(e.target.value))}
              className="timeline-select export-duration-select"
            >
              <option value={30}>30초</option>
              <option value={60}>60초 (기본값)</option>
              <option value={90}>90초</option>
              <option value={120}>120초 (2분)</option>
            </select>

            <button onClick={runExport} className="timeline-btn-primary" style={{ marginTop: '0.75rem' }}>
              <Download size={18} />
              애니메이션 다운로드
            </button>
          </div>
        )}
      </aside>

      <main className="timeline-map-area">
        <div ref={mapRef} className="map-canvas-container"></div>

        {!isItineraryOpen && (
          <button
            type="button"
            className="itinerary-expand-floating-btn"
            onClick={toggleItinerary}
            title="일정표 펼치기"
            aria-label="일정표 펼치기"
          >
            <PanelRightOpen size={18} />
            <span>일정표 보기</span>
          </button>
        )}

        {activePoints.length === 0 && (
          <div className="map-empty-overlay">
            <div className="map-empty-card">
              <span style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🗺️</span>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#f8fafc' }}>구글 타임라인 JSON 파일을 등록해 주세요</h3>
              <p style={{ margin: '0 0 1rem 0', color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.5' }}>
                좌측 패널의 <strong>[Google JSON 파일 선택]</strong>을 눌러 위치 기록 파일을 업로드하시면<br />
                전체 여행 기간의 이동 경로와 비행기, 자동차, 걷기 등의 시각화 애니메이션이 표시됩니다.
              </p>
              <div className="supported-formats-box">
                <span className="format-tag">✓ 모바일 Google Maps 내보내기 (Timeline.json)</span>
                <span className="format-tag">✓ Google Takeout 월별 기록 (*.json)</span>
                <span className="format-tag">✓ Google Takeout 원시 기록 (Records.json)</span>
              </div>
            </div>
          </div>
        )}

        {activePoints.length > 0 && (
          <div className="playback-control-bar">
            <div className="playback-row">
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    if (progress >= 1) setProgress(0);
                    setIsPlaying(!isPlaying);
                  }}
                  className={`timeline-play-btn ${isPlaying ? 'playing' : 'paused'}`}
                  title={isPlaying ? '일시정지' : '재생하기'}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  <span>{isPlaying ? '일시정지' : '재생하기'}</span>
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setProgress(0);
                  }}
                  className="timeline-rewind-btn"
                  title="처음으로 되감기"
                >
                  <RotateCcw size={18} />
                </button>
                {activePoints.length > 0 && (
                  <div className="current-playback-indicator fixed-width-display">
                    <span className="indicator-day-badge indicator-date">{currentPointData.dayBadge}</span>
                    <span className="indicator-sep">·</span>
                    <span className="indicator-mode">{currentPointData.emoji} {currentPointData.label}</span>
                    <span className="indicator-time" style={{ display: 'none' }}>{currentPointData.timeStr}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button onClick={() => setCameraMode(cameraMode === 'fit' ? 'follow' : 'fit')} style={{ background: cameraMode === 'follow' ? '#10b981' : '#3f3f46', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: 'white', fontWeight: 'bold', transition: 'background-color 0.2s' }}>
                  <Eye size={18} />
                  {cameraMode === 'follow' ? '카메라 추적 온' : '전체 보기'}
                </button>
                
                <select
                  value={speedMultiplier}
                  onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
                  className="timeline-select playback-speed-select"
                  aria-label="재생 속도"
                >
                  <option value={0.05}>0.05x (초슬로우 · 20배 느리게)</option>
                  <option value={0.1}>0.1x (극슬로우 · 10배 느리게)</option>
                  <option value={0.25}>0.25x (매우 느리게)</option>
                  <option value={0.5}>0.5x (느리게)</option>
                  <option value={1}>1x (보통 · 기본값)</option>
                  <option value={2}>2x (빠르게)</option>
                  <option value={4}>4x (매우 빠르게)</option>
                </select>

                <button
                  type="button"
                  onClick={toggleItinerary}
                  className={`timeline-btn-toggle-itinerary ${isItineraryOpen ? 'active' : ''}`}
                  title={isItineraryOpen ? '일정표 접기' : '일정표 보기'}
                >
                  <Calendar size={18} />
                  <span>{isItineraryOpen ? '일정표 접기' : '일정표'}</span>
                </button>
              </div>
            </div>

            <input 
              type="range" 
              min={0} 
              max={1} 
              step={0.001} 
              value={progress} 
              onChange={(e) => setProgress(Number(e.target.value))}
              style={{ width: '100%', marginTop: '0.5rem', cursor: 'pointer' }}
            />
          </div>
        )}

        {isExporting && (
          <div className="export-progress-overlay">
            <div style={{ width: '200px', height: '150px', border: '2px solid #3f3f46', borderRadius: '12px', background: '#18181b', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              {exportFrameImg ? <img src={exportFrameImg} alt="export-preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : '화면 준비중'}
            </div>
            <h3 style={{ margin: 0 }}>이동 애니메이션 내보내는 중...</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{Math.round(exportProgress * 100)}% 완료</p>
            <div style={{ width: '300px', height: '8px', background: '#27272a', borderRadius: '4px', overflow: 'hidden', border: '1px solid #3f3f46' }}>
              <div style={{ width: `${exportProgress * 100}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #3b82f6)' }}></div>
            </div>
          </div>
        )}
      </main>

      {isItineraryOpen && (
        <aside className="timeline-itinerary-panel" data-testid="timeline-itinerary-panel">
          <div className="itinerary-panel-header">
            <div className="itinerary-title-box">
              <h3>🗓️ 여행 여정 일정표</h3>
              {tripSummary?.itineraryList?.length > 0 && (
                <span className="itinerary-count-badge">총 {tripSummary.itineraryList.length}일</span>
              )}
            </div>
            <button
              type="button"
              className="itinerary-toggle-btn"
              onClick={toggleItinerary}
              title="일정표 접기"
              aria-label="일정표 접기"
            >
              <PanelRightClose size={18} />
            </button>
          </div>

          {tripSummary && (
            <div className="itinerary-all-btn-wrapper">
              <button
                type="button"
                className={`itinerary-all-btn ${selectedDayFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDayFilter('ALL');
                  setProgress(0);
                  setIsPlaying(false);
                }}
              >
                🌟 전체 일정 보기 ({tripSummary.totalDays}일간)
              </button>
            </div>
          )}

          <div className="itinerary-cards-container">
            {tripSummary?.itineraryList && tripSummary.itineraryList.length > 0 ? (
              tripSummary.itineraryList.map((item) => {
                const isSelected = selectedDayFilter === item.dateStr;
                const isCurrentDay = currentPointData?.date === item.dateStr || currentPointData?.dateKey === item.dateStr;
                const cardClasses = [
                  'itinerary-card',
                  isSelected ? 'selected' : '',
                  isCurrentDay ? 'active-playing-card' : ''
                ].filter(Boolean).join(' ');

                return (
                  <div
                    key={item.dateStr}
                    className={cardClasses}
                    onClick={() => handleCardClick(item.dateStr)}
                    role="button"
                    tabIndex={0}
                    data-testid={`itinerary-card-${item.dayNum}`}
                  >
                    <div className="itinerary-card-header">
                      <span className="itinerary-day-badge">Day {item.dayNum}</span>
                      <span className="itinerary-card-date">{item.displayDate}</span>
                    </div>
                    <div className="itinerary-card-places">
                      <span className="places-pin">📍</span>
                      <span className="places-text">{item.placesSummary}</span>
                    </div>
                    <div className="itinerary-card-footer">
                      <span className="itinerary-distance">📏 {item.distanceKm} km</span>
                      <div className="itinerary-modes">
                        {item.modes && item.modes.map((mode, mIdx) => (
                          <span key={mIdx} className="itinerary-mode-tag">
                            {mode}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="itinerary-empty-guide">
                <Calendar size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                <p>타임라인 JSON 파일을 등록하시면<br />일자별 상세 여정이 여기에 표시됩니다.</p>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
