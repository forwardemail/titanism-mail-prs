# Mailbox Loading Flow

This document traces the full request lifecycle when loading messages for a
mailbox folder — from user click through every cache layer, worker, and
network path, all the way back to the rendered list.

## High-level overview

```
User clicks folder
        |
        v
+------------------+     sync      +------------------+     sync      +------------------+
|   In-Memory LRU  | ------------> |     IndexedDB    | ------------> |   Network Fetch  |
|   (~0ms, sync)   |   if miss     |   (~5ms, async)  |   always      | (~100-500ms)     |
+------------------+               +------------------+               +------------------+
        |                                  |                                  |
        | hit: render                      | hit: render                      | response: merge,
        | immediately                      | immediately,                     | write IDB + LRU,
        |                                  | set loading=false                | update UI silently
        v                                  v                                  v
+-----------------------------------------------------------------------------+
|                           Svelte Store (messages)                           |
|                          UI renders from this store                         |
+-----------------------------------------------------------------------------+
```

**Key principle**: cache is always read first. Network always runs in the
background. The skeleton loader only appears when both the in-memory and
IndexedDB caches are empty (e.g. first visit to a folder on a new device).

---

## Detailed request flow

### Phase 1 — Folder selection (synchronous)

**Entry point**: `mailboxStore.ts:selectFolder()`

```
selectFolder(path)
  |
  +-- selectedFolder.set(path)      // update store (sync)
  +-- page.set(1)                   // reset pagination (sync)
  +-- selectedConversationIds.set([])
  +-- selectedMessage.set(null)
  |
  +-- loadMessages()                // starts the cache + fetch pipeline
```

`selectFolder` and the first part of `loadMessages` run in the **same
microtask**, which means Svelte batches the folder change and any synchronous
cache hit into a single render frame.

---

### Phase 2 — In-memory cache check (synchronous, ~0ms)

**Location**: `mailboxStore.ts:loadMessages()` — in-memory LRU section

```
folderMessageCache : Map<string, { messages[], hasNextPage }>

Key format: "account:folder:page"
Example:   "user@example.com:INBOX:1"
```

```
loadMessages()
  |
  +-- memKey = `${account}:${folder}:${page}`
  +-- memCached = folderMessageCache.get(memKey)
  |
  +-- if (memCached?.messages?.length)
        |
        +-- messages.set(memCached.messages)   // populate store (sync)
        +-- hasNextPage.set(memCached.hasNextPage)
        +-- loading.set(false)                 // no skeleton
        +-- auto-select first message (desktop classic layout)
```

This runs synchronously. If the folder was visited earlier in this session,
the list renders instantly with no flicker.

**Regardless of a hit or miss, execution continues to the next layers.**

---

### Phase 3 — IndexedDB cache read (async, ~5ms)

**Location**: `mailboxStore.ts:loadMessages()` — IDB cache section

```
                          +-------------------+
                          |   Dexie Query     |
                          +-------------------+
                                  |
                   +--------------+--------------+
                   |                             |
          newest / oldest sort             other sorts
                   |                             |
                   v                             v
    db.messages                          db.messages
      .where('[account+folder+date]')      .where('[account+folder]')
      .between(...)                        .equals([account, folder])
      .reverse()  (if newest)              .toArray()
      .offset(startIdx)                    |
      .limit(limit)                        v
      .toArray()                      sortMessages(cached, sort)
                   |                  .slice(startIdx, startIdx + limit)
                   |                             |
                   +-------------+---------------+
                                 |
                                 v
                       cachedPage = pageSlice.map(normalize)
```

If `cachedPage` has results:

```
  +-- messages.set(cachedPage)       // render cached data
  +-- loading.set(false)             // no skeleton
  +-- folderMessageCache.set(...)    // warm the in-memory LRU for next time
  +-- auto-select first message
  +-- count total for hasNextPage (if basic query)
```

**The IDB read populates the list within ~5ms** — well under the 150ms
skeleton delay threshold. Users see cached data almost instantly.

---

### Phase 4 — Skeleton decision

**Location**: `mailboxStore.ts:loadMessages()` — skeleton gate

```
if (!cachedPage.length) {
  loading.set(true);     // only triggers skeleton if BOTH caches missed
}
```

