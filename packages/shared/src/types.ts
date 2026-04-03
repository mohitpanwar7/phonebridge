// ── Camera ──

export interface CameraDevice {
  id: string;
  name: string;
  position: 'front' | 'back' | 'external';
  physicalDevices: PhysicalCameraType[];
  hasFlash: boolean;
  hasTorch: boolean;
  minZoom: number;
  maxZoom: number;
}

export type PhysicalCameraType =
  | 'ultra-wide-angle-camera'
  | 'wide-angle-camera'
  | 'telephoto-camera';

// ── Microphone ──

export interface MicrophoneDevice {
  id: string;
  name: string;
  source: AudioSourceType;
}

export type AudioSourceType =
  | 'DEFAULT'
  | 'MIC'
  | 'CAMCORDER'
  | 'VOICE_RECOGNITION'
  | 'VOICE_COMMUNICATION'
  | 'UNPROCESSED';

// ── Sensors ──

export type SensorType =
  | 'gps'
  | 'accelerometer'
  | 'gyroscope'
  | 'magnetometer'
  | 'barometer'
  | 'light'
  | 'proximity'
  | 'pedometer'
  | 'gravity'
  | 'rotation'
  | 'battery';

export interface GPSData {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  heading: number;
  accuracy: number;
}

export interface XYZData {
  x: number;
  y: number;
  z: number;
}

export interface RotationData {
  x: number;
  y: number;
  z: number;
  scalar: number;
}

export interface BarometerData {
  pressure: number;
  relativeAltitude: number;
}

export interface LightData {
  illuminance: number;
}

export interface ProximityData {
  isNear: boolean;
  distance: number;
}

export interface PedometerData {
  steps: number;
}

export interface BatteryData {
  level: number;
  isCharging: boolean;
  state: 'charging' | 'discharging' | 'full' | 'unknown';
}

export type SensorData =
  | GPSData
  | XYZData
  | RotationData
  | BarometerData
  | LightData
  | ProximityData
  | PedometerData
  | BatteryData;

export interface SensorReading<T extends SensorData = SensorData> {
  sensor: SensorType;
  timestamp: number;
  data: T;
}

// ── Settings ──

export interface StreamSettings {
  resolution: '480p' | '720p' | '1080p';
  fps: 15 | 24 | 30;
  videoCodec: 'H264' | 'VP8' | 'VP9';
  audioEnabled: boolean;
  audioSampleRate: 16000 | 44100 | 48000;
}

export interface SensorConfig {
  sensor: SensorType;
  enabled: boolean;
  intervalMs: number;
}

// ── Connection ──

export interface ConnectionInfo {
  ip: string;
  port: number;
  sessionId: string;
  appName: string;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'signaling'
  | 'connected'
  | 'streaming';
