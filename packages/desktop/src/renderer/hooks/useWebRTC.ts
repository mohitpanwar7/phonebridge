import { useEffect, useRef, useCallback } from 'react';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [], // LAN-only — no STUN/TURN needed
};

interface UseWebRTCOptions {
  onTrack?: (stream: MediaStream) => void;
}

export function useWebRTC({ onTrack }: UseWebRTCOptions = {}) {
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const sendSignaling = useCallback((msg: unknown) => {
    window.phoneBridge?.sendSignaling(msg);
  }, []);

  useEffect(() => {
    const bridge = window.phoneBridge;
    if (!bridge) return;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Receive media tracks from phone
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        onTrack?.(event.streams[0]);
      }
    };

    // Send ICE candidates to phone via signaling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignaling({
          type: 'candidate',
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
    };

    // Handle signaling messages from the phone (relayed by main process)
    const handleSignaling = async (msg: any) => {
      if (!pcRef.current) return;

      try {
        if (msg.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignaling({ type: 'answer', sdp: answer.sdp });
        } else if (msg.type === 'candidate' && msg.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate({
            candidate: msg.candidate,
            sdpMid: msg.sdpMid,
            sdpMLineIndex: msg.sdpMLineIndex,
          }));
        }
      } catch (err) {
        console.error('[WebRTC] Signaling error:', err);
      }
    };

    bridge.onSignaling(handleSignaling);

    return () => {
      pc.close();
      pcRef.current = null;
    };
  }, []);

  return { pcRef };
}
