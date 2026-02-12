# Building Webmail: The Data Layer

IndexedDB is not a cache here — it IS the product. The schema, upgrade
strategy, and recovery paths define whether offline-first feels solid or
fragile.

## Why IndexedDB Is Product Memory

The UI reads from local storage first. The API only supplies deltas. That means
IndexedDB holds everything the user expects to see immediately:

```
 ┌─────────────────────────────────────────────────────────────┐
 │                  What lives in IndexedDB                     │
 │                                                             │
 │  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
 │  │   Messages     │  │   Settings     │  │   Search     │  │
 │  │                │  │                │  │   Index      │  │
 │  │  Headers       │  │  Theme         │  │              │  │
 │  │  Flags         │  │  Font          │  │  FlexSearch  │  │
 │  │  Labels        │  │  PGP keys      │  │  payloads    │  │
 │  │  Folders       │  │  Labels        │  │  Metadata    │  │
 │  │  Snippets      │  │  Preferences   │  │  Health info │  │
 │  └────────────────┘  └────────────────┘  └──────────────┘  │
 │                                                             │
 │  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
 │  │  Message       │  │   Drafts &     │  │   Sync       │  │
 │  │  Bodies        │  │   Outbox       │  │   Manifests  │  │
 │  │                │  │                │  │              │  │
 │  │  HTML/text     │  │  Autosaved     │  │  Per-folder  │  │
 │  │  Attachments   │  │  compositions  │  │  cursors     │  │
 │  │  Sanitized     │  │  Queued sends  │  │  Progress    │  │
 │  └────────────────┘  └────────────────┘  └──────────────┘  │
 └─────────────────────────────────────────────────────────────┘
```

## Database Schema

Database: `webmail-cache-v1` (prod) / `webmail-cache-dev` (dev)
Schema version: `1` (defined in `src/utils/db-constants.ts`)

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │  TABLE              PRIMARY KEY          PURPOSE                    │
 │ ─────────────────── ──────────────────── ───────────────────────── │
 │                                                                     │
 │  accounts           id                   Account registry           │
 │  folders            [account+path]       Cached folder tree         │
 │  messages           [account+id]         Message headers + flags    │
 │  messageBodies      [account+id]         Parsed HTML/text bodies    │
 │  drafts             [account+id]         Autosaved drafts           │
 │  outbox             [account+id]         Queued outgoing mail       │
 │  syncManifests      [account+folder]     Per-folder sync cursors    │
 │  labels             [account+id]         User-defined labels        │
 │  settings           account              Account preferences        │
 │  settingsLabels     account              Label definitions          │
 │  searchIndex        [account+key]        FlexSearch payloads        │
 │  indexMeta          [account+key]        Search index metadata      │
 │  meta               key                  Key-value store (generic)  │
 │                                                                     │
 └─────────────────────────────────────────────────────────────────────┘
```

### Key Indexes on `messages`

The schema is designed to make these reads fast:

```
 ┌───────────────────────────────────────────────────────────────────┐
 │  INDEX                              USED FOR                      │
 │ ──────────────────────────────────  ──────────────────────────── │
 │  [account+folder]                   List messages in a folder     │
 │  [account+folder+date]              Sort by date within folder    │
 │  [account+folder+is_unread_index]   Filter unread in folder       │
 │  [account+id]                       Look up specific message      │
 └───────────────────────────────────────────────────────────────────┘
```

### The `meta` Table: Swiss Army Knife

The `meta` table is a generic key-value store that avoids schema migrations for
new features:

```
 ┌──────────────────────────────────────────────────────────────────┐
 │  KEY PATTERN                 USED BY                             │
 │ ──────────────────────────── ─────────────────────────────────── │
 │  mutation-queue              Offline mutation queue               │
 │  contacts:*                  Contact autocomplete cache           │
 │  attachment:*                Attachment blob cache (50MB quota)   │
 └──────────────────────────────────────────────────────────────────┘
```

## Storage Layers

Data flows through three layers, each with different speed and durability:

```
 FASTEST ─────────────────────────────────────────────── MOST DURABLE

 ┌──────────────────┐   ┌───────────────────┐   ┌──────────────────┐
 │                  │   │                   │   │                  │
 │  IN-MEMORY       │   │   INDEXEDDB        │   │   API SERVER     │
 │  (Svelte stores) │   │   (db.worker)      │   │                  │
 │                  │   │                   │   │                  │
 │  • LRU caches    │   │  • 13 tables       │   │  • Source of     │
 │  • $state vars   │   │  • Per-account     │   │    truth         │
 │  • Instant reads │   │  • Survives reload │   │  • Provides      │
 │  • Lost on nav   │   │  • 5ms reads       │   │    deltas        │
 │                  │   │                   │   │                  │
 │  Read: 0ms       │   │  Read: ~5ms        │   │  Read: 100-500ms │
 │                  │   │                   │   │                  │
 └──────────────────┘   └───────────────────┘   └──────────────────┘
        │                        │                        │
        │     populate           │      sync              │
        │◄───────────────────────│◄───────────────────────│
