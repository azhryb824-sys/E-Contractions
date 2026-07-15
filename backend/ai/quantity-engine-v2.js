'use strict';
const { getDefinition, VERSION, FIXED_SYSTEM_CODES } = require('./quantity-driver-catalog');

const CALCULATED = new Set(['exact_from_explicit_count', 'calculated_from_confirmed_area', 'calculated_from_zone_geometry']);
const value = (project, key) => project[key] ?? project[`${key}_value`] ?? null;
const zonesFor = (zones, type) => (zones || []).filter(z => z.zone_type === type && z.included_in_scope !== false);
function totalZone(zones, type, key) {
  const found = zonesFor(zones, type); if (!found.length || found.some(z => z[key] == null)) return null;
  return found.reduce((sum, z) => sum + Number(z[key]), 0);
}
function pending(item, def, state, required = def?.required_inputs || [], extra = {}) {
  return { ...item, unit: def?.canonical_unit || item.unit, quantity: null, quantity_state: state,
    quantity_driver: def?.quantity_driver || null, required_inputs: required, quantity_confidence: 0,
    can_enter_approved_boq: false, rule_id: def?.rule_id || null, rule_version: VERSION, ...extra };
}
function exact(item, def, quantity, state, extra = {}) {
  if (!Number.isFinite(quantity) || quantity <= 0) return pending(item, def, quantity === 0 ? 'out_of_scope' : 'pending_missing_input', def.required_inputs, extra);
  return { ...item, unit: def.canonical_unit, quantity, quantity_state: state, quantity_driver: def.quantity_driver,
    required_inputs: def.required_inputs, quantity_confidence: 1, can_enter_approved_boq: true,
    rule_id: def.rule_id, rule_version: VERSION, ...extra };
}
function calculate(item, project = {}, zones = []) {
  const def = getDefinition(item.code);
  if (!def || !def.quantity_driver) return pending(item, def, 'missing_quantity_driver');
  const driver = def.quantity_driver;
  if (item.classification === 'forbidden' || item.classification === 'excluded') return pending(item, def, 'out_of_scope');
  if (def.zone_requirement) {
    const [type, field] = def.zone_requirement; const amount = totalZone(zones, type, field);
    if (amount == null) return pending(item, def, 'pending_missing_input', [`${type}.${field}`]);
    return exact(item, def, amount, 'calculated_from_zone_geometry', { zone_type: type });
  }
  const countDrivers = ['bathroom_count', 'kitchen_count', 'room_count', 'floor_count', 'entrance_count', 'conditioned_space_count', 'door_count_from_spaces', 'equipment_count'];
  if (countDrivers.includes(driver)) {
    const key = driver === 'door_count_from_spaces' ? 'door_count' : driver;
    const count = value(project, key);
    if (count == null) return pending(item, def, 'pending_missing_input');
    return exact(item, def, Number(count), 'exact_from_explicit_count');
  }
  if (driver === 'project_area') {
    const area = value(project, 'area'); if (area == null) return pending(item, def, 'pending_missing_input');
    return exact(item, def, Number(area), 'calculated_from_confirmed_area', { zone_type: 'project' });
  }
  if (['usable_area', 'wall_area', 'ceiling_area', 'facade_area', 'room_perimeter'].includes(driver)) {
    const amount = value(project, driver); if (amount == null) return pending(item, def, 'pending_missing_input');
    return exact(item, def, Number(amount), 'calculated_from_confirmed_area');
  }
  if (driver === 'fixed_per_project' && FIXED_SYSTEM_CODES.has(item.code)) {
    return exact(item, def, 1, 'exact_from_explicit_count', { required_inputs: [], quantity_confidence: 0.8 });
  }
  if (driver === 'fixed_per_project' || driver === 'fixed_per_floor') return pending(item, def, 'pending_missing_input');
  if (driver === 'drawing_measurement') return pending(item, def, 'requires_architectural_drawing');
  if (driver === 'engineering_formula') return pending(item, def, 'requires_specialist_design');
  if (driver === 'manual_confirmation') return pending(item, def, 'pending_missing_input');
  return pending(item, def, 'pending_missing_input');
}
function calculateAll(items, project, zones) { return items.map(item => calculate(item, project, zones)); }
function canApprove(item) { return CALCULATED.has(item.quantity_state) && item.can_enter_approved_boq === true && Number.isFinite(item.quantity) && item.quantity > 0; }
module.exports = { VERSION, calculate, calculateAll, canApprove };
