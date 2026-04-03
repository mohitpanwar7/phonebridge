import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  AppState,
  AppStateStatus,
  Animated,
  Pressable,
  Modal,
  NativeModules,
} from 'react-native';

// Start/stop Android foreground streaming service
function startForegroundService() {
  if (Platform.OS === 'android' && NativeModules.StreamingServiceModule) {
    NativeModules.StreamingServiceModule.start();
  }
}
function stopForegroundService() {
  if (Platform.OS === 'android' && NativeModules.StreamingServiceModule) {
    NativeModules.StreamingServiceModule.stop();
  }
}
import { RTCView } from 'react-native-webrtc';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Battery from 'expo-battery';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { SignalingClient } from '../services/SignalingClient';
import { WebRTCManager } from '../services/WebRTCManager';
import type { ConnectionQuality } from '../services/WebRTCManager';
import { SensorManager } from '../sensors/SensorManager';
import { CameraManager } from '../camera/CameraManager';
import { MicrophoneManager } from '../audio/MicrophoneManager';
import type {
  SensorType,
  SensorData,
  DeviceInfoMessage,
  CameraDevice,
  MicrophoneDevice,
} from '@phonebridge/shared';
import { StreamProvider } from '../context/StreamContext';
import { connectionHistory } from '../utils/ConnectionHistory';

type Props = NativeStackScreenProps<RootStackParamList, 'Stream'>;

const CONTROL_HIDE_DELAY = 4000;

// ── Signal bars indicator ──────────────────────────────────────────────────
function SignalBars({ bars }: { bars: 1 | 2 | 3 | 4 }) {
  const color = bars >= 3 ? '#4ade80' : bars === 2 ? '#f59e0b' : '#f87171';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginRight: 4 }}>
      {([1, 2, 3, 4] as const).map((b) => (
        <View
          key={b}
          style={{
            width: 3,
            height: 4 + b * 3,
            borderRadius: 1.5,
            backgroundColor: b <= bars ? color : 'rgba(255,255,255,0.2)',
          }}
        />
      ))}
    </View>
  );
}

