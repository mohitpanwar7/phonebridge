import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('phoneBridge', {
  // Connection
  getConnectionInfo: () => ipcRenderer.invoke('get-connection-info'),
  sendCommand: (command: unknown) => ipcRenderer.invoke('send-command', command),

  // Sensors
  getSensorData: (sensor: string) => ipcRenderer.invoke('get-sensor-data', sensor),
  getSensorHistory: (sensor: string, limit: number) =>
    ipcRenderer.invoke('get-sensor-history', sensor, limit),

  // Events from main process
  onInit: (callback: (data: unknown) => void) => {
    ipcRenderer.on('init', (_event, data) => callback(data));
  },
  onPhoneConnected: (callback: (connected: boolean) => void) => {
    ipcRenderer.on('phone-connected', (_event, connected) => callback(connected));
  },
  onConnectionState: (callback: (state: string) => void) => {
    ipcRenderer.on('connection-state', (_event, state) => callback(state));
  },
  onSignaling: (callback: (msg: unknown) => void) => {
    ipcRenderer.on('signaling', (_event, msg) => callback(msg));
  },
  onDeviceInfo: (callback: (info: unknown) => void) => {
    ipcRenderer.on('device-info', (_event, info) => callback(info));
  },
  onSensorData: (callback: (data: unknown) => void) => {
    ipcRenderer.on('sensor-data', (_event, data) => callback(data));
  },
  onPhoneStatus: (callback: (status: unknown) => void) => {
    ipcRenderer.on('phone-status', (_event, status) => callback(status));
  },

  // Send signaling message back to phone
  sendSignaling: (msg: unknown) => {
    ipcRenderer.invoke('send-signaling', msg);
  },

  // Send video frame to virtual camera (Softcam)
  sendVideoFrame: (frameBuffer: ArrayBuffer, width: number, height: number) => {
    ipcRenderer.invoke('send-video-frame', Buffer.from(frameBuffer), width, height);
  },

  // Send PCM audio frame to VirtualMicrophone → VB-Cable
  // Uses ipcRenderer.send (fire-and-forget) for low-latency audio path
  sendAudioFrame: (frameBuffer: ArrayBuffer) => {
    ipcRenderer.send('send-audio-frame', Buffer.from(frameBuffer));
  },

  // Driver status
  getDriverStatus: () => ipcRenderer.invoke('get-driver-status'),
  onDriverStatus: (callback: (status: { softcamReady: boolean; vbCableReady: boolean }) => void) => {
    ipcRenderer.on('driver-status', (_event, status) => callback(status));
  },
});
