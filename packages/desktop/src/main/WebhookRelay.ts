import { net } from 'electron';

export interface WebhookConfig {
  id: string;
  sensor: string;
  url: string;
  enabled: boolean;
  rateMs: number; // minimum ms between sends
  includeFields?: string[]; // if empty, send all
}

export class WebhookRelay {
  private configs: WebhookConfig[] = [];
  private lastSent: Map<string, number> = new Map();

  setConfigs(configs: WebhookConfig[]) {
    this.configs = configs;
  }

  getConfigs(): WebhookConfig[] {
    return this.configs;
  }

  async relay(sensor: string, data: any, ts: number) {
    const now = Date.now();
    for (const cfg of this.configs) {
      if (!cfg.enabled || cfg.sensor !== sensor) continue;
      const lastSent = this.lastSent.get(cfg.id) ?? 0;
      if (now - lastSent < cfg.rateMs) continue;
      this.lastSent.set(cfg.id, now);

      const payload = cfg.includeFields?.length
        ? Object.fromEntries(cfg.includeFields.map((f) => [f, data[f]]))
        : data;

      this.sendWebhook(cfg.url, { sensor, ts, data: payload }).catch((err) => {
        console.warn(`[WebhookRelay] Failed to send to ${cfg.url}:`, err);
      });
    }
  }

  private sendWebhook(url: string, body: object): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const req = net.request({ method: 'POST', url });
        req.setHeader('Content-Type', 'application/json');
        req.on('response', () => resolve());
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
