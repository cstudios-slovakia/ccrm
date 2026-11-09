import test from 'node:test';
import assert from 'node:assert/strict';
import type { EmailBlock, EmailDoc } from './types.ts';
import {
  allBlocks,
  changeRowLayout,
  duplicateBlock,
  duplicateRow,
  findBlock,
  findColumn,
  insertBlock,
  insertRow,
  insertRowWithBlock,
  moveBlock,
  moveBlockToNewRow,
  moveRow,
  removeBlock,
  removeRow,
  shiftBlock,
  shiftRow,
  updateBlock,
  updateColumn,
  updateRow,
} from './docOps.ts';
import { defaultBody, defaultFooter, defaultHeader, newBlock, newRow, newStarterRow, BLOCK_TYPES, ROW_LAYOUTS } from './defaults.ts';

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o as Record<string, unknown>).forEach(deepFreeze);
  }
  return o;
};

const text = (id: string, html = id): EmailBlock => ({ id, type: 'text', html });

/** Two rows: r1 [c1: a, b][c2: c], r2 [c3: d]. */
const fixture = (): EmailDoc =>
  deepFreeze({
    version: 1,
    rows: [
      { id: 'r1', layout: '1-1', columns: [{ id: 'c1', blocks: [text('a'), text('b')] }, { id: 'c2', blocks: [text('c')] }] },
      { id: 'r2', layout: '1', columns: [{ id: 'c3', blocks: [text('d')] }] },
    ],
  });

const ids = (doc: EmailDoc) => doc.rows.map((r) => r.columns.map((c) => c.blocks.map((b) => b.id).join('')).join('|'));

test('insertBlock inserts at the index and clamps it', () => {
  const doc = fixture();
  assert.deepEqual(ids(insertBlock(doc, 'c1', 1, text('x'))), ['axb|c', 'd']);
  assert.deepEqual(ids(insertBlock(doc, 'c1', 0, text('x'))), ['xab|c', 'd']);
  assert.deepEqual(ids(insertBlock(doc, 'c1', 99, text('x'))), ['abx|c', 'd']);
  assert.deepEqual(ids(insertBlock(doc, 'c2', -5, text('x'))), ['ab|xc', 'd']);
  assert.equal(insertBlock(doc, 'nope', 0, text('x')), doc);
});

test('operations never mutate the input and untouched rows keep their identity', () => {
  const doc = fixture();
  const out = insertBlock(doc, 'c1', 1, text('x'));
  assert.notEqual(out, doc);
  assert.equal(out.rows[1], doc.rows[1]);
  assert.deepEqual(ids(doc), ['ab|c', 'd']);
});

test('removeBlock', () => {
  const doc = fixture();
  assert.deepEqual(ids(removeBlock(doc, 'b')), ['a|c', 'd']);
  assert.deepEqual(ids(removeBlock(doc, 'd')), ['ab|c', '']);
  assert.equal(removeBlock(doc, 'nope'), doc);
});

test('moveBlock within a column uses gaps before the move', () => {
  const doc = fixture();
  assert.deepEqual(ids(moveBlock(doc, 'a', 'c1', 2)), ['ba|c', 'd']);
  assert.deepEqual(ids(moveBlock(doc, 'b', 'c1', 0)), ['ba|c', 'd']);
  assert.equal(moveBlock(doc, 'a', 'c1', 0), doc);
  assert.equal(moveBlock(doc, 'a', 'c1', 1), doc);
  assert.equal(moveBlock(doc, 'b', 'c1', 2), doc);
});

test('moveBlock across columns and rows', () => {
  const doc = fixture();
  assert.deepEqual(ids(moveBlock(doc, 'a', 'c2', 1)), ['b|ca', 'd']);
  assert.deepEqual(ids(moveBlock(doc, 'c', 'c3', 0)), ['ab|', 'cd']);
  assert.equal(moveBlock(doc, 'a', 'nope', 0), doc);
  assert.equal(moveBlock(doc, 'nope', 'c1', 0), doc);
});

test('shiftBlock moves one place inside the column only', () => {
  const doc = fixture();
  assert.deepEqual(ids(shiftBlock(doc, 'a', 1)), ['ba|c', 'd']);
  assert.deepEqual(ids(shiftBlock(doc, 'b', -1)), ['ba|c', 'd']);
  assert.equal(shiftBlock(doc, 'a', -1), doc);
  assert.equal(shiftBlock(doc, 'b', 1), doc);
  assert.equal(shiftBlock(doc, 'nope', 1), doc);
});

test('duplicateBlock puts a copy with a new id right below', () => {
  const doc = fixture();
  const { doc: out, id } = duplicateBlock(doc, 'a');
  assert.ok(id && id !== 'a');
  assert.deepEqual(out.rows[0].columns[0].blocks.map((b) => b.id), ['a', id, 'b']);
  assert.deepEqual({ ...out.rows[0].columns[0].blocks[1], id: 'a' }, doc.rows[0].columns[0].blocks[0]);
  assert.equal(duplicateBlock(doc, 'nope').id, null);
});

