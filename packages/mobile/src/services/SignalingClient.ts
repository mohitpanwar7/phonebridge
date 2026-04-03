import type {
  SignalingMessage,
  DesktopToPhoneCommand,
  PhoneToDesktopMessage,
} from '@phonebridge/shared';

type MessageHandler = (msg: SignalingMessage | DesktopToPhoneCommand) => void;
type StateHandler = (connected: boolean) => void;
type ReconnectHandler = (delayMs: number, attempt: number) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private stateHandlers: Set<StateHandler> = new Set();
  private reconnectHandlers: Set<ReconnectHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private reconnectAttempt = 0;

  constructor(private url: string) {}

  connect() {
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  private getBackoffDelay(): number {
    // Exponential backoff: min(1000 * 2^attempt + jitter, 30000)
    const base = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 29500);
    const jitter = Math.random() * 500;
    return base + jitter;
  }

  private doConnect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[Signaling] Connected to desktop');
        this.reconnectAttempt = 0;
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
          const delay = this.getBackoffDelay();
          console.log(`[Signaling] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempt + 1})`);
          for (const h of this.reconnectHandlers) h(delay, this.reconnectAttempt + 1);
          this.reconnectAttempt++;
          this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Signaling] Error:', err);
      };
    } catch (err) {
      console.error('[Signaling] Connection failed:', err);
      if (this.shouldReconnect) {
        const delay = this.getBackoffDelay();
        for (const h of this.reconnectHandlers) h(delay, this.reconnectAttempt + 1);
        this.reconnectAttempt++;
        this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
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

  onReconnecting(handler: ReconnectHandler) {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
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
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
