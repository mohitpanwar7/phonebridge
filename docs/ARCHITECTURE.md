# PhoneBridge — Architecture Overview

## System Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    WINDOWS PC                            │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Electron Main Process                 │    │
│  │                                                 │    │
│  │  SignalingServer (ws :8765)                     │    │
│  │    ├─ SensorStore          (in-memory)          │    │
│  │    ├─ SensorAlerts         (rule engine)        │    │
│  │    ├─ WebhookRelay         (HTTP POST)          │    │
│  │    ├─ NFCStore             (tag cache)          │    │
│  │    └─ ComputedSensors      (formula eval)       │    │
│  │                                                 │    │
│  │  RestServer (http :8420)                        │    │
│  │    └─ /api/sensors, /api/connection, /api/nfc   │    │
│  │                                                 │    │
│  │  SensorWebSocketServer (:8421)                  │    │
│  │  CommandServer (:8422)  ← OBS / StreamDeck      │    │
│  │  NamedPipeServer        ← Unity / Unreal        │    │
│  │                                                 │    │
│  │  VirtualCamera   (Softcam DirectShow)           │    │
│  │  VirtualMicrophone (VB-Cable + naudiodon)       │    │
│  │  TrayManager / GlobalShortcuts                  │    │
│  └─────────────────────────────────────────────────┘    │
│                      │ IPC (contextBridge)               │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Electron Renderer (React)             │    │
│  │                                                 │    │
│  │  App.tsx                                        │    │
│  │    ├─ useWebRTC hook  (RTCPeerConnection)        │    │
│  │    ├─ AudioDecoder    (AudioContext + Worklet)   │    │
│  │    ├─ VideoProcessor  (canvas effects chain)    │    │
│  │    └─ Dashboard.tsx                             │    │
│  │         ├─ VideoTab    (live preview + PTZ)     │    │
│  │         ├─ SensorsTab  (graphs + export)        │    │
│  │         ├─ NFCTab      (scan/write/replay)      │    │
│  │         ├─ SettingsTab (quality, audio, sensors)│    │
│  │         └─ APITab      (endpoints reference)   │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                         │ WiFi (WebRTC + WS)
┌──────────────────────────────────────────────────────────┐
│                    ANDROID PHONE                         │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │           React Native App                      │    │
│  │                                                 │    │
│  │  HomeScreen                                     │    │
│  │    ├─ Bonjour discovery (react-native-zeroconf) │    │
│  │    ├─ Recent connections (AsyncStorage)         │    │
│  │    └─ QR code scanner                          │    │
│  │                                                 │    │
│  │  StreamScreen                                   │    │
│  │    ├─ VisionCamera v4  (camera feed)            │    │
│  │    ├─ WebRTCManager    (RTCPeerConnection)       │    │
│  │    ├─ SignalingClient  (WebSocket to desktop)   │    │
│  │    ├─ SensorManager    (11 sensors via expo)    │    │
│  │    ├─ MicrophoneManager (audio source routing)  │    │
│  │    └─ Floating controls bar                     │    │
│  │                                                 │    │
│  │  NFCScreen                                      │    │
│  │    ├─ NFCManager  (read/write/format)           │    │
│  │    ├─ NFCStorage  (AsyncStorage tag store)      │    │
│  │    └─ HCEService  (Host Card Emulation replay)  │    │
│  │                                                 │    │
│  │  StreamingService.java  (foreground service)    │    │
│  │  ScreenMirrorModule.java (MediaProjection)      │    │
│  │  PhoneBridgeWidget.java  (home screen widget)   │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## Data Flows

### Video Pipeline
```
Phone Camera (VisionCamera)
  → WebRTC video track (H264/VP8/VP9)
  → WiFi (ICE / DTLS-SRTP)
  → Desktop RTCPeerConnection.ontrack
  → <video> element
  → VideoProcessor.start() — canvas 2D effects loop
      ├─ BlurEffect      (MediaPipe segmentation)
      ├─ ColorEffect     (WebGL shader)
      ├─ CropEffect      (ROI / PTZ)
      ├─ FaceTracker     (TF.js + EMA)
      └─ RecordingManager (MediaRecorder)
  → ImageData callback
  → IPC: send-video-frame
  → VirtualCamera.sendFrame() (Softcam DIB format)
  → DirectShow filter → Zoom / OBS / Teams
```

### Audio Pipeline (Phone → PC)
```
Phone Microphone
  → WebRTC audio track
  → WiFi
  → Desktop RTCPeerConnection
  → AudioDecoder (AudioContext + AudioWorkletNode)
      ├─ GainNode (0–3× amplification)
      └─ NoiseGateProcessor (AudioWorklet)
  → IPC: send-audio-frame
  → VirtualMicrophone (naudiodon PortAudio)
  → VB-Cable CABLE Input
  → Any app using "CABLE Output" as mic
```

### Audio Pipeline (PC → Phone)
```
Windows system audio
  → Electron desktopCapturer ({ audio: true })
  → MediaStream audio track
  → WebRTC second audio track (desktop→phone direction)
  → Phone RTCPeerConnection.ontrack
  → react-native-incall-manager (setSpeakerphoneOn)
  → Phone speaker
```

