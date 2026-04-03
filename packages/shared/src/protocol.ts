import type {
  CameraDevice,
  MicrophoneDevice,
  SensorType,
  SensorData,
  SensorReading,
  StreamSettings,
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

export type PhoneToDesktopMessage =
  | DeviceInfoMessage
  | SensorMessage
  | SensorBatchMessage
  | StatusMessage;

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

export type DesktopToPhoneCommand =
  | SwitchCameraCommand
  | SwitchMicCommand
  | SetSensorRateCommand
  | EnableSensorCommand
  | UpdateSettingsCommand
  | EnableSpeakerCommand;
