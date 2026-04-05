import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron';
import { join } from 'path';
import { SignalingServer } from './SignalingServer';
import { MDNSAdvertiser } from './MDNSAdvertiser';
import { SensorStore } from './SensorStore';
import { RestServer } from './api/RestServer';
import { SensorWebSocketServer } from './api/WebSocketServer';
import { QRGenerator } from './QRGenerator';
import { VirtualCamera } from './VirtualCamera';
import { VirtualMicrophone } from './VirtualMicrophone';
import { VBCableDetector } from './VBCableDetector';
import { SoftcamInstaller } from './SoftcamInstaller';
import { NFCStore } from './NFCStore';
import { TrayManager } from './TrayManager';
import { SensorAlerts } from './SensorAlerts';
import { WebhookRelay } from './WebhookRelay';
import { CommandServer } from './api/CommandServer';
import { NamedPipeServer } from './api/NamedPipeServer';
import { ComputedSensors } from './ComputedSensors';
import { SensorRecorder } from './SensorRecorder';
import { SensorReplayer } from './SensorReplayer';
import {
  SIGNALING_PORT,
  REST_API_PORT,
  WEBSOCKET_API_PORT,
  APP_NAME,
} from '@phonebridge/shared';

const COMMAND_SERVER_PORT = 8422;

// ── Single Instance Lock ─────────────────────────────────────────────────────
// Prevent multiple instances from starting and binding to the same ports.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running — quit immediately
  app.quit();
  process.exit(0);
}

// Resolve icon path — works both in dev and after packaging
function getIconPath(): string {
  // In packaged app: resources/icon.ico sits next to app.asar
  // In dev: resources/icon.ico is relative to __dirname (out/main/)
  const devPath = join(__dirname, '../../resources/icon.ico');
  const prodPath = join(process.resourcesPath, 'icon.ico');
  const fs = require('fs');
  if (fs.existsSync(prodPath)) return prodPath;
  if (fs.existsSync(devPath)) return devPath;
  return devPath; // fallback
}

let mainWindow: BrowserWindow | null = null;
let signalingServer: SignalingServer;
let mdnsAdvertiser: MDNSAdvertiser;
let sensorStore: SensorStore;
let restServer: RestServer;
let wsServer: SensorWebSocketServer;
let virtualCamera: VirtualCamera;
let virtualMic: VirtualMicrophone;
let vbCableDetector: VBCableDetector;
let softcamInstaller: SoftcamInstaller;
let nfcStore: NFCStore;
let trayManager: TrayManager;
let sensorAlerts: SensorAlerts;
let webhookRelay: WebhookRelay;
let commandServer: CommandServer;
let namedPipeServer: NamedPipeServer;
let computedSensors: ComputedSensors;
let sensorRecorder: SensorRecorder;
let sensorReplayer: SensorReplayer;
let cachedInitData: unknown = null;

