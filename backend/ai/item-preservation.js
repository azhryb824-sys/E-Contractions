'use strict';

// Quantity processing is an annotation step.  It may never decide whether an
// item exists, change its classification, or silently remove it.
function itemKey(item) { return item.code || item.item_code; }
function flatten(sections) { return sections.flatMap(section => (section.items || []).map(item => ({ ...item, section_code: section.code, section_name: section.name }))); }
function rebuild(items, sections) {
  return sections.map(section => ({ ...section, items: items.filter(item => item.section_code === section.code).map(({ section_code, section_name, ...item }) => item) })).filter(section => section.items.length > 0);
}
function snapshot(items, meta = {}) {
  return { created_at: new Date().toISOString(), model_version: meta.model_version || null,
    items: items.map(item => ({ ...item, quantity: item.quantity ?? null, quantity_state: item.quantity_state || 'quantity_not_processed' })) };
}
function mergeQuantityResults(itemSnapshot, quantityResults, sections) {
  const byCode = new Map(quantityResults.map(item => [itemKey(item), item]));
  const finalItems = itemSnapshot.items.map(original => {
    const result = byCode.get(itemKey(original));
    if (!result) return { ...original, quantity: null, quantity_state: 'quantity_model_unavailable', can_enter_approved_boq: false };
    // Classification and selection fields always remain owned by item prediction.
    const { classification: ignoredClassification, section_code: ignoredSection, section_name: ignoredSectionName, ...quantity } = result;
    return { ...original, ...quantity, classification: original.classification, section_code: original.section_code, section_name: original.section_name };
  });
  const finalCodes = new Set(finalItems.map(itemKey));
  const deleted = itemSnapshot.items.filter(item => !finalCodes.has(itemKey(item))).map(item => ({ item_code: itemKey(item), previous_classification: item.classification, reason_code: 'ITEM_DELETED_BY_QUANTITY_PIPELINE', stage: 'quantity_merge' }));
  const sectionCoverage = sections.map(section => {
    const sectionItems = finalItems.filter(item => item.section_code === section.code);
    const ready = sectionItems.filter(item => Number.isFinite(item.quantity) && item.quantity > 0 && item.can_enter_approved_boq === true).length;
    const pending = sectionItems.length - ready;
    return { section_code: section.code, section_name: section.name, status: !sectionItems.length ? 'not_applicable' : pending ? 'requires_information' : 'covered', items: sectionItems.length, quantity_ready_items: ready, pending_quantity_items: pending };
  });
  const quality_gate = { status: deleted.length ? 'failed' : 'passed', candidate_items: itemSnapshot.items.length, final_items: finalItems.length,
    quantity_ready_items: finalItems.filter(item => Number.isFinite(item.quantity) && item.quantity > 0 && item.can_enter_approved_boq === true).length,
    pending_quantity_items: finalItems.filter(item => !Number.isFinite(item.quantity) || item.quantity <= 0 || item.can_enter_approved_boq !== true).length,
    item_preservation_rate: itemSnapshot.items.length ? finalItems.length / itemSnapshot.items.length : 1,
    errors: deleted.length ? ['ITEM_DELETED_BY_QUANTITY_PIPELINE'] : [] };
  return { finalItems, sections: rebuild(finalItems, sections), deleted, sectionCoverage, quality_gate };
}
module.exports = { flatten, rebuild, snapshot, mergeQuantityResults };
