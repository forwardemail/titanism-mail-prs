# Building Webmail: The Worker Mesh

Offline-first webmail is a concurrency problem. Message parsing, API sync, and
full-text indexing are too heavy for the main thread. The solution: a worker
mesh with clear ownership boundaries and zero shared state.

## The Golden Rule

```
 ╔═══════════════════════════════════════════════════════════╗
 ║                                                           ║
 ║   db.worker is the SOLE OWNER of IndexedDB.              ║
 ║                                                           ║
 ║   Every other component talks to it over MessageChannel.  ║
 ║   No exceptions. No "quick direct reads."                 ║
 ║                                                           ║
 ╚═══════════════════════════════════════════════════════════╝
```

This avoids lock contention, prevents version conflicts, and gives us a single
place to version and migrate the schema.

## The Architecture

```
                         ┌────────────────────────┐
                         │      Main Thread        │
                         │                        │
                         │  Svelte 5 UI + Stores  │
                         │  Routing + Shortcuts   │
                         │  Worker orchestration  │
                         └───┬──────┬─────────┬───┘
                             │      │         │
                   ┌─────────┘      │         └─────────┐
                   │                │                    │
                   │ MessageChannel │ MessageChannel     │ MessageChannel
                   │                │                    │
              ┌────▼──────┐   ┌────▼──────┐   ┌────────▼────────┐
              │           │   │           │   │                 │
              │ db.worker │   │  sync     │   │  search         │
              │           │   │  .worker  │   │  .worker        │
              │ ┌───────┐ │   │           │   │                 │
              │ │Dexie 4│ │   │ API fetch │   │ FlexSearch 0.7  │
              │ │       │ │   │ PostalMime│   │ Full-text index │
              │ │13 tbls│ │   │ OpenPGP   │   │ Health checks   │
              │ └───────┘ │   │ Normalize │   │ Persistence     │
              │           │   │           │   │                 │
              └─────▲─────┘   └──┬───┬────┘   └──────▲──────────┘
                    │            │   │                │
                    │ db ops     │   │ index batches  │
                    └────────────┘   └────────────────┘
                     MessagePort       MessagePort
```

## Worker Responsibilities

```
 ┌─────────────────────────────────────────────────────────────────┐
 │  db.worker                                    src/workers/db.worker.ts
 │ ─────────────────────────────────────────────────────────────── │
 │                                                                 │
 │  OWNS: Dexie/IndexedDB connection (sole owner)                 │
 │  DOES: All CRUD, schema versioning, migrations                  │
 │  SERVES: Main thread, sync.worker, search.worker               │
 │                                                                 │
 │  DOES NOT: Make network requests, touch UI state, build indexes │
 │                                                                 │
 │  Tables:                                                        │
 │  ┌────────────┬──────────────┬──────────────┬───────────────┐  │
 │  │ accounts   │ messages     │ searchIndex  │ labels        │  │
 │  │ folders    │ messageBodies│ indexMeta    │ settings      │  │
 │  │ drafts     │ syncManifests│ meta        │ settingsLabels│  │
 │  │ outbox     │              │             │               │  │
 │  └────────────┴──────────────┴──────────────┴───────────────┘  │
 └─────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────┐
 │  sync.worker                                src/workers/sync.worker.ts
 │ ─────────────────────────────────────────────────────────────── │
 │                                                                 │
 │  OWNS: API synchronization, message parsing pipeline            │
 │  DOES:                                                          │
 │    • Fetch folders + message lists from REST API               │
 │    • Normalize and enrich message metadata                     │
 │    • Parse message bodies with PostalMime                      │
 │    • PGP decryption via OpenPGP                                │
 │    • Write results to db.worker via MessagePort                │
 │    • Forward new messages to search.worker for indexing        │
 │    • Maintain per-folder sync manifests                        │
 │    • Emit progress events to main thread                       │
 │                                                                 │
 │  DOES NOT: Open IndexedDB, render UI, own search state         │
 └─────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────┐
 │  search.worker                            src/workers/search.worker.ts
 │ ─────────────────────────────────────────────────────────────── │
 │                                                                 │
 │  OWNS: FlexSearch index (per account, per includeBody mode)     │
 │  DOES:                                                          │
 │    • Index new messages from sync.worker or main thread        │
 │    • Execute search queries with filters                       │
 │    • Persist index state to IndexedDB via db.worker            │
 │    • Health checks: compare index count vs DB count            │
 │    • Background rebuilds when divergence detected              │
 │                                                                 │
 │  DOES NOT: Fetch from API, open IndexedDB directly             │
 └─────────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────────┐
 │  Service Worker                  public/sw-sync.js + Workbox SW
 │ ─────────────────────────────────────────────────────────────── │
 │                                                                 │
 │  OWNS: CacheStorage for static assets                           │
 │  DOES:                                                          │
 │    • Precache app shell (HTML, JS, CSS, fonts, icons)          │
 │    • SPA fallback routing (serve index.html for nav requests)  │
 │    • Runtime cache for images (30-day CacheFirst)              │
 │    • Background sync replay via sw-sync.js                     │
 │                                                                 │
 │  DOES NOT: Cache API responses, own Dexie, store mail data     │
 └─────────────────────────────────────────────────────────────────┘
```

