import express from 'express';
import type { Server } from 'http';
import { SensorStore } from '../SensorStore';

export class RestServer {
  private app = express();
  private server: Server | null = null;

  constructor(
    private port: number,
    private sensorStore: SensorStore
  ) {
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use(express.json());

    // CORS for local dev
    this.app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // List all sensors
    this.app.get('/api/sensors', (_req, res) => {
      const sensors = this.sensorStore.getAvailableSensors();
      const all = this.sensorStore.getAllLatest();
      res.json({
        sensors,
        data: all,
      });
    });

    // Get latest reading for a sensor
    this.app.get('/api/sensors/:name', (req, res) => {
      const latest = this.sensorStore.getLatest(req.params.name);
      if (!latest) {
        res.status(404).json({ error: `Sensor '${req.params.name}' not found` });
        return;
      }
      res.json(latest);
    });

    // Get history for a sensor
    this.app.get('/api/sensors/:name/history', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      const history = this.sensorStore.getHistory(req.params.name, limit);
      res.json({ sensor: req.params.name, count: history.length, readings: history });
    });

    // Health check
    this.app.get('/api/status', (_req, res) => {
      res.json({
        app: 'PhoneBridge',
        version: '0.1.0',
        sensors: this.sensorStore.getAvailableSensors(),
      });
    });
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`[REST] API server on http://localhost:${this.port}`);
    });
  }

  stop() {
    this.server?.close();
    this.server = null;
  }
}