// Track driver status for renderer
let softcamReady = false;
let vbCableReady = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Re-send init data when renderer finishes loading (fixes race with async startServices)
  mainWindow.webContents.on('did-finish-load', () => {
    if (cachedInitData) {
      mainWindow?.webContents.send('init', cachedInitData);
    }
    // Send driver status once renderer is ready
    mainWindow?.webContents.send('driver-status', { softcamReady, vbCableReady });
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startServices() {
  sensorStore       = new SensorStore();
  nfcStore          = new NFCStore();
  virtualCamera     = new VirtualCamera();
  virtualMic        = new VirtualMicrophone();
  vbCableDetector   = new VBCableDetector();
  softcamInstaller  = new SoftcamInstaller();
  sensorAlerts      = new SensorAlerts();
  webhookRelay      = new WebhookRelay();

  sensorAlerts.setOnAlert((rule, value) => {
    mainWindow?.webContents.send('sensor-alert-fired', { rule, value });
  });

  computedSensors = new ComputedSensors(sensorStore);
  computedSensors.setOnUpdate((name, data, ts) => {
    mainWindow?.webContents.send('sensor-data', { type: 'sensor', sensor: name, ts, data });
  });
  computedSensors.start();

  sensorRecorder = new SensorRecorder(sensorStore);
  sensorReplayer = new SensorReplayer(sensorStore);

  signalingServer = new SignalingServer(SIGNALING_PORT, sensorStore, (event, data) => {
    mainWindow?.webContents.send(event, data);
    // Update tray on connection events
    if (event === 'phone-connected') {
      trayManager?.setConnected(data as boolean);
    }
    if (event === 'device-info') {
      trayManager?.setConnected(true, (data as any).cameras ?? []);
    }
  }, nfcStore);
  signalingServer.setSensorAlerts(sensorAlerts);
  signalingServer.setWebhookRelay(webhookRelay);

  try { signalingServer.start(); } catch (e) {
    console.error('[Main] SignalingServer failed:', e);
  }

  mdnsAdvertiser = new MDNSAdvertiser(SIGNALING_PORT);
  try { mdnsAdvertiser.start(); } catch (e) {
    console.warn('[Main] mDNS advertiser failed (discovery will not work):', e);
  }

  try {
    restServer = new RestServer(REST_API_PORT, sensorStore);
    restServer.start();
  } catch (e) { console.warn('[Main] REST server failed:', e); }

  try {
    wsServer = new SensorWebSocketServer(WEBSOCKET_API_PORT, sensorStore);
    wsServer.start();
  } catch (e) { console.warn('[Main] Sensor WS server failed:', e); }

  // ── OBS/StreamDeck command server ────────────────────────────────────────────
  try {
    commandServer = new CommandServer(COMMAND_SERVER_PORT);
    commandServer.register('switchCamera', (cmd: any) => {
      signalingServer?.sendCommand({ cmd: 'switchCamera', deviceId: cmd.deviceId } as any);
      mainWindow?.webContents.send('camera-switched', cmd.deviceId);
    });
    commandServer.register('toggleMic', () => {
      mainWindow?.webContents.send('shortcut-toggle-mic');
    });
    commandServer.register('snapshot', () => {
      mainWindow?.webContents.send('shortcut-snapshot');
    });
    commandServer.register('toggleTorch', () => {
      mainWindow?.webContents.send('shortcut-toggle-torch');
    });
    commandServer.register('setZoom', (cmd: any) => {
      signalingServer?.sendCommand({ cmd: 'setZoom', level: cmd.level } as any);
    });
    commandServer.start();
  } catch (e) { console.warn('[Main] Command server failed:', e); }

  // Named pipe server (for Unity/Unreal integration) — Windows only
  if (process.platform === 'win32') {
    try {
      namedPipeServer = new NamedPipeServer(sensorStore);
      namedPipeServer.start();
    } catch (e) { console.warn('[Main] Named pipe server failed:', e); }
  }

  const localIP = getLocalIP();
  const qrData = JSON.stringify({
    ip: localIP,
    port: SIGNALING_PORT,
    sessionId: signalingServer.sessionId,
    appName: APP_NAME,
  });
  const qrCodeDataURL = await QRGenerator.toDataURL(qrData);

  cachedInitData = {
    ip: localIP,
    port: SIGNALING_PORT,
    sessionId: signalingServer.sessionId,
    qrCode: qrCodeDataURL,
  };

  mainWindow?.webContents.send('init', cachedInitData);

  // ── Check and install virtual drivers (non-blocking, don't block app start) ──
  checkDrivers();
}

async function checkDrivers() {
  // Check Softcam (virtual webcam)
  softcamReady = await softcamInstaller.ensureInstalled();
  mainWindow?.webContents.send('driver-status', { softcamReady, vbCableReady });

  // Check VB-Cable (virtual mic)
  vbCableReady = await vbCableDetector.ensureInstalled();
  if (vbCableReady) {
    const started = virtualMic.start();
    if (!started) {
      console.warn('[Main] VB-Cable detected but VirtualMicrophone could not start (naudiodon missing?)');
      vbCableReady = false;
    }
  }
  mainWindow?.webContents.send('driver-status', { softcamReady, vbCableReady });
}

function getLocalIP(): string {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-connection-info', () => ({
  ip: getLocalIP(),
  port: SIGNALING_PORT,
  sessionId: signalingServer?.sessionId,
}));

