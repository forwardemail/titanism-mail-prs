# Worker Architecture: Detailed Reference

This is the deep-dive companion to [Building Webmail: Workers](building-webmail-workers.md).
It covers message contracts, data flow diagrams, IndexedDB ownership, fallback
paths, and operational checklists.

## High-Level Overview

```
                    ┌──────────────────────────┐
                    │       Main Thread         │
                    │    UI + Svelte Stores     │
                    └─────┬──────┬──────┬──────┘
                          │      │      │
          MessageChannel  │      │      │  MessageChannel
                          │      │      │
   ┌──────────────────────┘      │      └──────────────────────┐
   │                             │                             │
   ▼                             ▼                             ▼
┌──────────┐             ┌──────────────┐             ┌──────────────┐
│ db.worker│◄────────────│ sync.worker  │────────────▶│search.worker │
│          │ MessagePort │              │ MessagePort │              │
│ Dexie 4  │             │ API + Parse  │             │ FlexSearch   │
│ IndexedDB│             │ PostalMime   │             │ Indexing     │
│ 13 tables│             │ OpenPGP      │             │ Queries      │
└──────────┘             └──────────────┘             └──────────────┘
```

## Main Thread Responsibilities

The main thread focuses on rendering and orchestration:

```
 ┌──────────────────────────────────────────────────────────────┐
 │  MAIN THREAD                                                │
 │                                                              │
 │  RENDERING                      ORCHESTRATION                │
 │  ──────────                     ─────────────                │
 │  UI components                  Worker startup + recovery    │
 │  Routing                        Fallback path selection      │
 │  Event handling                 Optimistic UI updates        │
 │  Keyboard shortcuts             Settings management          │
 │                                                              │
 │  KEY MODULES:                                                │
 │  ├── src/main.ts                    App bootstrap            │
 │  ├── src/utils/db.js                Init/recovery wrapper    │
 │  ├── src/utils/db-worker-client.js  Proxy to db.worker       │
 │  ├── src/utils/sync-worker-client.js Proxy to sync.worker    │
 │  ├── src/utils/search-worker-client.js Proxy to search       │
 │  ├── src/stores/mailboxStore.ts     Message list + cache     │
 │  ├── src/stores/mailService.ts      Body + attachments       │
 │  ├── src/stores/searchStore.ts      Search + health          │
 │  └── src/stores/settingsStore.ts    Settings + labels        │
 └──────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Startup (Happy Path)

```
 Main thread
   │
   ├──▶ initializeDatabase()
   │       └──▶ db.worker: open Dexie
   │
   ├──▶ Load settings from IDB (settingsStore)
   │
   ├──▶ Load folders, labels, messages (mailboxStore/Actions)
   │
   └──▶ startInitialSync()
           ├──▶ sync.worker: connect db port
           ├──▶ sync.worker: connect search port
           └──▶ sync.worker: begin folder + message sync
```

### Message List (Mailbox View)

```
 mailboxStore.loadMessages()
   │
   ├──▶ try sync.worker "messagePage"
   │       ├── Fetch GET /v1/messages?folder=...
   │       ├── Normalize + write to db.worker
   │       └── Return messages to main thread
   │
   ├──▶ FALLBACK: main thread fetch /v1/messages
   │
   ├──▶ Merge labels from IDB if API payload lacks them
   │
   └──▶ Update UI list
```

### Message Detail (Reader)

```
 mailService.loadMessageDetail()
   │
   ├──▶ Check messageBodies in db.worker
   │
   ├──▶ try sync.worker "messageDetail"
   │       ├── GET /v1/messages/:id?folder=...&raw=false
   │       ├── Parse body with PostalMime
   │       ├── Detect PGP → decrypt with OpenPGP
   │       ├── Store in db.worker (messageBodies)
   │       └── Return parsed result
   │
   └──▶ FALLBACK: main thread direct API fetch
```

### Search Indexing

```
 sync.worker writes messages to db.worker
   │
   └──▶ Forward batch to search.worker (MessagePort)
           │
           ├──▶ Load bodies from db.worker if includeBody
           ├──▶ Update FlexSearch index
           └──▶ Persist index to IndexedDB
```

### Labels & Settings

```
 Settings UI
   └──▶ settingsStore.updateSetting()
           ├──▶ PUT /v1/account
           └──▶ Cache to db.worker (settings/settingsLabels)

 Mailbox labels dropdown
   └──▶ mailboxActions.loadLabels()
           └──▶ Merge: settings labels + cached labels + message-derived labels
