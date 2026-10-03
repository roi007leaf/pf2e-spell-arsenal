import test from 'node:test';
import assert from 'node:assert/strict';
import { pf2eAdapter } from '../scripts/pf2e.js';
import { dnd5eAdapter } from '../scripts/dnd5e.js';
import { showAreaPrompt } from '../scripts/area-automation.js';

test('PF2e hidden NPC DC stays out of player prompt while actual DC reaches native save', async () => {
  globalThis.game = { user: { isGM: false }, pf2e: { settings: { metagame: { dcs: false } } } };
  let roll;
  const spell = { type: 'spell', name: 'Fireball', actor: { isOwner: false, hasPlayerOwner: false }, system: { defense: { save: { statistic: 'reflex' } } }, statistic: { dc: { value: 26 } } };
  const token = { name: 'Hero', actor: { saves: { reflex: { roll: async data => { roll = data; return {}; } } } } };
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async data => {
    assert.ok(!data.buttons.some(button => /DC|26/.test(button.label)));
    return data.buttons[0].callback();
  } } } } };
  await showAreaPrompt(spell, token, 'entry', { savesOnly: true });
  assert.equal(roll.dc.value, 26); assert.equal(roll.dc.visible, false);
  game.pf2e.settings.metagame.dcs = true; assert.equal(pf2eAdapter.areaShowDC(spell), true);
  game.pf2e.settings.metagame.dcs = false; game.user.isGM = true; assert.equal(pf2eAdapter.areaShowDC(spell), true);
});

test('D&D player prompts follow challenge visibility setting', () => {
  let visibility = 'none';
  globalThis.game = { user: { isGM: false }, settings: { get: (system, key) => { assert.equal(system, 'dnd5e'); assert.equal(key, 'challengeVisibility'); return visibility; } } };
  const npc = { actor: { hasPlayerOwner: false } }, pc = { actor: { hasPlayerOwner: true } };
  assert.equal(dnd5eAdapter.areaShowDC(npc), false);
  visibility = 'player'; assert.equal(dnd5eAdapter.areaShowDC(npc), false); assert.equal(dnd5eAdapter.areaShowDC(pc), true);
  visibility = 'all'; assert.equal(dnd5eAdapter.areaShowDC(npc), true);
  visibility = 'none'; game.user.isGM = true; assert.equal(dnd5eAdapter.areaShowDC(npc), true);
});
