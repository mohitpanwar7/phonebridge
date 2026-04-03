import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export interface TrustedPhone {
  name: string;
  ip: string;
  fingerprint?: string;
  addedAt: number;
}

const STORE_PATH = join(app.getPath('userData'), 'trusted-phones.json');

export class TrustedPhones {
  private phones: TrustedPhone[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (existsSync(STORE_PATH)) {
        this.phones = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
      }
    } catch {
      this.phones = [];
    }
  }

  private save() {
    try {
      writeFileSync(STORE_PATH, JSON.stringify(this.phones, null, 2), 'utf8');
    } catch {}
  }

  getAll(): TrustedPhone[] {
    return this.phones;
  }

  add(phone: Omit<TrustedPhone, 'addedAt'>) {
    const existing = this.phones.findIndex((p) => p.ip === phone.ip);
    if (existing >= 0) {
      this.phones[existing] = { ...phone, addedAt: this.phones[existing].addedAt };
    } else {
      this.phones.push({ ...phone, addedAt: Date.now() });
    }
    this.save();
  }

  remove(ip: string) {
    this.phones = this.phones.filter((p) => p.ip !== ip);
    this.save();
  }

  isTrusted(ip: string): boolean {
    return this.phones.some((p) => p.ip === ip);
  }
}
