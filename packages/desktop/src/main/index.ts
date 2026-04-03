import { app, BrowserWindow, ipcMain } from 'electron';
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
import {
  SIGNALING_PORT,
  REST_API_PORT,
  WEBSOCKET_API_PORT,
  APP_NAME,
} from '@phonebridge/shared';

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startServices() {
  sensorStore       = new SensorStore();
  virtualCamera     = new VirtualCamera();
  virtualMic        = new VirtualMicrophone();
  vbCableDetector   = new VBCableDetector();
  softcamInstaller  = new SoftcamInstaller();

  signalingServer = new SignalingServer(SIGNALING_PORT, sensorStore, (event, data) => {
    mainWindow?.webContents.send(event, data);
  });
  signalingServer.start();

  mdnsAdvertiser = new MDNSAdvertiser(SIGNALING_PORT);
  mdnsAdvertiser.start();

  restServer = new RestServer(REST_API_PORT, sensorStore);
  restServer.start();

  wsServer = new SensorWebSocketServer(WEBSOCKET_API_PORT, sensorStore);
  wsServer.start();

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

// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow();
  try {
    await startServices();
  } catch (err) {
    console.error('[Main] startServices failed:', err);
  }
});

app.on('window-all-closed', () => {
  signalingServer?.stop();
  mdnsAdvertiser?.stop();
  restServer?.stop();
  wsServer?.stop();
  virtualCamera?.destroy();
  virtualMic?.stop();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