export default function StreamScreen({ route, navigation }: Props) {
  const { ip, port } = route.params;

  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [activeSensors, setActiveSensors] = useState(0);

  // Camera / mic state
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [currentCamera, setCurrentCamera] = useState<string>('environment');
  const [currentMic, setCurrentMic] = useState<string>('DEFAULT');

  // Controls
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [showCameraPicker, setShowCameraPicker] = useState(false);
  const [showMicPicker, setShowMicPicker] = useState(false);

  // Connection quality
  const [quality, setQuality] = useState<ConnectionQuality | null>(null);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase 10: Battery & thermal
  const [batteryLevel, setBatteryLevel] = useState(1.0);
  const batteryModeRef = useRef<'normal' | 'low' | 'critical'>('normal');

  // Phase 6 features
  const [showGrid, setShowGrid] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [exposureComp, setExposureComp] = useState(0);
  const [focusIndicator, setFocusIndicator] = useState<{ x: number; y: number } | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase 14: Privacy mode
  const [privacyMode, setPrivacyMode] = useState(false);

  // Animated opacity for floating control bar
  const controlsAnim = useRef(new Animated.Value(1)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Service refs
  const signalingRef = useRef<SignalingClient | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const sensorRef = useRef<SensorManager | null>(null);
  const cameraManagerRef = useRef(new CameraManager());
  const micManagerRef = useRef(new MicrophoneManager());

  // ── Control bar auto-hide ──────────────────────────────────────────────────
  const showAndResetTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    Animated.timing(controlsAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(controlsAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, CONTROL_HIDE_DELAY);
  }, [controlsAnim]);

  // ── Background handling ────────────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        sensorRef.current?.setSensorRate('accelerometer', 500);
        sensorRef.current?.setSensorRate('gyroscope', 500);
      } else if (nextState === 'active') {
        sensorRef.current?.setSensorRate('accelerometer', 50);
        sensorRef.current?.setSensorRate('gyroscope', 50);
      }
    });
    return () => sub.remove();
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  // Battery monitoring
  useEffect(() => {
    let subscription: Battery.Subscription | null = null;
    Battery.getBatteryLevelAsync().then((level) => {
      setBatteryLevel(level);
      applyBatteryMode(level);
    }).catch(() => {});

    subscription = Battery.addBatteryLevelListener(({ batteryLevel: level }) => {
      setBatteryLevel(level);
      applyBatteryMode(level);
    });
    return () => subscription?.remove();
  }, []);

  const applyBatteryMode = (level: number) => {
    const newMode = level < 0.1 ? 'critical' : level < 0.2 ? 'low' : 'normal';
    if (newMode === batteryModeRef.current) return;
    batteryModeRef.current = newMode;
    if (newMode === 'critical') {
      // Disable non-essential sensors, minimum quality
      webrtcRef.current?.applyVideoQuality(854, 480, 15);
      sensorRef.current?.setSensorRate('accelerometer', 1000);
      sensorRef.current?.setSensorRate('gyroscope', 1000);
      sensorRef.current?.enableSensor('light', false);
      sensorRef.current?.enableSensor('magnetometer', false);
      console.log('[Battery] Critical mode — minimum quality');
    } else if (newMode === 'low') {
      // Reduce quality
      webrtcRef.current?.applyVideoQuality(854, 480, 15);
      sensorRef.current?.setSensorRate('accelerometer', 200);
      console.log('[Battery] Low mode — reduced quality');
    }
  };

  useEffect(() => {
    showAndResetTimer();
    startConnection();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      // Unlock orientation on unmount
      ScreenOrientation.unlockAsync().catch(() => {});
      cleanup();
    };
  }, []);

  // ── Connection start ───────────────────────────────────────────────────────
  const startConnection = async () => {
    try {
      const cams = await cameraManagerRef.current.initialize();
      const mics = micManagerRef.current.getAvailableMicrophones();
      setCameras(cams);
      setMicrophones(mics);

      const wsUrl = `ws://${ip}:${port}`;
      const signaling = new SignalingClient(wsUrl);
      signalingRef.current = signaling;

      // Reconnect countdown
      signaling.onReconnecting((delayMs, attempt) => {
        let remaining = Math.ceil(delayMs / 1000);
        setReconnectCountdown(remaining);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            setReconnectCountdown(null);
            if (countdownRef.current) clearInterval(countdownRef.current);
          } else {
            setReconnectCountdown(remaining);
          }
        }, 1000);
      });

      let webrtcStarted = false;
      signaling.onStateChange(async (isConnected) => {
        setConnected(isConnected);
        if (!isConnected) {
          setStreaming(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          return;
        }
        // Clear reconnect countdown
        setReconnectCountdown(null);
        if (countdownRef.current) clearInterval(countdownRef.current);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        connectionHistory.recordSuccess(ip, port, `PhoneBridge PC (${ip})`).catch(() => {});

        if (webrtcStarted) return;
        webrtcStarted = true;
        try {
          const webrtc = new WebRTCManager(signaling);
          webrtcRef.current = webrtc;
          webrtc.onDataChannelMessage((msg) => handleDesktopCommand(msg));
          await webrtc.start();
          webrtc.startQualityMonitor((q) => setQuality(q));

          const localStream = webrtc.getLocalStream();
          if (localStream) setLocalStreamURL(localStream.toURL());

          const deviceInfo: DeviceInfoMessage = {
            type: 'deviceInfo',
            cameras: cams,
            microphones: mics,
            sensors: [],
            platform: Platform.OS as 'android' | 'ios',
            model: `${Platform.OS} device`,
          };
          signaling.send(deviceInfo);

          // Periodic status reporting (battery + thermal)
          statusIntervalRef.current = setInterval(async () => {
            try {
              const level = await Battery.getBatteryLevelAsync();
              const charging = await Battery.getBatteryStateAsync();
              const isCharging = charging === Battery.BatteryState.CHARGING || charging === Battery.BatteryState.FULL;
              signaling.send({
                type: 'status',
                battery: level,
                isCharging,
                thermalState: 'nominal', // thermal API not available in Expo standard
              });
            } catch { /* ignore */ }
          }, 15000);

          const sensorManager = new SensorManager(
            (sensor: SensorType, data: SensorData, timestamp: number) => {
              signaling.send({ type: 'sensor', sensor, ts: timestamp, data });
            }
          );
          sensorRef.current = sensorManager;
          sensorManager.setBatchCallback((sensor, readings) => {
            signaling.send({ type: 'sensorBatch', sensor, readings });
          });
          sensorManager.startAll();
          setActiveSensors(sensorManager.getAvailableSensors().length);
          setStreaming(true);
          startForegroundService();
        } catch (err) {
          console.error('WebRTC start error:', err);
          Alert.alert('Error', 'Failed to start streaming');
        }
      });

      signaling.connect();
    } catch (err) {
      console.error('Connection error:', err);
      Alert.alert('Error', 'Failed to connect to desktop');
    }
  };

  // ── Desktop command handler ────────────────────────────────────────────────
  const handleDesktopCommand = (msg: any) => {
    switch (msg.cmd) {
      case 'switchCamera':
        webrtcRef.current?.switchCamera(msg.deviceId);
        setCurrentCamera(msg.deviceId);
        setTorchEnabled(false);
        setZoomLevel(1.0);
        break;
      case 'switchMic':
        micManagerRef.current.setSource(msg.source);
        webrtcRef.current?.switchMicrophone(msg.source);
        setCurrentMic(msg.source);
        break;
      case 'setSensorRate':
        sensorRef.current?.setSensorRate(msg.sensor, msg.intervalMs);
        break;
      case 'enableSensor':
        sensorRef.current?.enableSensor(msg.sensor, msg.enabled);
        break;
      case 'setVideoQuality':
        webrtcRef.current?.applyVideoQuality(msg.width, msg.height, msg.fps);
        break;
      case 'setTorch':
        webrtcRef.current?.setTorch(msg.enabled);
        setTorchEnabled(msg.enabled);
        break;
      case 'setZoom':
        webrtcRef.current?.setZoom(msg.level);
        setZoomLevel(msg.level);
        break;
      case 'setFocus':
        handleTapToFocus(msg.x, msg.y);
        break;
      case 'setExposure':
        setExposureComp(msg.compensation);
        break;
      case 'takePhoto':
        capturePhoto();
        break;
      case 'setNightMode':
        setNightMode(msg.enabled);
        break;
      case 'setGrid':
        setShowGrid(msg.enabled);
        break;
      case 'setOrientationLock':
        applyOrientationLock(msg.orientation);
        break;
      case 'setPrivacyMode':
        setPrivacyMode(msg.enabled);
        // Mute/unmute local audio track
        webrtcRef.current?.getLocalStream()?.getAudioTracks().forEach((t) => {
          t.enabled = !msg.enabled;
        });
        break;
    }
  };

  // ── User actions ───────────────────────────────────────────────────────────
  const switchCamera = async (cameraId: string) => {
    await webrtcRef.current?.switchCamera(cameraId);
    setCurrentCamera(cameraId);
    setTorchEnabled(false);
    setZoomLevel(1.0);
    setShowCameraPicker(false);
    showAndResetTimer();
  };

  const switchMic = async (micSource: string) => {
    micManagerRef.current.setSource(micSource);
    await webrtcRef.current?.switchMicrophone(micSource);
    setCurrentMic(micSource);
    setShowMicPicker(false);
    showAndResetTimer();
  };

  const flipCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const next = currentCamera === 'environment' ? 'user' : 'environment';
    await switchCamera(next);
  };

  const toggleTorch = async () => {
    const next = !torchEnabled;
    setTorchEnabled(next);
    await webrtcRef.current?.setTorch(next);
    showAndResetTimer();
  };

  const adjustZoom = async (delta: number) => {
    const next = parseFloat(Math.max(1.0, Math.min(10.0, zoomLevel + delta)).toFixed(1));
    setZoomLevel(next);
    await webrtcRef.current?.setZoom(next);
    showAndResetTimer();
  };

  const handleTapToFocus = async (normX: number, normY: number) => {
    // Show focus indicator
    setFocusIndicator({ x: normX, y: normY });
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => setFocusIndicator(null), 1500);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Apply constraints
    const videoTrack = webrtcRef.current?.getLocalStream()?.getVideoTracks()[0];
    if (videoTrack) {
      try {
        await (videoTrack as any).applyConstraints({
          advanced: [{ pointOfInterest: { x: normX, y: normY }, focusMode: 'manual' }],
        });
      } catch { /* not supported on all devices */ }
    }
  };

  const capturePhoto = async () => {
    const videoTrack = webrtcRef.current?.getLocalStream()?.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      const imageCapture = new (globalThis as any).ImageCapture(videoTrack);
      const bitmap = await imageCapture.grabFrame();
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      const dataURL = canvas.toDataURL('image/jpeg', 0.9);
      signalingRef.current?.send({
        type: 'photoCaptured',
        dataURL,
        width: bitmap.width,
        height: bitmap.height,
        timestamp: Date.now(),
      } as any);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch { /* ImageCapture not available on RN, this is handled natively */ }
  };

  const applyOrientationLock = async (orientation: 'portrait' | 'landscape' | 'auto') => {
    try {
      if (orientation === 'portrait') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } else if (orientation === 'landscape') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientation.unlockAsync();
      }
    } catch { /* not supported */ }
  };

  const handleVideoTap = async (evt: any) => {
    if (!streaming) return;
    showAndResetTimer();
    // Calculate normalized tap position for tap-to-focus
    const { locationX, locationY } = evt.nativeEvent;
    // We need the video element dimensions - use layout info from the View
    // Use a simplified approach: estimate from the RTCView's size
    const normX = locationX / 300; // will be updated with onLayout
    const normY = locationY / 500;
    await handleTapToFocus(Math.max(0, Math.min(1, normX)), Math.max(0, Math.min(1, normY)));
  };

  const disconnect = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    cleanup();
    navigation.goBack();
  };

  const cleanup = () => {
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    sensorRef.current?.stopAll();
    webrtcRef.current?.stop();
    signalingRef.current?.disconnect();
    stopForegroundService();
  };

  // ── Stream context ─────────────────────────────────────────────────────────
  const streamContextValue = {
    signaling: signalingRef.current,
    webrtc: webrtcRef.current,
    sensorManager: sensorRef.current,
    micManager: micManagerRef.current,
    sendCommand: (cmd: object) => signalingRef.current?.send(cmd as any),
  };

  const isFrontCamera = currentCamera === 'user' || currentCamera === 'front';

  return (
    <StreamProvider value={streamContextValue}>
      <Pressable style={styles.container} onPress={showAndResetTimer} onTouchEnd={handleVideoTap}>
        {/* Full-screen camera preview */}
        <View style={StyleSheet.absoluteFill}>
          {localStreamURL ? (
            <RTCView
              streamURL={localStreamURL}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
              mirror={isFrontCamera}
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {streaming ? 'Starting camera…' : connected ? 'Initializing…' : 'Connecting…'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Grid overlay ── */}
        {showGrid && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Rule-of-thirds: 2 horizontal + 2 vertical lines */}
            <View style={[styles.gridLine, styles.gridHoriz, { top: '33.33%' }]} />
            <View style={[styles.gridLine, styles.gridHoriz, { top: '66.66%' }]} />
            <View style={[styles.gridLine, styles.gridVert, { left: '33.33%' }]} />
            <View style={[styles.gridLine, styles.gridVert, { left: '66.66%' }]} />
          </View>
        )}

        {/* ── Focus indicator ── */}
        {focusIndicator && (
          <View
            style={[styles.focusBox, {
              left: `${focusIndicator.x * 100}%`,
              top: `${focusIndicator.y * 100}%`,
              transform: [{ translateX: -24 }, { translateY: -24 }],
            }]}
            pointerEvents="none"
          />
        )}

        {/* ── Top overlay: status pills ── */}
        <Animated.View style={[styles.topBar, { opacity: controlsAnim }]} pointerEvents="none">
          <View style={styles.pill}>
            <View style={[styles.dot, connected ? styles.dotGreen : styles.dotRed]} />
            <Text style={styles.pillText}>
              {streaming ? 'Live' : connected ? 'Connected' : 'Connecting…'}
            </Text>
          </View>

          {/* Signal quality bars */}
          {quality && (
            <View style={styles.pill}>
              <SignalBars bars={quality.bars} />
              <Text style={styles.pillText}>{quality.rttMs.toFixed(0)}ms</Text>
            </View>
          )}

          {streaming && (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{activeSensors} sensors</Text>
            </View>
          )}
          {torchEnabled && (
            <View style={[styles.pill, styles.pillAmber]}>
              <Text style={styles.pillText}>🔦 Torch</Text>
            </View>
          )}
          <View style={styles.pill}>
            <Text style={styles.pillText}>{zoomLevel.toFixed(1)}×</Text>
          </View>
          {/* Battery indicator (show when below 30%) */}
          {batteryLevel < 0.3 && (
            <View style={[styles.pill, batteryLevel < 0.1 ? styles.pillRed : styles.pillAmber]}>
              <Text style={styles.pillText}>
                🔋 {Math.round(batteryLevel * 100)}%
                {batteryLevel < 0.1 ? ' (Critical!)' : batteryLevel < 0.2 ? ' (Low)' : ''}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* ── Privacy mode overlay ── */}
        {privacyMode && (
          <View style={styles.privacyOverlay} pointerEvents="none">
            <Text style={styles.privacyIcon}>🔒</Text>
            <Text style={styles.privacyText}>Camera Paused</Text>
          </View>
        )}

        {/* ── Reconnect countdown overlay ── */}
        {reconnectCountdown !== null && (
          <View style={styles.reconnectOverlay} pointerEvents="none">
            <Text style={styles.reconnectText}>
              Reconnecting in {reconnectCountdown}s…
            </Text>
          </View>
        )}

        {/* ── Bottom floating controls bar ── */}
        <Animated.View style={[styles.controlsBar, { opacity: controlsAnim }]}>
          {/* Camera picker */}
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => { setShowCameraPicker(true); showAndResetTimer(); }}
          >
            <Text style={styles.ctrlIcon}>📷</Text>
            <Text style={styles.ctrlLabel}>Camera</Text>
          </TouchableOpacity>

          {/* Mic picker */}
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => { setShowMicPicker(true); showAndResetTimer(); }}
          >
            <Text style={styles.ctrlIcon}>🎙</Text>
            <Text style={styles.ctrlLabel}>Mic</Text>
          </TouchableOpacity>

          {/* Torch */}
          <TouchableOpacity
            style={[styles.ctrlBtn, torchEnabled && styles.ctrlBtnActive]}
            onPress={toggleTorch}
          >
            <Text style={styles.ctrlIcon}>🔦</Text>
            <Text style={styles.ctrlLabel}>{torchEnabled ? 'On' : 'Off'}</Text>
          </TouchableOpacity>

          {/* Zoom out */}
          <TouchableOpacity
            style={[styles.ctrlBtn, zoomLevel <= 1.0 && styles.ctrlBtnDim]}
            onPress={() => adjustZoom(-0.5)}
          >
            <Text style={styles.ctrlZoom}>−</Text>
            <Text style={styles.ctrlLabel}>{zoomLevel.toFixed(1)}×</Text>
          </TouchableOpacity>

          {/* Zoom in */}
          <TouchableOpacity
            style={[styles.ctrlBtn, zoomLevel >= 10.0 && styles.ctrlBtnDim]}
            onPress={() => adjustZoom(0.5)}
          >
            <Text style={styles.ctrlZoom}>+</Text>
            <Text style={styles.ctrlLabel}>Zoom</Text>
          </TouchableOpacity>

          {/* Flip */}
          <TouchableOpacity style={styles.ctrlBtn} onPress={flipCamera}>
            <Text style={styles.ctrlIcon}>🔄</Text>
            <Text style={styles.ctrlLabel}>Flip</Text>
          </TouchableOpacity>

          {/* Privacy */}
          <TouchableOpacity
            style={[styles.ctrlBtn, privacyMode && styles.ctrlBtnActive]}
            onPress={() => {
              const next = !privacyMode;
              setPrivacyMode(next);
              webrtcRef.current?.getLocalStream()?.getAudioTracks().forEach((t) => { t.enabled = !next; });
              signalingRef.current?.send({ cmd: 'setPrivacyMode', enabled: next } as any);
              showAndResetTimer();
            }}
          >
            <Text style={styles.ctrlIcon}>🔒</Text>
            <Text style={styles.ctrlLabel}>{privacyMode ? 'Private' : 'Privacy'}</Text>
          </TouchableOpacity>

          {/* NFC */}
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => { navigation.navigate('NFC'); }}
          >
            <Text style={styles.ctrlIcon}>📡</Text>
            <Text style={styles.ctrlLabel}>NFC</Text>
          </TouchableOpacity>

          {/* Stop */}
          <TouchableOpacity style={[styles.ctrlBtn, styles.ctrlBtnStop]} onPress={disconnect}>
            <Text style={styles.ctrlIcon}>⏹</Text>
            <Text style={styles.ctrlLabel}>Stop</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Connection info chip */}
        <View style={styles.connInfo} pointerEvents="none">
          <Text style={styles.connInfoText}>{ip}:{port}</Text>
        </View>
      </Pressable>

      {/* ── Camera Picker Modal ── */}
      <Modal
        visible={showCameraPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCameraPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCameraPicker(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select Camera</Text>
            {cameras.length > 0 ? (
              cameras.map((cam) => (
                <TouchableOpacity
                  key={cam.id}
                  style={[styles.sheetItem, cam.id === currentCamera && styles.sheetItemActive]}
                  onPress={() => switchCamera(cam.id)}
                >
                  <Text style={[styles.sheetItemText, cam.id === currentCamera && styles.sheetItemTextActive]}>
                    {cam.name}
                  </Text>
                  <Text style={styles.sheetItemSub}>{cam.position ?? ''}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.sheetItem, currentCamera === 'user' && styles.sheetItemActive]}
                  onPress={() => switchCamera('user')}
                >
                  <Text style={[styles.sheetItemText, currentCamera === 'user' && styles.sheetItemTextActive]}>
                    Front Camera
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetItem, currentCamera === 'environment' && styles.sheetItemActive]}
                  onPress={() => switchCamera('environment')}
                >
                  <Text style={[styles.sheetItemText, currentCamera === 'environment' && styles.sheetItemTextActive]}>
                    Back Camera
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Mic Picker Modal ── */}
      <Modal
        visible={showMicPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMicPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMicPicker(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select Microphone</Text>
            {microphones.map((mic) => (
              <TouchableOpacity
                key={mic.id}
                style={[styles.sheetItem, mic.source === currentMic && styles.sheetItemActive]}
                onPress={() => switchMic(mic.source)}
              >
                <Text style={[styles.sheetItemText, mic.source === currentMic && styles.sheetItemTextActive]}>
                  {mic.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </StreamProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090b',
  },
  placeholderText: {
    color: '#52525b',
    fontSize: 16,
  },

  // Top overlay
  topBar: {
    position: 'absolute',
    top: 48,
    left: 12,
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  pillAmber: {
    backgroundColor: 'rgba(245,158,11,0.25)',
  },
  pillRed: {
    backgroundColor: 'rgba(239,68,68,0.3)',
  },
  pillText: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '500',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotGreen: { backgroundColor: '#4ade80' },
  dotRed: { backgroundColor: '#f87171' },

  // Floating control bar
  controlsBar: {
    position: 'absolute',
    bottom: 32,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'rgba(9,9,11,0.75)',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ctrlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 14,
    minWidth: 38,
  },
  ctrlBtnActive: {
    backgroundColor: 'rgba(245,158,11,0.25)',
  },
  ctrlBtnDim: {
    opacity: 0.35,
  },
  ctrlBtnStop: {
    backgroundColor: 'rgba(127,29,29,0.7)',
    borderRadius: 14,
    paddingHorizontal: 8,
  },
  ctrlIcon: {
    fontSize: 20,
  },
  ctrlZoom: {
    fontSize: 22,
    color: '#e4e4e7',
    fontWeight: '700',
    lineHeight: 24,
  },
  ctrlLabel: {
    color: '#a1a1aa',
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },

  // Connection info chip
  connInfo: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
  },
  connInfoText: {
    color: 'rgba(161,161,170,0.5)',
    fontSize: 10,
    fontFamily: 'monospace',
  },

  // Grid overlay
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  gridHoriz: {
    left: 0, right: 0, height: StyleSheet.hairlineWidth,
  },
  gridVert: {
    top: 0, bottom: 0, width: StyleSheet.hairlineWidth,
  },

  // Focus box
  focusBox: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderRadius: 4,
  },

  // Privacy mode overlay
  privacyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f0f13',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  privacyText: {
    color: '#8888aa',
    fontSize: 18,
    fontWeight: '600',
  },

  // Reconnect countdown
  reconnectOverlay: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  reconnectText: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  sheetTitle: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    marginBottom: 4,
  },
  sheetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#27272a',
  },
  sheetItemActive: {
    backgroundColor: 'rgba(124,58,237,0.1)',
  },
  sheetItemText: {
    color: '#e4e4e7',
    fontSize: 15,
  },
  sheetItemTextActive: {
    color: '#a78bfa',
    fontWeight: '600',
  },
  sheetItemSub: {
    color: '#52525b',
    fontSize: 12,
    textTransform: 'capitalize',
  },
});
