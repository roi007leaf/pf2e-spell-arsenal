import test from 'node:test';
import assert from 'node:assert/strict';
import { showAreaPrompt, requestAreaSave } from '../scripts/area-automation.js';

test('PF2e dialog rolls affected token save with caster DC through native API', async () => {
  const rolls = [];
  const spell = { name: 'Fireball', type: 'spell', system: { level: { value: 4 }, defense: { save: { statistic: 'reflex' } } }, statistic: { dc: { value: 26 } }, damageKinds: new Set(['damage']), rollDamage: async () => rolls.push('damage') };
  const token = { name: 'Target', actor: { saves: { reflex: { roll: async options => rolls.push(options) } } } };
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async data => {
    assert.match(data.window.title, /Fireball.*Target/);
    assert.match(data.content, /is covered by/);
    assert.ok(data.classes.includes('spell-arsenal-area-prompt'));
    assert.equal(data.position.width, 440);
    await data.buttons.find(b => b.action === 'save').callback();
    await data.buttons.find(b => b.action === 'damage').callback();
  } } } } };
  await showAreaPrompt(spell, token, 'placement');
  assert.equal(rolls[0].dc.value, 26); assert.equal(rolls[0].item, spell); assert.equal(rolls[1], 'damage');
});

test('owner saves route once to player; GM only receives damage controls', async () => {
  const requests = [];
  const player = { id: 'player', active: true, name: 'Player', query: async (...args) => { requests.push(args); return 'save'; } };
  globalThis.game = { users: { contents: [player] } };
  const spell = { type: 'spell', name: 'Fireball', system: { defense: { save: { statistic: 'reflex' } } }, statistic: { dc: { value: 24 } }, damageKinds: new Set(['damage']), rollDamage: async () => ({}) };
  const token = { uuid: 'Token.t', name: 'Target', actor: { testUserPermission: () => true, saves: { reflex: { roll: async () => { throw Error('GM must not reroll owner save'); } } } } };
  foundry.applications.api.DialogV2.wait = async data => {
    assert.deepEqual(data.buttons.map(b => b.action), ['damage', 'skip']);
    return 'skip';
  };
  await requestAreaSave(spell, { uuid: 'Region.r' }, token, 'entry', () => true);
  assert.equal(requests.length, 1); assert.equal(requests[0][0], 'spell-arsenal.area-save');
  assert.equal(requests[0][1].tokenUuid, token.uuid);
});

test('invalid queued prompt cannot roll; cancelled save does not roll damage', async () => {
  let rolls = 0;
  const spell = { type: 'spell', name: 'Fireball', system: { defense: { save: { statistic: 'reflex' } } }, statistic: { dc: { value: 24 } }, damageKinds: new Set(['damage']), rollDamage: async () => { rolls++; } };
  const token = { name: 'Target', actor: { saves: { reflex: { roll: async () => null } } } };
  assert.equal(await showAreaPrompt(spell, token, 'entry', { valid: () => false }), 'cancelled');
  foundry.applications.api.DialogV2.wait = async data => data.buttons.find(b => b.action === 'both').callback();
  assert.equal(await showAreaPrompt(spell, token, 'entry'), 'cancelled');
  assert.equal(rolls, 0);
});

test('unowned token stays with GM and guards buttons after source disappears', async () => {
  globalThis.game = { users: { contents: [] } };
  let valid = true, rolls = 0;
  const spell = { type: 'spell', name: 'Fireball', system: {}, damageKinds: new Set(['damage']), rollDamage: async () => { rolls++; } };
  const token = { name: 'Target', actor: {} };
  foundry.applications.api.DialogV2.wait = async data => { valid = false; return data.buttons.find(b => b.action === 'damage').callback(); };
  assert.equal(await requestAreaSave(spell, {}, token, 'placement', () => valid), 'cancelled');
  assert.equal(rolls, 0);
});

test('PF2e Toolbelt suppresses follow-up save prompts and owner requests; D&D keeps its saves', async () => {
  let queries = 0, dialogs = 0;
  const owner = { active: true, query: async () => { queries++; } };
  globalThis.game = { modules: new Map([['pf2e-toolbelt', { active: true }]]), users: { contents: [owner] } };
  const token = { name: 'Target', actor: { testUserPermission: () => true, saves: { reflex: { roll: async () => ({}) } }, rollSavingThrow: async () => ({}) } };
  const pf = { type: 'spell', name: 'Fireball', system: { defense: { save: { statistic: 'reflex' } } }, statistic: { dc: { value: 21 } } };
  foundry.applications.api.DialogV2.wait = async () => { dialogs++; return 'skip'; };
  assert.equal(await requestAreaSave(pf, {}, token, 'placement', () => true, true), 'skip');
  assert.equal(queries, 0); assert.equal(dialogs, 0);
  game.modules.get('pf2e-toolbelt').active = false;
  await requestAreaSave(pf, {}, token, 'placement', () => true, true);
  assert.equal(queries, 1);
  game.modules.get('pf2e-toolbelt').active = true;
  const dnd = { type: 'spell', name: 'Fireball', system: { level: 3, activities: { save: { id: 'save', type: 'save', save: { ability: new Set(['dex']), dc: { value: 15 } } } } } };
  await requestAreaSave(dnd, {}, token, 'placement', () => true, true);
  assert.equal(queries, 2);
});

test('D&D dialog uses prepared activity DC, save ability and activity damage roll', async () => {
  const rolls = [];
  const spell = { type: 'spell', name: 'Fireball', system: { level: 5, activities: { save: { id: 'a', name: 'Fireball', type: 'save', save: { ability: new Set(['dex']), dc: { value: 18 } }, damage: { parts: [{}] }, rollDamage: async () => rolls.push('upcast damage') } } } };
  const token = { name: 'Target', actor: { rollSavingThrow: async options => rolls.push(options) } };
  foundry.applications.api.DialogV2.wait = async data => {
    await data.buttons.find(b => b.action === 'save-a-dex').callback();
    await data.buttons.find(b => b.action === 'damage-a').callback();
  };
  await showAreaPrompt(spell, token, 'entry');
  assert.equal(rolls[0].ability, 'dex'); assert.equal(rolls[0].dc, 18); assert.equal(rolls[1], 'upcast damage');
});
