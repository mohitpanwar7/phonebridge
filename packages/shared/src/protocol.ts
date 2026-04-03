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
  | NFCReplayStatusMessage;

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

// ── NFC Commands (Desktop → Phone) ──

export interface NFCStartScanCommand   { cmd: 'nfcStartScan'; }
export interface NFCStopScanCommand    { cmd: 'nfcStopScan'; }
export interface NFCWriteCommand       { cmd: 'nfcWrite'; records: NFCNdefRecord[]; }
export interface NFCReplayCommand      { cmd: 'nfcReplay'; tagId: string; }
export interface NFCStopReplayCommand  { cmd: 'nfcStopReplay'; }
export interface NFCDeleteTagCommand   { cmd: 'nfcDeleteTag'; tagId: string; }
export interface NFCUpdateTagCommand   { cmd: 'nfcUpdateTag'; tagId: string; name?: string; notes?: string; }
export interface NFCRequestTagsCommand { cmd: 'nfcRequestTags'; }

export type DesktopToPhoneCommand =
  | SwitchCameraCommand
  | SwitchMicCommand
  | SetSensorRateCommand
  | EnableSensorCommand
  | UpdateSettingsCommand
  | EnableSpeakerCommand
  | NFCStartScanCommand
  | NFCStopScanCommand
  | NFCWriteCommand
  | NFCReplayCommand
  | NFCStopReplayCommand
  | NFCDeleteTagCommand
  | NFCUpdateTagCommand
  | NFCRequestTagsCommand;
