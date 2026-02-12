# Building Webmail: Vision & Architecture

> A privacy-first, offline-capable webmail client that runs entirely in the
> browser and stores mailbox state locally.

## Why This Exists

Most webmail is server-driven: HTML rendered remotely, thin browser caches, and
features that disappear when the network stalls. We took the opposite bet.

```
 ┌───────────────────────────────────────────────────────────────┐
 │                    Traditional Webmail                        │
 │                                                               │
 │   Browser ──request──▶ Server ──renders──▶ HTML ──back──▶ UI │
 │                                                               │
 │   - Every click = network round-trip                         │
 │   - Offline = blank page                                     │
 │   - Server holds all state                                   │
 └───────────────────────────────────────────────────────────────┘

                          vs.

 ┌───────────────────────────────────────────────────────────────┐
 │                    Forward Email Webmail                      │
 │                                                               │
 │   Browser IS the app.  API is a data pipe.                   │
 │                                                               │
 │   - App shell cached at edge + locally                       │
 │   - Mail state lives in IndexedDB                            │
 │   - Offline = fully functional                               │
 │   - Server only provides deltas                              │
 └───────────────────────────────────────────────────────────────┘
```

## Architectural North Stars

These are the constraints we refuse to break:

```
 ╔═══════════════════════════════════════════════════════════════╗
 ║                                                               ║
 ║   1. PWA SHELL FROM CDN                                       ║
 ║      HTML/JS/CSS are static, versioned, cached at the edge.  ║
 ║                                                               ║
 ║   2. INDEXEDDB AS PRODUCT MEMORY                              ║
 ║      Mailbox state, drafts, settings, and search indexes     ║
 ║      live locally. IndexedDB is not a cache — it IS the      ║
 ║      product.                                                 ║
 ║                                                               ║
 ║   3. WORKERS OVER MAIN THREAD                                 ║
 ║      Parsing, sync, and indexing never block the UI.          ║
 ║      Three dedicated workers handle all heavy lifting.        ║
 ║                                                               ║
 ║   4. API AS DATA PIPE                                         ║
 ║      The server provides deltas and validation, never UI      ║
 ║      state. The client decides what to show.                  ║
 ║                                                               ║
 ╚═══════════════════════════════════════════════════════════════╝
```

## How a Request Flows

From cold start to rendered inbox in under 200ms (cached):

```
                    ┌──────────────────────┐
                    │    CDN / Edge         │
                    │  (Cloudflare R2)      │
                    │                      │
                    │  index.html          │
                    │  assets/*.js         │
                    │  assets/*.css        │
                    └──────────┬───────────┘
                               │
                          (1)  │  Load app shell
                               │
                    ┌──────────▼───────────┐
                    │   Service Worker      │        (2) Cache shell
                    │   Workbox precache    │◄──────── for next visit
                    └──────────┬───────────┘
                               │
                          (3)  │  Boot application
                               │
          ┌────────────────────▼────────────────────┐
          │             Main UI Thread               │
          │                                          │
          │   Svelte 5 components + stores           │
          │   Keyboard shortcuts + routing           │
          │   Orchestrates workers                   │
          └──────────┬──────────────┬────────────────┘
                     │              │
                (4)  │ Read         │ (5) Fetch
                     │ cache        │     deltas
                     │ first        │
          ┌──────────▼─────┐  ┌────▼─────────────────┐
          │   IndexedDB    │  │  Forward Email API    │
          │   (Dexie 4)    │  │  api.forwardemail.net │
          │                │  │                       │
          │  13 tables     │  │  REST + JSON          │
          │  per-account   │  │  Data only            │
          └──────────┬─────┘  └────┬─────────────────┘
                     │             │
                     └──────┬──────┘
                            │
                       (6)  │  Merge + update cache
                            │
                    ┌───────▼──────────┐
                    │   Render inbox    │
                    └──────────────────┘
```

