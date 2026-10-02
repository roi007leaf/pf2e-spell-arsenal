import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_RULES, validateRules, missingDefaults } from '../scripts/rules.js';
import { matchSpellVisual } from '../scripts/spell-matching.js';
import { inferSpellRule } from '../scripts/spell-parser.js';

test('catalog defaults use audited supported presets and real spell links', () => {
  const audit = JSON.parse(readFileSync(new URL('../docs/preset-audit.json', import.meta.url)));
  const rules = validateRules(DEFAULT_RULES);
  assert.equal(rules.length, audit.enabled);
  assert.equal(new Set(rules.map(r => r.spell.toLowerCase())).size, rules.length);
  for (const rule of rules) {
    assert.match(rule.sourceUuid, /^Compendium\.pf2e\.spells-srd\.Item\./);
    assert.notEqual(rule.kind, 'caster');
    const preset = audit.presets.find(p => p.name === rule.effect);
    assert.ok(preset);
    assert.ok(preset.types.every(t => ['Tile', 'AmbientLight', 'AmbientSound', 'Region'].includes(t)));
    assert.ok(preset.stages.includes(rule.stage));
    if (rule.kind === 'damage') assert.equal(rule.instant, true);
  }
  assert.equal(rules.find(r => r.spell === 'Scatter Scree').effect, 'Debris (Stone)');
  assert.equal(rules.find(r => r.spell === 'Scatter Scree').duration, 60);
});

test('adding defaults preserves name overrides and avoids ID collisions', () => {
  const existing = [{ id: 'fireball', spell: 'Custom spell' }, { id: 'custom', spell: ' FIREBALL ' }];
  const before = structuredClone(existing);
  const additions = missingDefaults(existing, DEFAULT_RULES);
  assert.ok(!additions.some(r => r.spell === 'Fireball'));
  assert.equal(new Set([...existing, ...additions].map(r => r.id)).size, existing.length + additions.length);
  assert.deepEqual(existing, before);
});

test('mixed and unsupported damage never become confident elemental matches', () => {
  assert.equal(matchSpellVisual({ name: 'Mixed', system: { damage: { a: { type: 'fire' }, b: { type: 'bludgeoning' } } } }).confidence, 'review');
  assert.equal(matchSpellVisual({ name: 'Noise', system: { damage: { a: { type: 'sonic' } } } }).effect, '');
  assert.equal(matchSpellVisual({ name: 'Web', system: {} }).effect, 'Spiderweb');
});

test('drops share catalog themes and reject unsupported later stages', () => {
  const configs = { debris: { name: 'Debris (Stone)', configs: { first: { type: 'Tile', stage: 1 } } } };
  const item = { type: 'spell', name: 'Scatter Scree', system: { area: { type: 'line', value: 10 }, duration: { value: '1 minute' }, damage: { a: { type: 'bludgeoning' } } } };
  assert.equal(inferSpellRule(item, configs, 'test').rule.effect, 'Debris (Stone)');
  configs.debris.configs.later = { type: 'Wall', stage: 2 };
  assert.equal(inferSpellRule(item, configs, 'test').rule.enabled, false);
});
