import { dialog } from 'electron';
import { writeFileSync } from 'fs';
import type { SensorStore } from './SensorStore';
import type { SensorData } from '@phonebridge/shared';

export interface SensorReading {
  sensor: string;
  ts: number;
  data: SensorData;
}

export interface SensorRecording {
  startTs: number;
  endTs: number;
  readings: SensorReading[];
}

export class SensorRecorder {
  private recording = false;
  private readings: SensorReading[] = [];
  private startTs = 0;
  private unsubscribe?: () => void;

  constructor(private sensorStore: SensorStore) {}

  startRecording() {
    if (this.recording) return;
    this.readings = [];
    this.startTs = Date.now();
    this.recording = true;
    this.unsubscribe = this.sensorStore.subscribe((sensor, entry) => {
      this.readings.push({ sensor, ts: entry.timestamp, data: entry.data });
    });
  }

  stopRecording(): SensorRecording {
    this.recording = false;
    this.unsubscribe?.();
    return { startTs: this.startTs, endTs: Date.now(), readings: this.readings };
  }

  isRecording() { return this.recording; }

  async saveRecording(recording: SensorRecording) {
    const result = await dialog.showSaveDialog({
      title: 'Save Sensor Recording',
      defaultPath: `sensor-recording-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath) {
      writeFileSync(result.filePath, JSON.stringify(recording, null, 2), 'utf8');
    }
  }
}
