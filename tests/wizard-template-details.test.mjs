import test from 'node:test';
import assert from 'node:assert/strict';
import { wizardTemplateDetails } from '../scripts/wizard-template-details.js';
import { spellAreaInfo, inferSpellRule } from '../scripts/spell-parser.js';
const id = 'pf2e-aztecs-template-wizard';

test('Wizard shapes include heightened sizes, widths, ring radii and contiguous count', () => {
  const saved = { enabled: true, templateShape: { shapes: [{ type: 'circle', size: 5 }] } };
  const item = { type: 'spell', name: 'Custom spell', system: {} };
  globalThis.game = { modules: new Map([[id, { active: true, api: {
    readAutomation: received => { assert.equal(received, item); return saved; },
    resolveAutomationHeightening: (source, received) => {
      assert.equal(source, saved); assert.equal(received, item);
      return { enabled: true, contiguous: { enabled: true, count: 4 }, templateShape: { shapes: [
        { type: 'circle', size: 20 }, { type: 'line', size: 30, width: 10 }, { type: 'ring', size: 20, innerRadius: 5 }
      ] } };
    }
  } }]]) };
  assert.deepEqual(wizardTemplateDetails(item), ['Wizard: 4 contiguous cells', 'Wizard: 20 ft burst', 'Wizard: 30 × 10 ft line', 'Wizard: 5–20 ft ring']);
  const area = spellAreaInfo(item);
  assert.equal(area.hasTemplate, true); assert.equal(area.templateDetails.length, 4);
  assert.equal(inferSpellRule(item, {}, 'custom').rule.kind, 'area');
  assert.equal(saved.templateShape.shapes[0].size, 5);
});

test('disabled or unavailable Wizard does not advertise default shapes', () => {
  const module = { active: true, api: { readAutomation: () => ({ enabled: false, templateShape: { shapes: [{ type: 'cone', size: 15 }] } }) } };
  globalThis.game = { modules: new Map([[id, module]]) };
  assert.deepEqual(wizardTemplateDetails({}), []);
  module.active = false;
  assert.deepEqual(wizardTemplateDetails({}), []);
});
