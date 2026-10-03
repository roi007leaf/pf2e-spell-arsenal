import test from 'node:test';
import assert from 'node:assert/strict';
import { areaTriggers, areaMode, areaRepeatKey, suggestAreaTriggers } from '../scripts/area-triggers.js';
import { validateRules, DEFAULT_RULES } from '../scripts/rules.js';

test('trigger selections validate independently, remain off when empty, and reject invalid keys', () => {
  const base = DEFAULT_RULES.find(rule => rule.kind === 'area');
  const rule = validateRules([{ ...base, areaTriggers: ['placement', 'entry', 'turn-end', 'exit'], areaRepeat: 'caster-turn' }])[0];
  assert.deepEqual(rule.areaTriggers, ['placement', 'entry', 'turn-end', 'exit']);
  assert.deepEqual(areaTriggers({ areaTriggers: [], areaAutomation: 'placement-entry' }), []);
  assert.throws(() => validateRules([{ ...base, areaTriggers: ['unknown'] }]));
  assert.throws(() => validateRules([{ ...base, areaRepeat: 'unknown' }]));
});

test('automatic mode resolves actual spell rules while manual selections remain untouched', () => {
  const spell = { system: { defense: { save: { statistic: 'reflex' } }, description: { value: 'A creature enters the area or ends its turn there.' } } };
  assert.equal(areaMode({}), 'auto');
  assert.equal(areaMode({ areaAutomation: 'off', areaTriggers: [] }), 'auto');
  assert.equal(areaMode({ areaMode: 'manual', areaTriggers: [] }), 'manual');
  assert.deepEqual(new Set(areaTriggers({ areaMode: 'auto', areaTriggers: ['exit'] }, spell)), new Set(['placement', 'entry', 'turn-end']));
  assert.deepEqual(areaTriggers({ areaMode: 'manual', areaTriggers: ['exit'] }, spell), ['exit']);
  assert.deepEqual(areaTriggers({ areaMode: 'manual', areaTriggers: [] }, spell), []);
  assert.deepEqual(areaTriggers({ areaMode: 'auto' }, { system: {} }), []);
});

test('repeat windows follow affected/caster turns instead of every combatant transition', () => {
  const token = { id: 'victim' }, caster = { id: 'caster', actor: { id: 'actor' } };
  const region = { parent: { tokens: [caster, token] } }, spell = { actor: caster.actor };
  const combat = { id: 'combat', started: true, round: 2, turn: 1, turns: [{ tokenId: 'caster' }, { tokenId: 'other' }, { tokenId: 'victim' }] };
  const key = () => areaRepeatKey({}, region, token, combat, spell);
  assert.equal(key(), 'combat:victim:1');
  combat.turn = 2; assert.equal(key(), 'combat:victim:2');
  combat.round = 3; combat.turn = 0; assert.equal(key(), 'combat:victim:2');
  assert.equal(areaRepeatKey({ areaRepeat: 'caster-turn' }, region, token, combat, spell), 'combat:caster:3');
  assert.equal(areaRepeatKey({ areaRepeat: 'unrestricted' }, region, token, combat, spell), null);
});

test('Grease suggestions expose description/activity evidence without enabling automation', () => {
  const spell = { system: { description: { value: '<p>A creature enters the area or ends its turn there.</p>' }, activities: { cast: { name: 'Cast', type: 'save' }, entry: { name: 'Enter / End Turn in Grease Save', type: 'save' } } } };
  const suggestion = suggestAreaTriggers(spell);
  assert.deepEqual(new Set(suggestion.triggers), new Set(['placement', 'entry', 'turn-end']));
  assert.ok(suggestion.evidence.includes('enters the area'));
  assert.equal(spell.areaTriggers, undefined);
  assert.deepEqual(suggestAreaTriggers({ system: {} }).triggers, []);
});
