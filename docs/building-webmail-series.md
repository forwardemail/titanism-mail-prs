# Building Webmail

A technical deep-dive into how we built a privacy-first, offline-capable webmail
PWA that runs entirely in the browser.

```
 ╔══════════════════════════════════════════════════════════════════╗
 ║                                                                  ║
 ║    ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐      ║
 ║    │  Read   │   │ Search  │   │ Compose │   │ Offline │      ║
 ║    │  Mail   │   │ Instant │   │  Rich   │   │  First  │      ║
 ║    └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘      ║
 ║         │             │             │             │              ║
 ║         └─────────────┴──────┬──────┴─────────────┘              ║
 ║                              │                                   ║
 ║                    ┌─────────▼─────────┐                        ║
 ║                    │   Forward Email   │                        ║
 ║                    │     Webmail PWA   │                        ║
 ║                    └───────────────────┘                        ║
 ║                                                                  ║
 ╚══════════════════════════════════════════════════════════════════╝
```

## The Series

```
 START HERE
     │
     ▼
 ┌─────────────────────────────────────────────────────┐
 │  1. Vision & Architecture                           │
 │     Why client-only? Why offline-first?             │
 │     The constraints that drive everything.          │
 └──────────────────────┬──────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────┐
 │  2. Technology Stack                                │
 │     Svelte 5 + Vite + Dexie + Workers.             │
 │     Every choice, why it was made.                  │
 └──────────────────────┬──────────────────────────────┘
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
 ┌─────────────┐ ┌────────────┐ ┌────────────────┐
 │ 3. Worker   │ │ 4. Data    │ │ 5. Search      │
 │    Mesh     │ │    Layer   │ │    Engine       │
 │             │ │            │ │                 │
 │ 3 workers,  │ │ IndexedDB  │ │ FlexSearch,     │
 │ 1 owner,    │ │ as product │ │ local-first,    │
 │ 0 UI jank   │ │ memory     │ │ instant results │
 └──────┬──────┘ └─────┬──────┘ └───────┬────────┘
        │              │                │
        └──────────────┼────────────────┘
                       ▼
 ┌─────────────────────────────────────────────────────┐
 │  6. Service Worker & Offline Patterns               │
 │     Cache the shell, not the mail.                  │
 │     Mutation queues, optimistic updates, sync.      │
 └──────────────────────┬──────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────┐
 │  7. Deployment                                      │
 │     Cloudflare R2 + Workers, CI/CD, go live.        │
 └─────────────────────────────────────────────────────┘
```

## Reading Guide

| You want to...                       | Start here                                                              |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Understand the big picture           | [Vision & Architecture](building-webmail-vision-architecture.md)        |
| Know why we picked Svelte/Dexie/etc  | [Technology Stack](building-webmail-technology-stack.md)                |
| Understand off-main-thread design    | [Worker Mesh](building-webmail-workers.md)                              |
| Debug cache or IndexedDB issues      | [Data Layer](building-webmail-db-schema-recovery.md)                    |
| Trace a search query end-to-end      | [Search Engine](building-webmail-search.md)                             |
| Understand offline and sync patterns | [Service Worker & Offline Patterns](building-webmail-service-worker.md) |
| Ship to production                   | [Deployment](deployment-checklist.md)                                   |

## Detailed References

These go deeper than the series articles:

| Document                                                        | Scope                                              |
| --------------------------------------------------------------- | -------------------------------------------------- |
| [Worker Architecture](worker-architecture.md)                   | Message contracts, data flows, fallback paths      |
| [Cache & Indexing Architecture](cache-indexing-architecture.md) | Storage layers, eviction, reconciliation           |
| [Mailbox Loading Flow](mailbox-loading-flow.md)                 | Full request lifecycle with timeline visualization |

## Quick Stats

```
 ┌────────────────────────────────────────────┐
 │                                            │
 │   Framework    Svelte 5 (runes)            │
 │   Build        Vite 5                      │
 │   Storage      Dexie 4 (IndexedDB)         │
 │   Search       FlexSearch 0.7              │
 │   Workers      3 dedicated + service worker│
 │   Encryption   OpenPGP 6.2                 │
 │   Editor       TipTap 2                    │
 │   Hosting      Cloudflare R2 + Workers     │
 │                                            │
 │   Tables       13 IndexedDB tables         │
 │   Source       190+ files                   │
 │   Bundle       Vendor-chunked, code-split  │
 │   Target       Lighthouse 90+              │
 │                                            │
 └────────────────────────────────────────────┘
```
