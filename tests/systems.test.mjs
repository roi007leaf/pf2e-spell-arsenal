import test from 'node:test';
import assert from 'node:assert/strict';
import { systemAdapter } from '../scripts/systems.js';
import { pf2eAdapter } from '../scripts/pf2e.js';
import { dnd5eAdapter } from '../scripts/dnd5e.js';

test('system adapters expose the same runtime contract and SF2e shares PF2e', () => {
  assert.deepEqual(Object.keys(pf2eAdapter).sort(), Object.keys(dnd5eAdapter).sort());
  for (const id of ['pf2e', 'sf2e']) {
    globalThis.game = { system: { id } };
    assert.equal(systemAdapter(), pf2eAdapter);
  }
  game.system.id = 'dnd5e';
  assert.equal(systemAdapter(), dnd5eAdapter);
  assert.equal(systemAdapter({ type: 'spell', system: { level: { value: 1 } } }), pf2eAdapter);
  assert.equal(systemAdapter({ type: 'spell', system: { level: 1 } }), dnd5eAdapter);
});

test('D&D registers only its native event hooks; PF2e leaves native messages intact', () => {
  const events = [];
  globalThis.Hooks = { on: name => events.push(name) };
  pf2eAdapter.registerHooks();
  assert.deepEqual(events, []);
  dnd5eAdapter.registerHooks();
  assert.deepEqual(events, ['dnd5e.preCreateUsageMessage', 'dnd5e.preApplyDamage', 'preUpdateActor']);
  assert.equal(dnd5eAdapter.messageEvent({ flags: { pf2e: {} } }, 'caster'), null);
  assert.equal(dnd5eAdapter.placementPending({}), false);
});
