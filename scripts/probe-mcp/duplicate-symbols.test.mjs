// The MCP gateway loads every public/api/mcp*.php module into one PHP process. A constant
// defined twice only raises a warning and the first definition wins silently: in Nov 2026
// MCP_MOVEMENT_WINDOW (ledger) shadowed the stock window and list_stock_movements sorted by
// a column its table does not have. A duplicate function is a fatal error on every MCP call.
// npm run check does not run PHP, so this guards both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'api');

test('no constant or function is defined in two MCP modules', () => {
  const seen = new Map();
  const dupes = [];
  for (const file of readdirSync(apiDir).filter((f) => /^mcp.*\.php$/.test(f))) {
    const src = readFileSync(join(apiDir, file), 'utf8');
    const re = /^(?:const\s+([A-Z][A-Z0-9_]*)\s*=|function\s+([a-z_][a-z0-9_]*)\s*\(|define\(\s*'([A-Z][A-Z0-9_]*)')/gim;
    for (const m of src.matchAll(re)) {
      const name = m[1] || m[2] || m[3];
      if (seen.has(name)) dupes.push(`${name}: ${seen.get(name)} and ${file}`);
      else seen.set(name, file);
    }
  }
  assert.deepEqual(dupes, []);
});
