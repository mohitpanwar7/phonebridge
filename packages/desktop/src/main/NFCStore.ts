import type { NFCTag } from '@phonebridge/shared';

/**
 * NFCStore — in-memory store for NFC tags received from the phone.
 * Mirrors the phone's NFCStorage so the desktop can show and export tags.
 */
export class NFCStore {
  private tags = new Map<string, NFCTag>();
  private lastScanned: NFCTag | null = null;

  /** Replace entire tag list (from nfcSavedTags sync message). */
  syncTags(tags: NFCTag[]): void {
    this.tags.clear();
    for (const t of tags) this.tags.set(t.id, t);
  }

  /** Add or update a single tag (from nfcTagScanned). */
  upsertTag(tag: NFCTag): void {
    this.tags.set(tag.id, tag);
    this.lastScanned = tag;
  }

  getTag(id: string): NFCTag | undefined {
    return this.tags.get(id);
  }

  getAllTags(): NFCTag[] {
    return Array.from(this.tags.values()).sort((a, b) => b.savedAt - a.savedAt);
  }

  getLastScanned(): NFCTag | null {
    return this.lastScanned;
  }

  deleteTag(id: string): void {
    this.tags.delete(id);
  }

  clear(): void {
    this.tags.clear();
    this.lastScanned = null;
  }

  get size(): number {
    return this.tags.size;
  }
}
