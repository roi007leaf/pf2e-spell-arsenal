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
  const state = await runSpellEffect('area', settings, 'spell-arsenal:area');
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

test('preset regions never copy gameplay behaviors', async () => {
  const env = environment();
  const preset = { name: 'Acid', configs: { region: { stage: 1, type: 'Region' } },
    toDocumentData: () => new Map([['Region', [{ shapes: [], behaviors: [{ type: 'executeScript', system: { source: 'throw Error()' } }] }]]]) };
  tileArsenal.utils.getConfigurations = async () => ({ configurations: { acid: preset } });
  const region = { id: 'visual-source', uuid: 'Scene.test.Region.visual-source', elevation: { bottom: 0 }, parent: canvas.scene, levels: new Set(['level']), flags: { pf2e: { origin: { name: 'Caustic Blast', type: 'spell' } } }, getCoverage: () => ({ covered: [{ i: 0, j: 0 }] }) };
  canvas.scene.regions = new Map();
  canvas.scene.regions[Symbol.iterator] = canvas.scene.regions.values.bind(canvas.scene.regions);
  const state = await runSpellEffect('area', runtimeSettings(DEFAULT_RULES[0]), 'visual-only');
  try {
    canvas.scene.regions.set(region.id, region);
    env.emit('createRegion', region);
    await state.queue;
    assert.equal(env.docs.length, 1);
    assert.deepEqual(env.docs[0].behaviors, []);
    assert.equal(env.docs[0].flags.world.spellArsenalArea.regionId, region.id);
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
  const state = await runSpellEffect('area', settings, 'spell-arsenal:description');
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

test('startup failure unregisters listeners and rejects activation', async () => {
  const env = environment();
  canvas.scene.getEmbeddedCollection = () => { throw new Error('Collection unavailable'); };
  await assert.rejects(runSpellEffect('damage', runtimeSettings(DEFAULT_RULES[0]), 'broken'), /Collection unavailable/);
  assert.equal(env.hooks.size, 0);
});

test('timed area edits retain original deadline even when coverage temporarily empties', async () => {
  const env = environment();
  const scene = canvas.scene;
  scene.regions = new Map();
  scene.regions[Symbol.iterator] = scene.regions.values.bind(scene.regions);
  let cells = [{ i: 0, j: 0 }];
  const region = { id: 'timed', uuid: 'Scene.test.Region.timed', parent: scene, levels: new Set(['level']),
    elevation: { bottom: 0 }, flags: { pf2e: { origin: { type: 'spell', name: 'Caustic Blast' } } },
    getCoverage: () => ({ covered: cells }) };
  const state = await runSpellEffect('area', { ...runtimeSettings(DEFAULT_RULES[0]), INSTANT: false, DURATION_SECONDS: 60 }, 'timed');
  try {
    scene.regions.set(region.id, region);
    env.emit('createRegion', region); await state.queue;
    const deadline = env.docs[0].flags.world.spellArsenalArea.expiresAt;
    cells = []; env.emit('updateRegion', region, { shapes: [] }); await state.queue;
    assert.equal(env.docs.length, 0);
    env.emit('canvasReady'); await state.queue;
    assert.equal(state.finished.has(region.uuid), false);
    cells = [{ i: 0, j: 0 }]; env.emit('updateRegion', region, { shapes: [] }); await state.queue;
    assert.equal(env.docs[0].flags.world.spellArsenalArea.expiresAt, deadline);
    assert.deepEqual(env.errors, []);
  } finally { await state.stop(); }
});

test('authority loss during creation stops subsequent document writes', async () => {
  const env = environment();
  tileArsenal.utils.getConfigurations = async () => ({ configurations: { acid: {
    name: 'Acid', configs: { tile: { type: 'Tile', stage: 1 }, light: { type: 'AmbientLight', stage: 1 } },
    toDocumentData: () => new Map([['Tile', [{ x: 0, y: 0, elevation: 0 }]], ['AmbientLight', [{ x: 0, y: 0, elevation: 0 }]]])
  } } });
  const original = canvas.scene.createEmbeddedDocuments;
  canvas.scene.createEmbeddedDocuments = async (...args) => { await original(...args); game.users.activeGM.id = 'new-gm'; };
  const state = await runSpellEffect('damage', runtimeSettings(DEFAULT_RULES[0]), 'handoff');
  try {
    env.emit('createChatMessage', env.message); await state.queue;
    assert.deepEqual(env.docs.map(doc => doc.type), ['Tile']);
    assert.equal(state.timers.size, 0);
  } finally { await state.stop(false); }
});

test('refresh schedules cleanup for timed areas in unviewed scenes', async () => {
  const env = environment();
  const scene = { ...canvas.scene, regions: new Map() };
  scene.regions[Symbol.iterator] = scene.regions.values.bind(scene.regions);
  const region = { id: 'away', uuid: 'Scene.away.Region.away', parent: scene,
    flags: { pf2e: { origin: { type: 'spell', name: 'Caustic Blast' } } } };
  scene.regions.set(region.id, region);
  game.scenes = [scene];
  const deadline = Date.now() + 60000;
  env.docs.push({ id: 'away-tile', type: 'Tile', flags: { world: { spellArsenalArea: { owner: 'away', source: 'away', regionId: 'away', expiresAt: deadline } } } });
  const state = await runSpellEffect('area', { ...runtimeSettings(DEFAULT_RULES[0]), INSTANT: false, DURATION_SECONDS: 60 }, 'away');
  try { assert.equal(state.deadlines.get('away'), deadline); assert.equal(state.timers.size, 1); }
  finally { await state.stop(); }
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

test('5e native regions and applied damage share visual lifecycle and cast-level stages', async () => {
  const env = environment(); game.system.id = 'dnd5e';
  const spell = { type: 'spell', name: 'Fireball', uuid: 'Actor.caster.Item.fireball', system: { level: 3 } };
  globalThis.fromUuidSync = uuid => uuid === spell.uuid ? spell : null;
  tileArsenal.utils.getConfigurations = async () => ({ configurations: { fire: {
    name: 'Fire', configs: { first: { type: 'Tile', stage: 1 }, second: { type: 'Tile', stage: 2 } },
    toDocumentData: (offset, stage) => new Map([['Tile', [{ x: 0, y: 0, testStage: stage }]]])
  } } });
  const region = { id: 'fireball-area', uuid: 'Scene.test.Region.fireball-area', parent: canvas.scene, elevation: { bottom: 0 }, levels: new Set(['level']),
    flags: { dnd5e: { item: spell.uuid, origin: 'Scene.test.Token.caster', spellLevel: 6 } }, getCoverage: () => ({ covered: [{ i: 0, j: 0 }, { i: 0, j: 1 }] }) };
  canvas.scene.regions = new Map(); canvas.scene.regions[Symbol.iterator] = canvas.scene.regions.values.bind(canvas.scene.regions);
  const settings = { ...runtimeSettings(DEFAULT_RULES[0]), SPELL_NAME: 'Fireball', EFFECT_NAME: 'Fire' };
  const area = await runSpellEffect('area', settings, 'spell-arsenal:dnd-area');
  try {
    canvas.scene.regions.set(region.id, region); env.emit('createRegion', region); await area.queue;
    assert.equal(env.docs.length, 2); assert.ok(env.docs.every(d => d.testStage === 2));
    canvas.scene.regions.delete(region.id); env.emit('deleteRegion', region); await area.queue;
    assert.equal(env.docs.length, 0);
  } finally { await area.stop(); }
  const damage = await runSpellEffect('damage', settings, 'spell-arsenal:dnd-damage');
  const token = { id: 'target-token', parent: canvas.scene, level: 'level', elevation: 0, getCenterPoint: () => ({ x: 50, y: 50 }) };
  try {
    const actor = { id: 'target', isToken: true, token };
    env.emit('updateActor', actor, {}, {}); await damage.queue; assert.equal(env.docs.length, 0);
    env.emit('updateActor', actor, {}, { spellArsenalDamageEvent: { id: 'damage', actorId: actor.id, name: 'Fireball', spellLevel: 5 } });
    await damage.queue; assert.equal(env.docs.length, 1); assert.equal(env.docs[0].testStage, 2);
    assert.deepEqual(env.errors, []);
  } finally { await damage.stop(); }
});

test('damage visuals use cast rank and repeated cantrips retain first stage', async () => {
  const env = environment();
  tileArsenal.utils.getConfigurations = async () => ({ configurations: { acid: {
    name: 'Acid', configs: { first: { type: 'Tile', stage: 1 }, second: { type: 'Tile', stage: 2 } },
    toDocumentData: (offset, stage) => new Map([['Tile', [{ x: 0, y: 0, testStage: stage }]]])
  } } });
  const state = await runSpellEffect('damage', runtimeSettings(DEFAULT_RULES[0]), 'spell-arsenal:rank');
  try {
    env.emit('createChatMessage', { ...env.message, item: { ...env.message.item, rank: 5 } });
    await state.queue; assert.equal(env.docs[0].testStage, 2);
    for (const id of ['cantrip-one', 'cantrip-two']) {
      env.emit('createChatMessage', { ...env.message, id, item: { ...env.message.item, rank: 8, isCantrip: true } });
      await state.queue; assert.equal(env.docs.length, 1); assert.equal(env.docs[0].testStage, 1);
    }
  } finally { await state.stop(); }
});

test('queued repeat damage advances and replaces cell visuals; removal resets stage', async () => {
  const env = environment();
  tileArsenal.utils.getConfigurations = async () => ({ configurations: { acid: {
    name: 'Acid', configs: { first: { type: 'Tile', stage: 1 }, second: { type: 'Tile', stage: 2 } },
    toDocumentData: (offset, stage) => new Map([['Tile', [{ x: 0, y: 0, elevation: 0, testStage: stage }]]])
  } } });
  const state = await runSpellEffect('damage', { ...runtimeSettings(DEFAULT_RULES[0]), STAGE_MODE: 'buildup' }, 'spell-arsenal:repeat');
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
