import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { Play, Pause, RotateCcw, Download, Upload, MapPin, Eye } from 'lucide-react';
import { parseTimelineJson } from '../services/timelineParser';
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

export default function TimelineVisualizer() {
  const [timelineData, setTimelineData] = useState(null);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
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

  // Timeline statistics
  const [selectedDayStats, setSelectedDayStats] = useState({ distance: 0, modes: [] });

  // Handle File upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const parsed = parseTimelineJson(json);
        setTimelineData(parsed);
        const sortedDates = Object.keys(parsed).sort();
        setDates(sortedDates);
        if (sortedDates.length > 0) {
          setSelectedDate(sortedDates[0]);
        }
      } catch (err) {
        alert('JSON 파일 파싱에 실패했습니다. 올바른 구글 타임라인 파일인지 확인하세요.');
      }
    };
    reader.readAsText(file);
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current) return;

    const map = L.map(mapRef.current).setView([37.5665, 126.978], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    leafletMapInstance.current = map;
    polylineGroupRef.current = L.featureGroup().addTo(map);

    return () => {
      map.remove();
    };
  }, []);

  // Get flat points array for the active day
  const getActiveDayPoints = () => {
    if (!timelineData || !selectedDate || !timelineData[selectedDate]) return [];
    const activities = timelineData[selectedDate].activities;
    let allPoints = [];
    activities.forEach(act => {
      act.path.forEach(pt => {
        allPoints.push({
          lat: pt.lat,
          lng: pt.lng,
          time: pt.time,
          type: act.type,
          label: act.label
        });
      });
    });
    return allPoints.sort((a, b) => a.time - b.time);
  };

  const activePoints = getActiveDayPoints();

  // Map stats & Polylines Update when date changes
  useEffect(() => {
    if (!leafletMapInstance.current || activePoints.length === 0) return;

    // Clear previous paths
    polylineGroupRef.current.clearLayers();

    // Clear previous marker
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    // Draw paths colored by activity type
    const activities = timelineData[selectedDate].activities;
    const modesSet = new Set();
    activities.forEach(act => {
      modesSet.add(act.label);
      const polyLatLngs = act.path.map(p => [p.lat, p.lng]);
      L.polyline(polyLatLngs, {
        color: ACTIVITY_COLORS[act.type] || '#3b82f6',
        weight: 5,
        opacity: 0.85
      }).addTo(polylineGroupRef.current);
    });

    // Fit map boundary
    const bounds = polylineGroupRef.current.getBounds();
    if (bounds.isValid()) {
      leafletMapInstance.current.fitBounds(bounds, { padding: [50, 50] });
    }

    // Update statistics
    setSelectedDayStats({
      distance: activities.reduce((acc, act) => acc + (act.path.length > 1 ? 1 : 0), 0), // estimation placeholder
      modes: Array.from(modesSet)
    });

    setProgress(0);
    setIsPlaying(false);
  }, [selectedDate, timelineData]);

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

  // Update marker location based on progress slider/value
  useEffect(() => {
    if (activePoints.length === 0 || !leafletMapInstance.current) return;

    const totalIndex = (activePoints.length - 1) * progress;
    const index = Math.floor(totalIndex);
    const remainder = totalIndex - index;

    let currentLat = activePoints[index].lat;
    let currentLng = activePoints[index].lng;
    let currentType = activePoints[index].type;

    if (remainder > 0 && index < activePoints.length - 1) {
      const nextPt = activePoints[index + 1];
      currentLat = currentLat + (nextPt.lat - currentLat) * remainder;
      currentLng = currentLng + (nextPt.lng - currentLng) * remainder;
    }

    // Update marker or create if missing
    const emoji = ACTIVITY_EMOJIS[currentType] || '📍';
    const customIcon = L.divIcon({
      html: `<div style="font-size: 24px; transform: translate(-10px, -20px);">${emoji}</div>`,
      className: 'custom-emoji-icon'
    });

    if (!markerRef.current) {
      markerRef.current = L.marker([currentLat, currentLng], { icon: customIcon }).addTo(leafletMapInstance.current);
    } else {
      markerRef.current.setLatLng([currentLat, currentLng]);
      markerRef.current.setIcon(customIcon);
    }

    // Camera track
    if (cameraMode === 'follow') {
      leafletMapInstance.current.panTo([currentLat, currentLng]);
    }
  }, [progress, cameraMode]);

  // Canvas Frame Rendering and Encoder Pipeline
  const runExport = async () => {
    if (activePoints.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);

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

    // Helper: Pre-load all tiles for the day bounding box
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
        currentTime = currentTime + (nextPt.time - currentTime) * remainder;
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

      // Overlay time text
      const timeStr = new Date(currentTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = 'rgba(24, 24, 27, 0.85)';
      ctx.fillRect(10, 10, 140, 40);
      ctx.strokeStyle = 'rgba(63, 63, 70, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, 140, 40);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Outfit, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(timeStr, 25, 20);

      // Record frames
      const dataUrl = canvas.toDataURL('image/png');
      frames.push(dataUrl);
      setExportFrameImg(dataUrl);
      setExportProgress((frameIdx + 1) / totalFrames * 0.7); // 70% progress for framing
      
      // Throttle rendering yield to keep browser UI alive
      await new Promise(r => setTimeout(r, 5));
    }

    // Process file export
    if (exportFormat === 'gif') {
      gifshot.createGIF({
        images: frames,
        gifWidth: width,
        gifHeight: height,
        interval: 1 / fps,
        numWorkers: 2
      }, (obj) => {
        if (!obj.error) {
          const link = document.createElement('a');
          link.download = `timeline-${selectedDate}.gif`;
          link.href = obj.image;
          link.click();
        } else {
          alert('GIF 생성 도중 에러가 발생했습니다.');
        }
        setIsExporting(false);
      });
    } else {
      // Export as MP4/WebM using Canvas capture stream
      const recordedChunks = [];
      const stream = canvas.captureStream(fps);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `timeline-${selectedDate}.webm`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        setIsExporting(false);
      };

      mediaRecorder.start();

      // Feed frames to stream again
      const playCanvasStream = async () => {
        const tempImg = new Image();
        for (let i = 0; i < frames.length; i++) {
          await new Promise((resolve) => {
            tempImg.src = frames[i];
            tempImg.onload = () => {
              ctx.drawImage(tempImg, 0, 0);
              setExportProgress(0.7 + (i / frames.length) * 0.3); // 70-100% progress
              resolve();
            };
          });
          await new Promise(r => setTimeout(r, 1000 / fps));
        }
        mediaRecorder.stop();
      };
      
      playCanvasStream();
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
        </div>

        {dates.length > 0 && (
          <div className="glass-input-card">
            <h3>날짜 선택</h3>
            <select 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="timeline-select"
            >
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}

        {selectedDate && (
          <div className="glass-input-card">
            <h3>하루 요약</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>날짜: {selectedDate}</p>
            <p style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '0.9rem', fontWeight: '600' }}>이동 수단:</p>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {selectedDayStats.modes.map(m => (
                <span key={m} style={{ background: '#3f3f46', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '500' }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {activePoints.length > 0 && (
          <div className="glass-input-card">
            <h3>비디오 내보내기 설정</h3>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>출력 형식</label>
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} className="timeline-select">
              <option value="gif">GIF 이미지</option>
              <option value="mp4">MP4 동영상</option>
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

        {activePoints.length > 0 && (
          <div className="playback-control-bar">
            <div className="playback-row">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setIsPlaying(!isPlaying)} style={{ background: '#3f3f46', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', transition: 'background-color 0.2s' }}>
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button onClick={() => setProgress(0)} style={{ background: '#3f3f46', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', transition: 'background-color 0.2s' }}>
                  <RotateCcw size={20} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
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
