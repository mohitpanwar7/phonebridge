import React, { useEffect, useRef, useState, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import { useWebRTC } from './hooks/useWebRTC';
import { AudioDecoder } from './audio/AudioDecoder';
import { VideoProcessor, type VideoEffects, DEFAULT_EFFECTS } from './video/VideoProcessor';
import { OnboardingOverlay, useOnboarding } from './components/OnboardingOverlay';
import { useNotifications } from './components/NotificationPanel';
import { applyTheme, getPreferredTheme } from './theme';
import type {
  ConnectionState,
  CameraDevice,
  MicrophoneDevice,
  SensorType,
} from '@phonebridge/shared';

interface DriverStatus {
  softcamReady: boolean;
  vbCableReady: boolean;
}

interface PhoneBridgeAPI {
  getConnectionInfo: () => Promise<{ ip: string; port: number; sessionId: string }>;
  sendCommand: (command: unknown) => Promise<void>;
  getSensorData: (sensor: string) => Promise<unknown>;
  getSensorHistory: (sensor: string, limit: number) => Promise<unknown>;
  onInit: (cb: (data: any) => void) => void;
  onPhoneConnected: (cb: (connected: boolean) => void) => void;
  onConnectionState: (cb: (state: string) => void) => void;
  onSignaling: (cb: (msg: any) => void) => void;
  onDeviceInfo: (cb: (info: any) => void) => void;
  onSensorData: (cb: (data: any) => void) => void;
  onPhoneStatus: (cb: (status: any) => void) => void;
  sendSignaling: (msg: unknown) => void;
  sendVideoFrame: (frameBuffer: ArrayBuffer, width: number, height: number) => void;
  sendAudioFrame: (frameBuffer: ArrayBuffer) => void;
  getDriverStatus: () => Promise<DriverStatus>;
  onDriverStatus: (cb: (status: DriverStatus) => void) => void;
}

declare global {
  interface Window {
    phoneBridge: PhoneBridgeAPI;
  }
}

const noop = () => {};
const noopAsync = () => Promise.resolve({} as any);
const mockBridge: PhoneBridgeAPI = {
  getConnectionInfo: noopAsync,
  sendCommand: noopAsync,
  getSensorData: noopAsync,
  getSensorHistory: noopAsync,
  getDriverStatus: () => Promise.resolve({ softcamReady: false, vbCableReady: false }),
  onInit: noop,
  onPhoneConnected: noop,
  onConnectionState: noop,
  onSignaling: noop,
  onDeviceInfo: noop,
  onSensorData: noop,
  onPhoneStatus: noop,
  onDriverStatus: noop,
  sendSignaling: noop,
  sendVideoFrame: noop,
  sendAudioFrame: noop,
};

function getBridge(): PhoneBridgeAPI {
  return window.phoneBridge ?? mockBridge;
}

export interface AppSettings {
  video: {
    resolution: '480p' | '720p' | '1080p' | '4K';
    fps: 15 | 24 | 30 | 60;
    codec: 'H264' | 'VP8' | 'VP9';
    bitrateKbps: number; // 0 = auto
  };
  audio: {
    enabled: boolean;
    sampleRate: 44100 | 48000;
    channels: 1 | 2;
    noiseSuppression: boolean;
    echoCancellation: boolean;
    speakerOutput: 'disabled' | 'vbcable';
  };
  sensors: Record<string, { enabled: boolean; intervalMs: number }>;
  connection: {
    autoReconnect: boolean;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  video: { resolution: '1080p', fps: 30, codec: 'H264', bitrateKbps: 0 },
  audio: {
    enabled: true,
    sampleRate: 48000,
    channels: 2,
    noiseSuppression: true,
    echoCancellation: true,
    speakerOutput: 'disabled',
  },
  sensors: {
    accelerometer: { enabled: true, intervalMs: 50 },
    gyroscope: { enabled: true, intervalMs: 50 },
    magnetometer: { enabled: true, intervalMs: 100 },
    barometer: { enabled: true, intervalMs: 1000 },
    light: { enabled: true, intervalMs: 200 },
    pedometer: { enabled: true, intervalMs: 1000 },
    gps: { enabled: true, intervalMs: 1000 },
    battery: { enabled: true, intervalMs: 10000 },
    proximity: { enabled: false, intervalMs: 500 },
  },
  connection: { autoReconnect: true },
};

export interface AppState {
  connectionState: ConnectionState;
  qrCode: string | null;
  ip: string;
  port: number;
  cameras: CameraDevice[];
  microphones: MicrophoneDevice[];
  sensors: SensorType[];
  activeCameraId: string | null;
  activeMicId: string | null;
  phoneModel: string;
  phonePlatform: string;
  batteryLevel: number;
  isCharging: boolean;
  sensorData: Record<string, { data: any; timestamp: number }>;
  driverStatus: DriverStatus;
}

export default function App() {
  // Phase 16: Theme
  const [themeMode, setThemeMode] = useState(() => getPreferredTheme());
  useEffect(() => {
    applyTheme(themeMode);
    localStorage.setItem('phonebridge-theme', themeMode);
  }, [themeMode]);

  // Phase 16: Notifications
  const { notifications, addNotification, clearNotifications } = useNotifications();

  // Phase 16: Onboarding
  const { showOnboarding, dismissOnboarding } = useOnboarding();

  const [state, setState] = useState<AppState>({
    connectionState: 'disconnected',
    qrCode: null,
    ip: '',
    port: 0,
    cameras: [],
    microphones: [],
    sensors: [],
    activeCameraId: null,
    activeMicId: null,
    phoneModel: '',
    phonePlatform: '',
    batteryLevel: 0,
    isCharging: false,
    sensorData: {},
    driverStatus: { softcamReady: false, vbCableReady: false },
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('phonebridge-settings');
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const frameLoopRef = useRef<number | null>(null);
  const audioDecoderRef = useRef<AudioDecoder>(new AudioDecoder());
  const videoProcessorRef = useRef<VideoProcessor>(new VideoProcessor());
  const [videoEffects, setVideoEffects] = useState<VideoEffects>(DEFAULT_EFFECTS);

  // ── Video frame capture → VideoProcessor → Softcam ───────────────────────
  const startFrameCapture = useCallback((stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    video.play().catch(() => {});

    video.onloadedmetadata = () => {
      // Stop any existing processor loop
      if (frameLoopRef.current) {
        cancelAnimationFrame(frameLoopRef.current);
        frameLoopRef.current = null;
      }
      videoProcessorRef.current.stop();

      // Start video processor — it handles effects, crop, recording
      videoProcessorRef.current.start(video, (imageData, w, h) => {
        getBridge().sendVideoFrame(imageData.data.buffer, w, h);
      });
    };

    // ── Audio → VB-Cable ─────────────────────────────────────────────────────
    if (stream.getAudioTracks().length > 0) {
      audioDecoderRef.current.start(stream).catch((err) => {
        console.warn('[App] AudioDecoder failed to start:', err);
      });
    }
  }, []);

  const { startSystemAudio, stopSystemAudio, setGain, setNoiseGateThreshold } = useWebRTC({ onTrack: startFrameCapture });

  // ── Bridge event handlers ──────────────────────────────────────────────────
  useEffect(() => {
    getBridge().onInit((data: any) => {
      setState((prev) => ({ ...prev, ip: data.ip, port: data.port, qrCode: data.qrCode }));
    });

    getBridge().onPhoneConnected((connected) => {
      setState((prev) => ({ ...prev, connectionState: connected ? 'connected' : 'disconnected' }));
      if (connected) {
        addNotification('Phone connected', 'info', '📱');
      } else {
        addNotification('Phone disconnected', 'warn', '📵');
        if (frameLoopRef.current) {
          cancelAnimationFrame(frameLoopRef.current);
          frameLoopRef.current = null;
        }
        audioDecoderRef.current.stop();
      }
    });

    getBridge().onDeviceInfo((info: any) => {
      setState((prev) => ({
        ...prev,
        cameras:      info.cameras      || [],
        microphones:  info.microphones  || [],
        sensors:      info.sensors      || [],
        phoneModel:   info.model        || '',
        phonePlatform: info.platform    || '',
        activeCameraId: info.cameras?.[0]?.id  || null,
        activeMicId:    info.microphones?.[0]?.id || null,
      }));
    });

    getBridge().onSensorData((data: any) => {
      if (data.type === 'sensor') {
        setState((prev) => ({
          ...prev,
          sensorData: { ...prev.sensorData, [data.sensor]: { data: data.data, timestamp: data.ts } },
        }));
      } else if (data.type === 'sensorBatch' && data.readings?.length) {
        const last = data.readings[data.readings.length - 1];
        setState((prev) => ({
          ...prev,
          sensorData: { ...prev.sensorData, [data.sensor]: { data: last.data, timestamp: last.ts } },
        }));
      }
    });

    getBridge().onPhoneStatus((status: any) => {
      setState((prev) => ({ ...prev, batteryLevel: status.battery, isCharging: status.isCharging }));
      if (status.battery < 0.1) {
        addNotification(`Battery critical: ${Math.round(status.battery * 100)}%`, 'error', '🔋');
      } else if (status.battery < 0.2) {
        addNotification(`Battery low: ${Math.round(status.battery * 100)}%`, 'warn', '🔋');
      }
    });

    getBridge().onDriverStatus((status) => {
      setState((prev) => ({ ...prev, driverStatus: status }));
    });

    // Load initial driver status
    getBridge().getDriverStatus().then((status) => {
      setState((prev) => ({ ...prev, driverStatus: status }));
    }).catch(() => {});

    return () => {
      if (frameLoopRef.current) cancelAnimationFrame(frameLoopRef.current);
      videoProcessorRef.current.stop();
      audioDecoderRef.current.stop();
    };
  }, []);

  // ── Commands ───────────────────────────────────────────────────────────────
  const switchCamera = (deviceId: string) => {
    getBridge().sendCommand({ cmd: 'switchCamera', deviceId });
    setState((prev) => ({ ...prev, activeCameraId: deviceId }));
  };

  const switchMic = (source: string) => {
    getBridge().sendCommand({ cmd: 'switchMic', source });
    setState((prev) => ({ ...prev, activeMicId: source }));
  };

  const setTorch = (enabled: boolean) => {
    getBridge().sendCommand({ cmd: 'setTorch', enabled });
  };

  const setZoom = (level: number) => {
    getBridge().sendCommand({ cmd: 'setZoom', level });
  };

  const sendCommand = (cmd: object) => {
    getBridge().sendCommand(cmd);
  };

  const applyVideoEffects = useCallback((effects: Partial<VideoEffects>) => {
    videoProcessorRef.current.setEffects(effects);
    setVideoEffects(videoProcessorRef.current.getEffects());
  }, []);

  const takeSnapshot = useCallback(() => {
    const dataURL = videoProcessorRef.current.snapshot();
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `phonebridge-snapshot-${Date.now()}.png`;
    a.click();
  }, []);

  const applySettings = useCallback((next: AppSettings) => {
    setSettings(next);
    try { localStorage.setItem('phonebridge-settings', JSON.stringify(next)); } catch {}

    const resMap: Record<string, { w: number; h: number }> = {
      '480p':  { w: 854,  h: 480  },
      '720p':  { w: 1280, h: 720  },
      '1080p': { w: 1920, h: 1080 },
      '4K':    { w: 3840, h: 2160 },
    };
    const { w, h } = resMap[next.video.resolution];
    getBridge().sendCommand({
      cmd: 'setVideoQuality', width: w, height: h,
      fps: next.video.fps, codec: next.video.codec, bitrateKbps: next.video.bitrateKbps,
    });
    getBridge().sendCommand({
      cmd: 'setAudioQuality',
      enabled: next.audio.enabled,
      sampleRate: next.audio.sampleRate,
      channels: next.audio.channels,
      noiseSuppression: next.audio.noiseSuppression,
      echoCancellation: next.audio.echoCancellation,
    });
    Object.entries(next.sensors).forEach(([sensor, cfg]) => {
      getBridge().sendCommand({ cmd: 'enableSensor', sensor, enabled: cfg.enabled });
      getBridge().sendCommand({ cmd: 'setSensorRate', sensor, intervalMs: cfg.intervalMs });
    });
  }, []);

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {showOnboarding && <OnboardingOverlay onDone={dismissOnboarding} />}
      <Dashboard
        state={state}
        settings={settings}
        videoRef={videoRef}
        onSwitchCamera={switchCamera}
        onSwitchMic={switchMic}
        onSettingsChange={applySettings}
        onTorch={setTorch}
        onZoom={setZoom}
        onCommand={sendCommand}
        onStartSystemAudio={startSystemAudio}
        onStopSystemAudio={stopSystemAudio}
        onSetGain={setGain}
        onSetNoiseGate={setNoiseGateThreshold}
        videoEffects={videoEffects}
        onVideoEffects={applyVideoEffects}
        onSnapshot={takeSnapshot}
        notifications={notifications}
        onClearNotifications={clearNotifications}
        themeMode={themeMode}
        onThemeToggle={() => setThemeMode((m) => m === 'dark' ? 'light' : 'dark')}
      />
    </>
  );
}
