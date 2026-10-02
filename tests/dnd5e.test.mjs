import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSpellRule, spellAreaInfo, resolveSpellDrop } from '../scripts/spell-parser.js';
import { DND_DEFAULT_RULES, annotateDndCast, annotateDndDamage, forwardDndDamage } from '../scripts/dnd5e.js';
import { validateRules } from '../scripts/rules.js';
import { spellStageRank } from '../scripts/stages.js';
const presets = Object.fromEntries(['Fire', 'Frost', 'Acid', 'Grease', 'Spiderweb', 'Smoke', 'Lightning Field'].map(name => [name, { name, configs: { tile: { type: 'Tile', stage: 1 } } }]));
const spell = (system = {}) => ({ type: 'spell', name: 'Fireball', uuid: 'Actor.caster.Item.spell', system: { level: 3, duration: { value: '', units: 'inst' }, description: { value: '' }, activities: {}, ...system } });

test('5e activity damage, multiple templates and structured durations import correctly', () => {
  const item = spell({ duration: { value: '1', units: 'minute' }, activities: new Map([
    ['a', { type: 'save', damage: { parts: [{ types: new Set(['fire']) }] }, target: { template: { type: 'sphere', size: '20', units: 'ft' } } }],
    ['b', { type: 'save', damage: { parts: [{ types: new Set(['fire']) }] }, target: { template: { type: 'cone', size: '30', width: '10', units: 'ft' } } }]
  ]) });
  const { rule } = inferSpellRule(item, presets, 'fireball');
  assert.equal(rule.kind, 'area'); assert.equal(rule.effect, 'Fire'); assert.equal(rule.enabled, true);
  assert.equal(rule.duration, 60); assert.equal(rule.instant, false);
  assert.deepEqual(spellAreaInfo(item).templateDetails, ['20 ft sphere', '30 × 10 ft cone']);
  assert.equal(rule.sourceUuid, item.uuid);
  assert.equal(validateRules(DND_DEFAULT_RULES).length, 36);
});

test('5e cantrips, mixed damage and healing do not infer misleading effects', () => {
  const item = spell({ level: 0, activities: { attack: { type: 'attack', damage: { parts: [{ types: ['cold'] }] } } } });
  item.name = 'Ray of Frost';
  assert.equal(inferSpellRule(item, presets, 'frost').rule.kind, 'damage');
  assert.equal(spellStageRank(item, { castRank: 8 }), 1);
  item.system.activities.attack.damage.parts.push({ types: ['fire'] });
  assert.equal(inferSpellRule(item, presets, 'mixed').rule.enabled, false);
  item.system.activities.attack.type = 'heal';
  assert.equal(inferSpellRule(item, presets, 'healing').rule.enabled, false);
});

test('5e lightning damage vocabulary and Fog Cloud use installed visual presets', () => {
  const lightning = spell({ activities: { save: { type: 'save', damage: { parts: [{ types: ['lightning'] }] } } } });
  lightning.name = 'Lightning Bolt';
  assert.equal(inferSpellRule(lightning, presets, 'lightning').rule.effect, 'Lightning Field');
  const fog = spell({ target: { template: { type: 'sphere', size: '20', units: 'ft' } }, duration: { value: '1', units: 'hour' } });
  fog.name = 'Fog Cloud';
  const rule = inferSpellRule(fog, presets, 'fog').rule;
  assert.equal(rule.effect, 'Smoke'); assert.equal(rule.duration, 3600); assert.equal(rule.kind, 'area');
});

test('5e linked wand and scroll Cast activities resolve original spell', async () => {
  const item = spell();
  globalThis.fromUuid = async uuid => { assert.equal(uuid, 'Compendium.dnd5e.spells.Item.spell'); return item; };
  const wand = { type: 'equipment', system: { activities: { cast: { type: 'cast', spell: { uuid: 'Compendium.dnd5e.spells.Item.spell' } } } } };
  const event = { dataTransfer: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Item.wand' }) } };
  assert.equal(await resolveSpellDrop(event, { fromDropData: async () => wand }), item);
});

test('5e cast metadata and real damage context travel without persisting actor flags', () => {
  const item = spell();
  globalThis.game = { system: { id: 'dnd5e' }, settings: { get: (id, key) => key === 'enabled' ? true : [{ enabled: true, kind: 'damage', spell: 'Fireball' }] } };
  globalThis.foundry = { utils: { randomID: () => 'application' } };
  const config = { data: {} };
  annotateDndCast({ item, getRollData: () => ({ item: { level: 6 } }) }, config);
  assert.equal(config.data.flags.world.spellArsenalCast.spellLevel, 6);
  const actor = { id: 'target', system: { attributes: { hp: { value: 20, temp: 2 } } } };
  const updates = { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 };
  const origin = { getAssociatedItem: () => item };
  annotateDndDamage(actor, 7, updates, { originatingMessage: origin });
  const options = {};
  forwardDndDamage(actor, updates, options);
  assert.equal(options.spellArsenalDamageEvent.name, 'Fireball');
  assert.equal(options.spellArsenalDamageEvent.actorId, actor.id);
  assert.equal(Object.hasOwn(updates, 'flags.world.spellArsenalDamageEvent'), false);
  const expanded = { flags: { world: { spellArsenalDamageEvent: options.spellArsenalDamageEvent, other: true } } };
  const forwarded = {};
  forwardDndDamage(actor, expanded, forwarded);
  assert.equal(forwarded.spellArsenalDamageEvent.id, 'application');
  assert.deepEqual(expanded, { flags: { world: { other: true } } });
  const healing = { 'system.attributes.hp.value': 25 };
  annotateDndDamage(actor, -5, healing, { originatingMessage: origin });
  assert.equal(Object.hasOwn(healing, 'flags.world.spellArsenalDamageEvent'), false);
  const unknown = { 'system.attributes.hp.value': 10 };
  annotateDndDamage(actor, 10, unknown, {});
  assert.equal(Object.hasOwn(unknown, 'flags.world.spellArsenalDamageEvent'), false);
});
