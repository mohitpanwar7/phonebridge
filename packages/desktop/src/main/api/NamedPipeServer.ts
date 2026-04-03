import { createServer, Server } from 'net';
import { SensorStore } from '../SensorStore';

const PIPE_NAME = '\\\\.\\pipe\\phonebridge-sensors';

/**
 * Named pipe server for Unity/Unreal game engine integration.
 * Clients connect and receive a stream of JSON lines:
 *   {"sensor":"accelerometer","ts":123,"data":{"x":0,"y":9.8,"z":0}}\n
 *
 * Also accepts commands as JSON lines:
 *   {"cmd":"subscribe","sensors":["accelerometer","gyroscope"]}\n
 */
export class NamedPipeServer {
  private server: Server | null = null;
  private clients: Set<import('net').Socket> = new Set();
  private subscriptions: Map<import('net').Socket, Set<string>> = new Map();
  private unsubscribeSensorStore?: () => void;

  constructor(private sensorStore: SensorStore) {}

  start() {
    this.server = createServer((socket) => {
      this.clients.add(socket);
      this.subscriptions.set(socket, new Set());
      socket.setEncoding('utf8');

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const msg = JSON.parse(line.trim());
            if (msg.cmd === 'subscribe' && Array.isArray(msg.sensors)) {
              const subs = this.subscriptions.get(socket);
              if (subs) msg.sensors.forEach((s: string) => subs.add(s));
            } else if (msg.cmd === 'unsubscribe') {
              this.subscriptions.set(socket, new Set());
            } else if (msg.cmd === 'getAll') {
              const all = this.sensorStore.getAllLatest();
              socket.write(JSON.stringify({ type: 'snapshot', data: all }) + '\n');
            }
          } catch {}
        }
      });

      socket.on('close', () => {
        this.clients.delete(socket);
        this.subscriptions.delete(socket);
      });

      socket.on('error', () => {
        this.clients.delete(socket);
        this.subscriptions.delete(socket);
      });

      // Send a welcome message
      socket.write(JSON.stringify({ type: 'connected', server: 'PhoneBridge Sensors' }) + '\n');
    });

    // Subscribe to all sensor updates and relay to pipe clients
    this.unsubscribeSensorStore = this.sensorStore.subscribe((sensor, entry) => {
      const payload = JSON.stringify({ sensor, ts: entry.timestamp, data: entry.data }) + '\n';
      for (const [socket, subs] of this.subscriptions) {
        if (subs.size === 0 || subs.has(sensor)) {
          socket.write(payload, () => {});
        }
      }
    });

    this.server.listen(PIPE_NAME, () => {
      console.log(`[NamedPipeServer] Listening at ${PIPE_NAME}`);
    });

    this.server.on('error', (err) => {
      console.warn('[NamedPipeServer] Error:', err.message);
    });
  }

  stop() {
    this.unsubscribeSensorStore?.();
    this.clients.forEach((s) => s.destroy());
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }
}