On the Svelte side (`Mailbox.svelte`), the skeleton has a **150ms delay**
before it actually renders:

```
wantListSkeleton = listIsEmpty && ($loading || syncingSelectedFolder || !showEmptyState)

$effect:
  if (wantListSkeleton)
    setTimeout(() => showListSkeleton = true, 150ms)   // LIST_SKELETON_DELAY_MS
  else
    showListSkeleton = false   // cancel immediately
```

This means: if the IDB read or a preview fetch resolves within 150ms, the
skeleton never appears at all.

---

### Phase 5 — Preview fetch (empty-cache optimization)

**Location**: `mailboxStore.ts:loadMessages()` — preview section

When cache is completely empty AND the page limit is large (>20), a **parallel
small fetch** fires to get initial results on screen faster:

```
if (!cachedPage.length && limit > 20) {

  +-- fetchWithFallback({ limit: 20 })     // small preview (fire-and-forget)
  |     .then(res => {
  |       messages.set(previewMessages)
  |       loading.set(false)               // cancel skeleton
  |     })
  |
  +-- fetchWithFallback({ limit: full })   // full request (awaited below)
}
```

Both requests run concurrently. The preview typically resolves first and
clears the skeleton while the full page loads.

---

### Phase 6 — Network fetch via `fetchWithFallback()`

**Location**: `mailboxStore.ts:fetchWithFallback()`

```
fetchWithFallback(params)
  |
  +-- TRY: sendSyncRequest('messagePage', { account, folder, page, limit, ... })
  |         |
  |         +-- returns { source: 'worker', res }
  |
  +-- CATCH: Remote.request('MessageList', params, { pathOverride: '/v1/messages' })
             |
             +-- returns { source: 'main', res }
```

Two paths, worker preferred with main-thread fallback:

```
+------------------------------------------------------+
|                  PRIMARY PATH                        |
|                                                      |
|  Main Thread          Sync Worker                    |
|  (mailboxStore)       (sync.worker.ts)               |
|       |                    |                         |
|       +-- postMessage ---> |                         |
|       |   { type: 'request',                         |
|       |     action: 'messagePage',                   |
|       |     payload }                                |
|       |                    |                         |
|       |                    +-- fetch(apiBase +        |
|       |                    |     '/v1/messages?...')  |
|       |                    |   (raw fetch, bypasses   |
|       |                    |    Service Worker)       |
|       |                    |                         |
|       |                    +-- normalize messages     |
|       |                    +-- merge missing labels   |
|       |                    +-- db.messages.bulkPut()  |
|       |                    +-- post to search worker  |
|       |                    |                         |
|       | <-- postMessage -- +                         |
|       |   { type: 'requestComplete',                 |
|       |     result: { messages, hasNextPage } }      |
|       |                                              |
+------------------------------------------------------+

+------------------------------------------------------+
|                  FALLBACK PATH                       |
|                                                      |
|  Main Thread          API                            |
|  (Remote.request)     (forwardemail.net)             |
|       |                    |                         |
|       +-- Ky HTTP -------> |                         |
|       |   GET /v1/messages?folder=...&page=...       |
|       |   Authorization: alias_auth / api_key        |
|       |   Timeout: 10s                               |
|       |   Retry: 3x exponential backoff              |
|       |     (1s -> 2s -> 4s, cap 5s)                 |
|       |                    |                         |
|       | <-- JSON --------- +                         |
|       |                                              |
+------------------------------------------------------+
```

---

### Phase 7 — Response processing (main thread)

**Location**: `mailboxStore.ts:loadMessages()` — response handler

