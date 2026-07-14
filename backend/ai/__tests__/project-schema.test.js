const assert = require('assert');
const schema = require('../project-schema');

assert.equal(schema.canonicalBuildingType('عمارة سكنية'), 'residential_building');
assert.equal(schema.canonicalBuildingType('مبنى سكني'), 'residential_building');
assert.equal(schema.canonicalBuildingType('مخزن مبرد'), 'cold_storage');
assert.equal(schema.canonicalBuildingType('مستودع'), 'warehouse');
const parsed = schema.parseProject({ description: 'تشطيب شقة 250 متر خمس غرف وحمامين', scope: 'full_fitout', area: 250, room_count: 5, bathroom_count: 2 });
assert.equal(parsed.unconfirmed_inferred_values.building_type.value, 'apartment');
assert.equal(parsed.unconfirmed_inferred_values.ownership_scope.value, 'single_unit_only');
const approved = schema.buildApprovedBoq([{ code: 'S', name: 'قسم', items: [
  { code: 'A', quantity: 2, classification: 'required' },
  { code: 'B', quantity: 0, classification: 'required' },
  { code: 'C', quantity: 1, classification: 'optional' },
  { code: 'D', quantity: 1, classification: 'alternative' }
]}], { optional_item_codes: ['C'], selected_alternative_codes: [] });
assert.deepEqual(approved.map(x => x.code), ['A', 'C']);
console.log('project-schema: 8 assertions passed');
