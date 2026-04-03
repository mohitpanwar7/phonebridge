import type { SensorType, SensorData } from '@phonebridge/shared';

interface SensorEntry {
  data: SensorData;
  timestamp: number;
}

export class SensorStore {
  private latest: Map<string, SensorEntry> = new Map();
  private history: Map<string, SensorEntry[]> = new Map();
  private maxHistory = 5000;
  private subscribers: Set<(sensor: string, entry: SensorEntry) => void> = new Set();

  update(sensor: SensorType | string, data: SensorData, timestamp: number) {
    const entry: SensorEntry = { data, timestamp };
    this.latest.set(sensor, entry);

    if (!this.history.has(sensor)) {
      this.history.set(sensor, []);
    }
    const hist = this.history.get(sensor)!;
    hist.push(entry);
    if (hist.length > this.maxHistory) {
      hist.splice(0, hist.length - this.maxHistory);
    }

    for (const sub of this.subscribers) {
      sub(sensor, entry);
    }
  }

  getLatest(sensor: string): SensorEntry | undefined {
    return this.latest.get(sensor);
  }

  getAllLatest(): Record<string, SensorEntry> {
    const result: Record<string, SensorEntry> = {};
    for (const [key, value] of this.latest) {
      result[key] = value;
    }
    return result;
  }

  getHistory(sensor: string, limit = 100): SensorEntry[] {
    const hist = this.history.get(sensor) || [];
    return hist.slice(-limit);
  }

  getAvailableSensors(): string[] {
    return Array.from(this.latest.keys());
  }

  getSensorNames(): string[] {
    return Array.from(this.history.keys());
  }

  getHistoryWithTimestamps(sensor: string, limit = 100): Array<{ ts: number; data: SensorData }> {
    const hist = this.history.get(sensor) || [];
    return hist.slice(-limit).map((e) => ({ ts: e.timestamp, data: e.data }));
  }

  subscribe(callback: (sensor: string, entry: SensorEntry) => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}
