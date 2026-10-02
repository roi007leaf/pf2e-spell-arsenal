import test from 'node:test';
import assert from 'node:assert/strict';
import { runSpellEffect } from '../scripts/runtime.js';
import { DEFAULT_RULES, runtimeSettings } from '../scripts/rules.js';

function environment(gm = true) {
  const hooks = new Map(); let next = 0, nextDoc = 0; const docs = []; const errors = [];
  globalThis.Hooks = { on(event, fn) { const id = ++next; hooks.set(id, { event, fn }); return id; }, off(event, id) { hooks.delete(id); } };
  const scene = {
    regions: [], getEmbeddedCollection: type => docs.filter(doc => doc.type === type),
    async createEmbeddedDocuments(type, data) { docs.push(...data.map(d => ({ ...d, id: `doc-${++nextDoc}`, type }))); },
    async deleteEmbeddedDocuments(type, ids) { for (let i = docs.length - 1; i >= 0; i--) if (ids.includes(docs[i].id)) docs.splice(i, 1); }
  };
  globalThis.game = { system: { id: 'pf2e' }, release: { generation: 14 }, user: { isGM: gm, id: 'gm' }, users: { activeGM: { id: 'gm' } }, modules: new Map([['tile-arsenal', { active: true }]]), scenes: [scene] };
  globalThis.ui = { notifications: { warn() {}, info() {}, error(message) { errors.push(message); } } };
  globalThis.foundry = { utils: { deepClone: structuredClone, expandObject: x => x } };
  globalThis.canvas = { ready: true, scene, level: { id: 'level', elevation: { base: 0 } }, grid: { isGridless: false, getOffset: () => ({ i: 0, j: 0 }), getCenterPoint: () => ({ x: 50, y: 50 }) } };
  globalThis.tileArsenal = { utils: { async getConfigurations() { return { configurations: { acid: { name: 'Acid', configs: { tile: { stage: 1, type: 'Tile' } }, toDocumentData: () => new Map([['Tile', [{ x: 0, y: 0, elevation: 0, flags: { 'tile-arsenal': { id: 'original' } } }]]]) } } }; } } };
  const token = { parent: scene, level: 'level', elevation: 10, getCenterPoint: () => ({ x: 80, y: 90 }) };
  const message = { id: 'damage-1', token, item: { name: 'Caustic Blast', isOfType: type => type === 'spell' }, flags: { pf2e: { context: { type: 'damage-taken' }, appliedDamage: { updates: [{ path: 'system.attributes.hp.value', value: 5 }] } } } };
  const emit = (event, ...args) => { for (const entry of [...hooks.values()]) if (entry.event === event) entry.fn(...args); };
  return { hooks, docs, errors, message, emit };
}

test('area lifecycle uses template cells, preserves edits and recovers Wizard areas', async () => {
  const env = environment();
  const scene = canvas.scene;
  scene.regions = new Map();
  scene.regions[Symbol.iterator] = scene.regions.values.bind(scene.regions);
  globalThis.CONST = { REGION_VISIBILITY: { LAYER: 1, ALWAYS: 2 } };
  game.settings = { get: () => [] };
  game.modules.set('pf2e-aztecs-template-wizard', { active: true });
  const region = { id: 'area', uuid: 'Scene.test.Region.area', parent: scene, levels: new Set(['level']),
    elevation: { bottom: 0 }, visibility: 2, flags: { pf2e: { origin: { name: 'Caustic Blast', type: 'spell' } },
      'pf2e-aztecs-template-wizard': { managed: { itemUuid: 'Item.test' } } },
    getCoverage: () => ({ covered: [{ i: 0, j: 0 }, { i: 0, j: 1 }] }) };
  scene.regions.set(region.id, region);
  const settings = { ...runtimeSettings(DEFAULT_RULES[0]), INSTANT: false, DURATION_SECONDS: 60 };
  const state = await runSpellEffect('area', settings, 'pf2e-spell-arsenal:area');
  try {
    assert.equal(env.docs.length, 2);
    assert.equal(state.timers.size, 0);
    env.emit('updateRegion', region, { shapes: [] });
    await state.queue;
    assert.equal(env.docs.length, 2);
    assert.ok(env.docs.every(doc => doc.flags.world.spellArsenalArea.stage === 1));
    scene.regions.delete(region.id);
    env.emit('deleteRegion', region);
    await state.queue;
    assert.equal(env.docs.length, 0);
    assert.deepEqual(env.errors, []);
  } finally { await state.stop(); }
});

