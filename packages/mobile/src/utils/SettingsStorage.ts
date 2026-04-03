import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@phonebridge/settings';

export interface AppSettings {
  video: {
    resolution: '480p' | '720p' | '1080p';
    fps: 15 | 24 | 30;
    codec: 'H264' | 'VP8' | 'VP9';
  };
  audio: {
    enabled: boolean;
    speakerMode: boolean;
  };
  sensors: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  video: {
    resolution: '720p',
    fps: 30,
    codec: 'H264',
  },
  audio: {
    enabled: true,
    speakerMode: false,
  },
  sensors: {
    gps: true,
    accelerometer: true,
    gyroscope: true,
    magnetometer: true,
    barometer: true,
    light: true,
    proximity: true,
    pedometer: true,
    gravity: false,
    rotation: false,
    battery: true,
  },
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    if (json) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
