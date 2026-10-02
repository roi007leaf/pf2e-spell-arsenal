import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, validateRules, runtimeSettings } from '../scripts/rules.js';

test('default mappings preserve source macro triggers and durations', () => {
  const rules = validateRules(DEFAULT_RULES);
  assert.equal(rules.length, 5);
  assert.equal(runtimeSettings(rules.find(r => r.id === 'grease')).FREEFORM_SQUARES, 4);
  assert.equal(rules.find(r => r.id === 'fireball').duration, 0);
  assert.equal(rules.find(r => r.id === 'fireball').instant, true);
  assert.equal(rules.find(r => r.id === 'caustic-blast').kind, 'damage');
});
test('prevents duplicate triggers but permits distinct trigger types', () => {
  const first = { ...DEFAULT_RULES[0] };
  assert.throws(() => validateRules([first, { ...first, id: 'second', spell: '  CAUSTIC BLAST ' }]), /Duplicate/);
  assert.equal(validateRules([first, { ...first, id: 'second', kind: 'caster' }]).length, 2);
});
test('persistent duration only valid for areas; bounds protect timers and scene size', () => {
  assert.throws(() => validateRules([{ ...DEFAULT_RULES[0], duration: 0 }]), /Duration/);
  assert.throws(() => validateRules([{ ...DEFAULT_RULES[1], squares: 121 }]), /120/);
  assert.throws(() => validateRules([{ ...DEFAULT_RULES[1], duration: 2147484 }]), /Duration/);
});
