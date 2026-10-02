import test from 'node:test';
import assert from 'node:assert/strict';
import { replacesAnimation, suppressMappedAnimations } from '../scripts/animation-integration.js';
test('only mapped region AutoAnimations visuals are suppressed, including deleted merge cells', async () => {
  globalThis.game = { system: { id: 'pf2e' }, user: { isGM: true, id: 'gm' }, users: { activeGM: { id: 'gm' } }, modules: new Map(), settings: { get: (id, key) => key === 'enabled' ? true : [{ enabled: true, kind: 'area', spell: 'Grease', effect: 'Grease' }] } };
  globalThis.fromUuidSync = () => null;
  const grease = { data: { name: 'grease', file: 'autoanimations.templatefx.square.grease.01.brown.0', source: 'Scene.scene.Region.deleted' } };
  const darkness = { data: { name: 'darkness', file: 'autoanimations.templatefx.circle.darkness', source: {} } };
  assert.equal(replacesAnimation(grease), true);
  assert.equal(replacesAnimation(darkness), false);
  assert.equal(replacesAnimation({ data: { ...grease.data, source: 'Actor.actor' } }), false);
  assert.equal(replacesAnimation({ data: { ...grease.data, file: 'custom.grease' } }), false);
  let ended;
  globalThis.Sequencer = { EffectManager: { getEffects: () => [grease, darkness], endEffects: async filter => { ended = filter.effects; } } };
  await suppressMappedAnimations(); assert.deepEqual(ended, [grease]);
});
