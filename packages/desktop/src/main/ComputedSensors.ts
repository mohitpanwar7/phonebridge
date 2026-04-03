// Computed virtual sensors using user-defined math formulas.
// Uses a safe subset of math without external dependencies.
import type { SensorStore } from './SensorStore';
import type { SensorData } from '@phonebridge/shared';

export interface ComputedSensorDef {
  id: string;
  name: string;
  formula: string;   // e.g. "sqrt(x*x + y*y + z*z)"
  inputs: string[];  // sensor names to pull from, e.g. ['accelerometer']
  outputField: string; // name of the output field
  enabled: boolean;
}

export class ComputedSensors {
  private defs: ComputedSensorDef[] = [];
  private intervalMs = 100;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onUpdate?: (name: string, data: SensorData, ts: number) => void;

  constructor(private sensorStore: SensorStore) {}

  setDefs(defs: ComputedSensorDef[]) { this.defs = defs; }
  getDefs(): ComputedSensorDef[] { return this.defs; }

  setOnUpdate(cb: (name: string, data: SensorData, ts: number) => void) {
    this.onUpdate = cb;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.compute(), this.intervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private compute() {
    const now = Date.now();
    for (const def of this.defs) {
      if (!def.enabled) continue;
      try {
        // Build context from all input sensors
        const ctx: Record<string, any> = { Math };
        for (const inp of def.inputs) {
          const entry = this.sensorStore.getLatest(inp);
          if (entry?.data) Object.assign(ctx, entry.data);
        }
        // Safe evaluation using Function constructor
        const keys = Object.keys(ctx);
        const vals = keys.map((k) => ctx[k]);
        // eslint-disable-next-line no-new-func
        const fn = new Function(...keys, `return (${def.formula})`);
        const result = fn(...vals);
        const data: SensorData = { [def.outputField]: result } as any;
        this.sensorStore.update(`computed_${def.name}`, data, now);
        this.onUpdate?.(`computed_${def.name}`, data, now);
      } catch {
        // Formula error — skip silently
      }
    }
  }
}