```
Network response arrives
  |
  +-- Stale check: did account/folder change while in-flight?
  |     +-- if stale: still write to IDB (for next visit), skip UI update
  |
  +-- Parse response
  |     +-- worker path:  res.messages, res.hasNextPage
  |     +-- fallback path: res.Result.List, list.length >= limit
  |
  +-- Normalize each message
  |     +-- normalizeMessageForCache(raw, folder, account)
  |     +-- attach: normalizedSubject, threadId, in_reply_to, references
  |
  +-- Merge enrichment
  |     +-- mergeMissingLabels(account, mapped, labelPresence)
  |     |     Look up existing IDB records to preserve labels
  |     |     that the list endpoint doesn't return
  |     |
  |     +-- mergeMissingFrom(account, merged)
  |           Look up existing IDB records to preserve full
  |           "from" field when API returns abbreviated version
  |
  +-- Cache prune (page 1 only)
  |     +-- Find IDB entries NOT in server response
  |     +-- db.messages.bulkDelete(staleKeys)
  |     +-- (removes moved/deleted messages from cache)
  |
  +-- Write to IDB
  |     +-- db.messages.bulkPut(merged)
  |
  +-- Write to in-memory LRU
  |     +-- folderMessageCache.set(account:folder:page, { messages, hasNextPage })
  |
  +-- Update search index (main-thread fallback only; worker already indexed)
  |     +-- searchStore.actions.indexMessages(merged)
  |
  +-- Update UI (if not stale)
        +-- messages.set(merged)          // silently swap in fresh data
        +-- loading.set(false)
        +-- updateFolderUnreadCounts()
```

---

## Complete timeline visualization

```
t=0ms     User clicks folder
          |
          +-- selectFolder.set(path)
          +-- loadMessages() begins (same microtask)
          |
          +-- [SYNC] Check in-memory LRU
          |   Hit? -> list renders at t=0ms. No skeleton.
          |
t=1ms     +-- [ASYNC] Start IDB query
          |
t=5ms     +-- IDB results arrive
          |   Hit? -> list renders at t=5ms. loading=false. No skeleton.
          |
          +-- [ASYNC] Preview fetch fires (if cache was empty)
          +-- [ASYNC] Full network fetch fires (always)
          |
t=100ms   +-- Preview response arrives (if fired)
          |   -> list renders preview. loading=false. Skeleton cancelled.
          |
t=150ms   --- Skeleton delay threshold ---
          |   (skeleton only appears if nothing has rendered by now)
          |
t=200ms   +-- Full network response arrives
          |   -> normalize, merge, write IDB + LRU
          |   -> messages.set(merged) — list updates silently
          |
t=200ms+  +-- Background: search indexing, folder count update, quota check
```

### When do you see a skeleton?

| Scenario                             | Memory     | IDB        | Network    | Skeleton?                       |
| ------------------------------------ | ---------- | ---------- | ---------- | ------------------------------- |
| Revisit folder (same session)        | hit        | --         | background | Never                           |
| Revisit folder (new session, cached) | miss       | hit (~5ms) | background | Never                           |
| First visit, fast network (<150ms)   | miss       | miss       | fast       | Never (preview beats delay)     |
| First visit, slow network (>150ms)   | miss       | miss       | slow       | Yes, until preview/full arrives |
| Offline, previously cached           | hit or hit | hit        | fails      | Never                           |
| Offline, never visited               | miss       | miss       | fails      | Yes, then error state           |

---

## Component responsibilities

### Sync Worker (`src/workers/sync.worker.ts`)

The sync worker is the **preferred network path**. It:

1. Makes raw `fetch()` calls to the API (bypasses Service Worker)
2. Normalizes raw API responses into cache-ready format
3. Writes results to IndexedDB via Dexie
4. Posts to the search worker for full-text indexing
5. Returns normalized messages to the main thread

**Why raw fetch?** The sync worker runs in a Web Worker context. Service
Workers intercept main-thread fetches but worker-originated fetches go
directly to the network. This is intentional — API responses are cached in
IndexedDB, not in CacheStorage.

### Service Worker (`public/sw-sync.js`)

The Service Worker does **not** cache API responses. Its roles:

```
+---------------------------------------------------+
|               Service Worker Roles                |
+---------------------------------------------------+
|                                                   |
|  1. Precache app shell (Workbox)                  |
|     -> JS, CSS, icons, images in CacheStorage     |
|                                                   |
|  2. Background sync                               |
|     -> Process offline mutation queue             |
|     -> Replay failed writes when online           |
|                                                   |
|  3. Bulk body prefetch                            |
|     -> Fetch message bodies for offline reading   |
|     -> Triggered after initial metadata sync      |
|                                                   |
+---------------------------------------------------+
```

### Main Thread (`src/stores/mailboxStore.ts`)

Orchestrates everything:

- Reads from in-memory and IDB caches
- Delegates network to sync worker (with main-thread fallback)
- Manages loading/skeleton state
- Merges network responses into stores
- Prunes stale cache entries