test('duplicateBlock deep-copies nested data (social items)', () => {
  const social = deepFreeze<EmailBlock>({ id: 's', type: 'social', items: [{ network: 'facebook', url: 'https://f.test' }] });
  const doc = deepFreeze<EmailDoc>({ version: 1, rows: [{ id: 'r', layout: '1', columns: [{ id: 'c', blocks: [social] }] }] });
  const { doc: out, id } = duplicateBlock(doc, 's');
  const copy = findBlock(out, id as string)?.block;
  assert.ok(copy && copy.type === 'social');
  assert.notEqual(copy.items, (social as { items: unknown }).items);
  assert.deepEqual(copy.items, [{ network: 'facebook', url: 'https://f.test' }]);
});

test('updateBlock merges, ignores id/type, removes undefined keys, and no-ops return the same doc', () => {
  const doc = deepFreeze<EmailDoc>({
    version: 1,
    rows: [{ id: 'r', layout: '1', columns: [{ id: 'c', blocks: [{ id: 'b', type: 'text', html: 'x', align: 'left' }] }] }],
  });
  const out = updateBlock(doc, 'b', { html: 'y', fontSize: 20, id: 'zzz', type: 'heading' });
  const b = findBlock(out, 'b')?.block;
  assert.deepEqual(b, { id: 'b', type: 'text', html: 'y', align: 'left', fontSize: 20 });
  const cleared = findBlock(updateBlock(out, 'b', { align: undefined }), 'b')?.block;
  assert.ok(cleared && !('align' in cleared));
  assert.equal(updateBlock(doc, 'b', { html: 'x' }), doc);
  assert.equal(updateBlock(doc, 'b', { color: undefined }), doc);
  assert.equal(updateBlock(doc, 'nope', { html: 'q' }), doc);
});

test('insertRow, removeRow', () => {
  const doc = fixture();
  const row = newRow('1');
  assert.deepEqual(insertRow(doc, row, 1).rows.map((r) => r.id), ['r1', row.id, 'r2']);
  assert.deepEqual(insertRow(doc, row, 0).rows.map((r) => r.id), [row.id, 'r1', 'r2']);
  assert.deepEqual(insertRow(doc, row, 99).rows.map((r) => r.id), ['r1', 'r2', row.id]);
  assert.deepEqual(removeRow(doc, 'r1').rows.map((r) => r.id), ['r2']);
  assert.equal(removeRow(doc, 'nope'), doc);
});

test('moveRow and shiftRow', () => {
  const doc = fixture();
  assert.deepEqual(moveRow(doc, 'r1', 2).rows.map((r) => r.id), ['r2', 'r1']);
  assert.deepEqual(moveRow(doc, 'r2', 0).rows.map((r) => r.id), ['r2', 'r1']);
  assert.equal(moveRow(doc, 'r1', 0), doc);
  assert.equal(moveRow(doc, 'r1', 1), doc);
  assert.deepEqual(shiftRow(doc, 'r1', 1).rows.map((r) => r.id), ['r2', 'r1']);
  assert.equal(shiftRow(doc, 'r1', -1), doc);
  assert.equal(shiftRow(doc, 'r2', 1), doc);
});

test('duplicateRow gives the copy new ids for the row, columns and blocks', () => {
  const doc = fixture();
  const { doc: out, id } = duplicateRow(doc, 'r1');
  assert.deepEqual(out.rows.map((r) => r.id), ['r1', id, 'r2']);
  const copy = out.rows[1];
  const used = new Set<string>();
  const collect = (d: EmailDoc) =>
    d.rows.forEach((r) => {
      used.add(r.id);
      r.columns.forEach((c) => {
        used.add(c.id);
        c.blocks.forEach((b) => used.add(b.id));
      });
    });
  collect(out);
  assert.equal(used.size, 3 + 5 + 7,'every id in the document is unique');
  assert.equal(copy.layout, '1-1');
  assert.deepEqual(copy.columns.map((c) => c.blocks.map((b) => (b as { html: string }).html)), [['a', 'b'], ['c']]);
  assert.equal(duplicateRow(doc, 'nope').id, null);
});

