/**
 * HCEService — Host Card Emulation for replaying saved NFC tags.
 *
 * Android HCE can emulate NDEF / ISO-DEP Type 4 tags. It CANNOT clone
 * MIFARE Classic UID (hardware limitation). Only tags with canEmulate=true
 * are offered for replay.
 *
 * The actual APDU response logic runs in PhoneBridgeHCEService.java.
 * This TS module provides the JS-side bridge:
 *  - Passes NDEF payload to the Java service via a React Native module
 *  - The Java service holds the data in a static field and responds to
 *    APDU SELECT commands from NFC readers
 *
 * Requires: PhoneBridgeHCEService.java registered in AndroidManifest.xml
 */

import { NativeModules, Platform } from 'react-native';
import type { NFCTag } from '@phonebridge/shared';

// Native module exposed by PhoneBridgeHCEModule.java
const { PhoneBridgeHCE } = NativeModules;

export class HCEService {
  private activeTag: NFCTag | null = null;

  /** Returns true if HCE is available on this device. */
  isAvailable(): boolean {
    if (Platform.OS !== 'android') return false;
    return !!PhoneBridgeHCE;
  }

  /**
   * Start emulating the given tag. Only works for NDEF / IsoDep tags.
   * Returns false if HCE is not available or the tag cannot be emulated.
   */
  async startEmulation(tag: NFCTag): Promise<boolean> {
    if (!this.isAvailable()) {
      console.warn('[HCEService] HCE not available (iOS or native module missing)');
      return false;
    }

    if (!tag.canEmulate) {
      console.warn('[HCEService] Tag type', tag.tagType, 'cannot be emulated via HCE');
      return false;
    }

    try {
      // Build NDEF payload bytes for the Java service
      const payload = this.buildNdefPayload(tag);
      await PhoneBridgeHCE.startEmulation(tag.id, payload);
      this.activeTag = tag;
      console.log('[HCEService] Emulating tag:', tag.name, '(', tag.uid, ')');
      return true;
    } catch (err) {
      console.error('[HCEService] startEmulation failed:', err);
      return false;
    }
  }

  /** Stop HCE emulation. */
  async stopEmulation(): Promise<void> {
    if (!this.isAvailable() || !this.activeTag) return;
    try {
      await PhoneBridgeHCE.stopEmulation();
      this.activeTag = null;
      console.log('[HCEService] Stopped');
    } catch (err) {
      console.error('[HCEService] stopEmulation failed:', err);
    }
  }

  get activeEmulatedTag(): NFCTag | null {
    return this.activeTag;
  }

  get isEmulating(): boolean {
    return this.activeTag !== null;
  }

  /**
   * Serialize NDEF records to a hex string for the Java service.
   * The Java side will parse and serve these bytes in APDU responses.
   */
  private buildNdefPayload(tag: NFCTag): string {
    if (!tag.ndefRecords || tag.ndefRecords.length === 0) return '';

    // Simple NDEF encoding: each record as "tnf:type:payload" separated by '|'
    // The Java HCE service parses this format
    return tag.ndefRecords
      .map((r) => `${r.tnf}:${r.type}:${Buffer.from(r.payload).toString('hex')}`)
      .join('|');
  }
}

export const hceService = new HCEService();
