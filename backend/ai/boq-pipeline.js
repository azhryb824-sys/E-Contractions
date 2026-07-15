'use strict';
const fs = require('fs');
const path = require('path');
const { buildApprovedBoq } = require('./project-schema');
const quantityEngine = require('./quantity-engine-v2');

const knowledge = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'knowledge', name), 'utf8'));
const buildingRules = knowledge('building-rules.json');
const exclusiveGroups = knowledge('exclusive-item-groups.json');
const measurementDrivers = new Set(['drawing_measurement','manual_measurement','engineering_formula']);

function flatten(sections) { return sections.flatMap(s => (s.items || []).map(item => ({ ...item, section_code: s.code, section_name: s.name }))); }
function rebuild(items, sections) {
  return sections.map(section => ({ ...section, items: items.filter(i => i.section_code === section.code).map(({section_code,section_name,...i}) => i) })).filter(s => s.items.length);
}
function applyBuildingEligibility(items, project, text) {
  const rule = buildingRules[project.building_type] || {};
  const forbidden = new Set(rule.forbidden_codes || []);
  const patterns = (rule.forbidden_name_patterns || []).map(x => x.toLowerCase());
  return items.map(item => {
    const name = String(item.name_ar || '').toLowerCase();
    if (forbidden.has(item.code) || patterns.some(p => name.includes(p))) return { ...item, classification: 'forbidden', exclusion_reason: 'غير مناسب لنوع المبنى' };
    if ((rule.optional_confirmation_codes || []).includes(item.code) && !text.includes(item.code)) return { ...item, classification: 'optional', requires_confirmation: true };
    return item;
  });
}
function resolveExclusiveGroups(items, selected = [], zones = []) {
  const chosen = new Set(selected);
  const zoned = new Set((zones || []).flatMap(z => z.selected_alternatives || []));
  const conflicts = [];
  for (const group of exclusiveGroups) {
    const present = items.filter(i => group.item_codes.includes(i.code) && i.classification !== 'forbidden');
    const explicit = present.filter(i => chosen.has(i.code) || zoned.has(i.code) || i.selected === true);
    if (explicit.length > 1 && group.selection === 'one') conflicts.push({ group_id: group.id, item_codes: explicit.map(i => i.code) });
    if (present.length > 1) for (const item of present) {
      if (!explicit.some(x => x.code === item.code)) Object.assign(item, { classification: 'alternative', alternative_group: group.id, requires_confirmation: true });
    }
  }
  return conflicts;
}
function classifyMeasurements(items) {
  return items.map(item => {
    if (item.requires_drawing || item.quantity_driver === 'drawing_measurement') return { ...item, classification: 'pending_measurement', quantity: null, requires_drawing: true };
    if (item.requires_engineering_calculation || measurementDrivers.has(item.quantity_driver)) return { ...item, classification: 'pending_measurement', quantity: null, requires_engineering_calculation: true };
    return item;
  });
}
function deduplicate(items) {
  const map = new Map();
  for (const item of items) {
    const prior = map.get(item.code);
    if (!prior || Number(item.confidence || 0) > Number(prior.confidence || 0)) map.set(item.code, item);
  }
  return [...map.values()];
}
function runBoqPipeline(sections, project, request = {}) {
  const trace = ['candidate_item_generation'];
  let items = flatten(sections);
  items = applyBuildingEligibility(items, project, `${request.title || ''} ${request.description || ''}`); trace.push('building_eligibility_filtering');
  const exclusiveConflicts = resolveExclusiveGroups(items, request.selected_alternatives || [], request.zones || []); trace.push('exclusive_group_resolution');
  items = classifyMeasurements(items); trace.push('quantity_driver_selection');
  items = quantityEngine.calculateAll(items, { ...project, ...request }, request.zones || project.zones || []);
  const testDependencies = { 'OPR-001': ['PLM-001','PLM-002'], 'OPR-002': ['ELC-010','ELC-EARTH'], 'OPR-003': ['HVAC-001','HVAC-005'] };
  const present = new Set(items.map(item => item.code));
  items = items.map(item => testDependencies[item.code] && !testDependencies[item.code].some(code => present.has(code))
    ? { ...item, quantity: null, quantity_state: 'not_applicable', can_enter_approved_boq: false, exclusion_reason: 'لا توجد أعمال تنفيذ مرتبطة للاختبار' }
    : item);
  trace.push('required_input_resolution','quantity_calculation','logical_validation');
  items = deduplicate(items); trace.push('deduplication','classification','confidence_calibration');
  const processedSections = rebuild(items, sections);
  const approvedBoq = buildApprovedBoq(processedSections, { optional_item_codes: request.approved_optional_items || [], selected_alternative_codes: request.selected_alternatives || [] });
  trace.push('user_approval','final_boq_creation');
  const rule = buildingRules[project.building_type] || {};
  const missingInputs = (rule.required_inputs || []).filter(key => project[key] == null && request[key] == null);
  return { sections: processedSections, approvedBoq, exclusiveConflicts, missingInputs,
    quantity_catalog_version: quantityEngine.VERSION, requires_specialist_review: !!rule.requires_specialist_review, pipeline_trace: trace };
}
module.exports = { runBoqPipeline, applyBuildingEligibility, resolveExclusiveGroups, classifyMeasurements, deduplicate };
