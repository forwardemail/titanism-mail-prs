# Cache & Indexing Architecture: Detailed Reference

This is the deep-dive companion to [Building Webmail: Data Layer](building-webmail-db-schema-recovery.md).
It covers storage layers, write ownership, read patterns, eviction policies,
reconciliation strategies, and troubleshooting.

## Storage Layers at a Glance

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                                                                     │
 │  LAYER 1: IN-MEMORY                              Read: 0ms         │
 │  ─────────────────                                                  │
 │  Svelte $state stores, LRU caches                                  │
 │  Lost on page navigation. Fastest reads.                           │
 │                                                                     │
 │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
 │                                                                     │
 │  LAYER 2: INDEXEDDB (db.worker/Dexie)             Read: ~5ms       │
 │  ────────────────────────────────────                               │
 │  13 tables, compound keys, per-account data                        │
 │  Survives page reloads. Source of local truth.                     │
 │                                                                     │
 │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
 │                                                                     │
 │  LAYER 3: SEARCH INDEX (search.worker/FlexSearch)                  │
 │  ────────────────────────────────────────────────                   │
 │  Full-text index persisted to IndexedDB                            │
 │  Rebuilt if health check detects divergence.                       │
 │                                                                     │
 │  ═══════════════════════════════════════════════════════════════    │
 │                                                                     │
 │  SEPARATE: SERVICE WORKER (CacheStorage)                           │
 │  ───────────────────────────────────────                           │
 │  JS, CSS, fonts, icons, images ONLY                                │
 │  NO API responses. NO mail data.                                   │
 │                                                                     │
 └─────────────────────────────────────────────────────────────────────┘
```

## Who Writes What

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  sync.worker ─────────────▶  messages                           │
 │                               messageBodies                     │
 │                               folders                           │
 │                               syncManifests                     │
 │                                                                  │
 │  main thread ─────────────▶  messages (flags, labels, folder)   │
 │  (fallback + user actions)    messageBodies (fallback writes)   │
 │                               settings, settingsLabels          │
 │                               outbox, drafts                    │
 │                                                                  │
 │  search.worker ───────────▶  searchIndex                        │
 │                               indexMeta                         │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

## Read Patterns

### Message List

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  1. In-memory LRU cache ────▶ HIT → return (0ms)               │
 │                                                                  │
 │  2. IndexedDB query:                                            │
 │     messages.where([account+folder]).sortBy(date)               │
 │     → HIT → render list (5ms)                                   │
 │                                                                  │
 │  3. API delta fetch (background):                               │
 │     sync.worker → /v1/messages?folder=...                       │
 │     → merge into IDB + update UI                                │
 │                                                                  │
 │  Labels merging: if API response omits labels, merge from       │
 │  cached IndexedDB records (mergeMissingLabels)                  │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

### Message Detail

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  1. messageBodies.get([account+id])                             │
 │     → HIT and fresh? → render body (5ms)                        │
 │                                                                  │
 │  2. sync.worker "messageDetail" task                            │
 │     → GET /v1/messages/:id?raw=false                            │
 │     → Parse with PostalMime                                     │
 │     → PGP decrypt if needed                                     │
 │     → Cache to messageBodies                                    │
 │                                                                  │
 │  3. FALLBACK: main thread direct API fetch                      │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

### Folders / Labels / Settings

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  Read cached folders, labels, settings at boot for fast         │
 │  hydration. Sync with API in background.                        │
 │                                                                  │
 │  Settings are per-account, keyed by account in IDB.             │
 │  Labels merge: settingsLabels + cached labels + msg-derived.    │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

## Search Indexing Flow

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  PRIMARY:                                                       │
 │  API → sync.worker → db.worker (messages)                       │
 │                    → search.worker (index batch)                 │
 │                                                                  │
 │  FALLBACK:                                                      │
 │  API → main thread → db.worker (messages)                       │
 │                    → search.worker (index batch)                 │
 │                                                                  │
 │  ON STARTUP:                                                    │
 │  search.worker loads persisted index from searchIndex table     │
 │  Compares indexMeta counts vs messages count                    │
 │  Diverged? → background rebuild (non-blocking)                  │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

## Data Freshness & Reconciliation

```
 ┌─────────────────────────┬────────────────────────────────────────┐
 │  DATA TYPE              │  RECONCILIATION STRATEGY                │
 ├─────────────────────────┼────────────────────────────────────────┤
 │  Labels                 │  Merge cached labels when API omits    │
 │                         │  them (mergeMissingLabels)             │
 ├─────────────────────────┼────────────────────────────────────────┤
 │  Flags (read/star)      │  Update in-place in messages table     │
 ├─────────────────────────┼────────────────────────────────────────┤
 │  Moves / deletes        │  Optimistic UI update, then update     │
 │                         │  specific record in IDB on success     │
 ├─────────────────────────┼────────────────────────────────────────┤
 │  Search index           │  Health check on startup; rebuild if   │
 │                         │  count diverges from messages table    │
 ├─────────────────────────┼────────────────────────────────────────┤
 │  Sync progress          │  syncManifests track per-folder cursor │
 │                         │  (lastUID, lastSyncAt, pagesFetched)  │
 └─────────────────────────┴────────────────────────────────────────┘
