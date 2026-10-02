import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseStage, spellStageRank, stageRecords, replaceOverlaps } from '../scripts/stages.js';

test('rank stages cap, handle sparse presets and never escalate repeated cantrips', () => {
  assert.equal(chooseStage([], 'spell', [1, 2, 3], 'auto', 1, 2), 2);
  assert.equal(chooseStage([], 'spell', [1, 2], 'auto', 1, 10), 2);
  assert.equal(chooseStage([], 'spell', [1, 3], 'auto', 1, 2), 1);
  assert.equal(chooseStage([{ data: { source: 'old', stage: 3 } }], 'new', [1, 2, 3], 'auto', 1, 1), 1);
  assert.equal(spellStageRank({ rank: 8, isCantrip: true }), 1);
  assert.equal(spellStageRank({ rank: 3 }, { castRank: 6 }), 6);
  assert.equal(spellStageRank(null, { rollOptions: ['origin:item:rank:5'] }), 5);
  assert.equal(spellStageRank(null, { rollOptions: ['origin:item:rank:5', 'origin:item:trait:cantrip'] }), 1);
  assert.equal(spellStageRank({ system: { location: { heightenedLevel: 7 }, level: { value: 2 } } }), 7);
});
const record = (stage, source = 'first') => ({ data: { stage, source } });
test('first cast, recast, cap, sparse presets and fixed override', () => {
  assert.equal(chooseStage([], 'first', [1, 2], 'buildup', 1), 1);
  assert.equal(chooseStage([record(1)], 'second', [1, 2], 'buildup', 1), 2);
  assert.equal(chooseStage([record(2)], 'third', [1, 2], 'buildup', 1), 2);
  assert.equal(chooseStage([record(1)], 'second', [1, 3], 'buildup', 1), 3);
  assert.equal(chooseStage([record(1)], 'first', [1, 2], 'buildup', 1), 1);
  assert.equal(chooseStage([record(2)], 'third', [1, 2], 'fixed', 1), 1);
});
test('buildup isolated by effect, cell, scene and level; expiry resets', () => {
  const doc = { flags: { world: { spellArsenalArea: { owner: 'pf2e-spell-arsenal:test', effect: 'acid', offset: '0:1', levelId: 'ground', stage: 2, expiresAt: 100 } } } };
  const scene = { getEmbeddedCollection: type => type === 'Tile' ? [doc] : [] };
  assert.equal(stageRecords(scene, 'acid', 'ground', '0:1', 99).length, 1);
  for (const args of [['fire', 'ground', '0:1', 99], ['acid', 'roof', '0:1', 99], ['acid', 'ground', '0:2', 99], ['acid', 'ground', '0:1', 100]]) assert.equal(stageRecords(scene, ...args).length, 0);
  assert.equal(stageRecords({ getEmbeddedCollection: () => [] }, 'acid', 'ground', '0:1', 99).length, 0);
});
test('replacement marks older region cell; never deletes new source or unrelated documents', async () => {
  const updates = [], deleted = [];
  const region = { flags: {}, update: async data => updates.push(data) };
  const scene = { regions: new Map([['r1', region]]), getEmbeddedCollection: type => type === 'Tile' ? [{ id: 'old' }, { id: 'new' }] : [], deleteEmbeddedDocuments: async (type, ids) => deleted.push([type, ids]) };
  await replaceOverlaps(scene, [{ type: 'Tile', doc: { id: 'old' }, data: { source: 'r1', regionId: 'r1', levelId: 'ground', offset: '0:1' } }, { type: 'Tile', doc: { id: 'new' }, data: { source: 'r2' } }], 'r2');
  assert.deepEqual(deleted, [['Tile', ['old']]]);
  assert.deepEqual(updates, [{ 'flags.world.spellArsenalSuperseded': { 'ground:0:1': true } }]);
});
