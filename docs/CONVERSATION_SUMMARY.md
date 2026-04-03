# PhoneBridge — Development Conversation Summary

This document summarizes the complete development history of PhoneBridge, built through a series of AI-assisted coding sessions.

---

## Project Goal

Build a full-featured app that turns an Android/iOS phone into a wireless hardware peripheral for a Windows PC over WiFi, covering:
- Wireless webcam (virtual DirectShow camera)
- Virtual microphone (VB-Cable)
- PC audio output to phone speaker
- Real-time sensor hub (11 sensors)
- NFC read/write/replay
- Screen mirroring
- Comprehensive desktop dashboard

---

## Session 1 — Initial Plan & Phases 1–8

### What Was Built

**Phase 1 — Foundation**
- `OnboardingScreen.tsx` — multi-step permission request (Camera, Mic, Location, Activity Recognition)
- `StreamContext.tsx` — React context for stream state
- `SettingsStorage.ts` — AsyncStorage wrapper for mobile settings
- Settings propagation: toggles in SettingsScreen now send live commands
- Mic switching fixed: `WebRTCManager.switchMicrophone()` following camera switch pattern
- Three missing sensors added: gravity (DeviceMotion), rotation (DeviceMotion), proximity
- Settings persistence on both desktop (localStorage) and mobile (AsyncStorage)

**Phase 2 — Virtual Drivers**
- `softcam_addon.cpp` — real Softcam DirectShow calls (scCreateCamera/scSendFrame/scDeleteCamera)
- `VirtualCamera.ts` — RGBA→BGR conversion for DIB format
- `SoftcamInstaller.ts` — registry check + regsvr32 elevation
- `VirtualMicrophone.ts` — naudiodon PortAudio stream to CABLE Input
- `AudioDecoder.ts` — AudioContext + AudioWorkletNode PCM extraction
- `VBCableDetector.ts` — enumerate audio devices, show install prompt

**Phase 3 — Camera Controls**
- Desktop camera switching by device ID fixed
- Floating controls bar on StreamScreen (animated show/hide on tap)
- Torch toggle + zoom slider with SetTorchCommand / SetZoomCommand in protocol.ts

**Phase 4 — Connection Reliability**
- Exponential backoff reconnect: `min(1000 * 2^attempt + rand(0,500), 30000)`
- `WebRTCManager.restart()` — fresh peer connection on reconnect
- Adaptive bitrate via `pc.getStats()` — adjusts encoding params on packet loss
- Signal strength bars (1–4) based on RTT + loss
- Pull-to-refresh on HomeScreen
- Haptic feedback (expo-haptics) on connect/flip/disconnect

**Phase 5 — Desktop UI**
- `TrayManager.ts` — system tray with context menu
- Stats overlay: FPS, bitrate, latency, resolution
- VU meter: AudioContext AnalyserNode canvas
- `SensorGraph.tsx` — Canvas 2D sparklines
- `electron-builder.yml` — NSIS installer config

**Phase 6 — Advanced Camera**
- Tap-to-focus: desktop click → normalized (x,y) → SetFocusCommand → VisionCamera
- Manual exposure + white balance sliders
- Multi-camera simultaneous (two video tracks)
- Photo capture: TakePhotoCommand → VisionCamera.takePhoto() → DataChannel
- Night mode (lowLightBoost), grid overlay, orientation lock

**Phase 7 — Audio Pipeline**
- PC audio → phone: desktopCapturer + second audio WebRTC track
- GainNode (0–3×) slider on desktop
- NoiseGateProcessor AudioWorklet (mute below dB threshold)

**Phase 8 — Video Effects**
- `VideoProcessor.ts` — effects chain orchestrator
- Background blur (MediaPipe selfie segmentation)
- Color filters (WebGL shaders: brightness, contrast, saturation, presets)
- Crop / ROI + virtual PTZ (keyboard/mouse pan within 4K stream)
- Face tracking auto-crop (TF.js + EMA smoothing)
- Recording (MediaRecorder → MP4) + Snapshot (canvas → PNG)

---

## Session 2 — Phases 9–17

### Phase 9 — Sensor Export & Alerts
- `SensorExporter.ts` — Electron save dialog → CSV or JSON
- `SensorAlerts.ts` — rule engine: `{ sensor, field, operator, threshold, action }`
- `WebhookRelay.ts` — HTTP POST sensor data to user-configured URLs
- Wired into `SignalingServer.ts` — every sensor update triggers check + relay
- IPC handlers + preload exposure
- Export buttons in Dashboard SensorsTab

