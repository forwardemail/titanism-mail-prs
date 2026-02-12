# Webmail Vision Gap Analysis

Sources reviewed: `../webmail-vision/README.md`, `../webmail-vision/SPECIFICATION.md`, `../webmail-vision/docs/{ARCHITECTURE,ROADMAP,ADDITIONAL_CONSIDERATIONS,DEPLOYMENT}.md`, current repo `README.md`, `docs/*`, and key code paths (`src/utils/db.js`, `search-service.js`, `storage.js`, `mailboxStore.js`, `Compose.svelte`, `workbox.config.cjs`, `.github/workflows/ci.yml`).

## Snapshot

- Core PWA shell, Dexie-backed mail caches, FlexSearch indexing, TipTap editor, and Schedule-X calendar UI align with the vision’s client-only, offline-capable direction.
- The stack diverges from the vision’s TypeScript/stack guidance (current code is JavaScript + Svelte stores; no centralized state lib).
- Several vision pillars are incomplete: offline/outbox flows, advanced search + server fallback, security/privacy hardening (SpamScanner, tracker/external image controls), rich composer (Markdown/diagrams/templates/schedule/send-later), rules/labels, and push/notification plumbing.
- Calendar/contacts exist as online CRUD views but lack CardDAV/CalDAV depth, offline caching, recurrence/sharing, and import/export expected in the vision.
- Testing/perf/a11y/i18n coverage is far short of the vision (CI skips tests; only `en` locale; no Lighthouse/axe budgets or telemetry).

## Gap Details (vision expectation → current state → TODO)

### Architecture & Stack

- **Expectation:** TypeScript Vite SPA with layered separation (presentation/business/data/service), lightweight state lib (Zustand/Jotai), and Dexie schema covering mail, contacts, calendars, settings, drafts, search, sync queue.
- **Current:** Svelte 4 + JavaScript; Svelte stores + ad-hoc helpers; Dexie tables limited to mail (folders/messages/bodies/drafts/search/sync queue/sync manifests), no contacts/calendars/settings tables; service worker only caches static assets.
- **TODO:** Introduce typing (TS or JSDoc) and clearer domain layering; expand Dexie schema to include contacts, calendars/events, settings, filters/rules, and per-account metadata; consider a centralized state module for cross-view coordination; align SW/service layer with data syncing responsibilities.

### Data, Offline, Sync

- **Expectation:** IndexedDB-first for all entities; offline queue covering send/move/delete/flag + contacts/calendars; background sync; API response caching (stale-while-revalidate); conflict handling; quota/eviction policies; settings sync (encrypted).
- **Current:** IndexedDB for mail artifacts only; simple sync queue helper not wired to compose or contacts/calendars; no offline send (docs note offline limitation), no background sync or API caching in SW; quota handling exists for mail bodies but not for other entities; settings live in localStorage without encryption or sync.
- **TODO:** Wire the sync queue into outbound mail + folder ops + contact/calendar mutations with retry/backoff; add background delta sync for headers/bodies/contacts/events; extend cache/quota controls to new tables; consider API response caching where safe; add encrypted settings storage + optional server sync.

### Mailbox & Message View

- **Expectation:** Threaded + flat views, density modes, drag/drop to folders, labels/tags, rules/filters, full action set (archive/spam/print/view-source/download .eml/report phishing), attachment previews/ZIP download, unified inbox across accounts.
- **Current:** Threading + flat list (flat view virtualized), basic filters (unread/attachments/starred), no drag/drop, no label/tag system, no rules engine, limited actions (toggle read/star/archive/delete only), no .eml/source/print/report phishing, no unified inbox; attachments parsed/inlined but no ZIP/download-all UX.
- **TODO:** Add labels/tags and rules UI/engine; expand action set (print/source/.eml/spam/phishing); add drag/drop + batch move/copy; implement density modes; build unified inbox/cross-account views; enhance attachment UX (previews, download-all, size/type guards surfaced in UI).

### Search

- **Expectation:** Advanced operators (from/to/subject/has/is/before/after/size/in + boolean), search suggestions, saved searches, server fallback merge, cross-folder and unified search, body indexing toggle, health/rebuild controls.
- **Current:** FlexSearch Document index with optional body; parser supports basic from/to/subject/is:read|unread/has:attachment/folder/before/after; saved searches persisted in Dexie meta; rebuild hooks in `mailboxActions` are placeholders; no server fallback or merge; no size/operator boolean logic; no UI for index health.
- **TODO:** Implement full query parser (boolean, size, in:, labels), search suggestions, and merge with server search when local misses; finish index rebuild/health UI; expose body-index toggle controls; add cross-account search paths.

### Compose

- **Expectation:** Full RTE + Markdown preview, Mermaid/diagrams, emoji picker with recents/tones, templates/canned responses, signatures, reply/forward flows with quoted text, attachment reminder, autosave drafts, offline outbox with retry, send-later, read receipts, priority, grammar/LanguageTool, LLM-assisted actions, alias selector and per-alias signatures.
- **Current:** TipTap starter with basic formatting + emoji picker; manual attachment size/type limits; no Markdown/diagram/template/signature support; no autosave drafts, offline outbox, send-later, read receipts, or grammar/LLM; compose uses live API only (no retry queue); limited recipient autocomplete from in-memory contacts.
- **TODO:** Add autosave/restore drafts in Dexie; wire compose to sync queue for offline/outbox; add send-later + read-receipt/priority flags; implement templates/signatures/alias selector; integrate attachment reminder; add Markdown/diagram preview option; optional grammar/LLM hooks gated by user-provided keys.

