'use strict';

// Central quantity-driver catalogue.  It deliberately has no numeric fallback:
// missing evidence is a state, not a quantity.
const fs = require('fs');
const path = require('path');
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'catalogs', 'items.json'), 'utf8'));

const VERSION = 'quantity-driver-catalog-v1.0.0';
const REQUIRED_BY_DRIVER = {
  project_area: ['area'], usable_area: ['usable_area'], wall_area: ['wall_area'], ceiling_area: ['ceiling_area'],
  bathroom_count: ['bathroom_count'], kitchen_count: ['kitchen_count'], room_count: ['room_count'],
  floor_count: ['floor_count'], entrance_count: ['entrance_count'], fixture_count: ['fixture_schedule'],
  equipment_count: ['equipment_schedule'], conditioned_space_count: ['conditioned_space_count'],
  door_count_from_spaces: ['door_count'], facade_area: ['facade_area'], room_perimeter: ['room_perimeter'],
  drawing_measurement: ['architectural_drawing'], engineering_formula: ['specialist_design'],
  manual_confirmation: ['manual_confirmation'], linked_item: ['linked_item_quantity']
};
const ZONE_DRIVER = {
  'FLR-009': ['bathroom', 'floor_area'], 'FLR-013': ['bathroom', 'wall_finish_area'],
  'FLR-011': ['entrance', 'floor_area'], 'FLR-010': ['bedroom', 'floor_area']
};
const FIXED_SYSTEM_CODES = new Set(['OPR-001', 'OPR-002', 'OPR-003', 'OPR-005', 'OPR-006']);

const catalogue = Object.fromEntries(items.map(item => {
  const driver = item.quantity_driver || null;
  return [item.code, {
    item_code: item.code, item_name_ar: item.name_ar, canonical_unit: item.unit,
    quantity_driver: driver, calculation_method: driver ? 'deterministic_rule' : 'none',
    required_inputs: REQUIRED_BY_DRIVER[driver] || [], optional_inputs: [], fallback_policy: 'return_null',
    rule_id: `QDR-${item.code}`, rule_version: VERSION, engineering_reviewed: false, is_active: true,
    zone_requirement: ZONE_DRIVER[item.code] || null
  }];
}));

function getDefinition(code) { return catalogue[code] || null; }
function seedDatabase(db) {
  const upsert = db.prepare(`INSERT INTO quantity_driver_catalog
    (item_code,item_name_ar,canonical_unit,quantity_driver,calculation_method,required_inputs_json,fallback_policy,rule_id,rule_version,engineering_reviewed,is_active,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(item_code) DO UPDATE SET item_name_ar=excluded.item_name_ar,canonical_unit=excluded.canonical_unit,
      quantity_driver=excluded.quantity_driver,calculation_method=excluded.calculation_method,required_inputs_json=excluded.required_inputs_json,
      fallback_policy=excluded.fallback_policy,rule_id=excluded.rule_id,rule_version=excluded.rule_version,is_active=excluded.is_active,updated_at=datetime('now')`);
  const tx = db.transaction(() => Object.values(catalogue).forEach(def => upsert.run(def.item_code, def.item_name_ar, def.canonical_unit,
    def.quantity_driver, def.calculation_method, JSON.stringify(def.required_inputs), def.fallback_policy, def.rule_id, def.rule_version,
    def.engineering_reviewed ? 1 : 0, def.is_active ? 1 : 0)));
  tx();
}
module.exports = { VERSION, catalogue, getDefinition, seedDatabase, FIXED_SYSTEM_CODES };
