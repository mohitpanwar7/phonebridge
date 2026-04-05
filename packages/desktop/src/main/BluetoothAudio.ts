/**
 * BluetoothAudio — lightweight audio-only WebSocket channel for streaming
 * phone mic / PC speaker audio without the full WebRTC stack.
 *
 * Runs a dedicated WebSocket server (default port 8423) that the phone
 * connects to when "Bluetooth Audio" mode is enabled.
 *
 * Wire protocol (binary frames):
 *   Byte 0    — message type
 *                 0x01 = MIC audio   (phone → PC)
 *                 0x02 = SPEAKER audio (PC → phone)
 *   Bytes 1…N — raw Int16 PCM, 16 kHz mono, little-endian
 *
 * This is NOT real Bluetooth — it provides the same wireless-mic/speaker
 * functionality over the local network with lower overhead than WebRTC.
 */

import { WebSocketServer, WebSocket } from 'ws';

// ── Constants ────────────────────────────────────────────────────────────────

const MSG_TYPE_MIC     = 0x01; // phone mic → PC
const MSG_TYPE_SPEAKER = 0x02; // PC speaker → phone

const DEFAULT_PORT   = 8423;
const LOG_TAG        = '[BluetoothAudio]';

// ── Types ────────────────────────────────────────────────────────────────────

type MicAudioCallback        = (pcm: Buffer) => void;
type ConnectionChangeCallback = (connected: boolean) => void;

// ── Class ────────────────────────────────────────────────────────────────────

export class BluetoothAudio {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private port = DEFAULT_PORT;

  private micCallbacks: MicAudioCallback[] = [];
  private connectionCallbacks: ConnectionChangeCallback[] = [];

  // ── Public getters ───────────────────────────────────────────────────────

  /** Whether a phone is currently connected to the audio channel. */
  get isConnected(): boolean {
    return (
      this.client !== null &&
      this.client.readyState === WebSocket.OPEN
    );
  }

  /** The port this server is (or will be) listening on. */
  get listeningPort(): number {
    return this.port;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Start the audio WebSocket server.
   *
   * @param port — TCP port to listen on (default 8423)
   */
  start(port: number = DEFAULT_PORT): void {
    if (this.wss) {
      console.warn(`${LOG_TAG} Already running on port ${this.port}`);
      return;
    }

    this.port = port;

    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('listening', () => {
      console.log(`${LOG_TAG} Audio server listening on port ${this.port}`);
    });

    this.wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `${LOG_TAG} Port ${this.port} is already in use. ` +
          'Is another instance running?',
        );
      } else {
        console.error(`${LOG_TAG} Server error:`, err);
      }
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const remoteAddr =
        req.socket.remoteAddress ?? 'unknown';

      // Only allow one phone at a time
      if (this.client && this.client.readyState === WebSocket.OPEN) {
        console.warn(
          `${LOG_TAG} Rejecting second connection from ${remoteAddr} — ` +
          'a phone is already connected',
        );
        ws.close(4001, 'Another device is already connected');
        return;
      }

      console.log(`${LOG_TAG} Phone connected from ${remoteAddr}`);
      this.client = ws;
      this.emitConnectionChange(true);

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (!isBinary) {
          // Ignore text frames — this channel is binary-only
          return;
        }

        this.handleBinaryMessage(data);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        console.log(
          `${LOG_TAG} Phone disconnected (code=${code}, reason=${reason.toString('utf8') || 'none'})`,
        );
        if (this.client === ws) {
          this.client = null;
          this.emitConnectionChange(false);
        }
      });

      ws.on('error', (err: Error) => {
        console.error(`${LOG_TAG} Client error:`, err.message);
        // The 'close' event will fire after this — cleanup happens there
      });
    });
  }

  /**
   * Stop the server and disconnect any connected phone.
   */
  stop(): void {
    if (this.client) {
      try {
        this.client.close(1000, 'Server shutting down');
      } catch {
        /* ignore — socket may already be dead */
      }
      this.client = null;
      this.emitConnectionChange(false);
    }

    if (this.wss) {
      this.wss.close((err) => {
        if (err) {
          console.error(`${LOG_TAG} Error closing server:`, err);
        } else {
          console.log(`${LOG_TAG} Server stopped`);
        }
      });
      this.wss = null;
    }
  }

  // ── Outbound audio (PC → phone) ─────────────────────────────────────────

  /**
   * Send PC audio (e.g. system sound, media playback) to the phone speaker.
   *
   * @param pcm — raw Int16 PCM, 16 kHz mono, little-endian
   */
  sendSpeakerAudio(pcm: Buffer): void {
    if (!this.isConnected) return;

    const frame = Buffer.allocUnsafe(1 + pcm.length);
    frame[0] = MSG_TYPE_SPEAKER;
    pcm.copy(frame, 1);

    try {
      this.client!.send(frame, { binary: true });
    } catch (err) {
      console.error(`${LOG_TAG} Failed to send speaker audio:`, (err as Error).message);
    }
  }

  // ── Callbacks ────────────────────────────────────────────────────────────

  /**
   * Register a callback that receives phone mic PCM data.
   * The buffer contains raw Int16 PCM, 16 kHz mono, little-endian.
   *
   * @returns an unsubscribe function
   */
  onMicAudio(callback: MicAudioCallback): () => void {
    this.micCallbacks.push(callback);
    return () => {
      this.micCallbacks = this.micCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register a callback that fires when the phone connects or disconnects.
   *
   * @returns an unsubscribe function
   */
  onConnectionChange(callback: ConnectionChangeCallback): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      this.connectionCallbacks = this.connectionCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Parse a binary frame and route to the appropriate handler.
   */
  private handleBinaryMessage(data: Buffer): void {
    if (data.length < 2) {
      // Need at least 1 type byte + 1 byte of audio
      return;
    }

    const msgType = data[0];
    const payload = data.subarray(1);

    switch (msgType) {
      case MSG_TYPE_MIC:
        this.dispatchMicAudio(payload);
        break;

      case MSG_TYPE_SPEAKER:
        // Phone should not be sending speaker-type frames — ignore
        break;

      default:
        // Unknown message type — silently drop
        break;
    }
  }

  /**
   * Forward received mic audio to all registered callbacks.
   */
  private dispatchMicAudio(pcm: Buffer): void {
    for (const cb of this.micCallbacks) {
      try {
        cb(pcm);
      } catch (err) {
        console.error(`${LOG_TAG} Mic audio callback error:`, (err as Error).message);
      }
    }
  }

  /**
   * Notify all connection-change listeners.
   */
  private emitConnectionChange(connected: boolean): void {
    for (const cb of this.connectionCallbacks) {
      try {
        cb(connected);
      } catch (err) {
        console.error(`${LOG_TAG} Connection callback error:`, (err as Error).message);
      }
    }
  }
}
