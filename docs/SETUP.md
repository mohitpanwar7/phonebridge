# PhoneBridge — Setup Guide

## Prerequisites

### Windows PC
- Windows 10/11 x64
- Node.js 18+ (LTS recommended)
- pnpm 9+ (`npm install -g pnpm`)
- Git

### For building the desktop app natively (optional)
- Visual Studio 2022 with "Desktop development with C++" workload (for native addons)
- Python 3.11+ (for node-gyp)

### For building the Android APK
- Android Studio (latest)
- Android SDK with Build Tools 34+
- Java 17 (bundled with Android Studio at `C:/Program Files/Android/Android Studio/jbr`)

### Virtual Devices (required for full functionality)
- **Virtual Webcam**: Install [Softcam](https://github.com/tshino/softcam) DirectShow filter
- **Virtual Mic**: Install [VB-Cable](https://vb-audio.com/Cable/) virtual audio device

---

## Install Dependencies

```bash
# Clone the repo
git clone https://github.com/mohitpanwar7/phonebridge.git
cd phonebridge

# Install all workspace dependencies
pnpm install
```

---

## Run in Development Mode

### Desktop
```bash
pnpm --filter @phonebridge/desktop dev
```
Opens Electron window with hot reload via electron-vite.

### Mobile (Metro + Android)
```bash
# Terminal 1 — start Metro bundler
cd packages/mobile
npx react-native start

# Terminal 2 — run on connected Android device
npx react-native run-android
```

---

## Build for Production

### Desktop (Windows Installer)
```bash
# 1. Build the renderer + main bundles
pnpm --filter @phonebridge/desktop build

# 2. Package into NSIS installer
cd packages/desktop
npx electron-builder --config electron-builder.yml
# Output: dist/PhoneBridge-Setup-0.1.0.exe
```

> Note: `signAndEditExecutable: false` is set in electron-builder.yml to skip PE patching.
> This avoids the winCodeSign symlink error on Windows without Developer Mode enabled.
> The app works fully — only the taskbar icon won't show the custom icon.

### Android (Release APK)
```bash
cd packages/mobile/android

# Set environment variables
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$HOME/AppData/Local/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

# Build
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

The release APK uses the debug keystore for signing (suitable for internal use).
For Play Store distribution, generate a production keystore.

### Install on Connected Phone
```bash
export ANDROID_HOME="$HOME/AppData/Local/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

adb install -r packages/mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## Environment Variables

No `.env` file is required. All configuration is done through the app's Settings UI.

The following are set at build time only:
- `JAVA_HOME` — path to JDK for Gradle
- `ANDROID_HOME` — path to Android SDK

---

## Ports & Firewall

PhoneBridge opens these ports on your PC. The app attempts to auto-configure Windows Firewall on first launch (requires admin prompt).

| Port | Protocol | Purpose |
|---|---|---|
| 8765 | TCP (WebSocket) | Signaling + commands |
| 8420 | TCP (HTTP) | REST API |
| 8421 | TCP (WebSocket) | Sensor stream |
| 8422 | TCP (WebSocket) | OBS/StreamDeck API |

To manually add firewall rules:
```powershell
netsh advfirewall firewall add rule name="PhoneBridge-8765" dir=in action=allow protocol=TCP localport=8765
netsh advfirewall firewall add rule name="PhoneBridge-8420" dir=in action=allow protocol=TCP localport=8420
netsh advfirewall firewall add rule name="PhoneBridge-8421" dir=in action=allow protocol=TCP localport=8421
netsh advfirewall firewall add rule name="PhoneBridge-8422" dir=in action=allow protocol=TCP localport=8422
```

---

## Common Issues

### "Unable to load script" on mobile
You installed the debug APK, which requires Metro bundler running.
**Fix**: Install the release APK (`app-release.apk`) instead.

### Virtual webcam not showing in Zoom/OBS
Softcam DirectShow filter is not registered.
**Fix**: Run `regsvr32 softcam.dll` as administrator, or use the Softcam installer.

### Virtual microphone not working
VB-Cable is not installed.
**Fix**: Download and install from https://vb-audio.com/Cable/

### naudiodon build fails
naudiodon requires Visual Studio C++ build tools.
**Fix**: The app gracefully disables virtual mic if naudiodon fails to load. Install VS Build Tools for full support.

### Phone not discovered
- Ensure phone and PC are on the **same WiFi network**
- Disable AP isolation on your router
- Check Windows Firewall is not blocking port 8765

### `winCodeSign` symlink error during packaging
Requires Windows Developer Mode for symlink creation.
**Fix**: Already resolved — `signAndEditExecutable: false` in electron-builder.yml skips this step.

### Gradle `JAVA_HOME is not set`
**Fix**:
```bash
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
```

### Gradle `adb: command not found`
**Fix**:
```bash
export ANDROID_HOME="$HOME/AppData/Local/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```
