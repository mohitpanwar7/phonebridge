import type {
  SignalingMessage,
  DesktopToPhoneCommand,
  PhoneToDesktopMessage,
} from '@phonebridge/shared';

type MessageHandler = (msg: SignalingMessage | DesktopToPhoneCommand) => void;
type StateHandler = (connected: boolean) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private stateHandlers: Set<StateHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  constructor(private url: string) {}

  connect() {
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Signaling] Connected to desktop');
        this.notifyState(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          for (const handler of this.messageHandlers) {
            handler(msg);
          }
        } catch (err) {
          console.error('[Signaling] Parse error:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[Signaling] Disconnected');
        this.notifyState(false);
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Signaling] Error:', err);
      };
    } catch (err) {
      console.error('[Signaling] Connection failed:', err);
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
      }
    }
  }

  send(msg: SignalingMessage | PhoneToDesktopMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStateChange(handler: StateHandler) {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  private notifyState(connected: boolean) {
    for (const handler of this.stateHandlers) {
      handler(connected);
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }
}
