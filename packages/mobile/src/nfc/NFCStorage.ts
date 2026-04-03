import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NFCTag } from '@phonebridge/shared';

const STORAGE_KEY = '@phonebridge/nfc-tags';

export class NFCStorage {
  async loadTags(): Promise<NFCTag[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as NFCTag[]) : [];
    } catch {
      return [];
    }
  }

  async saveTags(tags: NFCTag[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
    } catch (err) {
      console.error('[NFCStorage] saveTags failed:', err);
    }
  }

  async addTag(tag: NFCTag): Promise<NFCTag[]> {
    const tags = await this.loadTags();
    const updated = [tag, ...tags];
    await this.saveTags(updated);
    return updated;
  }

  async updateTag(id: string, updates: Partial<Pick<NFCTag, 'name' | 'notes'>>): Promise<NFCTag[]> {
    const tags = await this.loadTags();
    const updated = tags.map((t) => (t.id === id ? { ...t, ...updates } : t));
    await this.saveTags(updated);
    return updated;
  }

  async deleteTag(id: string): Promise<NFCTag[]> {
    const tags = await this.loadTags();
    const updated = tags.filter((t) => t.id !== id);
    await this.saveTags(updated);
    return updated;
  }

  async getTag(id: string): Promise<NFCTag | undefined> {
    const tags = await this.loadTags();
    return tags.find((t) => t.id === id);
  }

  async clearAll(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export const nfcStorage = new NFCStorage();