```

Separate layer for static assets only:

```
 ┌──────────────────────────────────────────┐
 │  SERVICE WORKER (Workbox CacheStorage)   │
 │                                          │
 │  JS, CSS, fonts, icons, images           │
 │  NO API responses. NO mail data.         │
 └──────────────────────────────────────────┘
```

## Read Patterns

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                                                                 │
 │  MAILBOX LIST                                                   │
 │  ────────────                                                   │
 │  1. Check in-memory LRU         (0ms)                          │
 │  2. Query messages by           (5ms)                          │
 │     [account+folder+date]                                      │
 │  3. Fetch API delta if stale    (100-500ms, background)        │
 │                                                                 │
 │  MESSAGE DETAIL                                                 │
 │  ──────────────                                                 │
 │  1. Check messageBodies by      (5ms)                          │
 │     [account+id]                                               │
 │  2. Fetch from API if missing   (200-800ms)                    │
 │  3. Parse, sanitize, cache      (background)                   │
 │                                                                 │
 │  SEARCH                                                         │
 │  ──────                                                         │
 │  1. Query FlexSearch index      (instant)                      │
 │  2. Health check vs DB count    (startup)                      │
 │  3. Rebuild if diverged         (background)                   │
 │                                                                 │
 │  SETTINGS & LABELS                                              │
 │  ─────────────────                                              │
 │  1. Read settings at boot       (fast hydration)               │
 │  2. Sync with API               (background)                   │
 │                                                                 │
 └─────────────────────────────────────────────────────────────────┘
```

## Write Patterns

```
 WHO WRITES WHAT
 ═══════════════

 sync.worker ──────▶ messages, messageBodies, folders, syncManifests
 main thread ──────▶ messages (flags/labels), settings, settingsLabels,
                      outbox, drafts (fallback writes for bodies too)
 search.worker ────▶ searchIndex, indexMeta
```

## Version Management

All version numbers are centralized:

| File                        | Variable                 | Purpose                                              |
| --------------------------- | ------------------------ | ---------------------------------------------------- |
| `src/utils/db-constants.ts` | `SCHEMA_VERSION`         | Single source of truth for DB schema                 |
| `src/workers/db.worker.ts`  | uses `SCHEMA_VERSION`    | Applies schema via `this.version(...).stores({...})` |
| `src/utils/db.js`           | imports `SCHEMA_VERSION` | Main thread access                                   |
| `public/sw-sync.js`         | must match               | Raw IDB access in service worker                     |

## Upgrade Strategy

Schema changes happen inside `db.worker` and are versioned. Every update must:

1. Add new tables/indexes without breaking existing reads
2. Keep migrations minimal — data ops, not runtime patches
3. Increment `SCHEMA_VERSION` in `db-constants.ts`
4. Ensure `sw-sync.js` stays in sync

## Recovery Strategy

```
 ┌──────────────────────────────────────────────────────────────┐
 │                     RECOVERY FLOW                            │
 │                                                              │
 │  Dexie open ──▶ VersionError?                               │
 │                      │                                       │
 │                YES   │   NO                                  │
 │                 │    │    │                                   │
 │                 ▼    │    ▼                                   │
 │           ┌─────────┐│  ┌──────────┐                        │
 │           │ Delete  ││  │ Continue │                        │
 │           │ DB      ││  │ normally │                        │
 │           └────┬────┘│  └──────────┘                        │
 │                │     │                                       │
 │                ▼     │                                       │
 │           ┌─────────┐│                                      │
 │           │ Re-init ││                                      │
 │           │ fresh   ││                                      │
 │           └────┬────┘│                                      │
 │                │     │                                       │
 │                ▼     │                                       │
 │           ┌─────────┐│                                      │
 │           │ Resync  ││                                      │
 │           │ from API││                                      │
 │           └─────────┘│                                      │
 │                                                              │
 │  PRESERVED: Account credentials (localStorage)              │
 │  CLEARED:   All cached mail, settings, search index         │
 │  COMMUNICATED: User sees "cache cleared, resyncing"         │
 └──────────────────────────────────────────────────────────────┘
```

## Cache Eviction

```
 ┌──────────────────────────────────────────────────────────┐
 │                    EVICTION PRIORITY                     │
 │                                                         │
 │  KEEP LONGEST:                                          │
 │    ██████████████████████████  Message metadata          │
 │    ████████████████████       Settings & labels          │
 │    ████████████████           Folders & manifests        │
 │                                                         │
 │  EVICT FIRST:                                           │
 │    ████████████               Message bodies             │
 │    ████████                   Search index payloads      │
 │    ████                       Attachment blobs (50MB)    │
 │                                                         │
 │  Quota tracked via navigator.storage.estimate()         │
 └──────────────────────────────────────────────────────────┘
```

## Troubleshooting

| Symptom                  | Check                                            |
| ------------------------ | ------------------------------------------------ |
| Empty inbox after reload | Is db.worker initialized? Check `messages` table |
| Search returns nothing   | Check `searchIndex` rows, run health check       |
| Stale data after sync    | Check `syncManifests` for cursor progress        |
| Blank settings on login  | Verify `settings` table has rows for account     |
| "Database blocked" error | Schema version mismatch — clear and re-init      |

---

**Next:** [Search Engine](building-webmail-search.md) — local-first full-text
search with FlexSearch.
