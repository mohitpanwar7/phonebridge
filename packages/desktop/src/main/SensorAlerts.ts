import { Notification } from 'electron';
import type { SensorStore } from './SensorStore';

export interface AlertRule {
  id: string;
  sensor: string;
  field: string; // e.g. 'x', 'pressure', 'level'
  operator: '>' | '<' | '==' | '>=' | '<=';
  threshold: number;
  action: 'notification' | 'sound';
  label: string;
  enabled: boolean;
  cooldownMs: number;
}

export class SensorAlerts {
  private rules: AlertRule[] = [];
  private lastFired: Map<string, number> = new Map();
  private onAlert?: (rule: AlertRule, value: number) => void;

  setOnAlert(cb: (rule: AlertRule, value: number) => void) {
    this.onAlert = cb;
  }

  setRules(rules: AlertRule[]) {
    this.rules = rules;
  }

  getRules(): AlertRule[] {
    return this.rules;
  }

  addRule(rule: AlertRule) {
    this.rules.push(rule);
  }

  removeRule(id: string) {
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  check(sensor: string, data: any) {
    const now = Date.now();
    for (const rule of this.rules) {
      if (!rule.enabled || rule.sensor !== sensor) continue;
      const value = data?.[rule.field];
      if (value === undefined || value === null) continue;
      const numVal = Number(value);
      if (isNaN(numVal)) continue;
      let triggered = false;
      switch (rule.operator) {
        case '>':  triggered = numVal > rule.threshold; break;
        case '<':  triggered = numVal < rule.threshold; break;
        case '>=': triggered = numVal >= rule.threshold; break;
        case '<=': triggered = numVal <= rule.threshold; break;
        case '==': triggered = numVal === rule.threshold; break;
      }
      if (!triggered) continue;
      const lastFired = this.lastFired.get(rule.id) ?? 0;
      if (now - lastFired < rule.cooldownMs) continue;
      this.lastFired.set(rule.id, now);
      this.fireAlert(rule, numVal);
    }
  }

  private fireAlert(rule: AlertRule, value: number) {
    this.onAlert?.(rule, value);
    if (rule.action === 'notification') {
      const notif = new Notification({
        title: `PhoneBridge Alert: ${rule.label}`,
        body: `${rule.sensor}.${rule.field} ${rule.operator} ${rule.threshold} (current: ${value.toFixed(3)})`,
      });
      notif.show();
    }
  }
}