ipcMain.handle('send-command', (_event, command) => {
  signalingServer?.sendCommand(command);
});

ipcMain.handle('get-sensor-data', (_event, sensor: string) => {
  return sensorStore?.getLatest(sensor);
});

ipcMain.handle('get-sensor-history', (_event, sensor: string, limit: number) => {
  return sensorStore?.getHistory(sensor, limit);
});

ipcMain.handle('send-signaling', (_event, msg) => {
  signalingServer?.sendSignaling(msg);
});

// Video frames from renderer → Softcam virtual webcam
ipcMain.handle('send-video-frame', (_event, frameBuffer: Buffer, width: number, height: number) => {
  if (!virtualCamera) return;
  if (
    !virtualCamera.isActive ||
    virtualCamera.dimensions.width  !== width ||
    virtualCamera.dimensions.height !== height
  ) {
    if (virtualCamera.isActive) virtualCamera.destroy();
    virtualCamera.create(width, height, 30);
  }
  virtualCamera.sendFrame(frameBuffer);
});

// PCM audio frames from renderer AudioWorklet → VirtualMicrophone → VB-Cable
ipcMain.on('send-audio-frame', (_event, frameBuffer: Buffer) => {
  virtualMic?.writePCM(frameBuffer);
});

// Driver status query from renderer
ipcMain.handle('get-driver-status', () => ({ softcamReady, vbCableReady }));

// ── NFC IPC ────────────────────────────────────────────────────────────────
ipcMain.handle('nfc-get-tags', () => nfcStore?.getAllTags() ?? []);
ipcMain.handle('nfc-get-last-scanned', () => nfcStore?.getLastScanned() ?? null);

// Commands to phone (start scan, write, replay, etc.)
ipcMain.handle('nfc-send-command', (_event, cmd: object) => {
  signalingServer?.sendCommand(cmd as any);
});

// ── Settings IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('get-login-item', () => app.getLoginItemSettings());
ipcMain.handle('set-login-item', (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
});

// Export sensor data
ipcMain.handle('export-sensors-csv', async () => {
  try {
    const { SensorExporter } = await import('./SensorExporter');
    const exporter = new SensorExporter(sensorStore);
    await exporter.exportCSV();
  } catch (err) {
    console.error('[Main] Export failed:', err);
  }
});

ipcMain.handle('export-sensors-json', async () => {
  try {
    const { SensorExporter } = await import('./SensorExporter');
    const exporter = new SensorExporter(sensorStore);
    await exporter.exportJSON();
  } catch (err) {
    console.error('[Main] Export failed:', err);
  }
});

// ── Sensor Alerts IPC ─────────────────────────────────────────────────────────
ipcMain.handle('get-alert-rules', () => sensorAlerts?.getRules() ?? []);
ipcMain.handle('set-alert-rules', (_event, rules) => sensorAlerts?.setRules(rules));

// ── Webhook Relay IPC ─────────────────────────────────────────────────────────
ipcMain.handle('get-webhook-configs', () => webhookRelay?.getConfigs() ?? []);
ipcMain.handle('set-webhook-configs', (_event, configs) => webhookRelay?.setConfigs(configs));

// ── Computed Sensors IPC ──────────────────────────────────────────────────────
ipcMain.handle('get-computed-sensor-defs', () => computedSensors?.getDefs() ?? []);
ipcMain.handle('set-computed-sensor-defs', (_event, defs) => computedSensors?.setDefs(defs));

