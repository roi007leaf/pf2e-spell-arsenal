import test from 'node:test';
import assert from 'node:assert/strict';
import { createTileArsenalNode, dispatchTileVisual, tileAnimationEntries, registerTriggerIntegration } from '../scripts/trigger-integration.js';

const rule = { id: 'grease', spell: 'Grease', kind: 'area' };
function environment(enabled = true) {
  globalThis.game = { user: { id: 'gm', isGM: true }, users: { activeGM: { id: 'gm' } }, modules: new Map(['trigger-animations', 'trigger-engine'].map(id => [id, { active: true }])), settings: { get: () => enabled } };
  const Base = class { async getInputValue(key) { return this.inputs[key]; } executeNext() { return true; } };
  const Node = createTileArsenalNode(Base);
  globalThis.triggerAnimations = { api: { matchTrigger: () => ({ id: 'module:spell-arsenal-grease' }), async runFromTrigger(payload) {
    const node = new Node(); node.inputs = { mapping: 'grease', options: payload.options };
    await node._execute(); await node._execute();
  } } };
}

test('custom node renders a dispatch once and standalone mode bypasses Trigger Animations', async () => {
  environment(); let renders = 0;
  await dispatchTileVisual(rule, () => { renders++; });
  assert.equal(renders, 1);
  environment(false);
  triggerAnimations.api.runFromTrigger = () => { throw new Error('unexpected bridge'); };
  await dispatchTileVisual(rule, () => { renders++; });
  assert.equal(renders, 2);
});

test('disabled or higher priority foreign entries prevent duplicate standalone rendering', async () => {
  environment(); let renders = 0, dispatches = 0;
  triggerAnimations.api.runFromTrigger = () => { dispatches++; };
  for (const match of [undefined, { id: 'module:other-grease' }]) {
    triggerAnimations.api.matchTrigger = () => match;
    await dispatchTileVisual(rule, () => { renders++; });
  }
  assert.equal(renders, 0); assert.equal(dispatches, 0);
});

test('generated entries wire options and mapping into custom node with standard event names', () => {
  const entries = tileAnimationEntries([rule, { id: 'acid', spell: 'Caustic Blast', kind: 'damage' }, { id: 'cast', spell: 'Light', kind: 'caster' }]);
  assert.deepEqual(entries.map(e => e.nodes[0].inputs.name.value), ['template:grease', 'damage:caustic-blast', 'light']);
  assert.equal(entries[0].nodes[1].inputs.options.connection, 'start:outputs:options');
  assert.equal(entries[0].nodes[1].inputs.mapping.value, 'grease');
});

test('extension hooks register node and spell entries in Trigger Animations application', () => {
  environment(); const callbacks = {};
  globalThis.Hooks = { on: (name, fn) => { callbacks[name] = fn; } };
  globalThis.triggerEngine = { TriggerNode: class {} };
  game.settings.get = () => [rule];
  registerTriggerIntegration(); const calls = [];
  callbacks['triggerEngine.registerNodes']((...args) => calls.push(args));
  callbacks['triggerEngine.registerTriggers']((...args) => calls.push(args));
  assert.ok(calls.every(args => args[0] === 'trigger-animations' && args[1] === 'anim-trigger'));
  assert.equal(calls[0][2][0].type, 'spell-arsenal-tile');
  assert.equal(calls[1][2][0].id, 'spell-arsenal-grease');
});
