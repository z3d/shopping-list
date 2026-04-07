/**
 * Shopping List API Worker
 * Cloudflare Worker with D1 database
 *
 * Lists can be templates (is_template=1) or shopping lists (is_template=0).
 * Template items use `selected` field + `quantity` for the maker to pick items.
 * POST /api/lists/:id/create-shop copies selected items to a new dated list.
 */

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Token',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    try {
      // Health check (public)
      if (path === '/api/health') {
        return json({ status: 'ok', timestamp: Date.now() }, 200, cors);
      }

      // --- Auth check for all other routes ---
      if (env.DASHBOARD_TOKEN) {
        const incoming = request.headers.get('X-Dashboard-Token') || '';
        if (incoming !== env.DASHBOARD_TOKEN) {
          return json({ error: 'Unauthorized' }, 401, cors);
        }
      }

      // List all lists with item counts
      if (path === '/api/lists' && request.method === 'GET') {
        const result = await env.DB.prepare(`
          SELECT l.*,
            COUNT(i.id) as item_count,
            SUM(CASE WHEN i.checked = 1 THEN 1 ELSE 0 END) as checked_count,
            SUM(CASE WHEN i.selected = 1 THEN 1 ELSE 0 END) as selected_count
          FROM lists l
          LEFT JOIN items i ON i.list_id = l.id
          GROUP BY l.id
          ORDER BY l.is_template DESC, l.updated_at DESC
        `).all();
        return json({ lists: result.results }, 200, cors);
      }

      // Get single list with items
      const listMatch = path.match(/^\/api\/lists\/(\d+)$/);
      if (listMatch && request.method === 'GET') {
        const id = parseInt(listMatch[1]);
        const list = await env.DB.prepare('SELECT * FROM lists WHERE id = ?').bind(id).first();
        if (!list) return json({ error: 'Not found' }, 404, cors);

        const orderBy = list.is_template
          ? 'ORDER BY category ASC, name ASC'
          : 'ORDER BY checked ASC, category ASC, name ASC';

        const items = await env.DB.prepare(
          'SELECT * FROM items WHERE list_id = ? ' + orderBy
        ).bind(id).all();
        return json({ list, items: items.results }, 200, cors);
      }

      // --- Create shopping list from template ---
      const createShopMatch = path.match(/^\/api\/lists\/(\d+)\/create-shop$/);
      if (createShopMatch && request.method === 'POST') {
        const templateId = parseInt(createShopMatch[1]);

        // Verify it's a template
        const template = await env.DB.prepare('SELECT * FROM lists WHERE id = ? AND is_template = 1')
          .bind(templateId).first();
        if (!template) return json({ error: 'Template not found' }, 404, cors);

        // Get selected items
        const selected = await env.DB.prepare(
          'SELECT * FROM items WHERE list_id = ? AND selected = 1'
        ).bind(templateId).all();

        if (!selected.results.length) {
          return json({ error: 'No items selected' }, 400, cors);
        }

        // Create dated list
        const body = request.headers.get('content-type')?.includes('json')
          ? await request.json() : {};
        const today = new Date().toISOString().split('T')[0];
        const listName = body.name || (template.name + ' — ' + today);

        const result = await env.DB.prepare(
          'INSERT INTO lists (name, is_template) VALUES (?, 0)'
        ).bind(listName).run();
        const newListId = result.meta.last_row_id;

        // Copy selected items
        for (const item of selected.results) {
          await env.DB.prepare(
            'INSERT INTO items (list_id, name, quantity, unit, category, notes) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(newListId, item.name, item.quantity, item.unit, item.category, item.notes).run();
        }

        // Reset selected state on template
        await env.DB.prepare(
          'UPDATE items SET selected = 0 WHERE list_id = ?'
        ).bind(templateId).run();

        return json({
          id: newListId,
          name: listName,
          item_count: selected.results.length
        }, 201, cors);
      }

      // --- List CRUD ---

      // Create list
      if (path === '/api/lists' && request.method === 'POST') {
        const body = await request.json();
        if (!body.name || !body.name.trim()) {
          return json({ error: 'Name is required' }, 400, cors);
        }
        const isTemplate = body.is_template ? 1 : 0;
        const result = await env.DB.prepare(
          'INSERT INTO lists (name, is_template) VALUES (?, ?)'
        ).bind(body.name.trim(), isTemplate).run();
        return json({ id: result.meta.last_row_id, name: body.name.trim(), is_template: isTemplate }, 201, cors);
      }

      // Duplicate list
      const dupMatch = path.match(/^\/api\/lists\/(\d+)\/duplicate$/);
      if (dupMatch && request.method === 'POST') {
        const srcId = parseInt(dupMatch[1]);
        const src = await env.DB.prepare('SELECT * FROM lists WHERE id = ?').bind(srcId).first();
        if (!src) return json({ error: 'List not found' }, 404, cors);

        const items = await env.DB.prepare('SELECT * FROM items WHERE list_id = ?').bind(srcId).all();

        const newName = src.name + ' (copy)';
        const result = await env.DB.prepare(
          'INSERT INTO lists (name, is_template) VALUES (?, ?)'
        ).bind(newName, src.is_template).run();
        const newId = result.meta.last_row_id;

        for (const item of items.results) {
          await env.DB.prepare(
            'INSERT INTO items (list_id, name, quantity, unit, category, notes, selected) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(newId, item.name, item.quantity, item.unit, item.category, item.notes, item.selected || 0).run();
        }

        return json({ id: newId, name: newName, is_template: src.is_template, item_count: items.results.length }, 201, cors);
      }

      // Update list
      if (listMatch && request.method === 'PUT') {
        const id = parseInt(listMatch[1]);
        const body = await request.json();
        if (!body.name || !body.name.trim()) {
          return json({ error: 'Name is required' }, 400, cors);
        }
        await env.DB.prepare(
          "UPDATE lists SET name = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(body.name.trim(), id).run();
        return json({ success: true }, 200, cors);
      }

      // Delete list (cascades items)
      if (listMatch && request.method === 'DELETE') {
        const id = parseInt(listMatch[1]);
        await env.DB.prepare('DELETE FROM items WHERE list_id = ?').bind(id).run();
        await env.DB.prepare('DELETE FROM lists WHERE id = ?').bind(id).run();
        return json({ success: true }, 200, cors);
      }

      // --- Item CRUD ---
      const itemsMatch = path.match(/^\/api\/lists\/(\d+)\/items$/);
      const itemMatch = path.match(/^\/api\/lists\/(\d+)\/items\/(\d+)$/);

      // Create item
      if (itemsMatch && request.method === 'POST') {
        const listId = parseInt(itemsMatch[1]);
        const body = await request.json();
        if (!body.name || !body.name.trim()) {
          return json({ error: 'Name is required' }, 400, cors);
        }

        const result = await env.DB.prepare(
          'INSERT INTO items (list_id, name, quantity, unit, category, notes, selected) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          listId,
          body.name.trim(),
          body.quantity || '',
          body.unit || '',
          body.category || '',
          body.notes || '',
          body.selected ? 1 : 0
        ).run();

        await env.DB.prepare("UPDATE lists SET updated_at = datetime('now') WHERE id = ?").bind(listId).run();

        const created = await env.DB.prepare('SELECT * FROM items WHERE id = ?')
          .bind(result.meta.last_row_id).first();
        return json(created, 201, cors);
      }

      // Update item (check/uncheck, select/deselect, quantity, or full update)
      if (itemMatch && request.method === 'PUT') {
        const listId = parseInt(itemMatch[1]);
        const itemId = parseInt(itemMatch[2]);
        const body = await request.json();

        const existing = await env.DB.prepare('SELECT * FROM items WHERE id = ? AND list_id = ?')
          .bind(itemId, listId).first();
        if (!existing) return json({ error: 'Not found' }, 404, cors);

        // Toggle checked (shopper checking off)
        if (body.checked !== undefined && !body.name && body.selected === undefined && body.quantity === undefined) {
          await env.DB.prepare(
            'UPDATE items SET checked = ?, checked_by = ? WHERE id = ?'
          ).bind(body.checked ? 1 : 0, body.checked_by || '', itemId).run();
        }
        // Toggle selected (maker picking for shop list)
        else if (body.selected !== undefined && !body.name && body.checked === undefined) {
          const updates = ['selected = ?'];
          const values = [body.selected ? 1 : 0];
          // Allow updating quantity at the same time as selecting
          if (body.quantity !== undefined) {
            updates.push('quantity = ?');
            values.push(body.quantity);
          }
          values.push(itemId);
          await env.DB.prepare(
            'UPDATE items SET ' + updates.join(', ') + ' WHERE id = ?'
          ).bind(...values).run();
        }
        // Inline quantity update only
        else if (body.quantity !== undefined && !body.name && body.checked === undefined && body.selected === undefined) {
          await env.DB.prepare(
            'UPDATE items SET quantity = ? WHERE id = ?'
          ).bind(body.quantity, itemId).run();
        }
        // Full item update
        else {
          await env.DB.prepare(
            'UPDATE items SET name = ?, quantity = ?, unit = ?, category = ?, notes = ? WHERE id = ?'
          ).bind(
            (body.name || existing.name).trim(),
            body.quantity !== undefined ? body.quantity : existing.quantity,
            body.unit !== undefined ? body.unit : existing.unit,
            body.category !== undefined ? body.category : existing.category,
            body.notes !== undefined ? body.notes : existing.notes,
            itemId
          ).run();
        }

        await env.DB.prepare("UPDATE lists SET updated_at = datetime('now') WHERE id = ?").bind(listId).run();
        const updated = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(itemId).first();
        return json(updated, 200, cors);
      }

      // Delete item
      if (itemMatch && request.method === 'DELETE') {
        const listId = parseInt(itemMatch[1]);
        const itemId = parseInt(itemMatch[2]);
        await env.DB.prepare('DELETE FROM items WHERE id = ? AND list_id = ?').bind(itemId, listId).run();
        await env.DB.prepare("UPDATE lists SET updated_at = datetime('now') WHERE id = ?").bind(listId).run();
        return json({ success: true }, 200, cors);
      }

      // --- Receipt Scanning ---
      if (path === '/api/scan-receipt' && request.method === 'POST') {
        if (!env.ANTHROPIC_API_KEY) {
          return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500, cors);
        }

        const formData = await request.formData();
        const files = formData.getAll('photos');
        if (!files.length) return json({ error: 'No photos uploaded' }, 400, cors);

        const listItemsRaw = formData.get('list_items');
        let listItems = [];
        try { listItems = JSON.parse(listItemsRaw || '[]'); } catch (e) {}

        const imageBlocks = [];
        for (const file of files) {
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const mediaType = file.type || 'image/jpeg';
          imageBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          });
        }

        const itemListText = listItems.map(function(item) {
          let desc = item.name;
          if (item.quantity) desc = item.quantity + (item.unit ? ' ' + item.unit : '') + ' ' + desc;
          return '- [id:' + item.id + '] ' + desc;
        }).join('\n');

        imageBlocks.push({
          type: 'text',
          text: `You are a receipt scanner. Extract all purchased items from this store receipt image.

Then match them against this shopping list:
${itemListText || '(no items on list)'}

Return ONLY valid JSON (no markdown, no code fences):
{
  "receipt_items": [
    {"name": "item as shown on receipt", "price": "0.00 or null"}
  ],
  "matches": [
    {"list_item_id": 123, "list_item_name": "Chicken breast", "receipt_item": "CHICKEN BRST", "price": "12.50"}
  ],
  "unmatched": [
    {"name": "RECEIPT ITEM NAME", "price": "3.50"}
  ]
}

Rules:
- Extract ALL line items from the receipt (product name and price)
- Match receipt items to shopping list items using fuzzy matching (abbreviations, different casing, partial names are OK)
- "matches" = receipt items that correspond to a shopping list item
- "unmatched" = receipt items NOT on the shopping list
- Prices should be numbers as strings, or null if unreadable
- Be generous with matching — "CHKN BRST" matches "Chicken breast", "WM MILK 2L" matches "Milk"
- If no receipt is visible or readable, return empty arrays`
        });

        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{ role: 'user', content: imageBlocks }]
          })
        });

        if (!claudeResp.ok) {
          const err = await claudeResp.text();
          return json({ error: 'Claude API error: ' + claudeResp.status, detail: err }, 502, cors);
        }

        const claudeData = await claudeResp.json();
        let text = claudeData.content?.[0]?.text || '';
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) text = fenceMatch[1].trim();

        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          return json({ error: 'Failed to parse scan response', raw: text }, 500, cors);
        }

        return json({
          matches: parsed.matches || [],
          unmatched: parsed.unmatched || [],
          receipt_items: parsed.receipt_items || [],
          model: claudeData.model || 'unknown'
        }, 200, cors);
      }

      return json({ error: 'Not found' }, 404, cors);

    } catch (err) {
      return json({ error: err.message || 'Internal error' }, 500, cors);
    }
  }
};
