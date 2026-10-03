import test from 'node:test';
import assert from 'node:assert/strict';
import { dnd5eAdapter, areaActivities } from '../scripts/dnd5e.js';

test('Grease offers cast save at placement and entry save at re-entry', () => {
  const activity = (id, name) => ({ id, name, type: 'save', save: { ability: new Set(['dex']), dc: { value: 14 } } });
  const spell = { system: { activities: { cast: activity('cast', 'Cast'), entry: activity('entry', 'Enter / End Turn in Grease Save') } } };
  const token = { actor: { rollSavingThrow: () => {} } };
  assert.deepEqual(dnd5eAdapter.areaActions(spell, token, 'placement').map(a => a.id), ['save-cast-dex']);
  assert.deepEqual(dnd5eAdapter.areaActions(spell, token, 'entry').map(a => a.id), ['save-entry-dex']);
  assert.deepEqual(dnd5eAdapter.areaActions(spell, token, 'turn'), []);
});

test('generic single activities remain available; start-turn excludes end-turn-only saves', () => {
  const single = { system: { activities: { save: { name: 'Fireball' } } } };
  assert.equal(areaActivities(single, 'entry').length, 1);
  const spell = { system: { activities: { cast: { name: 'Cast' }, start: { name: 'Start of Turn Save' }, end: { name: 'End Turn Save' } } } };
  assert.deepEqual(areaActivities(spell, 'turn').map(a => a.name), ['Start of Turn Save']);
});
