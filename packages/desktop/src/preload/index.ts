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

  // NFC
  nfcGetTags: () => ipcRenderer.invoke('nfc-get-tags'),
  nfcGetLastScanned: () => ipcRenderer.invoke('nfc-get-last-scanned'),
  nfcSendCommand: (cmd: unknown) => ipcRenderer.invoke('nfc-send-command', cmd),
  onNFCTagScanned: (callback: (tag: unknown) => void) => {
    ipcRenderer.on('nfc-tag-scanned', (_event, tag) => callback(tag));
  },
  onNFCSavedTags: (callback: (tags: unknown[]) => void) => {
    ipcRenderer.on('nfc-saved-tags', (_event, tags) => callback(tags));
  },
  onNFCWriteResult: (callback: (result: { success: boolean; error?: string }) => void) => {
    ipcRenderer.on('nfc-write-result', (_event, result) => callback(result));
  },
  onNFCReplayStatus: (callback: (status: { active: boolean; tagId?: string; tagName?: string }) => void) => {
    ipcRenderer.on('nfc-replay-status', (_event, status) => callback(status));
  },

  // Settings
  getLoginItem: () => ipcRenderer.invoke('get-login-item'),
  setLoginItem: (enabled: boolean) => ipcRenderer.invoke('set-login-item', enabled),

  // Export
  exportSensorsCSV: () => ipcRenderer.invoke('export-sensors-csv'),
  exportSensorsJSON: () => ipcRenderer.invoke('export-sensors-json'),

  // Sensor Alerts
  getAlertRules: () => ipcRenderer.invoke('get-alert-rules'),
  setAlertRules: (rules: unknown[]) => ipcRenderer.invoke('set-alert-rules', rules),
  onSensorAlertFired: (callback: (payload: { rule: unknown; value: number }) => void) => {
    ipcRenderer.on('sensor-alert-fired', (_event, payload) => callback(payload));
  },

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
  onShortcutToggleMic: (callback: () => void) => {
    ipcRenderer.on('shortcut-toggle-mic', () => callback());
  },
  onShortcutSnapshot: (callback: () => void) => {
    ipcRenderer.on('shortcut-snapshot', () => callback());
  },
  onShortcutToggleTorch: (callback: () => void) => {
    ipcRenderer.on('shortcut-toggle-torch', () => callback());
  },
  onCameraSwitched: (callback: (id: string) => void) => {
    ipcRenderer.on('camera-switched', (_event, id) => callback(id));
  },
  onPhotoCaptured: (callback: (msg: unknown) => void) => {
    ipcRenderer.on('photo-captured', (_event, msg) => callback(msg));
  },
});
