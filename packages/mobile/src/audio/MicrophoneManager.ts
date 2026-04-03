import { Platform } from 'react-native';
import type { MicrophoneDevice, AudioSourceType } from '@phonebridge/shared';

// Android audio sources map to different physical microphones
const ANDROID_MIC_SOURCES: Array<{ source: AudioSourceType; name: string }> = [
  { source: 'DEFAULT', name: 'Default Microphone' },
  { source: 'MIC', name: 'Bottom Microphone' },
  { source: 'CAMCORDER', name: 'Back Microphone (Camcorder)' },
  { source: 'VOICE_RECOGNITION', name: 'Voice Recognition Mic' },
  { source: 'VOICE_COMMUNICATION', name: 'Voice Communication Mic' },
  { source: 'UNPROCESSED', name: 'Raw Microphone (Unprocessed)' },
];

// iOS microphone options (simplified — full per-mic selection requires native module)
const IOS_MIC_SOURCES: Array<{ source: AudioSourceType; name: string }> = [
  { source: 'DEFAULT', name: 'Default Microphone' },
  { source: 'MIC', name: 'Bottom Microphone' },
  { source: 'VOICE_COMMUNICATION', name: 'Voice Optimized' },
];

export class MicrophoneManager {
  private currentSource: AudioSourceType = 'DEFAULT';

  getAvailableMicrophones(): MicrophoneDevice[] {
    const sources = Platform.OS === 'android' ? ANDROID_MIC_SOURCES : IOS_MIC_SOURCES;
    return sources.map((s, i) => ({
      id: `mic-${i}`,
      name: s.name,
      source: s.source,
    }));
  }

  getCurrentSource(): AudioSourceType {
    return this.currentSource;
  }

  setSource(source: AudioSourceType) {
    this.currentSource = source;
    // Note: Actual mic switching requires recreating the audio track
    // with the new source. This is handled in WebRTCManager.
  }

  getMediaConstraints(): object {
    // React Native WebRTC audio constraints are limited.
    // On Android, the AudioSource is set when creating the media stream.
    return {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
  }
}