**Bug fixed**: `SensorExporter.ts` used `entry.ts` but the interface uses `entry.timestamp`.

### Phase 10 — Power & Android Native
- Battery monitoring already in StreamScreen from Phase 4
- `StreamingService.java` — Android foreground service (type: camera|microphone)
  - `START_STICKY`, persistent notification with Stop button
  - Keeps camera/mic alive when screen is off
- `StreamingServiceModule.java` — ReactContextBaseJavaModule bridge
- `PhoneBridgeWidget.java` — AppWidgetProvider home screen widget
  - Connect/disconnect button, status indicator
  - `setConnected(ctx, connected, pcName)` static method
- Widget layout XML + AppWidgetProviderInfo XML
- AndroidManifest.xml updated with service + receiver declarations

### Phase 11 — System Integration
- `globalShortcut.register()` for Ctrl+Shift+1/2/3/M/S/T in index.ts
- `CommandServer.ts` (port 8422) — WebSocket for OBS/StreamDeck
- `get-login-item` / `set-login-item` IPC handlers
- `configureFirewall()` — `netsh advfirewall firewall add rule` for all ports

### Phase 12 — Named Pipe
- `NamedPipeServer.ts` — `\\.\pipe\phonebridge-sensors`
- JSON line protocol: subscribe/unsubscribe/getAll commands
- Relays SensorStore updates to all pipe clients
- Windows-only (win32 platform check)

### Phase 13 — NFC
- `NFCManager.ts` — read (NDEF, MIFARE, NfcA), write, format, erase
- `NFCStorage.ts` — AsyncStorage tag persistence
- `HCEService.ts` — Host Card Emulation for NDEF replay
- `PhoneBridgeHCEService.java` — HostApduService Type 4 Tag emulation
- `NFCScreen.tsx` — 4-tab UI (Scan, Saved, Write, Replay)
- `NFCStore.ts` (desktop) — in-memory tag cache
- NFC tab in Dashboard with live scan view, remote controls, export
- Protocol additions: NFCTagScannedMessage, NFCWriteCommand, NFCReplayCommand, etc.

### Phase 14 — Security & Privacy
- E2E encryption badge — extract from `pc.getStats()` type:'certificate'
- `TrustedPhones.ts` — file-backed whitelist at userData/trusted-phones.json
- `TrustedDevices.ts` (mobile) — AsyncStorage whitelist
- Privacy mode: `setPrivacyMode` command in protocol.ts
  - Mobile: replaces video with canvas placeholder, mutes audio track
  - Desktop: shows "Privacy Mode" overlay on video
  - Does NOT disconnect WebRTC connection

### Phase 15 — Developer Tools
- `ComputedSensors.ts` — 100ms eval loop using `new Function(...keys, formula)`
  - Results stored as `computed_<name>` in SensorStore
- `SensorRecorder.ts` — subscribe → capture with timestamps → save JSON
- `SensorReplayer.ts` — setTimeout-based replay at configurable speed
  - setPlaybackSpeed(), pauseReplay(), resumeReplay(), seekTo()

### Phase 16 — UX Polish
- `ConnectionHistory.ts` (mobile) — AsyncStorage, max 20 entries, sorted by recency
  - HomeScreen "Recent" section shows last 5 connections
  - StreamScreen calls `recordSuccess()` on successful connect
- `theme.ts` — CSS custom properties: `--bg`, `--surface`, `--accent`, `--text`, etc.
  - `applyTheme(mode)` sets properties on `document.documentElement`
  - `getPreferredTheme()` checks localStorage then `prefers-color-scheme`
- `OnboardingOverlay.tsx` — 3-step first-launch modal with animated dots
- `NotificationPanel.tsx` — bell icon + dropdown event log
  - `useNotifications(maxItems)` hook
  - Severity: info (blue), warn (yellow), error (red)
- Wired into App.tsx: battery low/critical, connect/disconnect notifications

### Phase 17 — Screen Mirror
- `ScreenMirrorModule.java` — MediaProjection API
  - `requestPermission()` → shows system dialog
  - `startMirroring(w, h, fps)` → VirtualDisplay + MediaCodec H.264 at 2Mbps
  - `stopMirroring()` → releases all resources
