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
│   │   └── index.html      # Symlink → ../../index.html (DO NOT replace with a copy)
│   └── src/
│       └── worker.js       # Cloudflare Worker: all API routes
```

**Symlink rule**: `worker/public/index.html` is a symlink to root `index.html`. All edits go to the root file only.

## Roles

- **List Maker**: Full CRUD — create/edit/delete lists and items
- **Shopper**: Check/uncheck items only, plus receipt scanning
- Role is toggled client-side via the badge in the header or in settings

## Features

- CRUD for shopping lists and items
- Items grouped by category with progress tracking
- Quick-add bar that filters visible items as you type, with deterministic parsing ("2kg chicken" → qty: 2, unit: kg, name: chicken), separate category control, and duplicate detection
- Receipt scanning via Claude Vision — photographs a store receipt, extracts items, fuzzy-matches against list, and checks off matched items
- Reward-card photo shortcuts for Woolworths Everyday Rewards and Coles Flybuys
- Auto-update system via version meta tag

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
