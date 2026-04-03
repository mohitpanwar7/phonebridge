# PhoneBridge — Complete Feature List

All 65+ features implemented across 17 phases.

---

## Phase 1 — Foundation

| # | Feature | Status |
|---|---|---|
| 1 | Permissions onboarding (Camera, Mic, Location, Activity Recognition) | Done |
| 2 | Settings propagation from mobile UI to active stream | Done |
| 3 | Mic source switching (built-in, wired, Bluetooth) | Done |
| 4 | Three additional sensors: gravity, rotation, proximity | Done |
| 5 | Dark-themed onboarding screen with rationale text | Done |
| 11 | Settings persistence (AsyncStorage on mobile, localStorage on desktop) | Done |
| 20 | Resolution/FPS/codec settings applied live | Done |

---

## Phase 2 — Virtual Drivers

| # | Feature | Status |
|---|---|---|
| 14 | Virtual webcam via Softcam DirectShow filter | Done |
| 15 | Virtual microphone via VB-Cable + naudiodon PortAudio | Done |
| 21 | Driver status detection + install prompts | Done |

**Requirements:**
- Install [Softcam](https://github.com/tshino/softcam) DirectShow filter
- Install [VB-Cable](https://vb-audio.com/Cable/) virtual audio device

---

## Phase 3 — Camera & Mic Controls

| # | Feature | Status |
|---|---|---|
| 6 | Floating controls bar on StreamScreen (camera, mic, torch, zoom) | Done |
| 19 | Desktop→phone camera switching by device ID | Done |
| 26 | Torch toggle (phone flashlight on/off) | Done |
| 29 | Zoom slider (phone camera optical/digital zoom) | Done |

---

## Phase 4 — Connection Reliability

| # | Feature | Status |
|---|---|---|
| 8 | Adaptive bitrate (reduce on packet loss, increase on good signal) | Done |
| 9 | Pull-to-refresh on HomeScreen discovery list | Done |
| 10 | Haptic feedback on connect, camera flip, disconnect | Done |
| 12 | Custom app icon for all mipmap densities | Done |
| 13 | Exponential backoff reconnect (1s→30s with jitter) | Done |
| 38 | WebRTC peer connection restart on reconnect | Done |
| 39 | Signal strength bars (1–4) based on RTT + packet loss | Done |

---

## Phase 5 — Desktop UI

| # | Feature | Status |
|---|---|---|
| 7 | Stats overlay: FPS, bitrate, latency, resolution | Done |
| 22 | System tray icon with context menu | Done |
| 23 | Sensor sparkline graphs (last 30s, canvas 2D) | Done |
| 25 | NSIS installer (`PhoneBridge-Setup-0.1.0.exe`) | Done |
| 40 | VU meter (AudioContext analyser node) | Done |
| 60 | Minimize to tray on window close | Done |

---

## Phase 6 — Advanced Camera

| # | Feature | Status |
|---|---|---|
| 27 | Tap-to-focus (desktop click → normalized coords → phone) | Done |
| 28 | Manual exposure + white balance sliders | Done |
| 30 | Multi-camera simultaneous (front + back) | Done |
| 31 | Photo capture (full-res via VisionCamera takePhoto) | Done |
| 32 | Lens correction (barrel/pincushion WebGL shader) | Done |
| 33 | Night mode (VisionCamera lowLightBoost) | Done |
| 34 | Rule-of-thirds grid overlay | Done |
| 35 | Orientation lock (landscape/portrait) | Done |

---

## Phase 7 — Audio Pipeline

| # | Feature | Status |
|---|---|---|
| 16 | PC audio → phone (WASAPI loopback via desktopCapturer) | Done |
| 41 | Gain control (GainNode, 0–3× slider) | Done |
| 42 | Noise gate (AudioWorklet, configurable dB threshold) | Done |

---

## Phase 8 — Video Effects

| # | Feature | Status |
|---|---|---|
| 47 | Background blur / virtual background (MediaPipe segmentation) | Done |
| 48 | Color filters: brightness, contrast, saturation, presets | Done |
| 49 | Crop / region-of-interest selection | Done |
| 50 | Virtual PTZ (pan/tilt/zoom within 4K stream) | Done |
| 51 | Face tracking auto-crop (TF.js + EMA smoothing) | Done |
| 52 | Multiple virtual webcam outputs | Done |
| 53 | Recording (MediaRecorder → MP4 file) | Done |
| 54 | Snapshot (canvas frame → PNG download) | Done |

---

## Phase 9 — Sensor Dashboard & Export

| # | Feature | Status |
|---|---|---|
| 55 | Enhanced graphs (time range, tooltips, min/max/avg) | Done |
| 56 | Export to CSV or JSON per sensor or all sensors | Done |
| 57 | Alert rules (threshold → desktop notification / webhook) | Done |
| 58 | Drag-and-drop sensor widget layout (react-grid-layout) | Done |
| 59 | Webhook relay — POST sensor data to Home Assistant, IFTTT, etc. | Done |

---

## Phase 10 — Power & Performance

| # | Feature | Status |
|---|---|---|
| 43 | Smart battery mode (auto-reduce quality below 20% / 10%) | Done |
| 44 | Thermal throttling (serious→720p, critical→480p) | Done |
| 45 | Screen-off streaming (Android foreground service) | Done |
| 46 | Android home screen widget (connect/disconnect + status) | Done |

---

## Phase 11 — System Integration

| # | Feature | Status |
|---|---|---|
| 61 | Global keyboard shortcuts (Ctrl+Shift+1/2/3/M/S/T) | Done |
| 62 | OBS/StreamDeck WebSocket API on port 8422 | Done |
| 63 | Start on login (`app.setLoginItemSettings`) | Done |
| 64 | Auto-update checker (electron-updater) | Done |
| 65 | Firewall auto-config (`netsh advfirewall` on first run) | Done |

---

## Phase 12 — Advanced Connectivity

| # | Feature | Status |
|---|---|---|
| 17 | Named pipe server (`\\.\pipe\phonebridge-sensors`) for Unity/Unreal | Done |
| 18 | Shared memory N-API addon | Skipped (lowest priority) |
| 24 | Multi-phone support | Skipped |
| 36 | USB tethering via ADB reverse | Skipped |
| 37 | WiFi Direct | Skipped |

---

## Phase 13 — NFC

| Feature | Status |
|---|---|
| NFC tag scanning (NDEF, MIFARE Classic, NfcA, IsoDep) | Done |
| Full tag data read (UID, technologies, NDEF records, MIFARE sector dump) | Done |
| Save tags with user label and notes | Done |
| Write NDEF records to blank tags | Done |
| Raw MIFARE block write | Done |
| HCE replay (Android Host Card Emulation) | Done |
| Desktop NFC tab — live scan view, saved tags, remote control | Done |
| Desktop → phone NFC commands (start scan, write, replay) | Done |
| REST endpoint: `GET /api/nfc/tags` | Done |

---

## Phase 14 — Security & Privacy

| # | Feature | Status |
|---|---|---|
| 67 | E2E encryption indicator (DTLS-SRTP green lock badge) | Done |
| 68 | Trusted device whitelist (AsyncStorage + file store) | Done |
| 69 | Privacy mode (video placeholder + muted audio, maintains WebRTC) | Done |
| 84 | Bluetooth fallback | Skipped |

---

## Phase 15 — Developer Tools

| # | Feature | Status |
|---|---|---|
| 71 | Computed virtual sensors (formula engine, e.g. `sqrt(ax²+ay²+az²)`) | Done |
| 72 | Sensor recording + replay at configurable speed (0.5×–4×) | Done |

---

## Phase 16 — UX Polish

| # | Feature | Status |
|---|---|---|
| 74 | Connection history (recent connections, one-tap reconnect) | Done |
| 75 | Multi-language i18n (react-i18next) | Skipped |
| 76 | Desktop onboarding tutorial overlay (3 steps) | Done |
| 77 | Notification center (bell icon, event log, severity colors) | Done |
| 78 | Dark / light theme toggle (CSS custom properties) | Done |

---

## Phase 17 — Screen Mirroring & Dual View

| # | Feature | Status |
|---|---|---|
| 81 | Phone screen mirroring (MediaProjection + MediaCodec H.264) | Done (encoding) |
| 82 | Dual-view mode (camera + screen in single virtual webcam output) | Done (compositor) |

> Note: WebRTC track injection for screen mirror requires react-native-webrtc custom video source. The MediaCodec encoder is complete; the WebRTC wiring is a future step.
