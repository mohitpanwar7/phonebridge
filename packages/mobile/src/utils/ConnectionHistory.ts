import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ConnectionRecord {
  ip: string;
  port: number;
  name: string;
  lastConnected: number;
  successCount: number;
}

const STORAGE_KEY = '@phonebridge/connection-history';
const MAX_ENTRIES = 20;

export class ConnectionHistory {
  private records: ConnectionRecord[] = [];
  private loaded = false;

  async load(): Promise<ConnectionRecord[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.records = raw ? JSON.parse(raw) : [];
    } catch {
      this.records = [];
    }
    this.loaded = true;
    return this.records;
  }

  async recordSuccess(ip: string, port: number, name = '') {
    if (!this.loaded) await this.load();
    const idx = this.records.findIndex((r) => r.ip === ip && r.port === port);
    if (idx >= 0) {
      this.records[idx].lastConnected = Date.now();
      this.records[idx].successCount++;
      if (name) this.records[idx].name = name;
    } else {
      this.records.unshift({ ip, port, name, lastConnected: Date.now(), successCount: 1 });
      if (this.records.length > MAX_ENTRIES) this.records = this.records.slice(0, MAX_ENTRIES);
    }
    // Sort by most recently connected
    this.records.sort((a, b) => b.lastConnected - a.lastConnected);
    await this.save();
  }

  async remove(ip: string, port: number) {
    this.records = this.records.filter((r) => !(r.ip === ip && r.port === port));
    await this.save();
  }

  getAll(): ConnectionRecord[] {
    return this.records;
  }

  private async save() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {}
  }
}

export const connectionHistory = new ConnectionHistory();