```

## Message Passing Contracts

### db.worker

```
 REQUEST:   { id: string, action: string, table: string, payload: any }
 RESPONSE:  { id: string, ok: true, result: any }
         or { id: string, ok: false, error: string }

 Common actions:
 ┌──────────────────┬──────────────────────────────────────────┐
 │  get             │  Read single record by key               │
 │  getAll          │  Read all records (optionally filtered)   │
 │  put             │  Upsert single record                    │
 │  bulkPut         │  Upsert multiple records                 │
 │  delete          │  Remove by key                           │
 │  where           │  Query with index + filters              │
 │  count           │  Count records matching criteria         │
 │  clear           │  Clear all records in a table            │
 └──────────────────┴──────────────────────────────────────────┘
```

### sync.worker

```
 TASK REQUEST:
   { type: 'task', taskId: string, task: { action: string, ...params } }

 REQUEST/RESPONSE:
   { type: 'request', requestId: string, action: string, payload: any }
   { type: 'requestComplete', requestId: string, result: any }
   { type: 'requestError', requestId: string, error: string }

 Common tasks:
 ┌──────────────────┬──────────────────────────────────────────┐
 │  messagePage     │  Fetch page of messages for a folder     │
 │  messageDetail   │  Fetch + parse single message body       │
 │  folderSync      │  Sync folder list from API               │
 │  bodiesPass      │  Background fetch bodies for a folder    │
 │  decryptMessage  │  PGP decrypt a message body              │
 └──────────────────┴──────────────────────────────────────────┘
```

### search.worker

```
 REQUEST:   { id: string, action: string, payload: any }
 RESPONSE:  { id: string, ok: true, result: any }
         or { id: string, ok: false, error: string }

 Common actions:
 ┌──────────────────┬──────────────────────────────────────────┐
 │  search          │  Execute FlexSearch query                │
 │  index           │  Add/update messages in index            │
 │  remove          │  Remove messages from index              │
 │  rebuild         │  Full index rebuild from IDB             │
 │  stats           │  Return index health info                │
 │  setAccount      │  Switch active account index             │
 └──────────────────┴──────────────────────────────────────────┘
```

## IndexedDB Ownership

```
 ┌──────────────────────────────────────────────────────────────┐
 │                                                              │
 │  OWNER: db.worker (SOLE OWNER)                              │
 │                                                              │
 │  Tables:                                                     │
 │  ┌────────────┬──────────────┬─────────────┬──────────────┐ │
 │  │ accounts   │ messages     │ searchIndex │ labels       │ │
 │  │ folders    │ messageBodies│ indexMeta   │ settings     │ │
 │  │ drafts     │ syncManifests│ meta       │ settingsLabels│ │
 │  │ outbox     │              │            │              │ │
 │  └────────────┴──────────────┴─────────────┴──────────────┘ │
 │                                                              │
 │  Other workers NEVER open IndexedDB directly.               │
 │  They always send requests to db.worker.                    │
 │                                                              │
 │  Exception: sw-sync.js uses raw IndexedDB API               │
 │  (service workers can't import Dexie)                       │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘
```

## Fallback & Resilience

```
 ┌──────────────────┬───────────────────────────────────────────┐
 │  COMPONENT       │  FALLBACK                                 │
 ├──────────────────┼───────────────────────────────────────────┤
 │  sync.worker     │  Main thread direct API calls             │
 │  search.worker   │  Main thread SearchService (in-memory)    │
 │  db.worker       │  Delete DB, re-init, resync from API     │
 │  Message list    │  Direct /v1/messages fetch                │
 │  Message detail  │  Direct /v1/messages/:id fetch            │
 └──────────────────┴───────────────────────────────────────────┘
```

Workers restart independently. The main thread always has a degraded path
that keeps the app functional.

## Known Constraints

- db.worker MUST initialize before sync/search workers connect
- `SCHEMA_VERSION` in `db-constants.ts` must match `sw-sync.js`
- Labels are keyed by keyword/id; rename changes display name only
- Service worker does NOT cache API responses
- Workers use TypeScript (`.ts`) but are bundled by Vite

## Update Checklist

When modifying worker code:

```
 [ ] Update schema in src/workers/db.worker.ts
 [ ] Increment SCHEMA_VERSION in src/utils/db-constants.ts
 [ ] Ensure db.worker clients handle new tables/fields
 [ ] Update sw-sync.js if meta table structure changes
 [ ] Update this doc if responsibilities or flows change
```
