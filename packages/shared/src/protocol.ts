import type {
  CameraDevice,
  MicrophoneDevice,
  SensorType,
  SensorData,
  SensorReading,
  StreamSettings,
  NFCTag,
  NFCNdefRecord,
} from './types';

// ── Signaling Messages (WebSocket) ──

export interface SignalingOffer {
  type: 'offer';
  sdp: string;
}

export interface SignalingAnswer {
  type: 'answer';
  sdp: string;
}

export interface SignalingCandidate {
  type: 'candidate';
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export type SignalingMessage = SignalingOffer | SignalingAnswer | SignalingCandidate;

// ── DataChannel Messages (Phone → Desktop) ──

export interface DeviceInfoMessage {
  type: 'deviceInfo';
  cameras: CameraDevice[];
  microphones: MicrophoneDevice[];
  sensors: SensorType[];
  platform: 'android' | 'ios';
  model: string;
}

export interface SensorMessage {
  type: 'sensor';
  sensor: SensorType;
  ts: number;
  data: SensorData;
}

export interface SensorBatchMessage {
  type: 'sensorBatch';
  sensor: SensorType;
  readings: Array<{ ts: number; data: SensorData }>;
}

export interface StatusMessage {
  type: 'status';
  battery: number;
  isCharging: boolean;
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
}

// ── NFC Messages (Phone → Desktop) ──

export interface NFCTagScannedMessage {
  type: 'nfcTagScanned';
  tag: NFCTag;
}

export interface NFCWriteResultMessage {
  type: 'nfcWriteResult';
  success: boolean;
  error?: string;
}

export interface NFCSavedTagsMessage {
  type: 'nfcSavedTags';
  tags: NFCTag[];
}

export interface NFCReplayStatusMessage {
  type: 'nfcReplayStatus';
  active: boolean;
  tagId?: string;
  tagName?: string;
}

export type PhoneToDesktopMessage =
  | DeviceInfoMessage
  | SensorMessage
  | SensorBatchMessage
  | StatusMessage
  | NFCTagScannedMessage
  | NFCWriteResultMessage
  | NFCSavedTagsMessage
  | NFCReplayStatusMessage
  | PhotoCapturedMessage;

// ── DataChannel Messages (Desktop → Phone) ──

export interface SwitchCameraCommand {
  cmd: 'switchCamera';
  deviceId: string;
}

export interface SwitchMicCommand {
  cmd: 'switchMic';
  source: string;
}

export interface SetSensorRateCommand {
  cmd: 'setSensorRate';
  sensor: SensorType;
  intervalMs: number;
}

export interface EnableSensorCommand {
  cmd: 'enableSensor';
  sensor: SensorType;
  enabled: boolean;
}

export interface UpdateSettingsCommand {
  cmd: 'updateSettings';
  settings: Partial<StreamSettings>;
}

export interface EnableSpeakerCommand {
  cmd: 'enableSpeaker';
  enabled: boolean;
}

export interface SetTorchCommand {
  cmd: 'setTorch';
  enabled: boolean;
}

export interface SetZoomCommand {
  cmd: 'setZoom';
  level: number; // 1.0 = no zoom, up to 10.0
}

export interface SetFocusCommand {
  cmd: 'setFocus';
  x: number; // normalized 0–1
  y: number; // normalized 0–1
}

export interface SetExposureCommand {
  cmd: 'setExposure';
  compensation: number; // -3 to +3 EV
}

export interface SetWhiteBalanceCommand {
  cmd: 'setWhiteBalance';
  temperature: number; // Kelvin, e.g. 2700–8000, or 0 = auto
}

export interface TakePhotoCommand {
  cmd: 'takePhoto';
}

export interface SetNightModeCommand {
  cmd: 'setNightMode';
  enabled: boolean;
}

export interface SetGridCommand {
  cmd: 'setGrid';
  enabled: boolean;
}

export interface SetOrientationLockCommand {
  cmd: 'setOrientationLock';
  orientation: 'portrait' | 'landscape' | 'auto';
}

// Photo captured on phone → Desktop
export interface PhotoCapturedMessage {
  type: 'photoCaptured';
  dataURL: string; // base64 JPEG
  width: number;
  height: number;
  timestamp: number;
}

// ── NFC Commands (Desktop → Phone) ──

export interface NFCStartScanCommand   { cmd: 'nfcStartScan'; }
export interface NFCStopScanCommand    { cmd: 'nfcStopScan'; }
export interface NFCWriteCommand       { cmd: 'nfcWrite'; records: NFCNdefRecord[]; }
export interface NFCReplayCommand      { cmd: 'nfcReplay'; tagId: string; }
export interface NFCStopReplayCommand  { cmd: 'nfcStopReplay'; }
export interface NFCDeleteTagCommand   { cmd: 'nfcDeleteTag'; tagId: string; }
export interface NFCUpdateTagCommand   { cmd: 'nfcUpdateTag'; tagId: string; name?: string; notes?: string; }
export interface NFCRequestTagsCommand { cmd: 'nfcRequestTags'; }

export interface SetPrivacyModeCommand {
  cmd: 'setPrivacyMode';
  enabled: boolean;
}

export interface SetVideoQualityCommand {
  cmd: 'setVideoQuality';
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrateKbps: number;
}

export interface SetAudioQualityCommand {
  cmd: 'setAudioQuality';
  enabled: boolean;
  sampleRate: number;
  channels: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
}

export type DesktopToPhoneCommand =
  | SwitchCameraCommand
  | SwitchMicCommand
  | SetSensorRateCommand
  | EnableSensorCommand
  | UpdateSettingsCommand
  | EnableSpeakerCommand
  | SetTorchCommand
  | SetZoomCommand
  | SetFocusCommand
  | SetExposureCommand
  | SetWhiteBalanceCommand
  | TakePhotoCommand
  | SetNightModeCommand
  | SetGridCommand
  | SetOrientationLockCommand
  | NFCStartScanCommand
  | NFCStopScanCommand
  | NFCWriteCommand
  | NFCReplayCommand
  | NFCStopReplayCommand
  | NFCDeleteTagCommand
  | NFCUpdateTagCommand
  | NFCRequestTagsCommand
  | SetPrivacyModeCommand
  | SetVideoQualityCommand
  | SetAudioQualityCommand;