### Sensor Pipeline
```
Phone sensors (expo-sensors, expo-battery, GPS)
  → SensorManager.ts — 50ms–10s intervals
  → SignalingClient.sendSensor({ type:'sensor', sensor, data, ts })
  → WebSocket to desktop SignalingServer
  → SensorStore.update(sensor, entry)
      ├─ SensorAlerts.check()    → desktop Notification
      ├─ WebhookRelay.relay()    → HTTP POST
      ├─ ComputedSensors loop    → derived virtual sensors
      ├─ SensorRecorder          → JSON file
      ├─ REST /api/sensors/:name
      ├─ WS :8421 subscribers
      └─ Named pipe subscribers
```

### Signaling / Control
```
Desktop UI action
  → window.phoneBridge.sendCommand({ cmd, ...args })
  → IPC: send-command
  → SignalingServer.broadcast(msg)
  → WebSocket to phone SignalingClient
  → StreamScreen.handleDesktopCommand(msg)
  → WebRTCManager / CameraManager / NFC / Privacy
```

---

## Key Files

### Desktop — Main Process (`packages/desktop/src/main/`)

| File | Role |
|---|---|
| `index.ts` | App entry, window, IPC handlers, service wiring |
| `SignalingServer.ts` | WebSocket hub (port 8765), message routing |
| `SensorStore.ts` | In-memory ring buffer for sensor history |
| `VirtualCamera.ts` | Softcam frame injection |
| `VirtualMicrophone.ts` | VB-Cable PCM output via naudiodon |
| `TrayManager.ts` | System tray + context menu |
| `SensorExporter.ts` | CSV/JSON export |
| `SensorAlerts.ts` | Threshold alert rule engine |
| `WebhookRelay.ts` | HTTP POST sensor data to external URLs |
| `ComputedSensors.ts` | Formula-based virtual sensors |
| `SensorRecorder.ts` | Record sensor sessions to JSON |
| `SensorReplayer.ts` | Replay recordings at variable speed |
| `TrustedPhones.ts` | File-backed device whitelist |
| `NFCStore.ts` | In-memory NFC tag cache |
| `RestServer.ts` | HTTP REST API (port 8420) |
| `api/CommandServer.ts` | OBS/StreamDeck WS API (port 8422) |
| `api/NamedPipeServer.ts` | Unity/Unreal named pipe |

### Desktop — Renderer (`packages/desktop/src/renderer/`)

| File | Role |
|---|---|
| `App.tsx` | Root component, bridge wiring, WebRTC |
| `components/Dashboard.tsx` | Main UI (tabs: Video, Sensors, NFC, Settings, API) |
| `components/NotificationPanel.tsx` | Bell icon + event log |
| `components/OnboardingOverlay.tsx` | First-launch tutorial |
| `hooks/useWebRTC.ts` | RTCPeerConnection lifecycle |
| `audio/AudioDecoder.ts` | Extract PCM from WebRTC audio track |
| `audio/NoiseGateProcessor.js` | AudioWorklet noise gate |
| `video/VideoProcessor.ts` | Canvas effects chain |
| `theme.ts` | CSS custom property dark/light theme |

### Mobile (`packages/mobile/src/`)

| File | Role |
|---|---|
| `screens/HomeScreen.tsx` | Discovery + recent connections |
| `screens/StreamScreen.tsx` | Live streaming + controls |
| `screens/SettingsScreen.tsx` | Audio/video/sensor settings |
| `screens/NFCScreen.tsx` | NFC scan/save/write/replay |
| `services/WebRTCManager.ts` | RTCPeerConnection + camera tracks |
| `services/SignalingClient.ts` | WebSocket to desktop |
| `services/MicrophoneManager.ts` | Audio source routing |
| `services/ScreenMirrorManager.ts` | MediaProjection JS bridge |
| `sensors/SensorManager.ts` | All 11 sensor subscriptions |
| `nfc/NFCManager.ts` | NFC hardware read/write |
| `nfc/NFCStorage.ts` | AsyncStorage tag persistence |
| `nfc/HCEService.ts` | Host Card Emulation replay |
| `utils/ConnectionHistory.ts` | Recent connections store |

---

## WebRTC Details

- **Signaling**: Custom WebSocket protocol (not SDP passthrough — commands + SDP interleaved)
- **ICE**: STUN only (LAN use case; no TURN needed)
- **Codec**: H264 baseline (configurable: VP8, VP9)
- **Encryption**: DTLS-SRTP (mandatory, WebRTC standard)
- **Audio tracks**: Up to 2 (phone mic, desktop loopback)
- **Video tracks**: Up to 2 (main camera, screen mirror)
- **Reconnect**: Exponential backoff 1s→30s + peer connection restart

---

## Monorepo Layout

```
pnpm-workspace.yaml       ← workspace root
packages/
  shared/
    src/
      types.ts            ← CameraDevice, MicrophoneDevice, SensorType, NFCTag…
      protocol.ts         ← All message/command union types
  desktop/
    src/
      main/               ← Electron main process (Node.js)
      preload/            ← contextBridge exposure
      renderer/           ← React app
    electron-builder.yml
    resources/icon.ico
  mobile/
    src/                  ← React Native TypeScript
    android/              ← Gradle project
    ios/                  ← Xcode project
```
