import test from 'node:test';
import assert from 'node:assert/strict';
import { wizardHandlesPlacement, wizardRegionSpell, wizardPlacementPending, wizardFlagsChanged, replacesWizardTexture, syncWizardTextures, WIZARD_ID } from '../scripts/template-wizard.js';
import { stageRecords } from '../scripts/stages.js';
test('Foundry iterable Collection without flatMap supports stage scan', () => {
  const docs = { *[Symbol.iterator]() { yield { flags: {} }; } };
  assert.deepEqual(stageRecords({ getEmbeddedCollection: () => docs }, 'grease', 'level', '0:0'), []);
});
test('Wizard setFlag flattened changes trigger finalization and managed source resolves', () => {
  assert.equal(wizardFlagsChanged({ [`flags.${WIZARD_ID}.managed`]: {} }), true);
  assert.equal(wizardFlagsChanged({ flags: { [WIZARD_ID]: { managed: {} } } }), true);
  assert.equal(wizardFlagsChanged({ flags: { world: {} } }), false);
  globalThis.game = { modules: new Map([[WIZARD_ID, { active: true }]]) };
  const spell = { type: 'spell', name: 'Grease' };
  globalThis.fromUuidSync = uuid => uuid === 'spell' ? spell : null;
  assert.equal(wizardRegionSpell({ flags: { [WIZARD_ID]: { managed: { itemUuid: 'spell' } } } }), spell);
});
test('contiguous cells wait for Wizard finalization before visuals or region updates', () => {
  globalThis.game = { system: { id: 'pf2e' }, modules: new Map([[WIZARD_ID, { active: true, api: { readAutomation: () => ({ enabled: true, contiguous: { enabled: true, count: 4 } }) } }]]) };
  globalThis.fromUuidSync = () => ({ type: 'spell', name: 'Grease' });
  const region = { flags: { pf2e: { origin: { uuid: 'spell' } } } };
  assert.equal(wizardPlacementPending(region), true);
  region.flags[WIZARD_ID] = { contiguousPlacement: { pending: true } };
  assert.equal(wizardPlacementPending(region), true);
  region.flags[WIZARD_ID] = { managed: { itemUuid: 'spell' } };
  assert.equal(wizardPlacementPending(region), false);
  region.flags[WIZARD_ID].contiguousPlacement = { pending: true, primary: true, total: 4 };
  assert.equal(wizardPlacementPending(region), false);
});
test('mapped Wizard textures suppress and restore opacity without deleting attachments', async () => {
  let enabled = true;
  globalThis.game = { system: { id: 'pf2e' }, modules: new Map([[WIZARD_ID, { active: true }]]), settings: { get: (id, key) => key === 'enabled' ? enabled : [{ enabled: true, kind: 'area', spell: 'Grease', effect: 'Grease' }] } };
  const region = { flags: { [WIZARD_ID]: { originUuid: 'spell' } } };
  globalThis.fromUuidSync = uuid => uuid === 'region' ? region : { type: 'spell', name: 'Grease' };
  const updates = [];
  const tile = { alpha: .7, flags: { [WIZARD_ID]: { attachedToRegion: 'region' }, world: {} }, update: async data => updates.push(data) };
  assert.equal(replacesWizardTexture(tile), true);
  await syncWizardTextures({ tiles: [tile] });
  assert.equal(updates[0].alpha, 0);
  tile.flags.world.spellArsenalWizardVisual = { alpha: .7 }; enabled = false;
  await syncWizardTextures({ tiles: [tile] });
  assert.equal(updates[1].alpha, .7);
});
test('Wizard integration only defers configured placement and resolves UUID-only regions', () => {
  const module = { active: true, api: { readAutomation: () => ({ enabled: true, contiguous: { enabled: true } }) } };
  globalThis.game = { modules: new Map([[WIZARD_ID, module]]) };
  const spell = { name: 'Grease', type: 'spell' };
  globalThis.fromUuidSync = () => spell;
  assert.equal(wizardHandlesPlacement(spell), true);
  assert.equal(wizardRegionSpell({ flags: { [WIZARD_ID]: { originUuid: 'Actor.a.Item.s' } } }), spell);
  module.api.readAutomation = () => ({ enabled: false, templateShape: { shapes: [{}] } });
  assert.equal(wizardHandlesPlacement(spell), false);
  module.active = false;
  assert.equal(wizardRegionSpell({ flags: { [WIZARD_ID]: { originUuid: 'Actor.a.Item.s' } } }), null);
});
