import test from 'node:test';
import assert from 'node:assert/strict';
import { openSpellDetails } from '../scripts/spell-details.js';
import { resolveSpellDetails } from '../scripts/spell-details.js';
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

test('unlinked mapping resolves configured world spell before unconfigured compendium copy', async () => {
  const spell = { type: 'spell', name: 'Grease', uuid: 'Actor.a.Item.grease', system: {}, flags: { 'pf2e-aztecs-template-wizard': { automation: { enabled: true } } } };
  globalThis.game = { actors: [{ items: [spell] }], items: [], packs: [] };
  assert.equal(await resolveSpellDetails('Grease', ''), spell);
});

test('spell lookup never invokes unrelated actorless consumable embedded getters', async () => {
  let reads = 0, opened = false;
  const oil = { type: 'consumable', name: 'Antipode Oil', system: {}, get embeddedSpell() { reads++; throw new Error('No owning actor found'); } };
  const spell = { type: 'spell', name: 'Grease', sheet: { render: async () => { opened = true; } } };
  globalThis.game = { items: [oil], actors: [{ items: [spell] }], packs: [] };
  await openSpellDetails('Grease', '');
  assert.equal(reads, 0); assert.equal(opened, true);
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
