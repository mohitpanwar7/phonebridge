import Bonjour from 'bonjour-service';
import { APP_NAME, MDNS_SERVICE_TYPE } from '@phonebridge/shared';

export class MDNSAdvertiser {
  private bonjour: InstanceType<typeof Bonjour> | null = null;

  constructor(private port: number) {}

  start() {
    this.bonjour = new Bonjour();
    try {
      const svc = this.bonjour.publish({
        name: APP_NAME,
        type: MDNS_SERVICE_TYPE,
        port: this.port,
        txt: {
          version: '1',
          platform: 'windows',
        },
      });
      svc.on('error', (err: Error) => {
        console.warn(`[mDNS] Publish warning: ${err.message}`);
      });
      console.log(`[mDNS] Advertising _${MDNS_SERVICE_TYPE}._tcp on port ${this.port}`);
    } catch (err: any) {
      console.warn(`[mDNS] Could not advertise: ${err.message}`);
    }
  }

  stop() {
    this.bonjour?.destroy();
    this.bonjour = null;
  }
}
