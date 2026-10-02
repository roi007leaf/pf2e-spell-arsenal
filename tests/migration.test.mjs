import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyModule } from '../scripts/migration.js';

function environment(entries = []) {
  const storage = new Map(entries), writes = [], updates = [];
  const docs = [{ id: 'tile', flags: { world: { spellArsenalArea: { owner: 'pf2e-spell-arsenal:grease', stage: 2, expiresAt: 123 }, other: true } } },
    { id: 'unrelated', flags: { world: { spellArsenalArea: { owner: 'other:grease' } } } }];
  globalThis.game = { user: { isGM: true, id: 'gm' }, users: { activeGM: { id: 'gm' } }, settings: {
    storage: new Map([['world', storage]]),
    get: (id, key) => storage.get(`${id}.${key}`)?.value ?? false,
    async set(id, key, value) { writes.push([key, value]); storage.set(`${id}.${key}`, { value }); }
  }, scenes: [{ getEmbeddedCollection: type => type === 'Tile' ? docs : [], async updateEmbeddedDocuments(type, data) { updates.push([type, data]); } }] };
  return { storage, writes, updates, docs };
}

test('rename migrates serialized rules, disabled automation and effect ownership', async () => {
  const rules = [{ id: 'grease', spell: 'Grease', duration: 60 }];
  const env = environment([['pf2e-spell-arsenal.rules', { value: JSON.stringify(rules) }], ['pf2e-spell-arsenal.enabled', { value: 'false' }]]);
  await migrateLegacyModule();
  assert.deepEqual(env.storage.get('spell-arsenal.rules').value, rules);
  assert.equal(env.storage.get('spell-arsenal.enabled').value, false);
  assert.deepEqual(env.updates, [['Tile', [{ _id: 'tile', 'flags.world.spellArsenalArea.owner': 'spell-arsenal:grease' }]]]);
  assert.equal(env.docs[0].flags.world.spellArsenalArea.stage, 2);
  assert.equal(env.docs[0].flags.world.spellArsenalArea.expiresAt, 123);
  assert.ok(env.storage.has('pf2e-spell-arsenal.rules'));
  const count = env.writes.length; await migrateLegacyModule(); assert.equal(env.writes.length, count);
});

test('new settings take precedence and migration waits for active GM', async () => {
  const env = environment([['spell-arsenal.rules', { value: [] }], ['pf2e-spell-arsenal.rules', { value: '[{"id":"old"}]' }]]);
  game.user.isGM = false; await migrateLegacyModule(); assert.equal(env.writes.length, 0);
  game.user.isGM = true; game.users.activeGM.id = 'other'; await migrateLegacyModule(); assert.equal(env.writes.length, 0);
  game.users.activeGM.id = 'gm'; await migrateLegacyModule();
  assert.deepEqual(env.storage.get('spell-arsenal.rules').value, []);
});

test('failed document migration stays retryable', async () => {
  const env = environment();
  game.scenes[0].updateEmbeddedDocuments = async () => { throw new Error('write failed'); };
  await assert.rejects(migrateLegacyModule(), /write failed/);
  assert.equal(env.storage.has('spell-arsenal.legacyMigrated'), false);
});
