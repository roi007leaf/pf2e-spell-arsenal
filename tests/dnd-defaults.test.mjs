import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DND_DEFAULT_RULES, DND_LEGACY_RULES, dndDefaultRules } from '../scripts/dnd5e.js';
import { validateRules, missingDefaults } from '../scripts/rules.js';

const presets = JSON.parse(readFileSync(new URL('./fixtures/presets.json', import.meta.url)));

test('5e editions have unique defaults with supported presets and source links', () => {
  for (const [defaults, pack, count] of [[DND_LEGACY_RULES, 'spells', 27], [DND_DEFAULT_RULES, 'spells24', 36]]) {
    const rules = validateRules(defaults);
    assert.equal(rules.length, count);
    assert.equal(new Set(rules.map(r => r.spell.toLowerCase())).size, rules.length);
    for (const rule of rules) {
      assert.ok(rule.sourceUuid.startsWith(`Compendium.dnd5e.${pack}.Item.`));
      const preset = presets.find(p => p.name === rule.effect);
      assert.ok(preset);
      assert.ok(preset.stages.includes(rule.stage));
      assert.ok(preset.types.every(type => ['Tile', 'AmbientLight', 'AmbientSound', 'Region'].includes(type)));
      assert.notEqual(rule.kind, 'caster');
      assert.equal(rule.stageMode, 'auto');
      if (rule.kind === 'damage') assert.equal(rule.instant, true);
    }
  }
});

test('world rules version selects correct Acid Splash targeting without mixing editions', () => {
  let version = 'legacy';
  globalThis.game = { settings: { get: () => version } };
  assert.equal(dndDefaultRules(), DND_LEGACY_RULES);
  assert.equal(dndDefaultRules().find(r => r.spell === 'Acid Splash').kind, 'damage');
  version = 'modern';
  assert.equal(dndDefaultRules(), DND_DEFAULT_RULES);
  assert.equal(dndDefaultRules().find(r => r.spell === 'Acid Splash').kind, 'area');
  assert.equal(dndDefaultRules().find(r => r.spell === 'Grease').duration, 60);
  for (const name of ['Fog Cloud', 'Web', 'Meteor Swarm', 'Wall of Force', 'Ice Storm']) assert.ok(!dndDefaultRules().some(r => r.spell === name));
});

test('catalog additions keep manually configured starter rows untouched', () => {
  const saved = [{ id: 'fireball', spell: 'Fireball', effect: 'Wild Magic', stageMode: 'fixed', stage: 3 }, { id: 'web', spell: 'Web', duration: 60 }];
  const snapshot = structuredClone(saved);
  const additions = missingDefaults(saved, DND_DEFAULT_RULES);
  assert.ok(!additions.some(r => r.spell === 'Fireball'));
  assert.deepEqual(saved, snapshot);
  assert.ok(additions.some(r => r.spell === 'Sacred Flame' && r.effect === 'Holy Light'));
});
