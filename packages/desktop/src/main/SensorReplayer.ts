import { readFileSync } from 'fs';
import type { SensorStore } from './SensorStore';
import type { SensorRecording, SensorReading } from './SensorRecorder';

export class SensorReplayer {
  private playing = false;
  private paused = false;
  private speed = 1.0;
  private currentIndex = 0;
  private recording: SensorRecording | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private sensorStore: SensorStore) {}

  loadFromFile(filePath: string): SensorRecording {
    const data = JSON.parse(readFileSync(filePath, 'utf8')) as SensorRecording;
    this.recording = data;
    return data;
  }

  loadRecording(recording: SensorRecording) {
    this.recording = recording;
  }

  startReplay() {
    if (!this.recording || this.playing) return;
    this.playing = true;
    this.paused = false;
    this.currentIndex = 0;
    this.scheduleNext();
  }

  pauseReplay() { this.paused = true; if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  resumeReplay() { if (this.playing && this.paused) { this.paused = false; this.scheduleNext(); } }
  stopReplay() { this.playing = false; this.paused = false; if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  setPlaybackSpeed(speed: number) { this.speed = Math.max(0.1, speed); }
  isPlaying() { return this.playing && !this.paused; }

  private scheduleNext() {
    if (!this.recording || this.currentIndex >= this.recording.readings.length) {
      this.playing = false;
      return;
    }
    const curr = this.recording.readings[this.currentIndex];
    const next = this.recording.readings[this.currentIndex + 1];
    const delay = next ? Math.max(0, (next.ts - curr.ts) / this.speed) : 0;

    this.timer = setTimeout(() => {
      const reading: SensorReading = this.recording!.readings[this.currentIndex];
      this.sensorStore.update(reading.sensor, reading.data, Date.now());
      this.currentIndex++;
      if (this.playing && !this.paused) this.scheduleNext();
    }, delay);
  }
}
