import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type {
  SignalingMessage,
  PhoneToDesktopMessage,
  DesktopToPhoneCommand,
} from '@phonebridge/shared';
import { SensorStore } from './SensorStore';
import { NFCStore } from './NFCStore';

export class SignalingServer {
  private wss: WebSocketServer | null = null;
  private phoneSocket: WebSocket | null = null;
  public sessionId: string;

  constructor(
    private port: number,
    private sensorStore: SensorStore,
    private emitToRenderer: (event: string, data: unknown) => void,
    private nfcStore?: NFCStore,
  ) {
    this.sessionId = uuidv4();
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (ws) => {
      console.log('[Signaling] Phone connected');
      this.phoneSocket = ws;
      this.emitToRenderer('phone-connected', true);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(msg);
        } catch (err) {
          console.error('[Signaling] Invalid message:', err);
        }
      });

      ws.on('close', () => {
        console.log('[Signaling] Phone disconnected');
        this.phoneSocket = null;
        this.emitToRenderer('phone-connected', false);
        this.emitToRenderer('connection-state', 'disconnected');
      });

      ws.on('error', (err) => {
        console.error('[Signaling] WebSocket error:', err);
      });
    });

    console.log(`[Signaling] Server started on port ${this.port}`);
  }

  private handleMessage(msg: SignalingMessage | PhoneToDesktopMessage) {
    if ('type' in msg) {
      switch (msg.type) {
        case 'offer':
        case 'answer':
        case 'candidate':
          // Forward WebRTC signaling to renderer
          this.emitToRenderer('signaling', msg);
          break;

        case 'deviceInfo':
          this.emitToRenderer('device-info', msg);
          break;

        case 'sensor':
          this.sensorStore.update(msg.sensor, msg.data, msg.ts);
          this.emitToRenderer('sensor-data', msg);
          break;

        case 'sensorBatch':
          for (const reading of msg.readings) {
            this.sensorStore.update(msg.sensor, reading.data, reading.ts);
          }
          this.emitToRenderer('sensor-data', msg);
          break;

        case 'status':
          this.emitToRenderer('phone-status', msg);
          break;

        case 'nfcTagScanned':
          this.nfcStore?.upsertTag(msg.tag);
          this.emitToRenderer('nfc-tag-scanned', msg.tag);
          break;

        case 'nfcSavedTags':
          this.nfcStore?.syncTags(msg.tags);
          this.emitToRenderer('nfc-saved-tags', msg.tags);
          break;

        case 'nfcWriteResult':
          this.emitToRenderer('nfc-write-result', { success: msg.success, error: msg.error });
          break;

        case 'nfcReplayStatus':
          this.emitToRenderer('nfc-replay-status', { active: msg.active, tagId: msg.tagId, tagName: msg.tagName });
          break;
      }
    }
  }

  sendSignaling(msg: SignalingMessage) {
    if (this.phoneSocket?.readyState === WebSocket.OPEN) {
      this.phoneSocket.send(JSON.stringify(msg));
    }
  }

  sendCommand(cmd: DesktopToPhoneCommand) {
    if (this.phoneSocket?.readyState === WebSocket.OPEN) {
      this.phoneSocket.send(JSON.stringify(cmd));
    }
  }

  stop() {
    this.wss?.close();
    this.wss = null;
    this.phoneSocket = null;
  }
}
