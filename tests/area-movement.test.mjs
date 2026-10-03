import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenInsideArea, crossesArea } from '../scripts/area-movement.js';

test('coverage delegates to native token footprint instead of center point', () => {
  const region = {};
  const token = { testInsideRegion: (actual, data) => { assert.equal(actual, region); assert.equal(data.width, 2); return true; }, getCenterPoint: () => { throw Error('center-only coverage'); } };
  assert.equal(tokenInsideArea(region, token, { width: 2 }), true);
});

test('pass-through uses native path segments and footprint offsets; teleport and other levels skip traversal', () => {
  globalThis.CONST = { REGION_MOVEMENT_SEGMENTS: { ENTER: 1 } };
  const token = { id: 't', x: 100, y: 200, elevation: 0, level: 'ground', getContainmentTestPoints: () => [{ x: 125, y: 225 }, { x: 175, y: 275 }] };
  let calls = 0;
  const region = { levels: new Set(['ground']), segmentizeMovementPath: (path, samples) => {
    calls++;
    assert.equal(path[1].x, 300); assert.equal(path.at(-1).x, 500);
    assert.deepEqual(samples, [{ x: 25, y: 25 }, { x: 75, y: 75 }]);
    return [{ type: 1 }];
  } };
  assert.equal(crossesArea(region, token, { x: 500 }, { movement: { t: { waypoints: [{ x: 300, y: 200, elevation: 0 }] } } }), true);
  assert.equal(crossesArea(region, token, { x: 500 }, { teleport: true }), false);
  assert.equal(crossesArea(region, token, { x: 500, level: 'upper' }, {}), false);
  assert.equal(calls, 1);
});