test('updateRow and updateColumn', () => {
  const doc = fixture();
  const out = updateRow(doc, 'r1', { background: '#fff', paddingTop: 0, stackOnMobile: false });
  assert.equal(out.rows[0].background, '#fff');
  assert.equal(out.rows[0].paddingTop, 0);
  assert.equal(out.rows[0].layout, '1-1');
  assert.equal(updateRow(out, 'r1', { background: '#fff' }), out);
  assert.equal(updateRow(out, 'r1', { background: undefined }).rows[0].background, undefined);
  assert.equal(updateRow(doc, 'nope', { background: '#fff' }), doc);
  const col = updateColumn(doc, 'c2', { verticalAlign: 'middle', paddingX: 4 });
  assert.deepEqual({ v: findColumn(col, 'c2')?.column.verticalAlign, p: findColumn(col, 'c2')?.column.paddingX }, { v: 'middle', p: 4 });
  assert.deepEqual(findColumn(col, 'c2')?.column.blocks.map((b) => b.id), ['c']);
  assert.equal(updateColumn(col, 'c2', { paddingX: 4 }), col);
});

test('changeRowLayout keeps blocks: fewer columns collect them into the last remaining one', () => {
  const doc = deepFreeze<EmailDoc>({
    version: 1,
    rows: [
      {
        id: 'r',
        layout: '1-1-1',
        columns: [
          { id: 'x', blocks: [text('a')], paddingX: 5 },
          { id: 'y', blocks: [text('b')] },
          { id: 'z', blocks: [text('c'), text('d')] },
        ],
      },
    ],
  });
  const two = changeRowLayout(doc, 'r', '1-2');
  assert.equal(two.rows[0].layout, '1-2');
  assert.deepEqual(two.rows[0].columns.map((c) => c.id), ['x', 'y']);
  assert.deepEqual(two.rows[0].columns.map((c) => c.blocks.map((b) => b.id).join('')), ['a', 'bcd']);
  assert.equal(two.rows[0].columns[0].paddingX, 5);
  const one = changeRowLayout(doc, 'r', '1');
  assert.deepEqual(one.rows[0].columns.map((c) => c.blocks.map((b) => b.id).join('')), ['abcd']);
  assert.equal(allBlocks(one).length, 4);
});

test('changeRowLayout with more columns adds empty ones; same layout is a no-op', () => {
  const doc = fixture();
  const three = changeRowLayout(doc, 'r1', '1-1-1');
  assert.equal(three.rows[0].columns.length, 3);
  assert.deepEqual(three.rows[0].columns.map((c) => c.blocks.length), [2, 1, 0]);
  assert.equal(new Set(three.rows[0].columns.map((c) => c.id)).size, 3);
  const grown = changeRowLayout(doc, 'r2', '2-1');
  assert.deepEqual(grown.rows[1].columns.map((c) => c.blocks.length), [1, 0]);
  assert.equal(changeRowLayout(doc, 'r1', '1-1'), doc);
  assert.equal(changeRowLayout(doc, 'nope', '1'), doc);
  // 1-1 -> 2-1 keeps the same number of columns and just relabels
  assert.deepEqual(changeRowLayout(doc, 'r1', '2-1').rows[0].columns.map((c) => c.id), ['c1', 'c2']);
});

test('insertRowWithBlock and moveBlockToNewRow', () => {
  const doc = fixture();
  const out = insertRowWithBlock(doc, text('n'), 1);
  assert.deepEqual(ids(out), ['ab|c', 'n', 'd']);
  assert.equal(out.rows[1].layout, '1');
  const moved = moveBlockToNewRow(doc, 'c', 0);
  assert.deepEqual(ids(moved), ['c', 'ab|', 'd']);
  assert.equal(moveBlockToNewRow(doc, 'nope', 0), doc);
});

test('factories: every block type and row layout', () => {
  for (const type of BLOCK_TYPES) {
    const b = newBlock(type, 'sk');
    assert.equal(b.type, type);
    assert.equal(b.id.length, 8);
  }
  const lengths = { '1': 1, '1-1': 2, '1-2': 2, '2-1': 2, '1-1-1': 3 } as const;
  for (const layout of ROW_LAYOUTS) assert.equal(newRow(layout).columns.length, lengths[layout]);
  assert.equal(newStarterRow('imageText').columns.length, 2);
  assert.equal(allBlocks({ version: 1, rows: [newStarterRow('twoColumns')] }).length, 2);
});

test('defaults: body, header and footer', () => {
  const body = defaultBody('hu');
  assert.equal(body.version, 1);
  assert.ok(allBlocks(body).length >= 2);
  const footer = defaultFooter({ name: 'Acme <Co> & Sons', address: 'Main 1\nBratislava' }, 'en');
  const html = JSON.stringify(footer);
  assert.ok(html.includes('{{unsubscribe_url}}') && html.includes('{{view_online_url}}'));
  assert.ok(html.includes('Acme &lt;Co&gt; &amp; Sons'));
  assert.ok(html.includes('Main 1<br>Bratislava'));
  const header = defaultHeader({ name: 'Acme', logoUrl: 'https://x.test/logo.png' });
  assert.equal(allBlocks(header)[0].type, 'image');
  assert.equal(allBlocks(defaultHeader({ name: 'Acme' }))[0].type, 'heading');
});
