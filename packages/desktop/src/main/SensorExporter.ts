import { dialog } from 'electron';
import { writeFileSync } from 'fs';
import type { SensorStore } from './SensorStore';

export class SensorExporter {
  constructor(private sensorStore: SensorStore) {}

  async exportCSV(sensors?: string[]) {
    const result = await dialog.showSaveDialog({
      title: 'Export Sensor Data',
      defaultPath: `phonebridge-sensors-${Date.now()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return;

    const allSensors = sensors ?? this.sensorStore.getSensorNames();
    const rows: string[] = ['sensor,timestamp,data'];

    for (const sensor of allSensors) {
      const history = this.sensorStore.getHistory(sensor, 10000);
      for (const entry of history) {
        rows.push(`${sensor},${entry.timestamp},${JSON.stringify(entry.data).replace(/,/g, ';')}`);
      }
    }

    writeFileSync(result.filePath, rows.join('\n'), 'utf8');
  }

  async exportJSON(sensors?: string[]) {
    const result = await dialog.showSaveDialog({
      title: 'Export Sensor Data',
      defaultPath: `phonebridge-sensors-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return;

    const allSensors = sensors ?? this.sensorStore.getSensorNames();
    const output: Record<string, any[]> = {};

    for (const sensor of allSensors) {
      output[sensor] = this.sensorStore.getHistory(sensor, 10000);
    }

    writeFileSync(result.filePath, JSON.stringify(output, null, 2), 'utf8');
  }
}
