# Building Webmail: The Search Engine

Search is the fastest way users navigate a mailbox. It has to be instant,
offline-capable, and reliable — even as the mailbox grows to thousands of
messages. That makes search a core system, not a feature.

## The Problem

```
 ┌──────────────────────────────────┐  ┌──────────────────────────────┐
 │       SERVER SEARCH              │  │       CLIENT SEARCH          │
 │                                  │  │                              │
 │  + Complete (all messages)       │  │  + Instant (no network)      │
 │  + Always accurate               │  │  + Works offline             │
 │  - 200-500ms per query          │  │  - Incomplete (only cached)  │
 │  - Requires network             │  │  - Needs maintenance         │
 │  - Feels sluggish               │  │  - Index can drift           │
 │                                  │  │                              │
 └──────────────────────────────────┘  └──────────────────────────────┘

                         │
                    OUR SOLUTION
                         │
                         ▼

 ┌─────────────────────────────────────────────────────────────────┐
 │                    HYBRID SEARCH                                │
 │                                                                 │
 │   Query local FlexSearch index first (instant).                │
 │   Fall back to API only when local cache is insufficient.       │
 │   Merge API results back into local index for next time.       │
 │                                                                 │
 └─────────────────────────────────────────────────────────────────┘
```

## Architecture

```
                    ┌────────────────────┐
                    │    Main Thread     │
                    │                    │
                    │  searchStore       │
                    │  Search UI         │
                    │  Query parsing     │
                    └────────┬───────────┘
                             │
                   MessageChannel
                             │
                    ┌────────▼───────────┐
                    │   search.worker    │
                    │                    │
                    │  ┌──────────────┐  │
                    │  │  FlexSearch  │  │
                    │  │              │  │
                    │  │  Per-account │  │
                    │  │  indexes     │  │
                    │  │              │  │
                    │  │  Subject +   │  │
                    │  │  body (opt)  │  │
                    │  └──────────────┘  │
                    │                    │
                    └────────┬───────────┘
                             │
                   MessagePort (to db.worker)
                             │
                    ┌────────▼───────────┐
                    │    db.worker       │
                    │                    │
                    │  searchIndex       │
                    │  indexMeta         │
                    │  messages          │
                    │  messageBodies     │
                    └────────────────────┘
```

## Indexing Pipeline

New messages flow through a pipeline from API to searchable index:

```
 API response
       │
       ▼
 sync.worker
       │
       ├──▶ Normalize metadata
       │
       ├──▶ Write to db.worker (messages table)
       │
       └──▶ Forward batch to search.worker
                  │
                  ├──▶ Index subject, from, snippet
                  │
                  ├──▶ If includeBody enabled:
                  │       Load bodies from db.worker
                  │       Index text content
                  │
                  └──▶ Persist index → db.worker
                         (searchIndex + indexMeta)
```

### What Gets Indexed

```
 ┌──────────────────────────────────────────────────────────────┐
 │                                                              │
 │  ALWAYS INDEXED              OPTIONAL (user toggle)          │
 │  ────────────────            ──────────────────              │
 │                                                              │
 │  • Subject line              • Full message body text        │
 │  • From address                                              │
 │  • Snippet/preview                                           │
 │  • Date                                                      │
 │  • Message ID                                                │
 │                                                              │
 │  Body indexing is toggled in Settings → Search.              │
 │  When enabled, existing messages are indexed in background.  │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘
```

## Query Model

Three paths, fastest first:

```
 User types query
       │
       ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  1. FAST PATH                                     ~10ms     │
 │     Query FlexSearch index in search.worker                 │
 │     Results from cached messages only                       │
 │     Instant for all indexed mail                            │
 └────────────────────────┬────────────────────────────────────┘
                          │
                    enough results?
                          │
                    NO    │    YES ──▶ Done, render results
                          │
 ┌────────────────────────▼────────────────────────────────────┐
 │  2. FILTER PATH                                             │
 │     Apply mailbox-level filters:                            │
 │     folder, flags (unread/starred), labels, date range      │
 └────────────────────────┬────────────────────────────────────┘
                          │
                    still missing?
                          │
                    YES   │    NO ──▶ Done
                          │
 ┌────────────────────────▼────────────────────────────────────┐
 │  3. FALLBACK PATH                                 100-500ms │
 │     Query the API: GET /v1/messages?q=...                   │
 │     Merge new results into db.worker + search index         │
 │     Next identical query will hit the fast path             │
 └─────────────────────────────────────────────────────────────┘
```

### Advanced Query Syntax

```
 ┌────────────────────────────────────────────────────────────────┐
 │  FILTER           EXAMPLE                                      │
 │ ────────────────  ──────────────────────────────────────────── │
 │  from:            from:alice@example.com                       │
 │  to:              to:bob@example.com                           │
 │  subject:         subject:meeting notes                        │
 │  before:          before:2025-01-01                            │
 │  after:           after:2024-06-15                             │
 │  has:attachment    has:attachment                               │
 │  is:unread        is:unread                                    │
 │  is:starred       is:starred                                   │
 │  label:           label:important                              │
 │  free text        quarterly report budget                      │
 └────────────────────────────────────────────────────────────────┘
```

## Index Health & Rebuilds

Indexes drift. Messages get synced, evicted, or updated. We track this
explicitly and heal automatically:

```
 ┌─────────────────────────────────────────────────────────────┐
 │                    HEALTH CHECK FLOW                         │
 │                                                             │
 │  On startup:                                                │
 │                                                             │
 │  search.worker loads persisted index                        │
 │         │                                                   │
 │         ▼                                                   │
 │  Compare indexMeta.count vs messages.count in db.worker     │
 │         │                                                   │
 │    ┌────┴────┐                                              │
 │    │         │                                              │
 │  MATCH    DIVERGED                                          │
 │    │         │                                              │
 │    ▼         ▼                                              │
 │  Ready    Trigger background rebuild                        │
 │           • Does not block UI                               │
 │           • Progress reported to main thread                │
 │           • Index re-persisted when complete                │
 │                                                             │
 └─────────────────────────────────────────────────────────────┘
```

## Key Source Files

| File                                | Role                                |
| ----------------------------------- | ----------------------------------- |
| `src/workers/search.worker.ts`      | FlexSearch owner, indexing, queries |
| `src/utils/search-worker-client.js` | Main thread proxy to search.worker  |
| `src/utils/search-service.js`       | Query execution and fallback        |
| `src/utils/search-query.js`         | Query parsing and filter logic      |
| `src/stores/searchStore.ts`         | Search UI state, health monitoring  |

---

**Next:** [Service Worker & Offline Patterns](building-webmail-service-worker.md)
— cache the shell, queue the mutations.
