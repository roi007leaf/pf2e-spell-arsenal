import test from 'node:test';
import assert from 'node:assert/strict';
import { regionCoverage } from '../scripts/region-coverage.js';

test('multi-square Grease uses core combined geometry when PF2e coverage is null', () => {
  const grid = { getOffsetRange: () => [0, 0, 2, 2], getCenterPoint: ({ i, j }) => ({ x: j * 100 + 50, y: i * 100 + 50 }) };
  const region = { getCoverage: () => null, bounds: {}, polygonTree: { testPoint: () => true } };
  assert.deepEqual(regionCoverage(region, {}, grid).covered, [{ i: 0, j: 0 }, { i: 0, j: 1 }, { i: 1, j: 0 }, { i: 1, j: 1 }]);
  delete region.getCoverage;
  region.polygonTree.testPoint = ({ x, y }) => x < 100 || y < 100;
  assert.equal(regionCoverage(region, {}, grid).covered.length, 3);
});

test('native measured coverage preserves blocked cells and receives current level', () => {
  const level = { id: 'ground' }, measured = { covered: [{ i: 1, j: 2 }], blocked: [{ i: 0, j: 0 }] };
  assert.equal(regionCoverage({ getCoverage: value => { assert.equal(value, level); return measured; } }, level, {}), measured);
});
