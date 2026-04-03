import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { SignalingServer } from './SignalingServer';
import { MDNSAdvertiser } from './MDNSAdvertiser';
import { SensorStore } from './SensorStore';
import { RestServer } from './api/RestServer';
import { SensorWebSocketServer } from './api/WebSocketServer';
import { QRGenerator } from './QRGenerator';
import { VirtualCamera } from './VirtualCamera';
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
let cachedInitData: unknown = null;

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
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startServices() {
  sensorStore = new SensorStore();
  virtualCamera = new VirtualCamera();

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

  // Send now — works if renderer already loaded; did-finish-load handler covers the other case
  mainWindow?.webContents.send('init', cachedInitData);
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

// IPC handlers
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

// Forward signaling messages from renderer back to phone
ipcMain.handle('send-signaling', (_event, msg) => {
  signalingServer?.sendSignaling(msg);
});

// Forward frames from renderer to virtual camera
ipcMain.handle('send-video-frame', (_event, frameBuffer: Buffer, width: number, height: number) => {
  if (!virtualCamera) return;
  // Create camera on first frame or if dimensions changed
  if (!virtualCamera.isActive ||
      virtualCamera.dimensions.width !== width ||
      virtualCamera.dimensions.height !== height) {
    if (virtualCamera.isActive) virtualCamera.destroy();
    virtualCamera.create(width, height, 30);
  }
  virtualCamera.sendFrame(frameBuffer);
});

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
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
