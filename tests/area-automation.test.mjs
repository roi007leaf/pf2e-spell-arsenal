import test from 'node:test';
import assert from 'node:assert/strict';
import { promptArea, areaAutomation, registerAreaAutomation } from '../scripts/area-automation.js';

test('both systems show one area dialog per combat turn without reposting spell data', async () => {
  for (const system of ['pf2e', 'dnd5e']) {
    const cards = [];
    const dialogs = [];
    globalThis.foundry = { applications: { api: { DialogV2: { wait: async data => { dialogs.push(data); return 'skip'; } } } } };
    const spell = { type: 'spell', name: 'Grease', system: system === 'dnd5e' ? { level: 1 } : {}, async toMessage() { return { content: 'Native save and damage controls', flags: {} }; } };
    globalThis.fromUuidSync = () => spell;
    globalThis.game = { system: { id: system }, user: { id: 'gm', isGM: true }, users: { activeGM: { id: 'gm' } }, modules: new Map(), combat: { id: system, started: true, round: 1, turn: 0 }, settings: { get: (id, key) => key === 'enabled' ? true : [{ enabled: true, kind: 'area', spell: 'Grease', areaMode: 'manual', areaAutomation: 'placement-entry' }] } };
    globalThis.ChatMessage = { create: async data => cards.push(data) };
    const region = { uuid: `Scene.${system}.Region.area`, flags: system === 'dnd5e' ? { dnd5e: { item: 'Item.spell' } } : {}, message: { item: spell }, levels: new Set(['ground']), testPoint: () => true };
    const token = { uuid: `Scene.${system}.Token.token`, name: '<Target>', actor: {}, level: 'ground', elevation: 0, getCenterPoint: () => ({ x: 50, y: 50 }) };
    await promptArea(region, token, 'placement');
    await promptArea(region, token, 'entry');
    assert.equal(cards.length, 0, 'area automation must not duplicate the original spell card');
    assert.equal(dialogs.length, 1);
    assert.ok(!dialogs[0].content.includes('<Target>'));
    game.user.isGM = false;
    game.combat.turn++;
    await promptArea(region, token, 'entry');
    assert.equal(cards.length, 0);
    assert.equal(dialogs.length, 1);
    game.user.isGM = true;
    if (system === 'pf2e') {
      game.modules.set('pf2e-aztecs-template-wizard', { active: true, api: { readAutomation: () => ({ enabled: true, contiguous: { enabled: true }, behaviors: [{ type: 'savingThrow' }] }) } });
      assert.equal(areaAutomation(region), null);
    }
  }
});

test('expired lasting regions cannot prompt and owner query rejects missing or unowned sources', async () => {
  const spell = { type: 'spell', name: 'Grease', system: {} };
  globalThis.game = { system: { id: 'pf2e' }, modules: new Map(), settings: { get: (_id, key) => key === 'enabled' ? true : [{ enabled: true, kind: 'area', spell: 'Grease', areaMode: 'manual', areaAutomation: 'placement-entry', instant: false, duration: 60 }] } };
  const region = { message: { item: spell }, _stats: { createdTime: Date.now() - 61000 } };
  assert.equal(areaAutomation(region), null);
  region._stats.createdTime = Date.now();
  assert.equal(areaAutomation(region).spell, spell);
  globalThis.CONFIG = { queries: {} };
  globalThis.Hooks = { on: () => {} };
  registerAreaAutomation();
  globalThis.fromUuid = async () => null;
  assert.equal(await CONFIG.queries['spell-arsenal.area-save']({ regionUuid: 'gone', tokenUuid: 'gone', event: 'placement' }), 'cancelled');
  const scene = {};
  region.parent = scene;
  globalThis.fromUuid = async uuid => uuid === 'region' ? region : { parent: scene, actor: { isOwner: false } };
  assert.equal(await CONFIG.queries['spell-arsenal.area-save']({ regionUuid: 'region', tokenUuid: 'token', event: 'entry' }), 'cancelled');
});
