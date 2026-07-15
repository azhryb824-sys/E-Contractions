const assert = require('assert');
const { calculate, canApprove } = require('../quantity-engine-v2');
const { getDefinition } = require('../quantity-driver-catalog');

const project = { area: 250, bathroom_count: 3, kitchen_count: 1, room_count: 4 };
const zones = [
  { zone_type: 'bathroom', floor_area: 25, wall_finish_area: null, included_in_scope: true },
  { zone_type: 'bedroom', floor_area: 70, included_in_scope: true },
  { zone_type: 'entrance', floor_area: 15, included_in_scope: true }
];
const base = (code) => ({ code, name_ar: getDefinition(code).item_name_ar, unit: getDefinition(code).canonical_unit });

const bathroomFloor = calculate(base('FLR-009'), project, zones);
assert.strictEqual(bathroomFloor.quantity, 25);
assert.strictEqual(bathroomFloor.quantity_state, 'calculated_from_zone_geometry');
const toilet = calculate(base('PLM-015'), project, zones);
assert.strictEqual(toilet.quantity, 3);
assert.notStrictEqual(toilet.quantity, 25);
const basin = calculate(base('PLM-BASIN'), { ...project, bathroom_count: null }, zones);
assert.strictEqual(basin.quantity, null);
assert.strictEqual(basin.quantity_state, 'pending_missing_input');
const bathroomWall = calculate(base('FLR-013'), project, zones);
assert.strictEqual(bathroomWall.quantity, null);
assert.strictEqual(bathroomWall.quantity_state, 'pending_missing_input');
const entrance = calculate(base('FLR-011'), project, zones);
assert.strictEqual(entrance.quantity, 15);
const bedroomFloor = calculate(base('FLR-010'), project, zones);
assert.strictEqual(bedroomFloor.quantity, 70);
const linear = calculate(base('PLM-001'), project, zones);
assert.strictEqual(linear.quantity, null);
assert.ok(!canApprove(linear));
assert.ok(canApprove(bathroomFloor));
assert.strictEqual(getDefinition('PLM-015').canonical_unit, 'عدد');
console.log('quantity-engine-v2: 11 assertions passed');
