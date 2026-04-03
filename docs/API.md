# PhoneBridge — API Reference

PhoneBridge exposes four programmatic interfaces for external integrations.

---

## 1. REST API — Port 8420

Base URL: `http://<PC-IP>:8420`

### Connection

#### `GET /api/connection`
Returns current connection state.
```json
{
  "state": "connected",
  "phoneModel": "Pixel 7",
  "platform": "android",
  "sessionId": "abc123"
}
```

#### `GET /api/connection/info`
Returns QR code data and network info.
```json
{
  "ip": "192.168.1.10",
  "port": 8765,
  "sessionId": "abc123",
  "qrCode": "data:image/png;base64,..."
}
```

---

### Sensors

#### `GET /api/sensors`
Returns latest reading for all sensors.
```json
{
  "accelerometer": { "x": 0.1, "y": 9.8, "z": 0.2 },
  "gyroscope": { "x": 0.0, "y": 0.01, "z": -0.002 },
  "gps": { "latitude": 28.6139, "longitude": 77.2090, "accuracy": 5 },
  "battery": { "level": 0.82, "isCharging": false },
  ...
}
```

#### `GET /api/sensors/:name`
Returns latest reading for a single sensor.
```
GET /api/sensors/accelerometer
```
```json
{ "x": 0.1, "y": 9.8, "z": 0.2, "timestamp": 1712140800000 }
```

#### `GET /api/sensors/:name/history?limit=100`
Returns last N readings (default 100, max 1000).
```json
[
  { "data": { "x": 0.1, "y": 9.8, "z": 0.2 }, "timestamp": 1712140800000 },
  ...
]
```

---

### NFC

#### `GET /api/nfc/tags`
Returns all saved NFC tags.
```json
[
  {
    "id": "1712140800000_04A3B2C1D0",
    "uid": "04A3B2C1D0",
    "name": "Office Badge",
    "tagType": "MifareClassic",
    "technologies": ["android.nfc.tech.MifareClassic", "android.nfc.tech.NfcA"],
    "savedAt": 1712140800000,
    "ndefRecords": [],
    "notes": "Building access card"
  }
]
```

#### `GET /api/nfc/tags/:id`
Returns a single saved tag by ID.

---

### Commands

#### `POST /api/command`
Send a command to the phone.
```json
{ "cmd": "switchCamera", "deviceId": "back" }
{ "cmd": "setTorch", "enabled": true }
{ "cmd": "setZoom", "level": 2.0 }
{ "cmd": "takePhoto" }
{ "cmd": "setPrivacyMode", "enabled": true }
{ "cmd": "nfcStartScan" }
{ "cmd": "nfcWrite", "data": [{ "tnf": 1, "type": "T", "payload": "Hello" }] }
```

---

## 2. Sensor WebSocket Stream — Port 8421

Connect to `ws://<PC-IP>:8421`

### Subscribe to sensors
```json
{ "type": "subscribe", "sensors": ["accelerometer", "gyroscope", "gps"] }
```

### Unsubscribe
```json
{ "type": "unsubscribe", "sensors": ["gps"] }
```

### Incoming messages
```json
{ "type": "sensor", "sensor": "accelerometer", "data": { "x": 0.1, "y": 9.8, "z": 0.2 }, "ts": 1712140800000 }
```

### Batch mode (phone sends multiple readings at once)
```json
{
  "type": "sensorBatch",
  "sensor": "accelerometer",
  "readings": [
    { "data": { "x": 0.1, "y": 9.8, "z": 0.2 }, "ts": 1712140800000 },
    { "data": { "x": 0.2, "y": 9.7, "z": 0.1 }, "ts": 1712140800050 }
  ]
}
```

---

## 3. OBS / StreamDeck WebSocket API — Port 8422

Connect to `ws://<PC-IP>:8422`

All messages are JSON. Each command returns an ACK.

### Switch Camera
```json
{ "cmd": "switchCamera", "deviceId": "back" }
// or
{ "cmd": "switchCamera", "deviceId": "front" }
```
Response: `{ "ok": true, "cmd": "switchCamera" }`

### Toggle Microphone
```json
{ "cmd": "toggleMic" }
```
Response: `{ "ok": true, "cmd": "toggleMic", "muted": true }`

### Take Snapshot
```json
{ "cmd": "snapshot" }
```
Response: `{ "ok": true, "cmd": "snapshot" }`

### Toggle Torch
```json
{ "cmd": "toggleTorch" }
```
Response: `{ "ok": true, "cmd": "toggleTorch" }`

### Set Zoom
```json
{ "cmd": "setZoom", "level": 2.5 }
```
Response: `{ "ok": true, "cmd": "setZoom" }`

### Error Response
```json
{ "ok": false, "error": "unknown command: foo" }
```

---

## 4. Named Pipe — `\\.\pipe\phonebridge-sensors`

For Unity, Unreal Engine, or any Win32 application. Windows only.

Connect to: `\\.\pipe\phonebridge-sensors`

Protocol: **JSON lines** (one JSON object per line, `\n` terminated).

### Get all current sensor values
Send:
```
{"type":"getAll"}\n
```
Receive:
```
{"type":"sensorData","sensors":{"accelerometer":{"x":0.1,"y":9.8,"z":0.2},...}}\n
```

### Subscribe to real-time updates
Send:
```
{"type":"subscribe","sensors":["accelerometer","gyroscope"]}\n
```
Receive (continuously as data arrives):
```
{"type":"sensor","sensor":"accelerometer","data":{"x":0.1,"y":9.8,"z":0.2},"ts":1712140800000}\n
{"type":"sensor","sensor":"gyroscope","data":{"x":0.01,"y":-0.02,"z":0.0},"ts":1712140800050}\n
```

### Unsubscribe
Send:
```
{"type":"unsubscribe","sensors":["gyroscope"]}\n
```

---

## 5. Global Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+1` | Switch to camera 1 |
| `Ctrl+Shift+2` | Switch to camera 2 |
| `Ctrl+Shift+3` | Switch to camera 3 |
| `Ctrl+Shift+M` | Toggle microphone mute |
| `Ctrl+Shift+S` | Take snapshot |
| `Ctrl+Shift+T` | Toggle torch |

---

## 6. Available Sensors

| Sensor Name | Data Fields |
|---|---|
| `accelerometer` | `x`, `y`, `z` (m/s²) |
| `gyroscope` | `x`, `y`, `z` (rad/s) |
| `magnetometer` | `x`, `y`, `z` (µT) |
| `barometer` | `pressure` (hPa) |
| `light` | `illuminance` (lux) |
| `pedometer` | `steps` (count) |
| `gps` | `latitude`, `longitude`, `altitude`, `accuracy`, `speed` |
| `battery` | `level` (0–1), `isCharging` (bool) |
| `proximity` | `isNear` (bool), `distance` (cm) |
| `gravity` | `x`, `y`, `z` (m/s²) |
| `rotation` | `x`, `y`, `z`, `scalar` |
| `computed_*` | User-defined formula output |

---

## 7. Webhook Payload Format

When a sensor alert fires or webhook relay sends, the HTTP POST body is:

```json
{
  "source": "phonebridge",
  "sensor": "accelerometer",
  "data": { "x": 12.5, "y": 0.1, "z": 9.8 },
  "timestamp": 1712140800000,
  "deviceId": "pixel7-abc123"
}
```

Content-Type: `application/json`
