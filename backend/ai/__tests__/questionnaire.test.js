const assert = require('assert');
const engine = require('../questionnaire-engine');

const cases = [
  ['office 25m brief', 'office_fitout'], ['open office no rooms/bath', 'office_fitout'],
  ['office pantry no bath', 'office_fitout'], ['mall shop bath OOS', 'retail_shop'],
  ['cafe no cooking', 'cafe_no_cooking'], ['gas restaurant', 'restaurant_commercial_kitchen'],
  ['dry warehouse', 'dry_warehouse'], ['freezer', 'cold_storage'],
  ['factory no equipment schedule', 'food_factory'], ['school classrooms no area', 'school'],
  ['hotel rooms', 'hotel'], ['mosque renovation no baths', 'mosque'], ['mixed-use', 'mixed_use_building']
];
for (const [name, group] of cases) assert.ok(engine.groupPlans[group], name);

const noRooms = { Q_HAS_ROOMS: { state: 'explicit', value: false } };
assert.ok(!engine.buildPlan('office_fitout', noRooms).some(q => q.question_id === 'Q_ROOM_COUNT'));
const zeroRooms = { Q_HAS_ROOMS: { state: 'explicit', value: true }, Q_ROOM_COUNT: { state: 'explicit', value: 0 } };
assert.strictEqual(engine.buildPlan('office_fitout', zeroRooms).find(q => q.question_id === 'Q_ROOM_COUNT').answer.value, 0);
const contradiction = { Q_HAS_BATHROOMS: { state: 'explicit', value: false }, Q_BATHROOM_COUNT: { state: 'explicit', value: 2 } };
assert.strictEqual(engine.detectContradictions(contradiction).length, 1);
const missingCount = { Q_HAS_BATHROOMS: { state: 'explicit', value: true } };
assert.ok(engine.readiness('office_fitout', missingCount).required_input.includes('Q_BATHROOM_COUNT'));
console.log(`questionnaire: ${cases.length + 4} assertions passed`);
