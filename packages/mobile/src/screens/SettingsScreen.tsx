import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { useStream } from '../context/StreamContext';
import {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  type AppSettings,
} from '../utils/SettingsStorage';
import { RESOLUTIONS } from '@phonebridge/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const;
const FPS_OPTIONS = [15, 24, 30] as const;
const CODECS = ['H264', 'VP8', 'VP9'] as const;

export default function SettingsScreen({ navigation }: Props) {
  const { sendCommand, webrtc, sensorManager } = useStream();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  // Debounced save
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => saveSettings(settings), 300);
    return () => clearTimeout(timer);
  }, [settings, loaded]);

  const updateVideo = useCallback(
    (key: keyof AppSettings['video'], value: any) => {
      setSettings((prev) => {
        const next = { ...prev, video: { ...prev.video, [key]: value } };
        // Send command to desktop
        const res = RESOLUTIONS[next.video.resolution] || RESOLUTIONS['720p'];
        sendCommand({
          cmd: 'setVideoQuality',
          width: res.width,
          height: res.height,
          fps: next.video.fps,
          codec: next.video.codec,
        });
        // Apply locally
        webrtc?.applyVideoQuality(res.width, res.height, next.video.fps);
        return next;
      });
    },
    [sendCommand, webrtc],
  );

  const updateAudio = useCallback(
    (key: keyof AppSettings['audio'], value: any) => {
      setSettings((prev) => {
        const next = { ...prev, audio: { ...prev.audio, [key]: value } };
        sendCommand({
          cmd: 'setAudioQuality',
          enabled: next.audio.enabled,
          speakerMode: next.audio.speakerMode,
        });
        return next;
      });
    },
    [sendCommand],
  );

  const toggleSensor = useCallback(
    (key: string) => {
      setSettings((prev) => {
        const enabled = !prev.sensors[key];
        const next = {
          ...prev,
          sensors: { ...prev.sensors, [key]: enabled },
        };
        // Send command to desktop
        sendCommand({ cmd: 'enableSensor', sensor: key, enabled });
        // Apply locally
        sensorManager?.enableSensor(key as any, enabled);
        return next;
      });
    },
    [sendCommand, sensorManager],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Video Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Video</Text>

        <Text style={styles.label}>Resolution</Text>
        <View style={styles.optionRow}>
          {RESOLUTION_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.optionBtn, settings.video.resolution === r && styles.optionActive]}
              onPress={() => updateVideo('resolution', r)}
            >
              <Text style={[styles.optionText, settings.video.resolution === r && styles.optionTextActive]}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Frame Rate</Text>
        <View style={styles.optionRow}>
          {FPS_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.optionBtn, settings.video.fps === f && styles.optionActive]}
              onPress={() => updateVideo('fps', f)}
            >
              <Text style={[styles.optionText, settings.video.fps === f && styles.optionTextActive]}>
                {f} fps
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Codec</Text>
        <View style={styles.optionRow}>
          {CODECS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.optionBtn, settings.video.codec === c && styles.optionActive]}
              onPress={() => updateVideo('codec', c)}
            >
              <Text style={[styles.optionText, settings.video.codec === c && styles.optionTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Audio Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Audio</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Microphone</Text>
          <Switch
            value={settings.audio.enabled}
            onValueChange={(v) => updateAudio('enabled', v)}
            trackColor={{ true: '#7c3aed', false: '#27272a' }}
            thumbColor="#e4e4e7"
          />
        </View>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Speaker Mode</Text>
            <Text style={styles.toggleHint}>Play PC audio through phone speaker</Text>
          </View>
          <Switch
            value={settings.audio.speakerMode}
            onValueChange={(v) => updateAudio('speakerMode', v)}
            trackColor={{ true: '#7c3aed', false: '#27272a' }}
            thumbColor="#e4e4e7"
          />
        </View>
      </View>

      {/* Sensor Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sensors</Text>
        {Object.entries(settings.sensors).map(([key, enabled]) => (
          <View key={key} style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </Text>
            <Switch
              value={enabled}
              onValueChange={() => toggleSensor(key)}
              trackColor={{ true: '#7c3aed', false: '#27272a' }}
              thumbColor="#e4e4e7"
            />
          </View>
        ))}
      </View>

      {/* API Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Developer APIs</Text>
        <Text style={styles.apiInfo}>
          REST API: http://[desktop-ip]:8420/api/sensors{'\n'}
          WebSocket: ws://[desktop-ip]:8421{'\n'}
          Named Pipe: \\.\pipe\phonebridge-sensors
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f13',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e4e4e7',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#71717a',
    marginBottom: 8,
    marginTop: 12,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#27272a',
  },
  optionActive: {
    backgroundColor: 'rgba(124,58,237,0.3)',
    borderWidth: 1,
    borderColor: '#7c3aed',
  },
  optionText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#c4b5fd',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  toggleLabel: {
    color: '#e4e4e7',
    fontSize: 14,
  },
  toggleHint: {
    color: '#52525b',
    fontSize: 11,
    marginTop: 2,
  },
  apiInfo: {
    color: '#52525b',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
});
