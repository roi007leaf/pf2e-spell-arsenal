import test from 'node:test';
import assert from 'node:assert/strict';
import { requestCasterRoll, requestAreaSave } from '../scripts/area-automation.js';

test('caster rolls go to active assigned owner rather than GM or affected token owner', async () => {
  const queries = [];
  const affectedOwner = { id: 'victim', active: true, query: async () => { throw Error('wrong roll owner'); } };
  const casterOwner = { id: 'caster-user', active: true, character: { id: 'caster' }, query: async (name, data) => { queries.push({ name, data }); return true; } };
  const spell = { type: 'spell', actor: { id: 'caster', testUserPermission: user => user.id === casterOwner.id } };
  globalThis.game = { users: { contents: [affectedOwner, casterOwner] } };
  assert.equal(await requestCasterRoll(spell, { uuid: 'Region.r' }, { uuid: 'Token.victim' }, 'placement', () => true, true), true);
  assert.equal(queries[0].name, 'spell-arsenal.area-cast');
  assert.equal(queries[0].data.placement, true);
});

test('entry saves and damage are routed to different actor owners', async () => {
  const queries = [];
  const victimOwner = { id: 'victim', active: true, query: async name => { queries.push(['victim', name]); return 'save'; } };
  const casterOwner = { id: 'caster', active: true, query: async name => { queries.push(['caster', name]); return 'damage'; } };
  globalThis.game = { users: { contents: [victimOwner, casterOwner] }, modules: new Map() };
  const spell = { type: 'spell', name: 'Fireball', actor: { id: 'caster', testUserPermission: user => user.id === 'caster' }, system: { defense: { save: { statistic: 'reflex' } } }, statistic: { dc: { value: 21 } }, damageKinds: new Set(['damage']), rollDamage: () => { throw Error('GM must not roll'); } };
  const token = { actor: { id: 'victim', testUserPermission: user => user.id === 'victim', saves: { reflex: { roll: () => { throw Error('GM must not roll'); } } } } };
  await requestAreaSave(spell, {}, token, 'entry', () => true);
  assert.deepEqual(queries, [['victim', 'spell-arsenal.area-save'], ['caster', 'spell-arsenal.area-cast']]);
});

test('unowned caster uses GM native roll; unavailable owner request never causes duplicate fallback', async () => {
  let rolls = 0, warnings = 0;
  const spell = { type: 'spell', actor: { testUserPermission: () => false }, damageKinds: new Set(['damage']), rollDamage: async () => { rolls++; return {}; } };
  globalThis.game = { users: { contents: [] } };
  await requestCasterRoll(spell, {}, null, 'placement', () => true, true);
  assert.equal(rolls, 1);
  game.users.contents = [{ active: true, name: 'Player', query: async () => { throw Error('timeout'); } }];
  spell.actor.testUserPermission = () => true;
  globalThis.ui = { notifications: { warn: () => warnings++ } };
  assert.equal(await requestCasterRoll(spell, {}, null, 'placement', () => true, true), false);
  assert.equal(rolls, 1); assert.equal(warnings, 1);
});