```

## Caching Policies & Eviction

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                      EVICTION PRIORITY                           │
 │                                                                  │
 │  Managed by: src/utils/cache-manager.js                         │
 │                                                                  │
 │  ┌────────────────────────────────────────┐                     │
 │  │  KEEP LONGEST                          │                     │
 │  │  ░░░░░░░░░░░░░░░░░░░░  metadata       │                     │
 │  │  ░░░░░░░░░░░░░░░░░░    settings       │                     │
 │  │  ░░░░░░░░░░░░░░░░      folders        │                     │
 │  │                                        │                     │
 │  │  EVICT FIRST                           │                     │
 │  │  ░░░░░░░░░░░░          bodies          │                     │
 │  │  ░░░░░░░░              search index    │                     │
 │  │  ░░░░                  attachment blobs │                     │
 │  └────────────────────────────────────────┘                     │
 │                                                                  │
 │  Attachment cache: 50MB quota (meta table, key: attachment:*)   │
 │  Contact cache: meta table (key: contacts:*)                    │
 │  Storage tracked: navigator.storage.estimate()                  │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

## Failure & Fallback Modes

```
 ┌────────────────────────┬─────────────────────────────────────────┐
 │  FAILURE               │  FALLBACK                               │
 ├────────────────────────┼─────────────────────────────────────────┤
 │  sync.worker fails     │  Main thread fetches /v1/messages and   │
 │                        │  writes to db.worker                    │
 ├────────────────────────┼─────────────────────────────────────────┤
 │  search.worker fails   │  Main thread SearchService + DB query   │
 ├────────────────────────┼─────────────────────────────────────────┤
 │  IndexedDB corrupt     │  Recovery: delete DB, re-init, resync   │
 │  or version mismatch   │  from API. Credentials preserved.       │
 ├────────────────────────┼─────────────────────────────────────────┤
 │  Quota exceeded        │  Evict bodies and attachments first     │
 └────────────────────────┴─────────────────────────────────────────┘
```

## Troubleshooting Checklist

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  1. Is db.worker initialized?                                   │
 │     → Check: DevTools → Application → IndexedDB                │
 │     → Should see webmail-cache-v1 with 13 tables               │
 │                                                                  │
 │  2. Does messages table have records after API fetch?           │
 │     → Open messages table, filter by account + folder           │
 │                                                                  │
 │  3. Are searchIndex/indexMeta populated after indexing?          │
 │     → If empty, search will return no results                  │
 │                                                                  │
 │  4. Is UI reading from cache before network?                    │
 │     → First render should show cached data                     │
 │     → Network data should update, not replace                  │
 │                                                                  │
 │  5. Are syncManifests progressing?                              │
 │     → lastSyncAt should update after each sync                 │
 │     → pagesFetched should increment                            │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

## Reference Files

| File                                | Role                             |
| ----------------------------------- | -------------------------------- |
| `src/workers/db.worker.ts`          | IndexedDB owner, schema, CRUD    |
| `src/workers/sync.worker.ts`        | API sync, writing to IDB         |
| `src/workers/search.worker.ts`      | FlexSearch indexing              |
| `src/utils/db-worker-client.js`     | Main thread proxy to db.worker   |
| `src/utils/sync-worker-client.js`   | Main thread proxy to sync.worker |
| `src/utils/search-worker-client.js` | Main thread proxy to search      |
| `src/utils/cache-manager.js`        | Eviction and lifecycle           |
| `src/utils/attachment-cache.js`     | Attachment blob cache (50MB)     |
| `src/utils/contact-cache.js`        | Contact autocomplete cache       |
| `src/stores/mailboxStore.ts`        | Message list orchestration       |
| `src/stores/mailService.ts`         | Message body + attachments       |
| `src/stores/settingsStore.ts`       | Settings + labels sync           |
