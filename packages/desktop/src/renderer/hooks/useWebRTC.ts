import { useEffect, useRef, useCallback } from 'react';
import noiseGateCode from '../audio/NoiseGateProcessor.js?raw';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [], // LAN-only — no STUN/TURN needed
};

interface UseWebRTCOptions {
  onTrack?: (stream: MediaStream) => void;
}

export function useWebRTC({ onTrack }: UseWebRTCOptions = {}) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Audio pipeline for PC audio → phone
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const noiseGateRef = useRef<AudioWorkletNode | null>(null);
  const sysAudioStreamRef = useRef<MediaStream | null>(null);
  const sysAudioSenderRef = useRef<RTCRtpSender | null>(null);

  // Stable ref for onTrack callback
  const onTrackRef = useRef(onTrack);
  onTrackRef.current = onTrack;

  const sendSignaling = useCallback((msg: unknown) => {
    window.phoneBridge?.sendSignaling(msg);
  }, []);

  // Create a fresh RTCPeerConnection, tearing down any previous one
  const createPeerConnection = useCallback(() => {
    // Clean up old connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    dataChannelRef.current = null;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Receive media tracks from phone (camera + mic)
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        onTrackRef.current?.(event.streams[0]);
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

    // Handle data channel created by the phone
    pc.ondatachannel = (event) => {
      console.log('[WebRTC] Data channel received:', event.channel.label);
      const dc = event.channel;
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log('[WebRTC] Data channel open');
      };
      dc.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          console.log('[WebRTC] Data channel message:', msg.type || msg.cmd || 'unknown');
        } catch { /* ignore */ }
      };
      dc.onclose = () => {
        console.log('[WebRTC] Data channel closed');
        dataChannelRef.current = null;
      };
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
    };

    return pc;
  }, [sendSignaling]);

  useEffect(() => {
    const bridge = window.phoneBridge;
    if (!bridge) return;

    // Create initial peer connection
    createPeerConnection();

    // Handle signaling messages from the phone (relayed by main process)
    const handleSignaling = async (msg: any) => {
      try {
        if (msg.type === 'offer') {
          // On new offer, create a fresh peer connection to handle reconnections
          const pc = createPeerConnection();
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignaling({ type: 'answer', sdp: answer.sdp });
        } else if (msg.type === 'candidate' && msg.candidate) {
          if (pcRef.current && pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate({
              candidate: msg.candidate,
              sdpMid: msg.sdpMid,
              sdpMLineIndex: msg.sdpMLineIndex,
            }));
          }
        }
      } catch (err) {
        console.error('[WebRTC] Signaling error:', err);
      }
    };

    bridge.onSignaling(handleSignaling);

    return () => {
      stopSystemAudio();
      pcRef.current?.close();
      pcRef.current = null;
      dataChannelRef.current = null;
    };
  }, []);

  // ── PC System Audio → Phone ───────────────────────────────────────────────

  const startSystemAudio = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    try {
      // Capture system audio via getDisplayMedia (Electron supports this on Windows)
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
        video: { width: 1, height: 1, frameRate: 1 }, // minimal video to satisfy API
      });

      // Stop the video track — we only want audio
      displayStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

      const audioTrack = displayStream.getAudioTracks()[0];
      if (!audioTrack) return;

      // Build audio pipeline: source → gain → noise gate → destination
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;

      // Load noise gate worklet from inline code
      const blob = new Blob([noiseGateCode], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);
      await audioCtx.audioWorklet.addModule(blobURL);
      URL.revokeObjectURL(blobURL);

      const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 1.0;
      gainNodeRef.current = gainNode;

      const noiseGate = new AudioWorkletNode(audioCtx, 'noise-gate');
      noiseGateRef.current = noiseGate;

      const dest = audioCtx.createMediaStreamDestination();
      source.connect(gainNode).connect(noiseGate).connect(dest);

      const processedTrack = dest.stream.getAudioTracks()[0];
      sysAudioStreamRef.current = displayStream;

      // Add as outgoing track to peer connection
      const sender = pc.addTrack(processedTrack, dest.stream);
      sysAudioSenderRef.current = sender;

      console.log('[WebRTC] System audio capture started');
    } catch (err) {
      console.error('[WebRTC] System audio capture failed:', err);
    }
  }, []);

  const stopSystemAudio = useCallback(() => {
    sysAudioStreamRef.current?.getTracks().forEach((t) => t.stop());
    sysAudioStreamRef.current = null;
    if (sysAudioSenderRef.current && pcRef.current) {
      try {
        pcRef.current.removeTrack(sysAudioSenderRef.current);
      } catch { /* pc may be closed */ }
      sysAudioSenderRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    gainNodeRef.current = null;
    noiseGateRef.current = null;
  }, []);

  const setGain = useCallback((value: number) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(value, gainNodeRef.current.context.currentTime, 0.01);
    }
  }, []);

  const setNoiseGateThreshold = useCallback((threshold: number) => {
    noiseGateRef.current?.port.postMessage({ threshold });
  }, []);

  const isSystemAudioActive = useCallback(() => {
    return sysAudioStreamRef.current !== null;
  }, []);

  return { pcRef, startSystemAudio, stopSystemAudio, setGain, setNoiseGateThreshold, isSystemAudioActive };
}