## Startup Sequence

```
 t=0ms     Main thread boots
              │
              ├──▶ (1) Initialize db.worker
              │         Open Dexie, verify schema
              │         ✓ DB ready
              │
              ├──▶ (2) Load cached state from IDB
              │         Settings, folders, labels, messages
              │         UI renders with cached data
              │
              ├──▶ (3) Connect sync.worker
              │         Pass db.worker MessagePort
              │         ✓ sync ready
              │
              ├──▶ (4) Connect search.worker
              │         Pass db.worker MessagePort
              │         Load persisted index
              │         Run health check
              │         ✓ search ready
              │
              └──▶ (5) Start initial sync
                       sync.worker fetches deltas
                       Writes to db.worker
                       Forwards batches to search.worker
                       Main thread updates UI
```

## Data Flow: Loading the Inbox

```
 User clicks INBOX
       │
       ▼
 mailboxStore.loadMessages()
       │
       ├──▶ Check in-memory LRU cache ───▶ HIT? Return immediately (0ms)
       │
       ├──▶ Check IndexedDB via db.worker ───▶ HIT? Render cached list
       │
       └──▶ sync.worker "messagePage" task
                │
                ├── GET /v1/messages?folder=INBOX
                │
                ├── Normalize metadata
                │       • Enrich flags, labels, snippets
                │       • Compute is_unread_index
                │
                ├── Write to db.worker
                │       • Upsert messages table
                │       • Update syncManifests
                │
                ├── Forward batch to search.worker
                │       • Incremental index update
                │
                └── Return to main thread
                        • Merge with existing state
                        • Update UI list
```

## Data Flow: Reading a Message

```
 User clicks message
       │
       ▼
 mailService.loadMessageDetail()
       │
       ├──▶ Check messageBodies in db.worker
       │       HIT and fresh? ───▶ Render cached body (5ms)
       │
       ├──▶ sync.worker "messageDetail" task
       │       │
       │       ├── GET /v1/messages/:id?folder=...&raw=false
       │       ├── Parse with PostalMime
       │       ├── Detect PGP? ──▶ Decrypt with OpenPGP
       │       ├── Sanitize HTML (DOMPurify)
       │       ├── Cache to db.worker (messageBodies)
       │       └── Return parsed result
       │
       └──▶ Fallback: main thread direct API call
               (if sync.worker unavailable)
```

## Message Passing Protocol

All workers use a request/response protocol over `MessageChannel`:

```
 ┌──────────────────────────────────────────────────────────────┐
 │  db.worker protocol                                         │
 │                                                             │
 │  REQUEST:   { id, action, table, payload }                  │
 │  RESPONSE:  { id, ok: true, result }                        │
 │          or { id, ok: false, error }                        │
 ├──────────────────────────────────────────────────────────────┤
 │  sync.worker protocol                                       │
 │                                                             │
 │  TASK:      { type: 'task', taskId, task }                  │
 │  REQUEST:   { type: 'request', requestId, action, payload } │
 │  RESPONSE:  { type: 'requestComplete', requestId, result }  │
 │          or { type: 'requestError', requestId, error }      │
 ├──────────────────────────────────────────────────────────────┤
 │  search.worker protocol                                     │
 │                                                             │
 │  REQUEST:   { id, action, payload }                         │
 │  RESPONSE:  { id, ok: true, result }                        │
 │          or { id, ok: false, error }                        │
 └──────────────────────────────────────────────────────────────┘
```

## Fallback & Resilience

```
 ┌────────────────────┐    FAIL    ┌──────────────────────────┐
 │ sync.worker fetch  │──────────▶│ Main thread direct API   │
 │ (primary path)     │           │ (graceful degradation)   │
 └────────────────────┘           └──────────────────────────┘

 ┌────────────────────┐    FAIL    ┌──────────────────────────┐
 │ search.worker      │──────────▶│ Main thread SearchService│
 │ FlexSearch query   │           │ (in-memory fallback)     │
 └────────────────────┘           └──────────────────────────┘

 ┌────────────────────┐    FAIL    ┌──────────────────────────┐
 │ db.worker          │──────────▶│ Delete DB + re-init      │
 │ Dexie open/query   │           │ Resync from API          │
 └────────────────────┘           └──────────────────────────┘
```

Workers can restart independently without UI resets. The main thread always has
a fallback path to direct API calls.

## Key Source Files

| File                                | Role                               |
| ----------------------------------- | ---------------------------------- |
| `src/workers/db.worker.ts`          | IndexedDB owner, schema, CRUD      |
| `src/workers/sync.worker.ts`        | API sync, parsing, PGP             |
| `src/workers/search.worker.ts`      | FlexSearch indexing and queries    |
| `src/utils/db-worker-client.js`     | Main thread proxy to db.worker     |
| `src/utils/sync-worker-client.js`   | Main thread proxy to sync.worker   |
| `src/utils/search-worker-client.js` | Main thread proxy to search.worker |
| `src/utils/sync-controller.js`      | Sync orchestration and scheduling  |
| `public/sw-sync.js`                 | Service worker background sync     |

---

**Next:** [Data Layer](building-webmail-db-schema-recovery.md) — how IndexedDB
becomes product memory.
