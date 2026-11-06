import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { Play, Pause, RotateCcw, Download, Upload, Eye } from 'lucide-react';
import { parseTimelineJson, getFullPeriodSummary } from '../services/timelineParser';
import './TimelineVisualizer.css';
import gifshot from 'gifshot';

const ACTIVITY_COLORS = {
  WALKING: '#10b981',      // Emerald Green
  VEHICLE: '#3b82f6',      // Blue
  MOTORCYCLING: '#f97316', // Orange
  FLYING: '#8b5cf6',       // Purple
  CYCLING: '#06b6d4',      // Cyan
  STILL: '#6b7280'         // Gray
};

const ACTIVITY_EMOJIS = {
  WALKING: '🚶',
  VEHICLE: '🚗',
  MOTORCYCLING: '🏍️',
  FLYING: '✈️',
  CYCLING: '🚲',
  STILL: '📍'
};

const ACTIVITY_LABELS = {
  WALKING: '걷기',
  VEHICLE: '자동차',
  MOTORCYCLING: '오토바이',
  FLYING: '비행기',
  CYCLING: '자전거',
  STILL: '정지'
};

function formatMarkerTooltip(timestamp, type) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const emoji = ACTIVITY_EMOJIS[type] || '📍';
  const label = ACTIVITY_LABELS[type] || type || '이동';
  return `${mm}.${dd} ${hh}:${min} · ${emoji} ${label}`;
}