// ── Sensor Recorder / Replayer IPC ───────────────────────────────────────────
ipcMain.handle('sensor-recording-start', () => sensorRecorder?.startRecording());
ipcMain.handle('sensor-recording-stop', async () => {
  const recording = sensorRecorder?.stopRecording();
  if (recording) await sensorRecorder?.saveRecording(recording);
  return recording ? true : false;
});
ipcMain.handle('sensor-recording-status', () => sensorRecorder?.isRecording() ?? false);
ipcMain.handle('sensor-replay-start', (_event, recording) => {
  sensorReplayer?.loadRecording(recording);
  sensorReplayer?.startReplay();
});
ipcMain.handle('sensor-replay-pause', () => sensorReplayer?.pauseReplay());
ipcMain.handle('sensor-replay-resume', () => sensorReplayer?.resumeReplay());
ipcMain.handle('sensor-replay-stop', () => sensorReplayer?.stopReplay());
ipcMain.handle('sensor-replay-speed', (_event, speed: number) => sensorReplayer?.setPlaybackSpeed(speed));

// ─────────────────────────────────────────────────────────────────────────────

function registerShortcuts() {
  // Ctrl+Shift+1/2/3: switch camera by index
  [0, 1, 2].forEach((i) => {
    globalShortcut.register(`CommandOrControl+Shift+${i + 1}`, () => {
      const cameras = signalingServer?.getCameraList?.() ?? [];
      const cam = cameras[i];
      if (cam) {
        signalingServer?.sendCommand({ cmd: 'switchCamera', deviceId: cam.id } as any);
        mainWindow?.webContents.send('camera-switched', cam.id);
      }
    });
  });
  // Ctrl+Shift+M: toggle mic
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    mainWindow?.webContents.send('shortcut-toggle-mic');
  });
  // Ctrl+Shift+S: snapshot
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    mainWindow?.webContents.send('shortcut-snapshot');
  });
  // Ctrl+Shift+T: toggle torch
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    mainWindow?.webContents.send('shortcut-toggle-torch');
  });
}

// When a second instance tries to launch, show the existing window instead
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  createWindow();
  trayManager = new TrayManager(() => mainWindow);
  trayManager.create();
  trayManager.onCameraSwitch((id) => {
    signalingServer?.sendCommand({ cmd: 'switchCamera', deviceId: id } as any);
    mainWindow?.webContents.send('camera-switched', id);
  });
  registerShortcuts();
  try {
    await startServices();
  } catch (err) {
    console.error('[Main] startServices failed:', err);
    dialog.showErrorBox(
      'PhoneBridge — Startup Error',
      `Some services failed to start:\n${(err as Error).message}\n\nThe app may work with reduced functionality.`
    );
  }
  // Configure firewall on first run (non-blocking)
  configureFirewall();
});

function configureFirewall() {
  const { execFile } = require('child_process');
  const ports = [SIGNALING_PORT, REST_API_PORT, WEBSOCKET_API_PORT, COMMAND_SERVER_PORT];
  const names = ['Signaling', 'REST API', 'WebSocket', 'Command'];
  ports.forEach((port, i) => {
    execFile('netsh', [
      'advfirewall', 'firewall', 'add', 'rule',
      `name=PhoneBridge ${names[i]}`,
      'dir=in', 'action=allow', 'protocol=TCP',
      `localport=${port}`,
    ], (err: any) => {
      if (err) console.warn(`[Firewall] Rule for port ${port} may already exist or requires elevation`);
    });
  });
}

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  globalShortcut.unregisterAll();
  // Clean up all servers before quit
  signalingServer?.stop();
  mdnsAdvertiser?.stop();
  restServer?.stop();
  wsServer?.stop();
  commandServer?.stop();
  namedPipeServer?.stop();
  computedSensors?.stop();
  sensorReplayer?.stopReplay();
  virtualCamera?.destroy();
  virtualMic?.stop();
});

app.on('window-all-closed', () => {
  signalingServer?.stop();
  mdnsAdvertiser?.stop();
  restServer?.stop();
  wsServer?.stop();
  commandServer?.stop();
  namedPipeServer?.stop();
  computedSensors?.stop();
  sensorReplayer?.stopReplay();
  virtualCamera?.destroy();
  virtualMic?.stop();
  trayManager?.destroy();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
