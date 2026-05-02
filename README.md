# Shopping List

A two-role shopping list manager (maker / shopper) deployed as a Cloudflare Worker with a D1 database. Single-file frontend, single-file worker — no build step.

## Features

- CRUD for shopping lists and items, grouped by category with progress tracking
- Two roles toggled in-app:
  - **Maker** — creates and edits lists, picks items from templates
  - **Shopper** — checks items off, scans receipts
- Templates: keep a master list (e.g. "Groceries"), select items each week, generate a dated shopping list
- Quick-add bar with deterministic parsing (`2kg chicken` → qty `2`, unit `kg`, name `chicken`), separate category control, and duplicate detection
- Receipt scanning via Claude Vision — photograph a receipt, items are extracted and fuzzy-matched against the list, then checked off automatically. Receipt images are sent to the Anthropic API (`api.anthropic.com`) and are not stored server-side. Don't upload receipts containing information you wouldn't want sent to a third-party AI provider.
- Multi-shopper sync (5s polling) so two people can shop the same list together
- Reward-card photo shortcuts for Woolworths Everyday Rewards and Coles Flybuys
- Auto-update banner driven by an `app-version` meta tag
- Token-gated API — reads and writes both require the dashboard token

## Architecture

```
├── index.html              # Single-file frontend (HTML + CSS + JS)
├── LICENSE                 # MIT
├── README.md
└── worker/
    ├── wrangler.jsonc      # Worker config (D1 binding)
    ├── schema.sql          # D1 schema
    ├── package.json
    ├── public/
    │   └── index.html      # Symlink → ../../index.html
    └── src/
        └── worker.js       # Cloudflare Worker — all API routes
```

`worker/public/index.html` is a **symlink** to the root `index.html`. All edits go to the root file only — never replace the symlink with a copy.

## API

| Method | Path                                    | Auth | Purpose                                          |
|--------|-----------------------------------------|------|--------------------------------------------------|
| GET    | `/api/health`                           | No   | Health check                                     |
| GET    | `/api/lists`                            | Yes  | List all lists with item counts                  |
| GET    | `/api/lists/:id`                        | Yes  | Get a list with all items                        |
| POST   | `/api/lists`                            | Yes  | Create list                                      |
| PUT    | `/api/lists/:id`                        | Yes  | Rename list                                      |
| DELETE | `/api/lists/:id`                        | Yes  | Delete list (cascades items)                     |
| POST   | `/api/lists/:id/duplicate`              | Yes  | Duplicate a list                                 |
| POST   | `/api/lists/:id/create-shop`            | Yes  | Create a dated shopping list from a template     |
| POST   | `/api/lists/:id/items`                  | Yes  | Create item                                      |
| PUT    | `/api/lists/:id/items/:itemId`          | Yes  | Update item, toggle checked, toggle selected     |
| DELETE | `/api/lists/:id/items/:itemId`          | Yes  | Delete item                                      |
| POST   | `/api/scan-receipt`                     | Yes  | Scan receipt photo(s) with Claude Vision         |
| GET    | `/api/reward-cards`                     | Yes  | List reward-card photos                          |
| PUT    | `/api/reward-cards`                     | Yes  | Upload/replace a reward-card photo               |
| DELETE | `/api/reward-cards/:store`              | Yes  | Delete a reward-card photo                       |

Auth is a shared token sent in the `X-Dashboard-Token` header. Only `/api/health` is public.

## Database schema

- **lists**: `id`, `name`, `is_template`, `created_at`, `updated_at`
- **items**: `id`, `list_id`, `name`, `quantity`, `unit`, `category`, `notes`, `checked`, `checked_by`, `selected`, `created_at`
- **reward_cards**: `id`, `store_name`, `image_data`, `media_type`, `created_at`, `updated_at`

`is_template = 1` lists hold the master selection of items. `selected = 1` items are picked for the next shop. `POST /api/lists/:id/create-shop` copies all selected items into a new dated list and resets the selection.

## Setup

```bash
# 1. Create D1 database
cd worker
npx wrangler d1 create shopping-list-db
# copy the database_id into wrangler.jsonc

# 2. Init schema
npm run db:init        # production
npm run db:init:local  # local dev

# 3. Set secrets
npx wrangler secret put DASHBOARD_TOKEN     # required for any read or write
npx wrangler secret put ANTHROPIC_API_KEY   # required for receipt scanning

# 4. Deploy
npx wrangler deploy
```

## Local development

```bash
cd worker && npx wrangler dev
# http://localhost:8787
```

To exercise the auth gate locally, create `worker/.dev.vars`:

```
DASHBOARD_TOKEN=anything
```

`.dev.vars` is gitignored.

## Versioning

`index.html` carries `<meta name="app-version" content="X.Y.Z">`. Bump it (semver) whenever `index.html` changes — connected clients will auto-reload to the new version.

## Design

Dark navy theme:

- Background: `#1a1a2e` → `#16213e` gradient
- Accent: `#4ade80` green
- CSS custom properties throughout
- System font stack, mobile-first, safe-area aware

## License

[MIT](./LICENSE) © 2026 z3d