export default function TimelineVisualizer() {
  const [timelineData, setTimelineData] = useState(null);
  const [tripSummary, setTripSummary] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [speedMultiplier, setSpeedMultiplier] = useState(5);
  const [cameraMode, setCameraMode] = useState('fit'); // 'fit' or 'follow'
  
  // Export Settings
  const [exportFormat, setExportFormat] = useState('gif'); // 'gif' or 'mp4'
  const [exportDuration, setExportDuration] = useState(15); // 15, 30, 45, 60
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportFrameImg, setExportFrameImg] = useState('');

  const mapRef = useRef(null);
  const leafletMapInstance = useRef(null);
  const markerRef = useRef(null);
  const polylineGroupRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(null);

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

  const activePoints = tripSummary ? tripSummary.allPoints : [];

  // Draw full-period paths onto polylineGroupRef when tripSummary changes
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

    if (!tripSummary || !tripSummary.allActivities || tripSummary.allActivities.length === 0) {
      setProgress(0);
      setIsPlaying(false);
      return;
    }

    // Draw all paths colored by activity type
    tripSummary.allActivities.forEach(act => {
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
      leafletMapInstance.current.fitBounds(bounds, { padding: [50, 50] });
    }

    setProgress(0);
    setIsPlaying(false);
  }, [tripSummary]);

  // Animate marker in real-time
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
        const next = prev + (delta / 1000 * speedMultiplier) / 100; // custom speed scale
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
    const index = Math.floor(totalIndex);
    const remainder = totalIndex - index;

    let currentLat = activePoints[index].lat;
    let currentLng = activePoints[index].lng;
    let currentType = activePoints[index].type;
    let currentTime = activePoints[index].time;

    if (remainder > 0 && index < activePoints.length - 1) {
      const nextPt = activePoints[index + 1];
      currentLat = currentLat + (nextPt.lat - currentLat) * remainder;
      currentLng = currentLng + (nextPt.lng - currentLng) * remainder;
      if (nextPt.time != null && currentTime != null) {
        currentTime = currentTime + (nextPt.time - currentTime) * remainder;
      }
    }

    // Update marker or create if missing
    const emoji = ACTIVITY_EMOJIS[currentType] || '📍';
    const customIcon = L.divIcon({
      html: `<div style="font-size: 24px; transform: translate(-10px, -20px); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${emoji}</div>`,
      className: 'custom-emoji-icon'
    });

    const tooltipContent = formatMarkerTooltip(currentTime, currentType);
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
  }, [progress, cameraMode, activePoints]);

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
          img.crossOrigin = 'anonymous'; // CRITICAL: Avoid canvas tainting
          img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null); // Continue even if tile fails
        });
      };

      // Helper: Pre-load all tiles for the trip bounding box
      const tileCache = {};
      const centerTileX = Math.floor(lngToX(centerLng, zoom) / 256);
      const centerTileY = Math.floor(latToY(centerLat, zoom) / 256);
      
      // We fetch a 5x5 grid around the center
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
        const index = Math.floor(totalIndex);
        const remainder = totalIndex - index;

        let currentLat = activePoints[index].lat;
        let currentLng = activePoints[index].lng;
        let currentType = activePoints[index].type;
        let currentTime = activePoints[index].time;

        if (remainder > 0 && index < activePoints.length - 1) {
          const nextPt = activePoints[index + 1];
          currentLat = currentLat + (nextPt.lat - currentLat) * remainder;
          currentLng = currentLng + (nextPt.lng - currentLng) * remainder;
          if (nextPt.time != null && currentTime != null) {
            currentTime = currentTime + (nextPt.time - currentTime) * remainder;
          }
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
          const pt = activePoints[j];
          const screenX = screenCenterX + (lngToX(pt.lng, zoom) - mapCenterPixelX);
          const screenY = screenCenterY + (latToY(pt.lat, zoom) - mapCenterPixelY);

          ctx.strokeStyle = ACTIVITY_COLORS[pt.type] || '#3b82f6';
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
          ctx.strokeStyle = ACTIVITY_COLORS[currentType] || '#3b82f6';
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
        const emoji = ACTIVITY_EMOJIS[currentType] || '📍';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, markerX, markerY);

        // Overlay time text with date and mode
        const overlayText = formatMarkerTooltip(currentTime, currentType);
        if (overlayText && overlayText.trim()) {
          ctx.font = 'bold 15px sans-serif';
          const textMetrics = ctx.measureText(overlayText);
          const boxWidth = Math.max(160, textMetrics.width + 24);

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
        setExportProgress((frameIdx + 1) / totalFrames * 0.7); // 70% progress for framing
        
        // Throttle rendering yield to keep browser UI alive
        await new Promise(r => setTimeout(r, 5));
      }

      const baseFileName = tripSummary?.startDate && tripSummary?.endDate
        ? `timeline-${tripSummary.startDate}_to_${tripSummary.endDate}`
        : 'timeline-export';

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
        // Detect native MP4 support or fallback to WebM
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

            // Feed frames to stream again
            const playCanvasStream = async () => {
              try {
                const tempImg = new Image();
                for (let i = 0; i < frames.length; i++) {
                  await new Promise((resolveImg, rejectImg) => {
                    tempImg.src = frames[i];
                    tempImg.onload = () => {
                      ctx.drawImage(tempImg, 0, 0);
                      setExportProgress(0.7 + (i / frames.length) * 0.3); // 70-100% progress
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
            <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--accent-teal, #10b981)', wordBreak: 'break-all' }}>
              📄 <strong>선택된 파일:</strong> {uploadedFileName}
            </div>
          )}
        </div>

        {tripSummary && (
          <div className="glass-input-card trip-summary-card">
            <h3>전체 여행 일정 요약</h3>
            <div className="summary-field">
              <span className="summary-title">🗓️ 여행 기간:</span>
              <span className="summary-content">
                {tripSummary.startDate} ~ {tripSummary.endDate} (총 {tripSummary.totalDays}일간)
              </span>
            </div>
            <div className="summary-field">
              <span className="summary-title">📏 총 이동 거리:</span>
              <span className="summary-content">
                {(tripSummary.totalDistanceMeters / 1000).toFixed(1)} km
              </span>
            </div>
            <div className="summary-field">
              <span className="summary-title">🚗 이용된 이동 수단:</span>
              <div className="mode-badges-container">
                {tripSummary.usedModes.map(mode => (
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
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} className="timeline-select">
              <option value="gif">GIF 이미지</option>
              <option value="mp4">
                {typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/mp4')
                  ? 'MP4 동영상'
                  : '동영상 (WebM / MP4)'}
              </option>
            </select>

            <label style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>영상 재생 길이</label>
            <select value={exportDuration} onChange={(e) => setExportDuration(Number(e.target.value))} className="timeline-select">
              <option value={15}>15초</option>
              <option value={30}>30초</option>
              <option value={45}>45초</option>
              <option value={60}>60초</option>
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    if (progress >= 1) setProgress(0);
                    setIsPlaying(!isPlaying);
                  }}
                  style={{ background: '#3f3f46', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', transition: 'background-color 0.2s' }}
                  title={isPlaying ? '일시 정지' : '재생'}
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setProgress(0);
                  }}
                  style={{ background: '#3f3f46', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', transition: 'background-color 0.2s' }}
                  title="처음으로 되감기"
                >
                  <RotateCcw size={20} />
                </button>
                {activePoints.length > 0 && (
                  <div className="current-playback-indicator">
                    {(() => {
                      const totalIdx = (activePoints.length - 1) * progress;
                      const idx = Math.floor(totalIdx);
                      const pt = activePoints[idx];
                      return pt ? formatMarkerTooltip(pt.time, pt.type) : '';
                    })()}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button onClick={() => setCameraMode(cameraMode === 'fit' ? 'follow' : 'fit')} style={{ background: cameraMode === 'follow' ? '#10b981' : '#3f3f46', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: 'white', fontWeight: 'bold', transition: 'background-color 0.2s' }}>
                  <Eye size={18} />
                  {cameraMode === 'follow' ? '카메라 추적 온' : '전체 보기'}
                </button>
                
                <select value={speedMultiplier} onChange={(e) => setSpeedMultiplier(Number(e.target.value))} className="timeline-select">
                  <option value={1}>1x 속도</option>
                  <option value={5}>5x 속도</option>
                  <option value={10}>10x 속도</option>
                  <option value={20}>20x 속도</option>
                </select>
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
    </div>
  );
}