- `ScreenMirrorManager.ts` — React Native JS bridge
- Note: WebRTC track injection requires react-native-webrtc custom video source support (future step)

---

## Build Issues Resolved

| Issue | Fix |
|---|---|
| `@abandonware/naudiodon` 404 | Changed to `naudiodon: ^2.0.0` |
| `adb: command not found` | Set `ANDROID_HOME` + added platform-tools to PATH |
| `JAVA_HOME is not set` | Set to Android Studio JBR: `C:/Program Files/Android/Android Studio/jbr` |
| `SensorExporter entry.ts` field missing | Changed to `entry.timestamp` |
| `naudiodon` build ignored by pnpm | pnpm v10 blocks native build scripts; app gracefully degrades |
| Release APK: `entryFile packages/index.js` not found | Changed `root = file("../../..")` to `root = file("../..")` in build.gradle |
| `winCodeSign` symlink error | Added `signAndEditExecutable: false` to electron-builder.yml |
| Icon too small | Regenerated as proper 256×256 ICO with embedded PNG |
| "Unable to load script" Metro error | Built release APK instead of debug APK |

---

## Files Created (New)

### Desktop
```
packages/desktop/electron-builder.yml
packages/desktop/resources/icon.ico
packages/desktop/src/main/ComputedSensors.ts
packages/desktop/src/main/SensorAlerts.ts
packages/desktop/src/main/SensorExporter.ts
packages/desktop/src/main/SensorRecorder.ts
packages/desktop/src/main/SensorReplayer.ts
packages/desktop/src/main/TrayManager.ts
packages/desktop/src/main/TrustedPhones.ts
packages/desktop/src/main/WebhookRelay.ts
packages/desktop/src/main/api/CommandServer.ts
packages/desktop/src/main/api/NamedPipeServer.ts
packages/desktop/src/renderer/audio/NoiseGateProcessor.js
packages/desktop/src/renderer/components/NotificationPanel.tsx
packages/desktop/src/renderer/components/OnboardingOverlay.tsx
packages/desktop/src/renderer/theme.ts
packages/desktop/src/renderer/video/VideoProcessor.ts
```

### Mobile
```
packages/mobile/src/services/ScreenMirrorManager.ts
packages/mobile/src/utils/ConnectionHistory.ts
packages/mobile/android/app/src/main/java/com/phonebridgemobile/StreamingService.java
packages/mobile/android/app/src/main/java/com/phonebridgemobile/StreamingServiceModule.java
packages/mobile/android/app/src/main/java/com/phonebridgemobile/PhoneBridgeWidget.java
packages/mobile/android/app/src/main/java/com/phonebridgemobile/ScreenMirrorModule.java
packages/mobile/android/app/src/main/res/layout/widget_phonebridge.xml
packages/mobile/android/app/src/main/res/xml/widget_info.xml
```

---

## Files Modified (Key Changes)

| File | Change |
|---|---|
| `SignalingServer.ts` | Added SensorAlerts + WebhookRelay hooks |
| `index.ts` (desktop main) | Wired all new services, IPC handlers, firewall config |
| `preload/index.ts` | Exposed 20+ new IPC channels |
| `App.tsx` (renderer) | Theme, notifications, onboarding |
| `Dashboard.tsx` | NFC tab, privacy mode, encryption badge, notifications |
| `protocol.ts` | SetPrivacyMode, NFC commands, video/audio quality commands |
| `StreamScreen.tsx` | Privacy mode, foreground service, connection history |
| `HomeScreen.tsx` | Recent connections section |
| `build.gradle` | Fixed root path for monorepo |
| `AndroidManifest.xml` | Foreground service + widget declarations |

---

## Deployment

### Phone
- Release APK: `packages/mobile/android/app/build/outputs/apk/release/app-release.apk`
- Installed via: `adb install -r app-release.apk`
- Launched via: `adb shell am start -n com.phonebridgemobile/.MainActivity`

### PC
- Installed to: `C:/Users/mohit/AppData/Local/Programs/PhoneBridge/`
- Desktop shortcut created: `PhoneBridge.lnk`
- Installer: `packages/desktop/dist/PhoneBridge-Setup-0.1.0.exe` (78 MB)

### GitHub
- Repository: https://github.com/mohitpanwar7/phonebridge
- Branch: master
- Commit: `feat: implement all 17 phases — complete PhoneBridge feature set`
- 42 files changed, 3788 insertions
