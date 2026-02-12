import { writable, get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { SearchService, SavedSearchService, setSearchDbClient } from '../utils/search-service';
import { mapMessageToDoc } from '../utils/search-mapping';
import { Local } from '../utils/storage';
import { db } from '../utils/db';
import { parseSearchQuery, applySearchFilters } from '../utils/search-query';
import { SearchWorkerClient } from '../utils/search-worker-client';
import { connectSearchWorker } from '../utils/sync-controller';
import { indexProgress } from './mailboxActions';
import { resolveSearchBodyIndexing } from '../utils/search-body-indexing.js';
import type { Message, SearchStats, SearchResult } from '../types';
import { warn } from '../utils/logger.ts';

export interface SearchHealth {
  healthy: boolean;
  messagesCount: number;
  indexCount: number;
  divergence: number;
  needsRebuild: boolean;
  needsIncrementalSync?: boolean;
}

export interface SavedSearch {
  name: string;
  query: string;
  createdAt?: number;
  options?: Record<string, unknown>;
}

export interface SearchOptions {
  folder?: string | null;
  crossFolder?: boolean;
  limit?: number;
  candidates?: Message[];
}

export interface RebuildOptions {
  silent?: boolean;
}

interface ToastsRef {
  show?: (message: string, type: string) => void;
}

// Set up db client for SearchService on main thread
setSearchDbClient(db);

let indexToastsRef: ToastsRef | null = null;

export const setIndexToasts = (toasts: ToastsRef): void => {
  indexToastsRef = toasts;
};

const ready: Writable<boolean> = writable(false);
const loading: Writable<boolean> = writable(false);
const stats: Writable<SearchStats> = writable({
  count: 0,
  sizeBytes: 0,
  includeBody: false,
  account: 'default',
});
const error: Writable<string> = writable('');
const query: Writable<string> = writable('');
const results: Writable<SearchResult[]> = writable([]);
const savedSearches: Writable<SavedSearch[]> = writable([]);
const health: Writable<SearchHealth> = writable({
  healthy: true,
  messagesCount: 0,
  indexCount: 0,
  divergence: 0,
  needsRebuild: false,
});
const includeBody: Writable<boolean> = writable(resolveSearchBodyIndexing());

let searchService: SearchService | null = null;
let savedSearchService: SavedSearchService | null = null;
let accountId: string = Local.get('email') || 'default';
let workerClient: SearchWorkerClient | null = null;
let syncWorkerConnected = false;
let startupCheckDone = false;

const refreshStats = (): void => {
  if (!searchService) return;
  stats.set(searchService.getStats());
};

const refreshSavedSearches = async (): Promise<void> => {
  if (!savedSearchService) return;
  const list = await savedSearchService.getAll();
  savedSearches.set(list || []);
};

// Lazy init for main-thread SearchService - only create when worker fails
const ensureMainThreadService = async (): Promise<void> => {
  if (searchService) return;
  searchService = new SearchService({
    includeBody: get(includeBody),
    account: accountId,
  });
  await searchService.loadFromCache();
  refreshStats();
};

const ensureInitialized = async (
  account: string = Local.get('email') || 'default',
): Promise<void> => {
  const normalizedAccount = account || 'default';
  if (workerClient && accountId === normalizedAccount) return;

  // Terminate old worker before creating new one to prevent parallel execution
  if (workerClient) {
    try {
      workerClient.terminate();
    } catch {
      // Ignore termination errors
    }
    workerClient = null;
    syncWorkerConnected = false; // Reset port flag so new connection is established
  }

  accountId = normalizedAccount;
  loading.set(true);
  error.set('');

  try {
    // Prefer worker - only init main-thread service on fallback
    try {
      workerClient = new SearchWorkerClient();
    } catch {
      workerClient = null;
      await ensureMainThreadService();
    }
    savedSearchService = new SavedSearchService(accountId);
    if (workerClient) {
      await workerClient.init(accountId, get(includeBody));

      // Connect sync worker to search worker for incremental indexing
      if (!syncWorkerConnected) {
        try {
          await connectSearchWorker(workerClient);
          syncWorkerConnected = true;
        } catch {
          // ignore
        }
      }

      // On first init, check if we need to rebuild index from cache
      if (!startupCheckDone) {
        startupCheckDone = true;
        await runStartupCheck();
      }
    }
    await refreshSavedSearches();
    ready.set(true);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Search initialization failed';
    error.set(message);
  } finally {
    loading.set(false);
  }
};

// Check index health on startup and trigger rebuild or incremental sync if needed
const runStartupCheck = async (): Promise<void> => {
  if (!workerClient) return;

  try {
    const healthResult = await workerClient.getHealth({
      account: accountId,
      includeBody: get(includeBody),
    });
    health.set(healthResult);

    // If index is empty but messages exist, trigger full rebuild
    if (healthResult.needsRebuild) {
      await rebuildFromCache({ silent: false });
    } else if (healthResult.needsIncrementalSync) {
      // If some messages are missing, do incremental sync (faster than full rebuild)
      const syncResult = await workerClient.syncMissingMessages({
        account: accountId,
        includeBody: get(includeBody),
      });
      if (syncResult?.stats) stats.set(syncResult.stats);
      // Re-check health after sync
      const newHealth = await workerClient.getHealth({
        account: accountId,
        includeBody: get(includeBody),
      });
      health.set(newHealth);
    }
  } catch (err) {
    warn('[searchStore] Startup health check failed', err);
  }
};

// Manually check health and update store
const checkHealth = async (): Promise<SearchHealth | null> => {
  if (!workerClient) return null;

  try {
    const healthResult = await workerClient.getHealth({
      account: accountId,
      includeBody: get(includeBody),
    });
    health.set(healthResult);
    return healthResult;
  } catch (err) {
    warn('[searchStore] Health check failed', err);
    return null;
  }
};

// Get the worker client (for external use, e.g., sync-controller)
const getWorkerClient = (): SearchWorkerClient | null => workerClient;

// Sync only missing messages (faster than full rebuild)
const syncMissingMessages = async (): Promise<{ stats?: SearchStats } | null> => {
  if (!workerClient) return null;

  loading.set(true);
  try {
    const result = await workerClient.syncMissingMessages({
      account: accountId,
      includeBody: get(includeBody),
    });
    if (result?.stats) stats.set(result.stats);

    // Update health after sync
    const healthResult = await workerClient.getHealth({
      account: accountId,
      includeBody: get(includeBody),
    });
    health.set(healthResult);

    return result;
  } catch (err) {
    warn('[searchStore] syncMissingMessages failed', err);
    return null;
  } finally {
    loading.set(false);
  }
};

const indexMessages = async (messages: Message[] = []): Promise<void> => {
  if (!messages?.length) return;
  await ensureInitialized();
  if (workerClient) {
    try {
      await workerClient.index({
        account: accountId,
        includeBody: get(includeBody),
        messages,
      });
      refreshStats();
      return;
    } catch {
      // ignore and fall back
    }
  }

  // Fallback: ensure main-thread service exists
  await ensureMainThreadService();

  let bodyMap: Map<string, string> | null = null;
  if (get(includeBody)) {
    const keys = messages.map((msg) => [accountId, msg.id]);
    try {
      const bodies = await db.messageBodies.bulkGet(keys);
      bodyMap = new Map();
      bodies?.forEach((rec: { id?: string; textContent?: string; body?: string }) => {
        if (rec?.id) bodyMap!.set(rec.id, rec.textContent || rec.body || '');
      });
    } catch (err) {
      warn('search body lookup failed', err);
    }
  }

  searchService!.upsertEntries(
    messages.map((msg) => mapMessageToDoc(msg, bodyMap?.get(msg.id) || '')),
  );
  await searchService!.persist();
  refreshStats();
};

const removeFromIndex = async (ids: string[] = []): Promise<void> => {
  if (!ids?.length) return;
  await ensureInitialized();
  if (workerClient) {
    try {
      await workerClient.remove({ account: accountId, ids });
      refreshStats();
      return;
    } catch {
      // ignore and fall back
    }
  }
  // Fallback: ensure main-thread service exists
  await ensureMainThreadService();
  searchService!.removeEntriesByIds(ids);
  await searchService!.persist();
  refreshStats();
};

const search = async (
  q: string,
  { folder = null, crossFolder = false, limit = 200, candidates = [] }: SearchOptions = {},
): Promise<SearchResult[]> => {
  await ensureInitialized();
  const parsed = parseSearchQuery(q || '');
  const { text, filters, ast } = parsed;
  query.set(q || '');

  const hasFilters =
    Boolean(text) ||
    filters?.from?.length > 0 ||
    filters?.to?.length > 0 ||
    filters?.subject?.length > 0 ||
    filters?.labels?.length > 0 ||
    filters.isUnread !== null ||
    filters.hasAttachment !== null ||
    filters.size ||
    filters.folder ||
    filters.before ||
    filters.after ||
    ast;

  if (!hasFilters) {
    results.set([]);
    return [];
  }

  const effectiveFolder = filters.folder || folder;
  const useCrossFolder = crossFolder || filters.scope === 'all' || effectiveFolder === 'all';

  if (workerClient) {
    try {
      // Only pass candidate IDs to avoid expensive serialization of full message objects
      const candidateIds = candidates?.length ? candidates.map((c) => c.id).filter(Boolean) : [];
      const res = await workerClient.search({
        account: accountId,
        query: q,
        folder: effectiveFolder,
        crossFolder: useCrossFolder,
        limit,
        candidateIds,
        includeBody: get(includeBody),
      });
      if (res?.stats) stats.set(res.stats);
      results.set(res?.results || []);
      return res?.results || [];
    } catch {
      // ignore and fall back
    }
  }

  // Fallback: ensure main-thread service exists
  await ensureMainThreadService();

  let hits: SearchResult[] = [];
  if (!text) {
    if (useCrossFolder || !effectiveFolder) {
      hits = await db.messages.where('account').equals(accountId).toArray();
    } else {
      hits = await db.messages
        .where('[account+folder]')
        .equals([accountId, effectiveFolder])
        .toArray();
    }
  } else if (useCrossFolder || !candidates?.length) {
    hits = await searchService!.searchAllFolders(text, limit);
    if (!useCrossFolder && effectiveFolder) {
      hits = hits.filter((h) => (h.folder || '').toLowerCase() === effectiveFolder.toLowerCase());
    }
  } else {
    hits = searchService!.search(text, candidates, {
      folder: effectiveFolder,
      limit,
      crossFolder: useCrossFolder,
    });
  }

  // Hydrate from cache when we don't already have full message objects
  if (!candidates?.length) {
    const ids = Array.from(new Set((hits || []).map((h) => h.id).filter(Boolean)));
    if (ids.length) {
      try {
        const records = await db.messages.bulkGet(ids.map((id) => [accountId, id]));
        const byId = new Map<string, SearchResult>();
        records?.forEach((rec: SearchResult | undefined) => {
          if (rec?.id) byId.set(rec.id, rec);
        });
        hits = hits.map((h) => {
          const hydrated = byId.get(h.id);
          if (hydrated) return hydrated;
          const parsedDate =
            typeof h.date === 'number'
              ? h.date
              : Number.isFinite(Date.parse(String(h.date) || ''))
                ? Date.parse(String(h.date) || '')
                : null;
          return { ...h, dateMs: parsedDate, date: parsedDate || h.date || null } as SearchResult;
        });
      } catch (err) {
        warn('[searchStore] hydrate results failed', err);
      }
    }
  }

  const filtered = applySearchFilters(hits || [], {
    ...filters,
    folder: effectiveFolder,
    ast,
  });

  results.set(filtered || []);
  return filtered;
};

const rebuildFromCache = async (options: RebuildOptions = {}): Promise<{ count: number }> => {
  await ensureInitialized();
  const account = accountId;
  const silent = options.silent || false;
  const startTime = Date.now();

  loading.set(true);
  indexProgress.set({
    active: true,
    current: 0,
    total: 0,
    message: 'Building search index...',
  });
  if (!silent) {
    indexToastsRef?.show?.('Building search index...', 'info');
  }

  try {
    // Prefer using worker's dedicated rebuildFromCache action
    if (workerClient) {
      const res = await workerClient.rebuildFromCache({
        account,
        includeBody: get(includeBody),
      });
      if (res?.stats) stats.set(res.stats);

      // Update health after rebuild
      const healthResult = await workerClient.getHealth({
        account,
        includeBody: get(includeBody),
      });
      health.set(healthResult);

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      indexProgress.set({ active: false, current: 0, total: 0, message: '' });
      if (!silent) {
        indexToastsRef?.show?.(
          `Search index built (${res?.count || 0} messages${elapsed > 2 ? `, ${elapsed}s` : ''})`,
          'success',
        );
      }

      return { count: res?.count || 0 };
    }

    // Fallback to main thread
    const messages = await db.messages.where('account').equals(account).toArray();
    if (!messages?.length) {
      stats.set({ count: 0, sizeBytes: 0, includeBody: get(includeBody), account });
      indexProgress.set({ active: false, current: 0, total: 0, message: '' });
      return { count: 0 };
    }

    indexProgress.update((p) => ({
      ...p,
      total: messages.length,
      message: `Indexing ${messages.length} messages...`,
    }));

    await ensureMainThreadService();
    let bodyMap: Map<string, string> | null = null;
    if (get(includeBody)) {
      const keys = messages.map((msg: Message) => [account, msg.id]);
      try {
        const bodies = await db.messageBodies.bulkGet(keys);
        bodyMap = new Map();
        bodies?.forEach((rec: { id?: string; textContent?: string; body?: string }) => {
          if (rec?.id) bodyMap!.set(rec.id, rec.textContent || rec.body || '');
        });
      } catch (err) {
        warn('[searchStore] rebuild body lookup failed', err);
      }
    }

    await searchService!.reset(
      messages.map((msg: Message) => mapMessageToDoc(msg, bodyMap?.get(msg.id) || '')),
    );
    refreshStats();

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    indexProgress.set({ active: false, current: 0, total: 0, message: '' });
    if (!silent) {
      indexToastsRef?.show?.(
        `Search index built (${messages.length} messages${elapsed > 2 ? `, ${elapsed}s` : ''})`,
        'success',
      );
    }

    return { count: messages.length };
  } catch (err) {
    warn('[searchStore] rebuildFromCache failed', err);
    indexProgress.set({ active: false, current: 0, total: 0, message: '' });
    indexToastsRef?.show?.('Search index build failed', 'error');
    throw err;
  } finally {
    loading.set(false);
  }
};

const saveSearch = async (
  name: string,
  q: string,
  options: Record<string, unknown> = {},
): Promise<SavedSearch> => {
  await ensureInitialized();
  const saved = await savedSearchService!.save(name, q, options);
  await refreshSavedSearches();
  return saved;
};

const deleteSavedSearch = async (name: string): Promise<void> => {
  await ensureInitialized();
  await savedSearchService!.delete(name);
  await refreshSavedSearches();
};

const setIncludeBody = async (value: boolean): Promise<void> => {
  const next = Boolean(value);
  includeBody.set(next);
  Local.set('search_body_indexing', next ? 'true' : 'false');
  Local.set('include_body', next ? 'true' : 'false');

  // Reinitialize search service so body flag propagates
  searchService = null;
  if (workerClient) {
    try {
      await workerClient.init(accountId, next);
    } catch {
      // ignore
    }
  }
  await ensureInitialized(accountId);
};

/**
 * Reset search connection state - call when switching accounts or during recovery
 */
const resetSearchConnection = (): void => {
  syncWorkerConnected = false;
  startupCheckDone = false;
};

/**
 * Terminate search worker and cleanup - call during shutdown or HMR
 */
const terminateWorker = (): void => {
  if (workerClient) {
    try {
      workerClient.terminate();
    } catch {
      // Ignore termination errors
    }
    workerClient = null;
  }
  syncWorkerConnected = false;
  startupCheckDone = false;
  searchService = null;
};

export const searchStore = {
  state: {
    ready,
    loading,
    stats,
    error,
    query,
    results,
    savedSearches,
    includeBody,
    health,
  },
  actions: {
    ensureInitialized,
    indexMessages,
    removeFromIndex,
    search,
    rebuildFromCache,
    syncMissingMessages,
    saveSearch,
    deleteSavedSearch,
    refreshSavedSearches,
    setIncludeBody,
    checkHealth,
    getWorkerClient,
    resetSearchConnection,
    terminateWorker,
  },
};

// HMR cleanup - terminate workers when module is replaced during development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    terminateWorker();
  });
}
