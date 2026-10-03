import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupInstantDamage } from '../scripts/area-automation.js';

test('manual Breathe Fire damage removes its instant cone without requiring prompt automation', async () => {
  const spell = { type: 'spell', name: 'Breathe Fire', uuid: 'Actor.caster.Item.spell', system: {} };
  let deleted = 0;
  const region = { uuid: 'Region.breath', flags: {}, message: { item: spell }, delete: async () => { deleted++; } };
  const scene = { regions: [region] };
  const rule = { enabled: true, kind: 'area', spell: 'Breathe Fire', instant: true, areaAutomation: 'off' };
  globalThis.game = { system: { id: 'pf2e' }, modules: new Map(), user: { id: 'gm', isGM: true }, users: { activeGM: { id: 'gm' } }, scenes: new Map([['scene', scene]]), settings: { get: (_id, key) => key === 'enabled' ? true : [rule] } };
  const message = { item: spell, rolls: [{}], speaker: { scene: 'scene' }, flags: { pf2e: { context: { type: 'damage-roll' } } } };
  await cleanupInstantDamage(message);
  assert.equal(deleted, 1);
  rule.instant = false;
  await cleanupInstantDamage(message);
  assert.equal(deleted, 1);
  rule.instant = true;
  scene.regions.push({ ...region, uuid: 'Region.other-cast' });
  await cleanupInstantDamage(message);
  assert.equal(deleted, 1);
  message.flags.pf2e.context.type = 'saving-throw';
  await cleanupInstantDamage(message);
  assert.equal(deleted, 1);
});
