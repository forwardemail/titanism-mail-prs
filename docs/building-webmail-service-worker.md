# Building Webmail: Service Worker & Offline Patterns

A service worker is essential for a PWA, but it is not a data store. Our rule:
**cache the shell, not the mail.** The real offline magic happens in IndexedDB
with optimistic updates, mutation queues, and background sync.

## The Separation

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                                                                 │
 │          SERVICE WORKER                  INDEXEDDB              │
 │          (CacheStorage)                  (db.worker)            │
 │                                                                 │
 │   ┌───────────────────────┐     ┌───────────────────────┐      │
 │   │                       │     │                       │      │
 │   │  HTML, JS, CSS        │     │  Messages, bodies     │      │
 │   │  Fonts, icons         │     │  Drafts, outbox       │      │
 │   │  Manifest             │     │  Settings, labels     │      │
 │   │  Images (30d cache)   │     │  Search index         │      │
 │   │                       │     │  Sync manifests       │      │
 │   │  STATIC ASSETS ONLY   │     │  ALL MAIL DATA        │      │
 │   │                       │     │                       │      │
 │   └───────────────────────┘     └───────────────────────┘      │
 │                                                                 │
 │   WHY: Mail data changes          WHY: Local reads are         │
 │   frequently, can be large,       0-latency, survive           │
 │   and would create divergence     offline, and sync as         │
 │   and complex invalidation.       a background process.        │
 │                                                                 │
 └─────────────────────────────────────────────────────────────────┘