### Remote (`src/utils/remote.js`)

Fallback HTTP client used when the sync worker is unavailable:

- Uses **Ky** (a `fetch` wrapper)
- 3 retries with exponential backoff
- Per-action timeouts (MessageList: 10s, default: 30s)
- Auth header from sessionStorage (tab-scoped)

---

## Data flow between components

```
+-------------------------------------------------------------------+
|                         Main Thread                               |
|                                                                   |
|  selectFolder()                                                   |
|       |                                                           |
|       v                                                           |
|  loadMessages()                                                   |
|       |                                                           |
|       +--[1]-- folderMessageCache (Map) ----> Svelte store        |
|       |        (sync, ~0ms)                   messages.set()      |
|       |                                                           |
|       +--[2]-- db.messages (Dexie/IDB) -----> Svelte store        |
|       |        (async, ~5ms)                  messages.set()      |
|       |                                                           |
|       +--[3]-- sendSyncRequest() ----------+                      |
|       |                                    |                      |
|       |    +-------------------------------+                      |
|       |    |  Sync Worker                                         |
|       |    |    |                                                  |
|       |    |    +-- fetch(API) -----> forwardemail.net             |
|       |    |    +-- normalize()                                   |
|       |    |    +-- db.messages.bulkPut()                         |
|       |    |    +-- postToSearch()                                |
|       |    |    |                                                  |
|       |    +----+-- postMessage(result) --+                       |
|       |                                   |                       |
|       | <---------------------------------+                       |
|       |                                                           |
|       +-- normalize + merge                                       |
|       +-- db.messages.bulkPut()         (write-through to IDB)    |
|       +-- folderMessageCache.set()      (write-through to LRU)    |
|       +-- messages.set(merged) ---------> Svelte store            |
|       +-- loading.set(false)                                      |
|                                                                   |
+-------------------------------------------------------------------+
```

---

## Cache layers summary

| Layer                 | Type               | Speed        | Scope                             | Populated by                        | Cleared on                                                      |
| --------------------- | ------------------ | ------------ | --------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `folderMessageCache`  | In-memory `Map`    | ~0ms (sync)  | Per page, per folder, per account | IDB read + network response         | Account switch (`resetMailboxState`)                            |
| `db.messages` (Dexie) | IndexedDB          | ~5ms (async) | All messages, all accounts        | Sync worker + main thread writes    | Cache prune (page 1 server diff), `emptyFolder`, quota eviction |
| Svelte stores         | In-memory reactive | ~0ms         | Current view only                 | Any cache layer or network response | Folder switch, account switch                                   |

### IndexedDB indexes used for message queries

```
Primary (date-sorted):  [account+folder+date]
  -> Used for newest/oldest sort
  -> Supports efficient offset+limit pagination

Fallback (unsorted):    [account+folder]
  -> Used for subject/sender sort
  -> Full scan + in-memory sort + slice
```

---

## Key constants

| Constant                 | Value              | Location                         | Purpose                                    |
| ------------------------ | ------------------ | -------------------------------- | ------------------------------------------ |
| `LIST_SKELETON_DELAY_MS` | 150ms              | `Mailbox.svelte`                 | Delay before showing list skeleton         |
| `SKELETON_DELAY_MS`      | 200ms              | `Mailbox.svelte`                 | Delay before showing message body skeleton |
| `EMPTY_STATE_DELAY_MS`   | 150ms              | `Mailbox.svelte`                 | Delay before showing "no messages"         |
| Preview limit            | 20                 | `mailboxStore.ts`                | Quick-fetch page size when cache is empty  |
| MessageList timeout      | 10s                | `remote.js`                      | Ky request timeout for message list        |
| HTTP retry count         | 3                  | `remote.js`                      | Exponential backoff retries                |
| DB name                  | `webmail-cache-v1` | `db-constants.ts` / `sw-sync.js` | Must match between app and SW              |

---

## Related documents

- [Worker Architecture](worker-architecture.md) — worker responsibilities and communication
- [Cache and Indexing Architecture](cache-indexing-architecture.md) — storage layers and search indexing
- [Service Worker](building-webmail-service-worker.md) — SW setup and background sync
