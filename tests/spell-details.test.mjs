import test from 'node:test';
import assert from 'node:assert/strict';
import { openSpellDetails } from '../scripts/spell-details.js';
test('source spell sheet opens; removed source falls back to compendium', async () => {
  let opened = 0;
  const spell = { type: 'spell', name: 'Grease', sheet: { render: async force => { assert.equal(force, true); opened++; } } };
  globalThis.fromUuid = async () => spell;
  globalThis.game = { packs: [] };
  await openSpellDetails('Grease', 'Actor.a.Item.s'); assert.equal(opened, 1);
  globalThis.fromUuid = async () => null;
  game.packs = [{ documentName: 'Item', collection: 'pf2e.spells-srd', getIndex: async () => [{ type: 'spell', name: 'Grease', _id: 's' }], getDocument: async () => spell }];
  await openSpellDetails('Grease', 'deleted'); assert.equal(opened, 2);
  await assert.rejects(openSpellDetails('Unknown', ''), /unavailable/);
});

test('missing compendium document does not prevent fallback to another spell pack', async () => {
  let opened = false;
  const spell = { type: 'spell', name: 'Grease', sheet: { render: async () => { opened = true; } } };
  globalThis.game = { packs: [
    { documentName: 'Item', collection: 'missing.spells', getIndex: async () => [{ type: 'spell', name: 'Grease', _id: 'missing' }], getDocument: async () => null },
    { documentName: 'Item', collection: 'working.spells', getIndex: async () => [{ type: 'spell', name: 'Grease', _id: 'grease' }], getDocument: async () => spell }
  ] };
  await openSpellDetails('Grease', '');
  assert.equal(opened, true);
});
