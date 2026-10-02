import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSpellRule, resolveSpellDrop, spellAreaInfo } from '../scripts/spell-parser.js';
import { validateRules } from '../scripts/rules.js';
const presets = Object.fromEntries(['Fire', 'Frost', 'Acid', 'Grease', 'Earthquake'].map(name => [name, { name, configs: { tile: { type: 'Tile', stage: 1 } } }]));
const spell = system => ({ name: 'Test Spell', type: 'spell', system });

test('description-only Grease templates use placed coverage, retaining duration and cell count', () => {
  const item = spell({ slug: 'grease', duration: { value: '1 minute' }, description: { value:
    '<p><strong>Area</strong> 4 contiguous 5-foot squares @Template[burst|distance:5] @Template[line|distance:5|width:5]</p>' } });
  const { rule, summary } = inferSpellRule(item, presets, 'grease');
  assert.equal(rule.kind, 'area'); assert.equal(rule.hasTemplate, true);
  assert.equal(rule.duration, 60); assert.equal(rule.squares, 4);
  assert.match(summary, /Description templates: 5 ft burst \/ 5 ft line/);
});

test('description templates support explicit types and variable distances without evaluation', () => {
  const item = spell({ description: { value: '@Template[type:cone|distance:resolve(@item.level * 5)]' }, traits: { value: ['fire'] } });
  const { rule } = inferSpellRule(item, presets, 'cone');
  assert.equal(rule.hasTemplate, true); assert.equal(rule.kind, 'area'); assert.equal(rule.effect, 'Fire');
  assert.equal(spellAreaInfo(spell({ description: { value: '@Template[banana|distance:5] @Template[burst|distance:-5]' } })).hasTemplate, false);
});

test('structured areas take precedence; contiguous prose supplies bounded picker size', () => {
  const area = spellAreaInfo(spell({ area: { type: 'burst', value: 20 }, description: { value: '@Template[cone|distance:5]' } }));
  assert.equal(area.summary, '20 ft burst');
  const { rule } = inferSpellRule(spell({ description: { value: '<p>Area 6 contiguous 5-foot squares</p>' } }), presets, 'cells');
  assert.equal(rule.kind, 'area'); assert.equal(rule.hasTemplate, false); assert.equal(rule.squares, 6);
  assert.equal(spellAreaInfo(spell({ description: { value: '999 contiguous 5-foot squares' } })).squares, undefined);
});
test('dropped prepared Fireball supports Set damage kinds', async () => {
  const item = await resolveSpellDrop({ dataTransfer: { getData: () => JSON.stringify({ type: 'Item', uuid: 'Compendium.pf2e.spells-srd.Item.fireball' }) } }, {
    fromDropData: async () => ({ name: 'Fireball', type: 'spell', system: { slug: 'fireball', area: { type: 'burst', value: 20 }, damage: { primary: { type: 'fire', kinds: new Set(['damage']) } } } })
  });
  const { rule } = inferSpellRule(item, presets, 'fireball');
  assert.equal(rule.effect, 'Fire'); assert.equal(rule.kind, 'area'); assert.equal(rule.enabled, true);
});
test('healing-only Set and array entries do not infer damage trigger', () => {
  for (const kinds of [new Set(['healing']), ['healing']]) {
    const { rule } = inferSpellRule(spell({ damage: { primary: { type: 'vitality', kinds } } }), presets, 'healing');
    assert.equal(rule.kind, 'caster');
  }
});
test('structured area and damage infer fire burst', () => {
  const { rule } = inferSpellRule(spell({ area: { type: 'burst', value: 20 }, damage: { a: { type: 'fire', kinds: ['damage'] } } }), presets, 'test');
  assert.equal(rule.kind, 'area'); assert.equal(rule.effect, 'Fire'); assert.equal(rule.duration, 0); assert.equal(rule.instant, true); assert.equal(rule.enabled, true);
});
test('targeted cold uses damage; timed field parses minute duration', () => {
  const { rule } = inferSpellRule(spell({ damage: { a: { type: 'cold', kinds: ['damage'] } } }), presets, 'test');
  assert.equal(rule.kind, 'damage'); assert.equal(rule.effect, 'Frost');
  const field = inferSpellRule(spell({ area: { type: 'emanation', value: 10 }, duration: { value: '1 minute' }, traits: { value: ['fire'] } }), presets, 'field').rule;
  assert.equal(field.duration, 60); assert.equal(field.highlight, true);
});

test('seconds and sustained text stay lasting instead of becoming instant', () => {
  const timed = inferSpellRule(spell({ area: { type: 'burst', value: 5 }, duration: { value: '30 seconds' } }), presets, 'seconds').rule;
  assert.equal(timed.instant, false); assert.equal(timed.duration, 30);
  const sustained = inferSpellRule(spell({ area: { type: 'burst', value: 5 }, duration: { value: 'sustained' } }), presets, 'sustained').rule;
  assert.equal(sustained.instant, false); assert.equal(sustained.duration, 0);
});
test('grease without area uses picker; ambiguous visuals remain disabled and saveable', () => {
  const grease = inferSpellRule(spell({ slug: 'grease', duration: { value: '1 minute' } }), presets, 'grease').rule;
  assert.equal(grease.kind, 'area'); assert.equal(grease.squares, 4); assert.equal(grease.effect, 'Grease');
  const mixed = inferSpellRule(spell({ damage: { a: { type: 'fire' }, b: { type: 'cold' } } }), presets, 'mixed').rule;
  assert.equal(mixed.enabled, false); assert.equal(mixed.effect, ''); assert.equal(validateRules([mixed]).length, 1);
});
test('sheet and compendium drops use native resolver; non-spells rejected', async () => {
  for (const uuid of ['Actor.actor.Item.spell', 'Compendium.pf2e.spells-srd.Item.spell']) {
    const result = await resolveSpellDrop({ dataTransfer: { getData: () => JSON.stringify({ type: 'Item', uuid }) } }, { fromDropData: async data => { assert.equal(data.uuid, uuid); return spell({}); } });
    assert.equal(result.type, 'spell');
  }
  await assert.rejects(resolveSpellDrop({ dataTransfer: { getData: () => '{broken' } }, {}), /Drop/);
  await assert.rejects(resolveSpellDrop({ dataTransfer: { getData: () => '{"type":"Item"}' } }, { fromDropData: async () => ({ type: 'weapon' }) }), /Only spell/);
});

test('wand and scroll drops extract prepared or source spell; mapping uses contained spell name', async () => {
  const embedded = { name: 'Breathe Fire', type: 'spell', system: { area: { type: 'cone', value: 15 }, damage: { primary: { type: 'fire', kinds: new Set(['damage']) } } } };
  for (const item of [
    { type: 'consumable', name: 'Wand of Breathe Fire', embeddedSpell: embedded },
    { type: 'consumable', name: 'Scroll of Breathe Fire', system: { spell: embedded } }
  ]) {
    const dropped = await resolveSpellDrop({ dataTransfer: { getData: () => '{"type":"Item","uuid":"Actor.actor.Item.wand"}' } }, { fromDropData: async () => item });
    const { rule } = inferSpellRule(dropped, presets, 'wand');
    assert.equal(rule.spell, 'Breathe Fire'); assert.equal(rule.effect, 'Fire'); assert.equal(rule.kind, 'area'); assert.equal(rule.instant, true);
  }
  await assert.rejects(resolveSpellDrop({ dataTransfer: { getData: () => '{"type":"Item"}' } }, { fromDropData: async () => ({ type: 'consumable', name: 'Potion' }) }), /Only spell/);
});
