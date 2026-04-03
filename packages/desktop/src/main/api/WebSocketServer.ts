import { WebSocketServer as WSSServer, WebSocket } from 'ws';
import { SensorStore } from '../SensorStore';

interface Subscription {
  ws: WebSocket;
  sensors: Set<string>;
}

export class SensorWebSocketServer {
  private wss: WSSServer | null = null;
  private subscriptions: Subscription[] = [];
  private unsubscribeStore: (() => void) | null = null;

  constructor(
    private port: number,
    private sensorStore: SensorStore
  ) {}

  start() {
    this.wss = new WSSServer({ port: this.port });

    this.wss.on('connection', (ws) => {
      const sub: Subscription = { ws, sensors: new Set() };
      this.subscriptions.push(sub);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.subscribe && Array.isArray(msg.subscribe)) {
            sub.sensors = new Set(msg.subscribe);
            // Send current values immediately
            for (const sensor of sub.sensors) {
              const latest = this.sensorStore.getLatest(sensor);
              if (latest) {
                ws.send(JSON.stringify({ sensor, ...latest }));
              }
            }
          }
          if (msg.unsubscribe && Array.isArray(msg.unsubscribe)) {
            for (const s of msg.unsubscribe) {
              sub.sensors.delete(s);
            }
          }
        } catch {
          // ignore invalid messages
        }
      });

      ws.on('close', () => {
        this.subscriptions = this.subscriptions.filter((s) => s !== sub);
      });

      // Send available sensors on connect
      ws.send(
        JSON.stringify({
          type: 'available',
          sensors: this.sensorStore.getAvailableSensors(),
        })
      );
    });

    // Forward sensor updates to subscribed clients
    this.unsubscribeStore = this.sensorStore.subscribe((sensor, entry) => {
      for (const sub of this.subscriptions) {
        if (sub.sensors.has(sensor) && sub.ws.readyState === WebSocket.OPEN) {
          sub.ws.send(JSON.stringify({ sensor, ...entry }));
        }
      }
    });

    console.log(`[WS] Sensor WebSocket on ws://localhost:${this.port}`);
  }

  stop() {
    this.unsubscribeStore?.();
    this.wss?.close();
    this.wss = null;
    this.subscriptions = [];
  }
}
