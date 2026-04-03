import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { SignalingClient } from '../services/SignalingClient';
import { WebRTCManager } from '../services/WebRTCManager';
import { SensorManager } from '../sensors/SensorManager';
import { CameraManager } from '../camera/CameraManager';
import { MicrophoneManager } from '../audio/MicrophoneManager';
import type { SensorType, SensorData, DeviceInfoMessage } from '@phonebridge/shared';
import { SIGNALING_PORT } from '@phonebridge/shared';
import { StreamProvider } from '../context/StreamContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Stream'>;

export default function StreamScreen({ route, navigation }: Props) {
  const { ip, port } = route.params;
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [localStreamURL, setLocalStreamURL] = useState<string | null>(null);
  const [activeSensors, setActiveSensors] = useState(0);
  const [currentCamera, setCurrentCamera] = useState<string>('back');

  const signalingRef = useRef<SignalingClient | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const sensorRef = useRef<SensorManager | null>(null);
  const cameraManagerRef = useRef(new CameraManager());
  const micManagerRef = useRef(new MicrophoneManager());

  // Keep streaming when screen turns off / app goes background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        // Reduce sensor rate to save battery in background
        sensorRef.current?.setSensorRate('accelerometer', 500);
        sensorRef.current?.setSensorRate('gyroscope', 500);
        // WebRTC tracks + signaling continue running automatically
        console.log('[StreamScreen] App backgrounded — reduced sensor rate');
      } else if (nextState === 'active') {
        // Restore full rate when foregrounded
        sensorRef.current?.setSensorRate('accelerometer', 50);
        sensorRef.current?.setSensorRate('gyroscope', 50);
        console.log('[StreamScreen] App foregrounded — restored sensor rate');
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    startConnection();
    return () => cleanup();
  }, []);

  const startConnection = async () => {
    try {
      // Initialize camera manager
      const cameras = await cameraManagerRef.current.initialize();
      const microphones = micManagerRef.current.getAvailableMicrophones();

      // Connect signaling
      const wsUrl = `ws://${ip}:${port}`;
      const signaling = new SignalingClient(wsUrl);
      signalingRef.current = signaling;

      let webrtcStarted = false;
      signaling.onStateChange(async (isConnected) => {
        setConnected(isConnected);
        if (!isConnected) {
          setStreaming(false);
          return;
        }
        // Start WebRTC on first connection
        if (webrtcStarted) return;
        webrtcStarted = true;
        try {
          const webrtc = new WebRTCManager(signaling);
          webrtcRef.current = webrtc;

          // Handle commands from desktop
          webrtc.onDataChannelMessage((msg) => {
            handleDesktopCommand(msg);
          });

          await webrtc.start();

          // Set local stream for preview
          const localStream = webrtc.getLocalStream();
          if (localStream) {
            setLocalStreamURL(localStream.toURL());
          }

          // Send device info
          const deviceInfo: DeviceInfoMessage = {
            type: 'deviceInfo',
            cameras,
            microphones,
            sensors: sensorRef.current?.getAvailableSensors() || [],
            platform: Platform.OS as 'android' | 'ios',
            model: `${Platform.OS} device`,
          };
          signaling.send(deviceInfo);

          // Start sensors
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

  const handleDesktopCommand = (msg: any) => {
    switch (msg.cmd) {
      case 'switchCamera':
        webrtcRef.current?.switchCamera(msg.deviceId);
        setCurrentCamera(msg.deviceId);
        break;
      case 'switchMic':
        micManagerRef.current.setSource(msg.source);
        webrtcRef.current?.switchMicrophone(msg.source);
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
    }
  };

  const toggleCamera = async () => {
    const newFacing = currentCamera === 'back' ? 'user' : 'environment';
    await webrtcRef.current?.switchCamera(newFacing);
    setCurrentCamera(currentCamera === 'back' ? 'front' : 'back');
  };

  const disconnect = () => {
    cleanup();
    navigation.goBack();
  };

  const cleanup = () => {
    sensorRef.current?.stopAll();
    webrtcRef.current?.stop();
    signalingRef.current?.disconnect();
  };

  const streamContextValue = {
    signaling: signalingRef.current,
    webrtc: webrtcRef.current,
    sensorManager: sensorRef.current,
    micManager: micManagerRef.current,
    sendCommand: (cmd: object) => {
      signalingRef.current?.send(cmd as any);
    },
  };

  return (
    <StreamProvider value={streamContextValue}>
      <View style={styles.container}>
        {/* Camera Preview */}
        <View style={styles.previewContainer}>
          {localStreamURL ? (
            <RTCView
              streamURL={localStreamURL}
              style={styles.preview}
              objectFit="cover"
              mirror={currentCamera === 'front'}
            />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={styles.placeholderText}>Starting camera...</Text>
            </View>
          )}

          {/* Overlay status */}
          <View style={styles.overlay}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, connected ? styles.dotGreen : styles.dotRed]} />
              <Text style={styles.statusText}>
                {streaming ? 'Streaming' : connected ? 'Connected' : 'Connecting...'}
              </Text>
            </View>
            {streaming && (
              <Text style={styles.sensorCount}>
                {activeSensors} sensors active
              </Text>
            )}
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={toggleCamera}>
            <Text style={styles.controlIcon}>&#x1F504;</Text>
            <Text style={styles.controlLabel}>Flip</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.controlBtn, styles.disconnectBtn]} onPress={disconnect}>
            <Text style={styles.controlIcon}>&#x23F9;</Text>
            <Text style={styles.controlLabel}>Stop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.controlIcon}>&#x2699;</Text>
            <Text style={styles.controlLabel}>Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.infoText}>Connected to {ip}:{port}</Text>
          <Text style={styles.infoText}>Camera: {currentCamera}</Text>
        </View>
      </View>
    </StreamProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f13',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    borderRadius: 12,
    margin: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  preview: {
    flex: 1,
  },
  previewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#52525b',
    fontSize: 16,
  },
  overlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotGreen: { backgroundColor: '#4ade80' },
  dotRed: { backgroundColor: '#f87171' },
  statusText: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '500',
  },
  sensorCount: {
    color: '#a78bfa',
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 16,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#27272a',
  },
  disconnectBtn: {
    backgroundColor: '#7f1d1d',
  },
  controlIcon: {
    fontSize: 22,
  },
  controlLabel: {
    color: '#a1a1aa',
    fontSize: 10,
    marginTop: 2,
  },
  info: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    color: '#52525b',
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