test('applied damage creates owned effects once; undo removes them', async () => {
  const env = environment();
  const state = await runSpellEffect('damage', runtimeSettings(DEFAULT_RULES[0]), 'test-damage');
  try {
    env.emit('createChatMessage', env.message); env.emit('createChatMessage', env.message);
    await state.queue;
    assert.equal(env.docs.length, 1);
    assert.equal(env.docs[0].flags.world.spellArsenalDamage.owner, 'test-damage');
    assert.equal(env.docs[0].flags['tile-arsenal'], undefined);
    assert.equal(env.docs[0].x, 30);
    env.message.flags.pf2e.appliedDamage.isReverted = true;
    env.emit('updateChatMessage', env.message); await state.queue;
    assert.equal(env.docs.length, 0);
    assert.deepEqual(env.errors, []);
  } finally { await state.stop(); }
  assert.equal(env.hooks.size, 0);
});

test('description template casts wait for native placement instead of opening a second picker', async () => {
  const env = environment();
  const settings = { ...runtimeSettings(DEFAULT_RULES[0]), INSTANT: false, DURATION_SECONDS: 0 };
  const state = await runSpellEffect('area', settings, 'pf2e-spell-arsenal:description');
  try {
    const message = { ...env.message, item: { ...env.message.item, system: { description: { value: '@Template[burst|distance:5]' } } },
      flags: { pf2e: { context: { type: 'spell-cast' }, origin: { rollOptions: ['origin:action:slug:cast-a-spell'] } } } };
    env.emit('createChatMessage', message);
    await state.queue;
    assert.equal(state.pickerTask, undefined);
    assert.equal(env.docs.length, 0);
    assert.deepEqual(env.errors, []);
  } finally { await state.stop(); }
});

test('healing, reverted damage and non-GM clients cannot spawn visuals', async () => {
  const player = environment(false);
  assert.equal(await runSpellEffect('damage', runtimeSettings(DEFAULT_RULES[0]), 'test-player'), undefined);
  assert.equal(player.hooks.size, 0);
  const env = environment(); const state = await runSpellEffect('damage', runtimeSettings(DEFAULT_RULES[0]), 'test-filter');
  try {
    env.message.flags.pf2e.appliedDamage.isHealing = true;
    env.emit('createChatMessage', env.message); await state.queue;
    assert.equal(env.docs.length, 0);
    env.message.flags.pf2e.appliedDamage.isHealing = false;
    game.users.activeGM.id = 'another-gm';
    env.emit('createChatMessage', env.message); await state.queue;
    assert.equal(env.docs.length, 0);
  } finally { await state.stop(false); }
  assert.equal(env.hooks.size, 0);
});

test('queued repeat damage advances and replaces cell visuals; removal resets stage', async () => {
  const env = environment();
  tileArsenal.utils.getConfigurations = async () => ({ configurations: { acid: {
    name: 'Acid', configs: { first: { type: 'Tile', stage: 1 }, second: { type: 'Tile', stage: 2 } },
    toDocumentData: (offset, stage) => new Map([['Tile', [{ x: 0, y: 0, elevation: 0, testStage: stage }]]])
  } } });
  const state = await runSpellEffect('damage', runtimeSettings(DEFAULT_RULES[0]), 'pf2e-spell-arsenal:repeat');
  try {
    for (const id of ['one', 'two', 'three']) env.emit('createChatMessage', { ...env.message, id });
    await state.queue;
    assert.equal(env.docs.length, 1); assert.equal(env.docs[0].testStage, 2);
    assert.equal(env.docs[0].flags.world.spellArsenalDamage.messageId, 'three');
    env.emit('updateChatMessage', { ...env.message, id: 'one', flags: { pf2e: { appliedDamage: { isReverted: true } } } });
    await state.queue; assert.equal(env.docs.length, 1);
    env.emit('updateChatMessage', { ...env.message, id: 'three', flags: { pf2e: { appliedDamage: { isReverted: true } } } });
    await state.queue; assert.equal(env.docs.length, 0);
    env.emit('createChatMessage', { ...env.message, id: 'four' });
    await state.queue; assert.equal(env.docs[0].testStage, 1);
    assert.deepEqual(env.errors, []);
  } finally { await state.stop(); }
});
