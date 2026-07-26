# Shopping List

Shopping list manager with two roles (maker/shopper), deployed as a Cloudflare Worker over D1. Single-file frontend (`index.html`) + worker (`worker/src/worker.js`); routes and schema are readable there and in `worker/schema.sql`.

## Commands

```bash
cd worker && npx wrangler dev          # local dev at http://localhost:8787
cd worker && npx wrangler deploy
cd worker && npm run db:init           # init production D1
cd worker && npm run db:init:local
```

Setup from scratch: `npx wrangler d1 create shopping-list-db` (copy the id into `wrangler.jsonc`), init the schema, then `npx wrangler secret put DASHBOARD_TOKEN` and `ANTHROPIC_API_KEY` (receipt scanning via Claude Vision).

## Critical rules

- **`worker/public/index.html` is a symlink to the root `index.html`** — all edits go to the root file.
- **Two version bumps, not one**: `<meta name="app-version">` in `index.html` on every frontend change, **and** `VERSION` in `worker/public/sw.js` whenever the cached shell changes — it names the caches, and a stale value leaves users on the old shell until they manually reload.
- **Import only ever adds.** It creates lists, never updates or deletes — importing the same file twice deliberately gives two copies, so an import can never destroy data. Keep that property. `EXPORT_VERSION` in `worker/src/worker.js` stamps the format; bump it when the payload shape changes (import rejects files stamped newer than it understands).
- **Reward cards are excluded from export** — they're photos of loyalty barcodes and exports get emailed around.
- **The offline outbox owns local state.** Check/uncheck is optimistic; failed writes queue in localStorage `shopping_list_outbox` and replay on `online`, tab focus, and after settings save. `syncList` **skips polling while the outbox is non-empty** so queued local changes are never overwritten by the server — don't "fix" that.

## Roles and behaviour

- **List Maker**: full CRUD on lists/items/templates. **Shopper**: check/uncheck, search, add, receipt scanning — no editing, deleting, or template access. Role toggles client-side (header badge or settings).
- Items group by category in supermarket walking order (`CATEGORY_ORDER` in `index.html`), not alphabetically; Uncategorised sorts last; checked items sink to the bottom of their category.
- Search/add bar parses deterministically ("2kg chicken" → qty 2, unit kg, name chicken) with duplicate detection.
- Receipt scanning photographs a receipt, extracts items via Claude Vision, fuzzy-matches, and checks off matches.
- Every view and overlay pushes a history entry, so hardware/browser Back steps through the app instead of leaving it.
- The service worker caches the app shell **network-first** (so the auto-update check still works) and successful `GET /api/*` responses; polling pauses on `visibilitychange`.

## Design

Dark navy theme matching brisbane-dashboard and recipes: `#1a1a2e` → `#16213e` gradient, `#4ade80` green accent, CSS custom properties, mobile-first, safe-area support.
