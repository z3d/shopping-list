# Shopping List

Shopping list manager with two roles (maker/shopper), deployed as a Cloudflare Worker.

## Commands

- `cd worker && npx wrangler dev` — local dev server at `http://localhost:8787`
- `cd worker && npx wrangler deploy` — deploy to Cloudflare
- `cd worker && npm run db:init` — init production D1 database
- `cd worker && npm run db:init:local` — init local D1 database
- Or just open `index.html` directly in a browser (no server needed, but needs Worker URL configured)

## Architecture

```
├── index.html              # Single-file frontend (HTML + CSS + JS)
├── worker/
│   ├── wrangler.jsonc      # Worker config (update database_id after creation)
│   ├── schema.sql          # D1 database schema
│   ├── public/
│   │   ├── index.html      # Symlink → ../../index.html (DO NOT replace with a copy)
│   │   ├── sw.js           # Service worker: offline app shell + cached list data
│   │   ├── manifest.webmanifest
│   │   └── icon.svg, icon-180/192/512.png
│   └── src/
│       └── worker.js       # Cloudflare Worker: all API routes
```

**Symlink rule**: `worker/public/index.html` is a symlink to root `index.html`. All edits go to the root file only.

## Roles

- **List Maker**: Full CRUD — create/edit/delete lists and items
- **Shopper**: Check/uncheck items, search, add items, and receipt scanning. No editing, deleting, or template access.
- Role is toggled client-side via the badge in the header or in settings

## Features

- CRUD for shopping lists and items
- Items grouped by category, ordered by supermarket walking order (`CATEGORY_ORDER` in `index.html`), not alphabetically. Uncategorised sorts last. Checked items sink to the bottom of their category.
- Search/add bar that filters visible items as you type, with deterministic parsing ("2kg chicken" → qty: 2, unit: kg, name: chicken), separate category control, and duplicate detection
- Receipt scanning via Claude Vision — photographs a store receipt, extracts items, fuzzy-matches against list, and checks off matched items
- Reward-card photo shortcuts for Woolworths Everyday Rewards and Coles Flybuys
- Auto-update system via version meta tag
- Every view and overlay pushes a history entry, so hardware/browser Back steps through the app instead of leaving it

## Offline behaviour

The app is used inside supermarkets, so it has to survive bad signal:

- `sw.js` caches the app shell (network-first, so the auto-update check still works) and successful `GET /api/*` responses, so the last-viewed list is readable with no connection.
- Check/uncheck is optimistic. If the write fails at the network layer it goes into an outbox in `localStorage` (`shopping_list_outbox`) and replays on `online`, on tab focus, and after a settings save. A banner shows the pending count.
- `syncList` skips polling while the outbox is non-empty, so queued local state is never overwritten by the server.
- Polling pauses on `visibilitychange` and catches up when the tab is shown again.

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | No | Health check |
| GET | `/api/lists` | Yes | List all lists with item counts |
| GET | `/api/lists/:id` | Yes | Get list with all items |
| POST | `/api/lists` | Yes | Create list |
| PUT | `/api/lists/:id` | Yes | Update list |
| DELETE | `/api/lists/:id` | Yes | Delete list + items |
| POST | `/api/lists/:id/duplicate` | Yes | Duplicate a list |
| POST | `/api/lists/:id/create-shop` | Yes | Create a dated shopping list from a template |
| POST | `/api/lists/:id/items` | Yes | Create item |
| PUT | `/api/lists/:id/items/:itemId` | Yes | Update item, toggle checked, or toggle selected |
| DELETE | `/api/lists/:id/items/:itemId` | Yes | Delete item |
| POST | `/api/scan-receipt` | Yes | Scan receipt photo(s) with Claude Vision |
| GET | `/api/reward-cards` | Yes | List all reward cards with images |
| PUT | `/api/reward-cards` | Yes | Upload/replace a reward card photo (multipart/form-data) |
| DELETE | `/api/reward-cards/:store` | Yes | Remove a reward card |

## Database Schema

- **lists**: id, name, is_template, created_at, updated_at
- **items**: id, list_id, name, quantity, unit, category, notes, checked, checked_by, selected, created_at
- **reward_cards**: id, store_name (unique), image_data (base64), media_type, created_at, updated_at

## Version Bumping

`index.html` has `<meta name="app-version" content="X.Y.Z">`. Bump this (semver) whenever changing `index.html`.

Also bump `VERSION` in `worker/public/sw.js` when the cached shell changes — it names the caches, so a stale value leaves users on the old shell until they hit the reload button.

## Secrets Required

- `DASHBOARD_TOKEN` (required) — auth token for all API operations (except health check)
- `ANTHROPIC_API_KEY` — for receipt scanning via Claude Vision

## Setup

```bash
# Create D1 database
cd worker && npx wrangler d1 create shopping-list-db
# Copy the database_id into wrangler.jsonc

# Init schema
npm run db:init        # production
npm run db:init:local  # local dev

# Set secrets
npx wrangler secret put DASHBOARD_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY

# Deploy
npx wrangler deploy
```

## Design

Dark navy theme matching brisbane-dashboard and recipes app:
- Background: `#1a1a2e` → `#16213e` gradient
- Accent: `#4ade80` green
- CSS custom properties throughout
- System font stack, mobile-first, safe area support
