/**
 * NFCManager — wraps react-native-nfc-manager for tag reading, writing, and erasing.
 *
 * Supported operations:
 *  - Read: NDEF records, MIFARE Classic sector/block dump, raw NfcA/NfcV bytes
 *  - Write: NDEF message to any writable tag
 *  - Format: format blank tag as NDEF
 *  - Erase: write empty NDEF message
 */

import NfcManager, { NfcTech, Ndef, NfcError } from 'react-native-nfc-manager';
import type { NFCTag, NFCNdefRecord, MifareDump, NFCTagType } from '@phonebridge/shared';

export class NFCManager {
  private initialized = false;

  async initialize(): Promise<boolean> {
    try {
      const supported = await NfcManager.isSupported();
      if (!supported) {
        console.warn('[NFCManager] NFC not supported on this device');
        return false;
      }
      await NfcManager.start();
      this.initialized = true;
      console.log('[NFCManager] Initialized');
      return true;
    } catch (err) {
      console.error('[NFCManager] Init failed:', err);
      return false;
    }
  }

  async isEnabled(): Promise<boolean> {
    try {
      return await NfcManager.isEnabled();
    } catch {
      return false;
    }
  }

  isSupported(): boolean {
    return this.initialized;
  }

  /**
   * Scan for the next NFC tag. Requests all supported technologies in priority order.
   * Returns a complete NFCTag object.
   */
  async readTag(): Promise<NFCTag | null> {
    if (!this.initialized) return null;

    // Try NDEF first (most common), then MIFARE, then fallback NfcA
    const techOrder = [NfcTech.Ndef, NfcTech.MifareClassic, NfcTech.NfcA, NfcTech.IsoDep, NfcTech.NfcV];

    for (const tech of techOrder) {
      try {
        await NfcManager.requestTechnology(tech, {
          alertMessage: 'Hold your phone near an NFC tag',
        });

        const tag = await NfcManager.getTag();
        if (!tag) continue;

        const result = await this.buildNFCTag(tag, tech);
        await NfcManager.cancelTechnologyRequest();
        return result;
      } catch (ex: any) {
        await NfcManager.cancelTechnologyRequest().catch(() => {});
        if (ex?.code === NfcError.USER_CANCELLED) return null;
        // Try next tech
      }
    }
    return null;
  }

  private async buildNFCTag(rawTag: any, tech: string): Promise<NFCTag> {
    const uid = this.bytesToHex(rawTag.id ?? []);
    const technologies: string[] = rawTag.techTypes ?? [tech];
    const tagType = this.detectTagType(technologies);
    const now = Date.now();

    const nfcTag: NFCTag = {
      id: `${now}_${uid.replace(/:/g, '')}`,
      uid,
      name: `NFC Tag ${uid.slice(-5)}`,
      tagType,
      technologies,
      savedAt: now,
      canEmulate: tagType === 'Ndef' || tagType === 'IsoDep',
    };

    // Read NDEF records
    if (tech === NfcTech.Ndef && rawTag.ndefMessage) {
      nfcTag.ndefRecords = this.parseNdefMessage(rawTag.ndefMessage);
    }

    // Dump MIFARE Classic
    if (tech === NfcTech.MifareClassic) {
      nfcTag.mifareData = await this.dumpMifare(rawTag);
    }

    // Raw bytes for unknown
    if (tech === NfcTech.NfcA && rawTag.atqa) {
      nfcTag.rawData = this.bytesToHex(rawTag.atqa);
    }

    return nfcTag;
  }

  private parseNdefMessage(ndefMessage: any[]): NFCNdefRecord[] {
    return ndefMessage.map((record): NFCNdefRecord => {
      const tnf: number = record.tnf ?? 0;
      const type = String.fromCharCode(...(record.type ?? []));
      const payloadBytes: number[] = record.payload ?? [];

      let payload = '';
      let languageCode: string | undefined;
      let uri: string | undefined;

      if (tnf === 1 && type === 'T') {
        // Well-known text record
        const statusByte = payloadBytes[0] ?? 0;
        const langLen = statusByte & 0x3f;
        languageCode = String.fromCharCode(...payloadBytes.slice(1, 1 + langLen));
        payload = String.fromCharCode(...payloadBytes.slice(1 + langLen));
      } else if (tnf === 1 && type === 'U') {
        // Well-known URI record
        const prefixes: Record<number, string> = {
          0x00: '', 0x01: 'http://www.', 0x02: 'https://www.',
          0x03: 'http://', 0x04: 'https://', 0x05: 'tel:',
          0x06: 'mailto:', 0x07: 'ftp://anonymous:anonymous@',
        };
        const prefix = prefixes[payloadBytes[0] ?? 0] ?? '';
        uri = prefix + String.fromCharCode(...payloadBytes.slice(1));
        payload = uri;
      } else {
        payload = this.bytesToHex(payloadBytes);
      }

      return { tnf, type, payload, languageCode, uri };
    });
  }

