import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, validateRules, runtimeSettings, runtimeSignature } from '../scripts/rules.js';

test('default mappings select expected triggers and durations', () => {
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

test('invalid optional toggles and duration units fail validation', () => {
  for (const fields of [{ instant: 'false' }, { hasTemplate: 'true' }, { durationUnit: 'days' }])
    assert.throws(() => validateRules([{ ...DEFAULT_RULES[0], ...fields }]), /Invalid/);
});

test('template metadata and display units do not restart visuals; runtime overrides do', () => {
  const rule = validateRules(DEFAULT_RULES)[3];
  assert.equal(runtimeSignature(rule), runtimeSignature({ ...rule, templateDetails: ['5 ft burst'], sourceUuid: 'Item.grease', hasTemplate: true, durationUnit: 'seconds' }));
  assert.notEqual(runtimeSignature(rule), runtimeSignature({ ...rule, duration: 120 }));
  assert.notEqual(runtimeSignature(rule), runtimeSignature({ ...rule, kind: 'caster' }));
});
