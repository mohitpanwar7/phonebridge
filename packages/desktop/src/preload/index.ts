import { contextBridge, ipcRenderer } from 'electron';

// Helper: subscribe to an IPC channel and return a cleanup function
function onChannel(channel: string, callback: (...args: any[]) => void) {
  const handler = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
}

contextBridge.exposeInMainWorld('phoneBridge', {
  // Connection
  getConnectionInfo: () => ipcRenderer.invoke('get-connection-info'),
  getInitData: () => ipcRenderer.invoke('get-init-data'),
  sendCommand: (command: unknown) => ipcRenderer.invoke('send-command', command),

  // Sensors
  getSensorData: (sensor: string) => ipcRenderer.invoke('get-sensor-data', sensor),
  getSensorHistory: (sensor: string, limit: number) =>
    ipcRenderer.invoke('get-sensor-history', sensor, limit),

  // Events from main process — all return cleanup functions
  onInit: (callback: (data: unknown) => void) => onChannel('init', callback),
  onPhoneConnected: (callback: (connected: boolean) => void) => onChannel('phone-connected', callback),
  onConnectionState: (callback: (state: string) => void) => onChannel('connection-state', callback),
  onSignaling: (callback: (msg: unknown) => void) => onChannel('signaling', callback),
  onDeviceInfo: (callback: (info: unknown) => void) => onChannel('device-info', callback),
  onSensorData: (callback: (data: unknown) => void) => onChannel('sensor-data', callback),
  onPhoneStatus: (callback: (status: unknown) => void) => onChannel('phone-status', callback),

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
  onDriverStatus: (callback: (status: { softcamReady: boolean; vbCableReady: boolean }) => void) =>
    onChannel('driver-status', callback),

  // NFC
  nfcGetTags: () => ipcRenderer.invoke('nfc-get-tags'),
  nfcGetLastScanned: () => ipcRenderer.invoke('nfc-get-last-scanned'),
  nfcSendCommand: (cmd: unknown) => ipcRenderer.invoke('nfc-send-command', cmd),
  onNFCTagScanned: (callback: (tag: unknown) => void) => onChannel('nfc-tag-scanned', callback),
  onNFCSavedTags: (callback: (tags: unknown[]) => void) => onChannel('nfc-saved-tags', callback),
  onNFCWriteResult: (callback: (result: { success: boolean; error?: string }) => void) =>
    onChannel('nfc-write-result', callback),
  onNFCReplayStatus: (callback: (status: { active: boolean; tagId?: string; tagName?: string }) => void) =>
    onChannel('nfc-replay-status', callback),

  // Settings
  getLoginItem: () => ipcRenderer.invoke('get-login-item'),
  setLoginItem: (enabled: boolean) => ipcRenderer.invoke('set-login-item', enabled),

  // Export
  exportSensorsCSV: () => ipcRenderer.invoke('export-sensors-csv'),
  exportSensorsJSON: () => ipcRenderer.invoke('export-sensors-json'),

  // Sensor Alerts
  getAlertRules: () => ipcRenderer.invoke('get-alert-rules'),
  setAlertRules: (rules: unknown[]) => ipcRenderer.invoke('set-alert-rules', rules),
  onSensorAlertFired: (callback: (payload: { rule: unknown; value: number }) => void) =>
    onChannel('sensor-alert-fired', callback),

  // Webhook Relay
  getWebhookConfigs: () => ipcRenderer.invoke('get-webhook-configs'),
  setWebhookConfigs: (configs: unknown[]) => ipcRenderer.invoke('set-webhook-configs', configs),

  // Computed Sensors
  getComputedSensorDefs: () => ipcRenderer.invoke('get-computed-sensor-defs'),
  setComputedSensorDefs: (defs: unknown[]) => ipcRenderer.invoke('set-computed-sensor-defs', defs),

  // Sensor Recording / Replay
  sensorRecordingStart: () => ipcRenderer.invoke('sensor-recording-start'),
  sensorRecordingStop: () => ipcRenderer.invoke('sensor-recording-stop'),
  sensorRecordingStatus: () => ipcRenderer.invoke('sensor-recording-status'),
  sensorReplayStart: (recording: unknown) => ipcRenderer.invoke('sensor-replay-start', recording),
  sensorReplayPause: () => ipcRenderer.invoke('sensor-replay-pause'),
  sensorReplayResume: () => ipcRenderer.invoke('sensor-replay-resume'),
  sensorReplayStop: () => ipcRenderer.invoke('sensor-replay-stop'),
  sensorReplaySpeed: (speed: number) => ipcRenderer.invoke('sensor-replay-speed', speed),

  // Shortcuts
  onShortcutToggleMic: (callback: () => void) => onChannel('shortcut-toggle-mic', callback),
  onShortcutSnapshot: (callback: () => void) => onChannel('shortcut-snapshot', callback),
  onShortcutToggleTorch: (callback: () => void) => onChannel('shortcut-toggle-torch', callback),
  onCameraSwitched: (callback: (id: string) => void) => onChannel('camera-switched', callback),
  onPhotoCaptured: (callback: (msg: unknown) => void) => onChannel('photo-captured', callback),

  // VB-Cable installer
  installVBCable: () => ipcRenderer.invoke('install-vbcable'),

  // Bluetooth Audio
  btAudioStart: () => ipcRenderer.invoke('bt-audio-start'),
  btAudioStop: () => ipcRenderer.invoke('bt-audio-stop'),
  btAudioStatus: () => ipcRenderer.invoke('bt-audio-status'),
  onBtAudioState: (callback: (state: { connected: boolean; port: number }) => void) =>
    onChannel('bt-audio-state', callback),

  // Tunnel (internet connectivity)
  tunnelStart: () => ipcRenderer.invoke('tunnel-start'),
  tunnelStop: () => ipcRenderer.invoke('tunnel-stop'),
  tunnelStatus: () => ipcRenderer.invoke('tunnel-status'),

  // Window controls (frameless window)
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
});
