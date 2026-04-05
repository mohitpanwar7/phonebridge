export const APP_NAME = 'PhoneBridge';
export const SIGNALING_PORT = 8765;
export const REST_API_PORT = 8420;
export const WEBSOCKET_API_PORT = 8421;
export const MDNS_SERVICE_TYPE = 'phonebridge';
export const MDNS_SERVICE_PROTOCOL = 'tcp';

export const DEFAULT_VIDEO_WIDTH = 1280;
export const DEFAULT_VIDEO_HEIGHT = 720;
export const DEFAULT_VIDEO_FPS = 30;
export const DEFAULT_AUDIO_SAMPLE_RATE = 48000;
export const DEFAULT_AUDIO_CHANNELS = 1;

export const SENSOR_NAMED_PIPE = '\\\\.\\pipe\\phonebridge-sensors';
export const SHARED_MEMORY_NAME = 'PhoneBridgeSensors';

// ICE servers for WebRTC NAT traversal (enables internet connectivity)
export const ICE_SERVERS = [
  // Free Google STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // Free Metered TURN server (relay fallback when STUN fails)
  {
    urls: 'turn:a.relay.metered.ca:80',
    username: 'e8dd65a92f3db0eb5c835e70',
    credential: '2VDjSMz0wxELgK7r',
  },
  {
    urls: 'turn:a.relay.metered.ca:443',
    username: 'e8dd65a92f3db0eb5c835e70',
    credential: '2VDjSMz0wxELgK7r',
  },
  {
    urls: 'turn:a.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65a92f3db0eb5c835e70',
    credential: '2VDjSMz0wxELgK7r',
  },
];

export const VIDEO_CODECS = ['H264', 'VP8', 'VP9'] as const;
export const RESOLUTIONS = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
} as const;
