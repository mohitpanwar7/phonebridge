import React, { createContext, useContext } from 'react';
import type { SignalingClient } from '../services/SignalingClient';
import type { WebRTCManager } from '../services/WebRTCManager';
import type { SensorManager } from '../sensors/SensorManager';
import type { MicrophoneManager } from '../audio/MicrophoneManager';

interface StreamContextValue {
  signaling: SignalingClient | null;
  webrtc: WebRTCManager | null;
  sensorManager: SensorManager | null;
  micManager: MicrophoneManager | null;
  sendCommand: (cmd: object) => void;
}

const StreamContext = createContext<StreamContextValue>({
  signaling: null,
  webrtc: null,
  sensorManager: null,
  micManager: null,
  sendCommand: () => {},
});

export const StreamProvider = StreamContext.Provider;

export function useStream(): StreamContextValue {
  return useContext(StreamContext);
}

export default StreamContext;
