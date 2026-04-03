import { WebSocketServer, WebSocket } from 'ws';

type CommandHandler = (cmd: object) => void;

/**
 * OBS/StreamDeck WebSocket command server on port 8422.
 * Accepts JSON commands: { cmd, ...params }
 * Supported: switchCamera, toggleMic, snapshot, toggleEffect, toggleTorch, setZoom
 */
export class CommandServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private handlers: Map<string, CommandHandler> = new Map();

  constructor(private port: number) {}

  register(cmd: string, handler: CommandHandler) {
    this.handlers.set(cmd, handler);
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.send(JSON.stringify({ type: 'connected', server: 'PhoneBridge CommandServer' }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          const cmd = msg.cmd as string;
          const handler = this.handlers.get(cmd);
          if (handler) {
            handler(msg);
            ws.send(JSON.stringify({ type: 'ack', cmd }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: `Unknown command: ${cmd}` }));
          }
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
      });

      ws.on('close', () => this.clients.delete(ws));
    });

    console.log(`[CommandServer] Listening on port ${this.port}`);
  }

  broadcast(event: object) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  stop() {
    this.wss?.close();
    this.wss = null;
    this.clients.clear();
  }
}
