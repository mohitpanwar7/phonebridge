import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { SignalingClient } from './SignalingClient';
import type { SignalingMessage } from '@phonebridge/shared';

const RTC_CONFIG = {
  iceServers: [], // LAN-only, no STUN/TURN needed
};

const MEDIA_CONSTRAINTS = {
  audio: {
    sampleRate: 48000,
    sampleSize: 16,
    channelCount: 2,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    width: { ideal: 1920, max: 3840 },
    height: { ideal: 1080, max: 2160 },
    frameRate: { ideal: 30, max: 60 },
    facingMode: 'environment',
  },
};

type DataChannelMessageHandler = (msg: any) => void;

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private dataChannel: any = null; // RTCDataChannel
  private dataChannelHandlers: Set<DataChannelMessageHandler> = new Set();

  constructor(private signaling: SignalingClient) {
    this.signaling.onMessage((msg) => {
      if ('type' in msg) {
        this.handleSignalingMessage(msg as SignalingMessage);
      }
    });
  }

  async start() {
    this.pc = new RTCPeerConnection(RTC_CONFIG);

    // Get media stream
    this.localStream = await mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);

    // Add tracks to peer connection
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    // Create data channel for sensor data and commands
    this.dataChannel = this.pc.createDataChannel('phonebridge', {
      ordered: true,
    });
    this.setupDataChannel(this.dataChannel);

    // ICE candidates
    this.pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        this.signaling.send({
          type: 'candidate',
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };

    // Handle incoming audio from PC (speaker mode)
    this.pc.ontrack = (event: any) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      // The audio track from the PC will play automatically through the phone speaker
    };

    this.pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.pc?.connectionState);
    };

    // Create and send offer
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    this.signaling.send({
      type: 'offer',
      sdp: offer.sdp!,
    });
  }

  private async handleSignalingMessage(msg: SignalingMessage) {
    if (!this.pc) return;

    switch (msg.type) {
      case 'answer':
        await this.pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: msg.sdp })
        );
        break;

      case 'candidate':
        await this.pc.addIceCandidate(
          new RTCIceCandidate({
            candidate: msg.candidate,
            sdpMid: msg.sdpMid,
            sdpMLineIndex: msg.sdpMLineIndex,
          })
        );
        break;
    }
  }

  private setupDataChannel(channel: any) {
    channel.onopen = () => {
      console.log('[DataChannel] Open');
    };
    channel.onmessage = (event: any) => {
      try {
        const msg = JSON.parse(event.data);
        for (const handler of this.dataChannelHandlers) {
          handler(msg);
        }
      } catch {
        // ignore
      }
    };
    channel.onclose = () => {
      console.log('[DataChannel] Closed');
    };
  }

  sendData(data: object) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  onDataChannelMessage(handler: DataChannelMessageHandler) {
    this.dataChannelHandlers.add(handler);
    return () => this.dataChannelHandlers.delete(handler);
  }

  async applyVideoQuality(width: number, height: number, fps: number) {
    if (!this.pc || !this.localStream) return;
    const senders = this.pc.getSenders();
    const videoSender = senders.find((s: any) => s.track?.kind === 'video');
    if (videoSender) {
      try {
        const params = videoSender.getParameters();
        if (params.encodings?.length) {
          params.encodings[0].maxFramerate = fps;
          await videoSender.setParameters(params);
        }
      } catch { /* not all platforms support setParameters */ }
    }
    // Renegotiate with new constraints
    const newStream = await mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps }, facingMode: 'environment' },
    });
    const newTrack = newStream.getVideoTracks()[0];
    if (videoSender && newTrack) {
      await videoSender.replaceTrack(newTrack);
    }
    const oldTrack = this.localStream.getVideoTracks()[0];
    if (oldTrack) this.localStream.removeTrack(oldTrack);
    if (newTrack) this.localStream.addTrack(newTrack);
  }

  async switchMicrophone(source: string) {
    if (!this.localStream || !this.pc) return;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.stop();
    }

    // React Native WebRTC doesn't support AudioSource selection directly,
    // but recreating the audio track with fresh constraints picks up changes
    const newStream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: source !== 'UNPROCESSED',
        noiseSuppression: source !== 'UNPROCESSED',
        autoGainControl: source !== 'UNPROCESSED',
      },
      video: false,
    });

    const newAudioTrack = newStream.getAudioTracks()[0];
    const senders = this.pc.getSenders();
    const audioSender = senders.find((s: any) => s.track?.kind === 'audio');
    if (audioSender && newAudioTrack) {
      await audioSender.replaceTrack(newAudioTrack);
    }

    if (audioTrack) this.localStream.removeTrack(audioTrack);
    if (newAudioTrack) this.localStream.addTrack(newAudioTrack);
  }

  async switchCamera(facingMode: string) {
    if (!this.localStream || !this.pc) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.stop();
    }

    // Support both facingMode ('user'/'environment') and deviceId
    const isDeviceId = facingMode !== 'user' && facingMode !== 'environment';
    const videoConstraints: any = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (isDeviceId) {
      videoConstraints.deviceId = { exact: facingMode };
    } else {
      videoConstraints.facingMode = facingMode;
    }

    const newStream = await mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    const senders = this.pc.getSenders();
    const videoSender = senders.find((s: any) => s.track?.kind === 'video');
    if (videoSender && newVideoTrack) {
      await videoSender.replaceTrack(newVideoTrack);
    }

    // Update local stream reference
    this.localStream.removeTrack(videoTrack);
    this.localStream.addTrack(newVideoTrack);
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  stop() {
    this.localStream?.getTracks().forEach((track: any) => track.stop());
    this.dataChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this.dataChannel = null;
  }
}
