# Building Webmail: Technology Stack

Every tool in this stack was chosen to serve one goal: a static, client-only
webmail app that behaves like a native client.

## Stack Principles

```
 ┌─────────────────────────────────────────────────────────────┐
 │                                                             │
 │   SMALL RUNTIME          Push heavy work to workers.        │
 │   BIG CAPABILITY         Load features on demand.           │
 │                                                             │
 │   LOCAL-FIRST            IndexedDB is the source of truth.  │
 │   BY DEFAULT             The API only supplies deltas.      │
 │                                                             │
 │   DETERMINISTIC          Static shell. SW controls updates. │
 │   UPDATES                No surprises mid-session.          │
 │                                                             │
 │   SECURITY AS            Sanitize HTML, encrypt secrets,    │
 │   BASELINE               zero third-party tracking.         │
 │                                                             │
 └─────────────────────────────────────────────────────────────┘
```

## Core Platform

```
 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │              │     │              │     │              │
 │   Svelte 5   │────▶│    Vite 5    │────▶│  Workbox 7   │
 │              │     │              │     │              │
 │  Compile-time│     │  Fast dev    │     │  Precache    │
 │  reactivity  │     │  HMR + build │     │  app shell   │
 │  with runes  │     │  Vendor split│     │  SW updates  │
 │              │     │              │     │              │
 └──────────────┘     └──────────────┘     └──────────────┘
```

| Layer       | Tool         | Version           | Why                                                                        |
| ----------- | ------------ | ----------------- | -------------------------------------------------------------------------- |
| Framework   | Svelte       | ^5.48             | Runes (`$state`, `$derived`, `$effect`), compiled reactivity, tiny runtime |
| Build       | Vite         | ^5.0              | Sub-second HMR, optimized chunking, ES modules                             |
| PWA         | Workbox      | ^7.0              | Reliable precaching, SPA fallback, cache-first                             |
| Styling     | Tailwind CSS | ^4.1              | Utility-first, purged in production                                        |
| Components  | shadcn/ui    | via Bits UI ^2.15 | Accessible, composable primitives                                          |
| TypeScript  | TypeScript   | ^5.3              | Strict mode, worker typing                                                 |
| Package Mgr | pnpm         | ^9.0              | Fast, disk-efficient, strict                                               |
| Node        | Node.js      | 20 LTS            | Stable, long-term support                                                  |

## Data & Storage

```
 ┌───────────────────────────────────────────────────────────────────┐
 │                         DATA LAYER                                │
 │                                                                   │
 │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
 │   │   Dexie 4    │    │  FlexSearch   │    │   Mutation   │       │
 │   │              │    │              │    │    Queue     │       │
 │   │  IndexedDB   │    │  Full-text   │    │             │       │
 │   │  wrapper     │    │  search      │    │  Offline    │       │
 │   │  13 tables   │    │  index       │    │  actions    │       │
 │   │  per-account │    │  per-account │    │  meta table │       │
 │   └──────────────┘    └──────────────┘    └──────────────┘       │
 └───────────────────────────────────────────────────────────────────┘
```

| Component     | Tool       | Version | Why                                                    |
| ------------- | ---------- | ------- | ------------------------------------------------------ |
| Database      | Dexie      | ^4.2    | Schema layer over IndexedDB, compound keys, migrations |
| Search        | FlexSearch | ^0.7    | Fast client-side full-text, persistent indexes         |
| HTTP Client   | ky         | ^1.14   | Lightweight, retry-aware, hooks                        |
| Email Parsing | PostalMime | ^2.6    | RFC-compliant MIME parsing in workers                  |

## Workers & Concurrency

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                                                                 │
 │                     ┌───────────────┐                           │
 │                     │  Main Thread  │                           │
 │                     │  UI + Stores  │                           │
 │                     └──────┬────────┘                           │
 │                            │                                    │
 │              ┌─────────────┼─────────────┐                      │
 │              │             │             │                      │
 │              ▼             ▼             ▼                      │
 │     ┌──────────────┐ ┌──────────┐ ┌──────────────┐            │
 │     │ sync.worker  │ │db.worker │ │search.worker │            │
 │     │              │ │          │ │              │            │
 │     │  API fetch   │ │  Dexie   │ │  FlexSearch  │            │
 │     │  PostalMime  │ │  CRUD    │ │  Indexing    │            │
 │     │  OpenPGP     │ │  Schema  │ │  Queries     │            │
 │     └──────────────┘ └──────────┘ └──────────────┘            │
 │                                                                 │
 │     + Service Worker (Workbox) for asset caching               │
 │                                                                 │
 └─────────────────────────────────────────────────────────────────┘
