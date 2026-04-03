import Zeroconf from 'react-native-zeroconf';
import { MDNS_SERVICE_TYPE } from '@phonebridge/shared';
import type { ConnectionInfo } from '@phonebridge/shared';

export interface DiscoveredDevice {
  name: string;
  ip: string;
  port: number;
  txt: Record<string, string>;
}

type DiscoveryHandler = (devices: DiscoveredDevice[]) => void;

export class DiscoveryService {
  private zeroconf = new Zeroconf();
  private devices: Map<string, DiscoveredDevice> = new Map();
  private handlers: Set<DiscoveryHandler> = new Set();

  constructor() {
    this.zeroconf.on('resolved', (service: any) => {
      const device: DiscoveredDevice = {
        name: service.name,
        ip: service.addresses?.[0] || service.host,
        port: service.port,
        txt: service.txt || {},
      };
      this.devices.set(service.name, device);
      this.notifyHandlers();
    });

    this.zeroconf.on('removed', (name: string) => {
      this.devices.delete(name);
      this.notifyHandlers();
    });

    this.zeroconf.on('error', (err: any) => {
      console.error('[Discovery] Error:', err);
    });
  }

  startScan() {
    this.devices.clear();
    this.zeroconf.scan(MDNS_SERVICE_TYPE, 'tcp', 'local.');
    console.log('[Discovery] Scanning for PhoneBridge desktops...');
  }

  stopScan() {
    this.zeroconf.stop();
  }

  onDevicesChanged(handler: DiscoveryHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notifyHandlers() {
    const deviceList = Array.from(this.devices.values());
    for (const handler of this.handlers) {
      handler(deviceList);
    }
  }

  getDevices(): DiscoveredDevice[] {
    return Array.from(this.devices.values());
  }

  static parseQRCode(data: string): ConnectionInfo | null {
    try {
      const parsed = JSON.parse(data);
      if (parsed.ip && parsed.port) {
        return parsed as ConnectionInfo;
      }
    } catch {
      // ignore
    }
    return null;
  }

  destroy() {
    this.zeroconf.stop();
    this.zeroconf.removeAllListeners();
  }
}
