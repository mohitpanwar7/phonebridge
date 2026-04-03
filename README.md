# PhoneBridge

Turn your Android/iOS phone into a full wireless hardware peripheral for your Windows PC — webcam, microphone, speaker, sensor hub, and NFC reader, all over WiFi.

## What It Does

- **Wireless Webcam** — Phone camera streams via WebRTC to a virtual DirectShow camera (Softcam). Use it in Zoom, OBS, Teams, etc.
- **Virtual Microphone** — Phone mic audio routes to VB-Cable virtual audio device
- **PC Audio to Phone** — Desktop system audio plays through the phone speaker
- **Sensor Hub** — Accelerometer, gyroscope, GPS, barometer, light, battery, magnetometer, pedometer, proximity in real time
- **NFC Reader/Writer** — Scan, save, write, and replay NFC tags from your desktop
- **Screen Mirror** — Phone screen captured via MediaProjection and streamed to PC

## Repository Structure

```
wireless-cam/
├── packages/
│   ├── desktop/          # Electron + React Windows app
│   ├── mobile/           # React Native Android/iOS app
│   └── shared/           # Shared TypeScript types + protocol
├── docs/                 # Full documentation
│   ├── CONVERSATION_SUMMARY.md
│   ├── FEATURES.md
│   ├── ARCHITECTURE.md
│   ├── SETUP.md
│   └── API.md
└── README.md
```

## Quick Start

### Desktop (Windows)
1. Download `PhoneBridge-Setup-0.1.0.exe` from Releases and install
2. Or run from source: `pnpm --filter @phonebridge/desktop dev`

### Mobile (Android)
1. Install the APK from Releases
2. Or build from source: see `docs/SETUP.md`

### Connect
1. Open PhoneBridge on PC — a QR code appears
2. Open PhoneBridge on phone — scan QR or tap your PC from the list
3. Grant camera/microphone/location permissions
4. Select "PhoneBridge Camera" in any video application

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop app | Electron 30 + React 18 + TypeScript |
| Build tool | electron-vite |
| Installer | electron-builder (NSIS) |
| Mobile app | React Native 0.74 |
| Camera | VisionCamera v4 |
| Streaming | WebRTC (react-native-webrtc) |
| Discovery | Bonjour/mDNS (react-native-zeroconf) |
| Virtual webcam | Softcam (DirectShow filter) |
| Virtual mic | VB-Cable + naudiodon (PortAudio) |
| Sensors | expo-sensors, expo-battery |
| NFC | react-native-nfc-manager |
| Monorepo | pnpm workspaces |

## Ports Used

| Port | Purpose |
|---|---|
| 8765 | WebSocket signaling server |
| 8420 | REST API |
| 8421 | Sensor WebSocket stream |
| 8422 | OBS/StreamDeck command server |
| `\\.\pipe\phonebridge-sensors` | Named pipe (Unity/Unreal) |

## Documentation

- [Full Feature List](docs/FEATURES.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Setup Guide](docs/SETUP.md)
- [API Reference](docs/API.md)
- [Development History](docs/CONVERSATION_SUMMARY.md)
