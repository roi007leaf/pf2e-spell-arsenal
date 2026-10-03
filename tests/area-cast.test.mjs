import test from 'node:test';
import assert from 'node:assert/strict';
import { pf2eAdapter } from '../scripts/pf2e.js';
import { dnd5eAdapter } from '../scripts/dnd5e.js';

test('PF2e area prompts use native heightened variant retaining caster context', () => {
  globalThis.game = { system: { id: 'pf2e' }, modules: new Map() };
  const actor = { id: 'caster', dc: 25 };
  const spell = { actor, rank: 1, loadVariant({ castRank }) { return { actor: this.actor, rank: castRank, damage: `${castRank * 2}d6` }; } };
  const region = { message: { item: spell }, flags: { pf2e: { origin: { rollOptions: ['origin:item:rank:4'] } } } };
  const cast = pf2eAdapter.regionCastSpell(region);
  assert.equal(cast.rank, 4); assert.equal(cast.damage, '8d6'); assert.equal(cast.actor, actor);
  assert.equal(spell.rank, 1);
  region.flags.pf2e.origin.castRank = 5;
  assert.equal(pf2eAdapter.regionCastSpell(region).rank, 5);
});

test('D&D prompts use native upcast scaling delta and original caster', () => {
  const actor = { id: 'caster' };
  const spell = { actor, _source: { system: { level: 2 } }, system: { level: 2 }, scaledClone(delta) { return { actor: this.actor, system: { level: 2 + delta }, damage: `${3 + delta}d8` }; } };
  globalThis.fromUuidSync = () => spell;
  globalThis.game = { messages: new Map() };
  const region = { flags: { dnd5e: { item: 'Item.spell', spellLevel: 5 } } };
  const cast = dnd5eAdapter.regionCastSpell(region);
  assert.equal(cast.system.level, 5); assert.equal(cast.damage, '6d8'); assert.equal(cast.actor, actor);
  assert.equal(spell.system.level, 2);
  const actual = { actor, system: { level: 6 } };
  region.flags.dnd5e.messageId = 'cast';
  game.messages.set('cast', { getAssociatedItem(options) { assert.equal(options.scaled, true); return actual; } });
  assert.equal(dnd5eAdapter.regionCastSpell(region), actual);
});

test('missing cast metadata retains original spell and cantrips are not slot-scaled', () => {
  const spell = { system: { level: 0 }, scaledClone() { throw new Error('Cantrips must not be upcast'); } };
  globalThis.fromUuidSync = () => spell;
  globalThis.game = { messages: new Map() };
  assert.equal(dnd5eAdapter.regionCastSpell({ flags: { dnd5e: { item: 'Item.cantrip', spellLevel: 5 } } }), spell);
});
