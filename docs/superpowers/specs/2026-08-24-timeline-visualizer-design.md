# Google Timeline Route Visualizer Design Spec

This document details the design and implementation specifications for the Google Timeline Route Visualizer. This feature enables users to upload their Google Takeout location history files, select a specific date, preview the movement animations interactively, and export the animation as a GIF or MP4/WebM video of a configurable duration (15s, 30s, 45s, 60s).

---

## 1. Technical Requirements & Architecture

### Libraries to Install
1. **`leaflet`**: Interactive mapping library for displaying path previews.
2. **`lucide-react`**: Vector icons for playback controls, file uploads, and settings.
3. **`gifshot`**: Client-side GIF generation library.

### File Structure
- `src/services/timelineParser.js` [NEW]: Parse Google Timeline JSON files (both monthly Semantic JSON and raw Records.json) and normalize them into a uniform path format.
- `src/components/TimelineVisualizer.jsx` [NEW]: Main component containing map display, playback controls, and export configurations.
- `src/components/TimelineVisualizer.css` [NEW]: Premium styles for the visualizer dashboard.
- `src/App.jsx` [MODIFY]: Add navigation tabs to toggle between the existing "Travel Settlement" (여행 정산) and the new "Timeline Visualizer" (경로 시각화).
- `index.html` [MODIFY]: Include Leaflet CSS from CDN for styling stability, or import it locally.

---

## 2. Core Modules & Detailed Design

### A. Timeline Parser (`timelineParser.js`)
Normalizes location data into a uniform structure:
```javascript
{
  date: "YYYY-MM-DD",
  activities: [
    {
      type: "WALKING" | "VEHICLE" | "FLYING" | "MOTORCYCLING" | "CYCLING" | "STILL",
      label: "걷기" | "자동차" | "비행기" | "오토바이" | "자전거" | "정류지",
      startTime: number, // timestamp ms
      endTime: number,
      path: [{ lat, lng, time }]
    }
  ]
}
```

#### Parsing Strategies:
1. **Semantic monthly files (e.g. `2024_JANUARY.json`)**:
   - Extract `timelineObjects`.
   - For `activitySegment`, parse `activityType` and extract path from `waypointPath.waypoints` or `simplifiedRawPath.points`. Map types: `FLYING` -> 비행기, `MOTORCYCLING` -> 오토바이, `WALKING`/`ON_FOOT` -> 걷기, `IN_PASSENGER_VEHICLE`/`DRIVING` -> 자동차, `CYCLING` -> 자전거.
   - For `placeVisit`, treat as `STILL` at the given latitude/longitude.
2. **Raw Records files (`Records.json`)**:
   - Extract `locations`.
   - Sort by timestamp. Group points by calendar date.
   - Calculate speed between consecutive points using the Haversine formula:
     $$\text{Speed } v = \frac{\Delta \text{distance}}{\Delta \text{time}}$$
   - Classify movement:
     - \(v < 2 \text{ m/s}\): 걷기 (WALKING)
     - \(2 \le v < 8 \text{ m/s}\): 자전거 (CYCLING)
     - \(8 \le v < 50 \text{ m/s}\): 자동차 (VEHICLE)
     - \(v \ge 50 \text{ m/s}\): 비행기 (FLYING)
   - Group consecutive points of the same category into single activity segments.

---

### B. Interactive Map View (`TimelineVisualizer.jsx`)
- Render map container using `Leaflet`.
- Draw polyline segments representing the user's path, colored dynamically by activity type:
  - 🚶 Walking: Green
  - 🚗 Vehicle: Blue
  - 🏍️ Motorcycle: Orange
  - ✈️ Flying: Purple
  - 🚲 Cycling: Light Blue
- Display custom markers representing start, end, and visiting places.
- **Playback Preview**: Animate a moving marker (icon matching current activity) along the paths:
  - Playback controls: Play, Pause, Speed multiplier (1x, 2x, 5x, 10x, 20x).
  - Time scrubbing: Slider representing 0% to 100% of the active day's duration.
  - Hover tooltips showing timestamp and speed.

---

### C. Canvas Animation & Export Pipeline
For exporting as GIF or Video:
1. **Frame Setup**:
   - Total export duration: $T \in \{15, 30, 45, 60\}$ seconds.
   - Frame rate: 10 fps (for GIF, total $10T$ frames) or 20 fps (for MP4/WebM, total $20T$ frames).
   - Canvas resolution: 800 x 600.
2. **Dynamic Tile Fetching (CORS-Compliant)**:
   - Calculate bounding box of path points or center around the current marker position.
   - Fetch OSM map tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) with `crossOrigin = "anonymous"`.
   - Draw tiles onto Canvas.
3. **Canvas Drawing Logic**:
   - Draw map tiles.
   - Draw historical path up to current time (polylines with custom colors).
   - Draw current position marker using emoji/icons (e.g. ✈️ for flying, 🚗 for driving).
   - Render a timestamp overlay (e.g. "오전 10:24").
4. **Encoding & Save**:
   - For **GIF**: Collect all canvas frames (`imageData`), send to `gifshot` to compile, and prompt user to download.
   - For **MP4/WebM**: Capture stream using `canvas.captureStream()`, record using `MediaRecorder`, compile chunks, and download.
   - Show a modal overlay showing progress (e.g. "Generating frame 120 / 300...").

---

## 3. User Interface Layout
- **Visual styling**: Glassmorphism dashboard matching the dark/high-premium aesthetic of the existing settlement application.
- **Responsive design**: Side-by-side configuration sidebar and map layout for desktop; stacked view for mobile.

---

## 4. Verification Plan

### Automated Tests
- Test parsing functions under `src/services/timelineParser.test.js` to ensure proper identification of semantic files and raw files, correct speed calculations, and appropriate default output formatting.

### Manual Verification
- Upload sample Google Takeout Semantic JSON. Verify date listings load.
- Select a date. Check that path layers display correctly on Leaflet.
- Run preview animation. Verify marker updates icon based on current activity.
- Export a 15-second GIF and a 15-second WebM. Verify file downloads and plays correctly with map backgrounds and matching routes.