  private async dumpMifare(tag: any): Promise<MifareDump> {
    const DEFAULT_KEYS = [
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5],
      [0xd3, 0xf7, 0xd3, 0xf7, 0xd3, 0xf7],
    ];

    const sectorCount: number = tag.sectorCount ?? 16;
    const sectors: Record<number, Record<number, string>> = {};

    for (let s = 0; s < sectorCount; s++) {
      const blocks: Record<number, string> = {};
      let authenticated = false;

      for (const key of DEFAULT_KEYS) {
        try {
          await NfcManager.mifareClassicAuthenticateA(s, key);
          authenticated = true;
          break;
        } catch {
          // try next key
        }
      }

      if (authenticated) {
        const blocksPerSector = s < 32 ? 4 : 16;
        const firstBlock = s < 32 ? s * 4 : 128 + (s - 32) * 16;

        for (let b = 0; b < blocksPerSector; b++) {
          try {
            const data = await NfcManager.mifareClassicReadBlock(firstBlock + b);
            blocks[b] = this.bytesToHex(data);
          } catch {
            blocks[b] = '????????????????????????????????';
          }
        }
      }

      sectors[s] = blocks;
    }

    return { sectorCount, sectors };
  }

  /**
   * Write NDEF records to the currently connected tag.
   * Must call readTag() first to have a technology session open, or start a new one.
   */
  async writeNdef(records: NFCNdefRecord[]): Promise<{ success: boolean; error?: string }> {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Hold your phone near the tag to write',
      });

      const ndefMessage = records.map((r) => {
        if (r.tnf === 1 && r.type === 'T') {
          return Ndef.textRecord(r.payload, r.languageCode ?? 'en');
        } else if (r.tnf === 1 && r.type === 'U') {
          return Ndef.uriRecord(r.uri ?? r.payload);
        } else {
          return Ndef.record(r.tnf, r.type, [], Array.from(Buffer.from(r.payload, 'hex')));
        }
      });

      const bytes = Ndef.encodeMessage(ndefMessage);
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      await NfcManager.cancelTechnologyRequest();
      return { success: true };
    } catch (err: any) {
      await NfcManager.cancelTechnologyRequest().catch(() => {});
      return { success: false, error: err?.message ?? String(err) };
    }
  }

  /** Format a blank tag as NDEF and write an empty message. */
  async formatTag(): Promise<{ success: boolean; error?: string }> {
    try {
      await NfcManager.requestTechnology(NfcTech.NdefFormatable, {
        alertMessage: 'Hold your phone near the blank tag to format',
      });
      await NfcManager.ndefFormatableHandler.formatNdef(Ndef.encodeMessage([Ndef.textRecord('')]));
      await NfcManager.cancelTechnologyRequest();
      return { success: true };
    } catch (err: any) {
      await NfcManager.cancelTechnologyRequest().catch(() => {});
      return { success: false, error: err?.message ?? String(err) };
    }
  }

  /** Erase a tag by writing an empty NDEF message. */
  async eraseTag(): Promise<{ success: boolean; error?: string }> {
    return this.writeNdef([]);
  }

  /** Cancel any ongoing NFC scan. */
  async cancel(): Promise<void> {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch { /* already cancelled */ }
  }

  /** Cleanly shut down NFC manager. */
  async destroy(): Promise<void> {
    await this.cancel();
    // NfcManager.unregisterTagEvent is called internally on cancel
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  private bytesToHex(bytes: number[]): string {
    return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  }

  private detectTagType(technologies: string[]): NFCTagType {
    const t = technologies.join(',');
    if (t.includes('MifareClassic'))   return 'MifareClassic';
    if (t.includes('MifareUltralight')) return 'MifareUltralight';
    if (t.includes('Ndef'))            return 'Ndef';
    if (t.includes('IsoDep'))          return 'IsoDep';
    if (t.includes('NfcA'))            return 'NfcA';
    if (t.includes('NfcB'))            return 'NfcB';
    if (t.includes('NfcF'))            return 'NfcF';
    if (t.includes('NfcV'))            return 'NfcV';
    return 'Unknown';
  }
}

export const nfcManager = new NFCManager();