```

Every worker communicates via `MessageChannel` — no shared memory, no
contention, no UI stalls.

## Composition & Content

| Component        | Tool                 | Version | Why                                       |
| ---------------- | -------------------- | ------- | ----------------------------------------- |
| Rich Text Editor | TipTap               | ^2.6    | Extensible, ProseMirror-based, formatting |
| Calendar         | Schedule-X           | ^1.63   | Month/week/day views, no server rendering |
| Sanitizer        | DOMPurify            | ^3.1    | XSS protection for HTML email content     |
| Encryption       | OpenPGP              | ^6.2    | Client-side PGP decrypt/encrypt           |
| Markdown         | marked               | ^12.0   | Compose in markdown, render as HTML       |
| Emoji            | emoji-picker-element | ^1.21   | Native emoji selection                    |
| Icons            | Lucide Svelte        | ^0.562  | Tree-shakeable SVG icon library           |
| Dates            | date-fns             | ^3.6    | Lightweight date formatting/parsing       |

## Security & Privacy

```
 ┌─────────────────────────────────────────────────────────────┐
 │                    SECURITY LAYERS                          │
 │                                                             │
 │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
 │  │  DOMPurify  │  │  Sandboxed  │  │   OpenPGP   │        │
 │  │             │  │   Iframe    │  │             │        │
 │  │  HTML email │  │             │  │  End-to-end │        │
 │  │  sanitized  │  │  Email body │  │  encryption │        │
 │  │  before     │  │  rendered   │  │  in sync    │        │
 │  │  display    │  │  isolated   │  │  worker     │        │
 │  └─────────────┘  └─────────────┘  └─────────────┘        │
 │                                                             │
 │  + Local-first storage (no server-side UI state)           │
 │  + Static hosting (immutable, no server-rendered HTML)     │
 │  + Zero third-party tracking                               │
 │  + CSP headers via Cloudflare Worker                       │
 └─────────────────────────────────────────────────────────────┘
```

## Build & Quality

| Tool                     | Purpose                                 |
| ------------------------ | --------------------------------------- |
| ESLint 9 + TypeScript    | Linting with strict rules               |
| Prettier 3               | Consistent formatting                   |
| Husky + lint-staged      | Pre-commit quality gates                |
| Vitest 2.1               | Unit tests (jsdom)                      |
| Playwright 1.57          | E2E browser tests                       |
| Lighthouse CI            | Performance, a11y, best practices (90+) |
| rollup-plugin-visualizer | Bundle analysis (`pnpm analyze`)        |

## Performance Budget

```
 ┌─────────────────────────────────────────────────────────┐
 │                   PERFORMANCE TARGETS                    │
 │                                                         │
 │   Lighthouse         ████████████████████░  90+         │
 │   First Paint        ████████░░░░░░░░░░░░  < 1s        │
 │   Cached Boot        ████░░░░░░░░░░░░░░░░  < 200ms     │
 │   Main Thread Work   ████████████░░░░░░░░  Minimal     │
 │   Bundle (gzipped)   ████████████████░░░░  Chunked     │
 │                                                         │
 │   HOW WE HIT THEM:                                     │
 │   • Svelte compiles away the framework                 │
 │   • Vendor chunk: svelte, dexie, ky, openpgp, tiptap   │
 │   • Lazy routes: calendar, contacts, compose           │
 │   • Virtual scrolling for message lists                │
 │   • Workers for all CPU-heavy operations               │
 │                                                         │
 └─────────────────────────────────────────────────────────┘
```

## Development Commands

```bash
pnpm dev              # Dev server on :5174 with HMR
pnpm build            # Production build + SW generation
pnpm preview          # Preview production build
pnpm check            # Svelte type checking
pnpm analyze          # Bundle visualization → dist/stats.html

pnpm test             # Unit tests (Vitest)
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm test:e2e         # E2E tests (Playwright)

pnpm lint             # ESLint check
pnpm lint:fix         # ESLint auto-fix
pnpm format           # Prettier check
pnpm format:fix       # Prettier auto-fix
```

---

**Next:** [Worker Mesh](building-webmail-workers.md) — the three-worker
architecture that keeps the UI at 60fps.