```

## Service Worker Strategy

### What Gets Cached

```
 ┌──────────────────────────────────────────────────────────────┐
 │  PRECACHED (Workbox)                    RUNTIME CACHED       │
 │  ──────────────────                     ──────────────       │
 │                                                              │
 │  index.html                             Images: 30-day       │
 │  assets/*.js                            CacheFirst           │
 │  assets/*.css                                                │
 │  *.woff2, *.woff (fonts)               App icons: 30-day    │
 │  *.png, *.svg, *.ico                    CacheFirst           │
 │  manifest.json                                               │
 │  sw-sync.js                                                  │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘

 ┌──────────────────────────────────────────────────────────────┐
 │  NEVER CACHED BY SERVICE WORKER                              │
 │  ──────────────────────────────                              │
 │                                                              │
 │  /v1/* API responses                                        │
 │  /api/* endpoints                                           │
 │  Message bodies                                             │
 │  Attachments                                                │
 │  Any mail data whatsoever                                   │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘
```

### Update Model

```
 ┌───────────┐     ┌────────────────┐     ┌────────────────────┐
 │ New build │────▶│  CDN receives  │────▶│  SW detects new    │
 │ deployed  │     │  static files  │     │  version on fetch  │
 └───────────┘     └────────────────┘     └─────────┬──────────┘
                                                    │
                                                    ▼
                                          ┌────────────────────┐
                                          │  Install new SW    │
                                          │  in background     │
                                          └─────────┬──────────┘
                                                    │
                                                    ▼
                                          ┌────────────────────┐
                                          │  UI prompts user   │
                                          │  to refresh        │
                                          │  (no mid-session   │
                                          │   forced reloads)  │
                                          └────────────────────┘
```

## Offline-First Patterns

The service worker handles the app shell. Everything below handles the data.

### Pattern 1: Optimistic Updates

Apply changes to the local store and IndexedDB immediately. Sync with the API
in the background. If the API call fails, queue for retry.

```
 User action (e.g., mark as read)
       │
       ├──▶ (1) Update Svelte store         ◄── Instant UI feedback
       │
       ├──▶ (2) Write to IndexedDB          ◄── Survives page reload
       │         via db.worker
       │
       └──▶ (3) Call API                    ◄── Background
                  │
             ┌────┴────┐
             │         │
          SUCCESS    FAILURE
             │         │
             ▼         ▼
          Done    Queue mutation
                  for retry
```

**Key:** We never revert the optimistic update. On failure, the mutation goes
into a durable queue and retries when the network returns.

### Pattern 2: Mutation Queue

Failed API calls are persisted in the `meta` table under the `mutation-queue`
key. The queue is durable across page reloads and processed in order.

```
 ┌──────────────────────────────────────────────────────────────┐
 │                    MUTATION QUEUE                             │
 │                                                              │
 │  Storage: meta table (key: mutation-queue)                   │
 │  File:    src/utils/mutation-queue.js                        │
 │                                                              │
 │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │
 │  │ toggle │ │ toggle │ │  move  │ │ delete │  ...           │
 │  │  read  │ │  star  │ │ to     │ │        │               │
 │  │        │ │        │ │ trash  │ │        │               │
 │  └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘               │
 │       │          │          │          │                     │
 │       └──────────┴──────┬───┴──────────┘                     │
 │                         │                                    │
 │                    Online?                                   │
 │                    ┌────┴────┐                               │
 │                   YES       NO                               │
 │                    │         │                                │
 │                    ▼         ▼                                │
 │              Process in   Wait for                           │
 │              order via    navigator.onLine                   │
 │              API calls    or SW background sync              │
 │                                                              │
 │  Mutation types:                                            │
 │    • toggleRead    (PUT /v1/messages/:id)                   │
 │    • toggleStar    (PUT /v1/messages/:id)                   │
 │    • setLabels     (PUT /v1/messages/:id)                   │
 │    • move          (PUT /v1/messages/:id)                   │
 │    • delete        (DELETE /v1/messages/:id)                │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘
```

### Pattern 3: Outbox (Offline Send)

Composed emails are queued in the `outbox` table when offline and sent when the
network returns.

```
 User clicks Send
       │
       ├──▶ Online?
       │       │
       │   YES │   NO
       │       │    │
       │       ▼    ▼
       │    Send   Queue in outbox table
       │    via    (durable, per-account)
       │    API         │
       │                ▼
       │           Show "queued" indicator
       │                │
       │                ▼
       │           On reconnect:
       │           Process outbox in order
       │           Update status per item
```

### Pattern 4: Draft Autosave

Drafts are saved to IndexedDB automatically as the user composes, protecting
against browser crashes and network loss.

```
 ┌──────────────────────────────────────────────────────────────┐
 │                    DRAFT LIFECYCLE                            │
 │                                                              │
 │  Compose ──debounce──▶ Save to drafts table (local)         │
 │                                │                             │
 │                           Online?                            │
 │                           ┌──┴──┐                            │
 │                          YES    NO                           │
 │                           │      │                           │
 │                           ▼      ▼                           │
 │                      Sync to   Keep local,                   │
 │                      server    sync later                    │
 │                                                              │
 │  File: src/utils/draft-service.js                            │
 └──────────────────────────────────────────────────────────────┘
```

### Pattern 5: Background Sync (Service Worker)

The service worker (`sw-sync.js`) can replay queued actions when the browser
regains connectivity — even if the tab is closed.

```
 ┌──────────────────────────────────────────────────────────────┐
 │                  SW BACKGROUND SYNC                          │
 │                                                              │
 │  1. Main app queues mutation in meta table                   │
 │  2. Registers a sync tag with service worker                │
 │  3. Browser fires 'sync' event when online                  │
 │  4. sw-sync.js reads mutation queue from raw IndexedDB      │
 │     (no Dexie — SW can't import it)                         │
 │  5. Replays each mutation via fetch()                       │
 │  6. Removes processed items from queue                      │
 │                                                              │
 │  IMPORTANT: sw-sync.js uses raw IndexedDB API,             │
 │  not Dexie. DB name must match db-constants.ts.             │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘
```

### Pattern 6: Generation Counter

Prevents stale API responses from overwriting fresh data when the user
switches folders or accounts rapidly.

```
 ┌──────────────────────────────────────────────────────────────┐
 │                  GENERATION COUNTER                          │
 │                                                              │
 │  loadGeneration: 0                                          │
 │                                                              │
 │  User clicks INBOX        loadGeneration → 1                │
 │  API starts fetching...                                     │
 │                                                              │
 │  User clicks SENT         loadGeneration → 2                │
 │  API starts fetching...                                     │
 │                                                              │
 │  INBOX response arrives   gen=1, current=2 → DISCARD        │
 │  SENT response arrives    gen=2, current=2 → APPLY          │
 │                                                              │
 │  File: src/stores/mailboxActions.ts                         │
 └──────────────────────────────────────────────────────────────┘
```

### Pattern 7: Atomic Account Switch

When switching accounts, we preload the new account's cache from IndexedDB
before resetting stores — avoiding a blank flash.

```
 switchAccount("alice@example.com")
       │
       ├──▶ (1) Read IDB: folders, messages, settings
       │         for the new account (preload)
       │
       ├──▶ (2) Reset all stores (atomic)
       │
       ├──▶ (3) Apply preloaded data to stores
       │         UI shows cached data immediately
       │
       └──▶ (4) Start background sync for new account
                  Fresh deltas arrive, UI updates
```

## Key Source Files

| File                           | Role                                |
| ------------------------------ | ----------------------------------- |
| `src/utils/mutation-queue.js`  | Offline mutation queue (meta table) |
| `src/utils/outbox-service.js`  | Offline email send queue            |
| `src/utils/draft-service.js`   | Draft autosave and sync             |
| `src/utils/sync-controller.js` | Sync orchestration and scheduling   |
| `src/utils/cache-manager.js`   | Cache lifecycle and eviction        |
| `public/sw-sync.js`            | Service worker background sync      |
| `workbox.config.cjs`           | Workbox precaching configuration    |

---

**Next:** [Deployment](deployment-checklist.md) — ship to Cloudflare R2 + Workers.