### Contacts

- **Expectation:** Full CardDAV support, groups/tags/favorites/frequent contacts, merge duplicates, vCard import/export, offline caching/sync, composer suggestions.
- **Current:** Svelte contacts CRUD hitting API directly; no Dexie storage or offline behavior; no groups/merge/import/export; autocomplete limited to fetched list; no CardDAV specifics.
- **TODO:** Add contacts tables + sync; implement groups/tags/favorites/recents; build merge + import/export (vCard/CSV); integrate CardDAV endpoints if available; cache for offline and composer suggestions.

### Calendar

- **Expectation:** Day/week/month/agenda/year views, recurrence, reminders, invites/RSVP, CalDAV sync, multiple calendars, sharing, color coding, import/export .ics, email-to-calendar links.
- **Current:** Schedule-X calendar with basic event CRUD via API; no Dexie caching; no recurrence/invite/RSVP/sharing; limited reminder handling; ICS generate/parse helpers exist but not integrated into flows; CalDAV specifics absent.
- **TODO:** Add calendar/event tables + offline sync; implement recurrence + reminders; wire invite/RSVP + sharing if API allows; multi-calendar colors; import/export flows; CalDAV alignment.

### Security & Privacy

- **Expectation:** DOMPurify hardening, external image controls + tracker detection, SpamScanner/phishing/malware warnings, OpenPGP with key mgmt, password-protected messages, Web Crypto for credential/storage encryption, strict CSP, downloadable/source view with safety checks.
- **Current:** DOMPurify wrapper; PostalMime parsing with inline data URLs; openpgp decrypt path; credentials stored in localStorage/plain Basic auth; no tracker detection or external image toggle; no SpamScanner/phishing/malware hooks; no CSP tooling; no password-protected messages.
- **TODO:** Encrypt stored credentials/passphrases; add external image toggle + tracker heuristics; integrate SpamScanner/phishing checks; improve DOMPurify config/URL allowlist + CID handling; surface PGP key mgmt UI; add safe view-source/.eml download paths; define CSP and sanitizer tests.

### PWA, Sync, Notifications

- **Expectation:** SW handles asset + API caching, background sync of queued ops, push notifications with actions/badge, offline-first UX including compose queue, quota-aware eviction.
- **Current:** SW precaches assets/icons only; no API caching, background sync, or push; offline compose disabled; quota logic limited to message bodies; badge/notifications absent.
- **TODO:** Extend SW/runtime caching where safe; add background sync hook to replay sync queue; implement push subscription + notification actions; badge unread counts; surface quota states and controls.

### Settings, Customization, i18n, Accessibility

- **Expectation:** Rich settings categories (display/density/theme/fonts/shortcuts/security/offline/notifications), keyboard shortcut editor, theme variants, language/RTL support (40+ langs), high-contrast/reduced-motion, WCAG/ARIA coverage, optional settings sync.
- **Current:** Theme toggle and shortcut bindings exist but not user-editable; only `en` locale; no RTL/high-contrast/reduced-motion toggles; settings stored locally only; a11y not covered by tests/docs.
- **TODO:** Add settings surfaces for images/search/cache/shortcuts/notifications/themes; implement shortcut editor; expand locales + RTL handling; add accessibility audits + high-contrast/reduced-motion modes; optional settings sync.

### Testing, Observability, Performance

- **Expectation:** Vitest/Playwright suites for auth/search/compose/offline/images/shortcuts, Lighthouse CI/perf budgets, telemetry with redaction, axe/a11y + unsafe-HTML checks in CI.
- **Current:** Unit tests exist but CI skips tests; limited e2e (login only); no perf/a11y/HTML safety checks; error logger exists but no telemetry pipeline; no Lighthouse budgets.
- **TODO:** Turn tests back on in CI and expand coverage to search/offline/compose; add Playwright flows per vision; integrate axe + sanitizer checks; add Lighthouse/perf budgets; wire redacted telemetry/diagnostics export.

### Deployment & Native Apps

- **Expectation:** Release-based CI/CD to R2 with tests, plus native app packaging (Neutralino/Tauri/Capacitor) and manifest updates.
- **Current:** GitHub Actions deploy on push to `main` (lint/format/build; tests commented out) and sync to R2; no native app artifacts/manifests.
- **TODO:** Move to release-triggered deploy or add staging; re-enable tests in pipeline; add native packaging steps/manifests if pursuing Neutralino/Tauri; align with vision’s update manifest flow.

## Highest-Impact Next Steps

- Wire compose + mailbox ops into the sync queue with offline/outbox + background replay; add external image controls + tracker checks.
- Expand Dexie schema for contacts/calendars/settings and cache/sync them; add search rebuild/health UI with server fallback.
- Implement composer resilience (draft autosave, attachment reminder, send-later, templates/signatures) and richer mailbox actions (labels/rules, drag/drop, spam/phishing paths).
- Restore CI test execution and add Lighthouse/a11y checks; encrypt stored credentials and tighten sanitizer/CSP defaults.
