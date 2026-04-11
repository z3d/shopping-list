-- Shopping List Schema

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_template INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  category TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  checked INTEGER DEFAULT 0,
  checked_by TEXT DEFAULT '',
  selected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_list_id ON items(list_id);

CREATE TABLE IF NOT EXISTS reward_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_name TEXT NOT NULL UNIQUE,
  image_data TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'image/jpeg',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