## Layered Architecture

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                      PRESENTATION LAYER                         │
 │                                                                 │
 │  Svelte 5 Components    Routing     Keyboard Shortcuts          │
 │  Virtual Scrolling      Themes      Responsive Layout           │
 │  shadcn/ui + Bits UI    TipTap      Schedule-X Calendar         │
 ├─────────────────────────────────────────────────────────────────┤
 │                      BUSINESS LOGIC LAYER                       │
 │                                                                 │
 │  mailboxStore      mailboxActions      mailService              │
 │  settingsStore     searchStore         conversationStore        │
 │  viewStore         folderStore         messageStore             │
 │                                                                 │
 │  Threading    Search parsing    Filtering    Security checks    │
 ├─────────────────────────────────────────────────────────────────┤
 │                        DATA LAYER                               │
 │                                                                 │
 │  ┌──────────┐   ┌──────────────┐   ┌──────────────┐            │
 │  │db.worker │   │ sync.worker  │   │search.worker │            │
 │  │          │   │              │   │              │            │
 │  │ Dexie 4  │◄──│ API fetch    │──▶│ FlexSearch   │            │
 │  │ IndexedDB│   │ PostalMime   │   │ Full-text    │            │
 │  │ 13 tables│   │ OpenPGP      │   │ indexing     │            │
 │  └──────────┘   └──────────────┘   └──────────────┘            │
 ├─────────────────────────────────────────────────────────────────┤
 │                       SERVICE LAYER                             │
 │                                                                 │
 │  Service Worker (Workbox)     Background Sync (sw-sync.js)     │
 │  Asset precaching             Offline mutation replay           │
 │  SPA fallback routing         Outbox queue processing           │
 └─────────────────────────────────────────────────────────────────┘
```

## What This Unlocks

```
 ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
 │                  │  │                  │  │                  │
 │  OFFLINE PARITY  │  │  FAST SEARCH     │  │  NATIVE FEEL     │
 │                  │  │                  │  │                  │
 │  Read, search,   │  │  FlexSearch runs │  │  UI stays at     │
 │  compose, and    │  │  locally. No     │  │  60fps. Workers  │
 │  queue actions   │  │  server round-   │  │  handle all      │
 │  without a       │  │  trips for       │  │  heavy lifting   │
 │  network.        │  │  instant results.│  │  off-thread.     │
 │                  │  │                  │  │                  │
 └──────────────────┘  └──────────────────┘  └──────────────────┘

 ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
 │                  │  │                  │  │                  │
 │  PRIVACY FIRST   │  │  MULTI-ACCOUNT   │  │  PGP BUILT-IN    │
 │                  │  │                  │  │                  │
 │  Static hosting, │  │  Per-account     │  │  Client-side     │
 │  no tracking,    │  │  IndexedDB keys, │  │  decryption via  │
 │  local-first     │  │  instant switch  │  │  OpenPGP in the  │
 │  data storage.   │  │  with preloaded  │  │  sync worker.    │
 │                  │  │  cache.          │  │                  │
 └──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Key Design Decisions

| Decision                    | Why                                                    |
| --------------------------- | ------------------------------------------------------ |
| Client-only PWA             | No server-rendered UI = immutable, globally fast       |
| IndexedDB over server state | Local reads are 0-latency, survive offline             |
| Workers for all heavy work  | UI thread stays free, 60fps guaranteed                 |
| Optimistic updates          | Apply locally first, sync API in background            |
| Generation counters         | Prevent stale API responses from clobbering fresh data |
| Leading-edge debounce       | Account switches feel instant, last one wins           |
| Atomic cache swap           | Read IDB before resetting stores = no blank flash      |
| Vendor chunk splitting      | Core deps cached separately from app code              |
| Lazy-loaded routes          | Calendar, contacts, compose load on demand             |

## The Bet

If we get the architecture right, everything else scales: faster UX, better
privacy, richer features, and a codebase that ships as a PWA today and wraps
as a native app tomorrow. The constraint is the advantage.

---

**Next:** [Technology Stack](building-webmail-technology-stack.md) — the tools
that make this constraint real.
