'use strict';

const PROJECT_CATEGORIES = ['residential','commercial','hospitality','healthcare','educational','religious','industrial','storage_logistics','mixed_use','other'];
const BUILDING_TYPES = ['apartment','villa','residential_building','office','administrative_building','shop','showroom','restaurant','cafe','clinic','medical_center','school','nursery','hotel','serviced_apartments','warehouse','cold_storage','factory','workshop','mosque','mixed_use_building','other'];
const PROJECT_CONDITIONS = ['new_construction','shell_and_core','existing_building_fitout','renovation','partial_renovation','maintenance','expansion','system_replacement'];
const SCOPES = ['full_construction','full_fitout','partial_fitout','renovation','electrical_only','plumbing_only','hvac_only','painting_only','flooring_only','waterproofing_only','facade_only','structural_only','external_works','selected_trades'];
const OWNERSHIP_SCOPES = ['single_unit_only','private_villa','common_areas_only','entire_building','selected_floors','selected_zones'];
const FINISH_LEVELS = ['economic','standard','good','very_good','luxury','specialized'];

function normalizeArabic(value) {
  return String(value || '').toLowerCase().trim()
    .replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء').replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

const BUILDING_SYNONYMS = {
  apartment: ['شقه','شقة','شقق','وحده سكنيه'], villa: ['فيلا','فله','فلل'],
  residential_building: ['عماره','عمارة','عماره سكنيه','مبنى سكني','برج سكني'],
  office: ['مكتب','مكاتب'], administrative_building: ['مبنى اداري','مبني اداري'],
  shop: ['محل','دكان','متجر'], showroom: ['معرض'], restaurant: ['مطعم'], cafe: ['كافيه','مقهى','كوفي'],
  clinic: ['عياده','عيادة'], medical_center: ['مستوصف','مركز طبي'], school: ['مدرسه','مدرسة'],
  nursery: ['روضه','روضة','حضانه','حضانة'], hotel: ['فندق'], serviced_apartments: ['شقق فندقيه','شقق مفروشه'],
  warehouse: ['مستودع','مخزن'], cold_storage: ['مخزن مبرد','ثلاجه','ثلاجة'], factory: ['مصنع'],
  workshop: ['ورشه','ورشة'], mosque: ['جامع','مسجد'], mixed_use_building: ['مبنى متعدد الاستخدام','متعدد الاستخدامات']
};

const synonymIndex = Object.entries(BUILDING_SYNONYMS).flatMap(([value, terms]) =>
  terms.map(term => [normalizeArabic(term), value])
).sort((a, b) => b[0].length - a[0].length);

function canonicalBuildingType(value) {
  if (BUILDING_TYPES.includes(value)) return value;
  const normalized = normalizeArabic(value);
  const match = synonymIndex.find(([term]) => normalized === term || normalized.includes(term));
  return match ? match[1] : null;
}

function inferBuildingType(text) {
  const normalized = normalizeArabic(text);
  const match = synonymIndex.find(([term]) => normalized.includes(term));
  return match ? { value: match[1], confidence: 0.93, reason: `ذكر نوع المبنى: ${match[0]}` } : null;
}

function categoryForBuilding(buildingType) {
  if (['apartment','villa','residential_building'].includes(buildingType)) return 'residential';
  if (['office','administrative_building','shop','showroom','restaurant','cafe'].includes(buildingType)) return 'commercial';
  if (['clinic','medical_center'].includes(buildingType)) return 'healthcare';
  if (['school','nursery'].includes(buildingType)) return 'educational';
  if (['hotel','serviced_apartments'].includes(buildingType)) return 'hospitality';
  if (['warehouse','cold_storage'].includes(buildingType)) return 'storage_logistics';
  if (['factory','workshop'].includes(buildingType)) return 'industrial';
  if (buildingType === 'mosque') return 'religious';
  if (buildingType === 'mixed_use_building') return 'mixed_use';
  return 'other';
}

function normalizeProjectRequest(request = {}) {
  const normalized = { ...request };
  const explicitType = canonicalBuildingType(request.building_type || request.buildingType);
  if (explicitType) normalized.building_type = explicitType;
  return normalized;
}

const LEGACY_BUILDING = { apartment:'شقة', villa:'فيلا', residential_building:'عمارة', office:'مكتب', administrative_building:'مكتب', shop:'محل', showroom:'محل', restaurant:'مطعم', cafe:'مقهى', clinic:'عيادة', medical_center:'عيادة', school:'مدرسة', nursery:'مدرسة', hotel:'فندق', serviced_apartments:'فندق', warehouse:'مستودع', cold_storage:'مستودع', factory:'مصنع', workshop:'مصنع', mosque:'مسجد', mixed_use_building:'مبنى متعدد الاستخدامات' };
const LEGACY_SCOPE = { full_construction:'إنشاء كامل', full_fitout:'تشطيب كامل', partial_fitout:'تشطيب كامل', renovation:'ترميم شامل', electrical_only:'كهرباء فقط', plumbing_only:'سباكة فقط', painting_only:'دهانات فقط', selected_trades:'أعمال محددة' };
function toLegacyRequest(request = {}) { return { ...request, building_type: LEGACY_BUILDING[request.building_type] || request.building_type, scope: LEGACY_SCOPE[request.scope] || request.scope }; }

function parseProject(request = {}) {
  const normalized = normalizeProjectRequest(request);
  const explicit_values = {};
  const confirmed_inferred_values = {};
  const unconfirmed_inferred_values = {};
  const text = `${request.title || ''} ${request.description || ''}`;
  const copy = ['building_type','project_category','building_subtype','occupancy_type','project_condition','scope','ownership_scope','finish_level','area','floor_count','unit_count','room_count','bathroom_count','zones','special_features'];
  for (const key of copy) if (normalized[key] !== undefined && normalized[key] !== '') explicit_values[key] = normalized[key];
  const inferredBuilding = explicit_values.building_type ? null : inferBuildingType(text);
  if (inferredBuilding) unconfirmed_inferred_values.building_type = inferredBuilding;
  const building = explicit_values.building_type || inferredBuilding?.value;
  if (!explicit_values.project_category && building) {
    unconfirmed_inferred_values.project_category = { value: categoryForBuilding(building), confidence: 0.93, reason: 'مشتق من نوع المبنى' };
  }
  if (!explicit_values.ownership_scope && building === 'apartment') {
    unconfirmed_inferred_values.ownership_scope = { value: 'single_unit_only', confidence: 0.90, reason: 'المشروع شقة مستقلة' };
  }
  const missing_information = [];
  if (!building) missing_information.push('نوع المبنى');
  if (building === 'other' && !request.building_subtype) missing_information.push('وصف نوع المبنى');
  if (!explicit_values.scope) missing_information.push('نطاق العمل');
  if (!explicit_values.finish_level) missing_information.push('مستوى التشطيب');
  return { explicit_values, confirmed_inferred_values, unconfirmed_inferred_values, missing_information, questions: [] };
}

function buildApprovedBoq(sections = [], approvals = {}) {
  const approvedOptional = new Set(approvals.optional_item_codes || []);
  const selectedAlternatives = new Set(approvals.selected_alternative_codes || []);
  const excluded = new Set(['forbidden','excluded','pending_measurement','pending_confirmation','invalid']);
  const seen = new Set();
  const approved = [];
  
  for (const section of sections) {
    for (const item of section.items || []) {
      const classification = String(item.classification || 'required').toLowerCase();
      
      // Skip excluded items
      if (!item.code || seen.has(item.code) || excluded.has(classification)) continue;
      
      // Handle optional items - require approval
      if (classification === 'optional' && !approvedOptional.has(item.code) && item.user_approved !== true) continue;
      
      // Handle alternative items - require selection
      if (classification === 'alternative' && !selectedAlternatives.has(item.code) && item.selected !== true) continue;
      
      // Handle conditional items - include them but mark for confirmation
      if (classification === 'conditional' || classification === 'pending_information' || classification === 'requires_measurement' || classification === 'requires_engineering_design') {
        // Include conditional items but mark them
        if (item.needs_confirmation === false || item.requires_confirmation === false) {
          // Explicitly confirmed, include it
        } else {
          // Not confirmed, skip for now but could be shown separately
          continue;
        }
      }
      
      // Skip items that need confirmation (unless explicitly confirmed)
      if (item.needs_confirmation === true && item.user_confirmed !== true) continue;
      if (item.requires_confirmation === true && item.user_confirmed !== true) continue;
      
      const quantity = Number(item.quantity);
      // Only a documented, safe quantity may become contractual BOQ data.
      // Legacy callers may not yet carry quantity metadata; the new pipeline always does.
      if (item.can_enter_approved_boq === false) continue;
      if (item.quantity_state && !['exact_from_explicit_count','calculated_from_confirmed_area','calculated_from_zone_geometry'].includes(item.quantity_state)) continue;
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      
      seen.add(item.code);
      approved.push({ 
        ...item, 
        section_code: section.code, 
        section_name: section.name, 
        quantity,
        final_classification: classification
      });
    }
  }
  
  return approved;
}

module.exports = { PROJECT_CATEGORIES, BUILDING_TYPES, PROJECT_CONDITIONS, SCOPES, OWNERSHIP_SCOPES, FINISH_LEVELS, normalizeArabic, canonicalBuildingType, inferBuildingType, categoryForBuilding, normalizeProjectRequest, toLegacyRequest, parseProject, buildApprovedBoq };
