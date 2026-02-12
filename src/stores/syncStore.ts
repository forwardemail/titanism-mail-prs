import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { db } from '../utils/db.js';
import { accountKey } from '../utils/sync-helpers.ts';

export interface SyncManifest {
  account: string;
  folder?: string;
  lastSync?: number;
  lastUid?: number;
  lastModseq?: string;
}

const manifests: Writable<SyncManifest[]> = writable([]);
const loading: Writable<boolean> = writable(false);
const error: Writable<string> = writable('');

async function refresh(account: string): Promise<void> {
  loading.set(true);
  error.set('');
  try {
    const acct = accountKey(account);
    const list = await db.syncManifests?.where?.('account')?.equals?.(acct)?.toArray?.();
    manifests.set(Array.isArray(list) ? list : []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load sync manifests';
    error.set(message);
  } finally {
    loading.set(false);
  }
}

export const syncStore = {
  state: {
    manifests,
    loading,
    error,
  },
  actions: {
    refresh,
  },
};
