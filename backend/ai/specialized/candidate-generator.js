'use strict';
const fs = require('fs');
const path = require('path');
const { predict: specializedPredict } = require('./item-predictor');

const KNOWLEDGE_DIR = path.join(__dirname, '..', 'data', 'knowledge');
const CATALOGS_DIR = path.join(__dirname, '..', 'data', 'catalogs');

// Load section coverage rules
let sectionCoverage = null;
try {
  sectionCoverage = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, 'project-section-coverage.json'), 'utf8'));
} catch (e) {
  console.warn('Failed to load section coverage rules:', e.message);
  sectionCoverage = { coverage_rules: {} };
}

// Load items catalog
let itemsCatalog = [];
try {
  itemsCatalog = JSON.parse(fs.readFileSync(path.join(CATALOGS_DIR, 'items.json'), 'utf8')) || [];
} catch (e) {
  console.warn('Failed to load items catalog:', e.message);
}

// Load sections catalog
let sectionsCatalog = [];
try {
  sectionsCatalog = JSON.parse(fs.readFileSync(path.join(CATALOGS_DIR, 'sections.json'), 'utf8')) || [];
} catch (e) {
  console.warn('Failed to load sections catalog:', e.message);
}

/**
 * High Recall Candidate Generation
 * الهدف: استدعاء معظم البنود المحتملة الصحيحة
 * يسمح بمرشحين أكثر ولا يفلتر بشكل صارم
 */
function generateHighRecallCandidates(project, request = {}) {
  const buildingType = project.building_type || request.building_type || '';
  const scope = project.scope || request.scope || '';
  const finishLevel = project.finish_level || request.finish_level || '';
  
  // Find matching coverage rule
  const ruleKey = findCoverageRuleKey(buildingType, scope);
  const coverageRule = sectionCoverage.coverage_rules[ruleKey];
  
  const candidates = [];
  const sectionCandidates = {};
  
  // Initialize sections from coverage rules
  if (coverageRule && coverageRule.required_sections) {
    for (const sectionRule of coverageRule.required_sections) {
      const sectionCode = sectionRule.section;
      sectionCandidates[sectionCode] = {
        section: sectionRule,
        candidates: [],
        status: sectionRule.status,
        reason: sectionRule.reason
      };
    }
  }
  
  // Add items from catalog based on section
  for (const item of itemsCatalog) {
    if (!item || !item.code) continue;
    
    // Find which section this item belongs to
    const sectionName = item.section || '';
    const sectionDef = sectionsCatalog.find(s => s.name === sectionName);
    
    if (!sectionDef) continue;
    
    // Check if section is in our coverage rules
    if (sectionCandidates[sectionDef.code]) {
      sectionCandidates[sectionDef.code].candidates.push({
        item_code: item.code,
        name_ar: item.name_ar,
        section: sectionDef.code,
        section_name: sectionDef.name,
        classification_default: item.classification_default || 'optional',
        quantity_driver: item.quantity_driver,
        source: 'catalog_section_coverage'
      });
    }
  }
  
  // Convert to flat list with section info
  for (const [sectionCode, sectionData] of Object.entries(sectionCandidates)) {
    for (const candidate of sectionData.candidates) {
      candidates.push({
        ...candidate,
        section_status: sectionData.status,
        section_reason: sectionData.reason
      });
    }
  }
  
  // Add specialized model predictions
  const specializedPrediction = specializedPredict(request, project);
  if (specializedPrediction && specializedPrediction.items) {
    for (const predItem of specializedPrediction.items) {
      // Check if already in candidates
      const existing = candidates.find(c => c.item_code === predItem.item_code);
      if (!existing) {
        candidates.push({
          item_code: predItem.item_code,
          classification: predItem.classification,
          presence_confidence: predItem.presence_confidence,
          evidence_from_description: predItem.evidence_from_description,
          reason: predItem.reason,
          requires_confirmation: predItem.requires_confirmation,
          source: 'specialized_model'
        });
      } else {
        // Merge with existing
        existing.classification = predItem.classification || existing.classification;
        existing.presence_confidence = predItem.presence_confidence || existing.presence_confidence;
        existing.evidence_from_description = predItem.evidence_from_description || existing.evidence_from_description;
        existing.reason = predItem.reason || existing.reason;
        existing.requires_confirmation = predItem.requires_confirmation;
        existing.source = 'catalog_plus_model';
      }
    }
  }
  
  return {
    candidates,
    section_coverage: sectionCandidates,
    coverage_rule_key: ruleKey,
    total_candidates: candidates.length
  };
}

/**
 * High Precision Classification
 * الهدف: تصنف المرشحين بدقة وتستبعد غير المناسب
 */
function classifyWithHighPrecision(candidates, project, request = {}) {
  const classified = [];
  const excluded = [];
  const pending = [];
  
  for (const candidate of candidates) {
    let classification = candidate.classification || candidate.classification_default || 'optional';
    let confidence = candidate.presence_confidence || 0.5;
    let requiresConfirmation = candidate.requires_confirmation !== false;
    
    // Apply classification rules
    if (classification === 'core' && confidence < 0.45) {
      classification = 'recommended';
      requiresConfirmation = true;
    }
    
    // Check for exclusions based on project parameters
    const isExcluded = checkExclusions(candidate, project, request);
    if (isExcluded) {
      excluded.push({
        ...candidate,
        classification: 'excluded',
        exclusion_reason: isExcluded.reason
      });
      continue;
    }
    
    // Determine final classification
    const finalClassification = mapToStandardClassification(classification, candidate.section_status);
    
    const item = {
      ...candidate,
      classification: finalClassification,
      confidence: confidence,
      requires_confirmation: requiresConfirmation || finalClassification === 'conditional' || finalClassification === 'pending_information'
    };
    
    // Route to appropriate bucket
    if (finalClassification === 'excluded') {
      excluded.push(item);
    } else if (finalClassification === 'pending_information' || finalClassification === 'requires_measurement' || finalClassification === 'requires_engineering_design') {
      pending.push(item);
    } else {
      classified.push(item);
    }
  }
  
  return {
    classified,
    excluded,
    pending,
    total_classified: classified.length,
    total_excluded: excluded.length,
    total_pending: pending.length
  };
}

/**
 * Check if item should be excluded based on project parameters
 */
function checkExclusions(candidate, project, request = {}) {
  const buildingType = project.building_type || '';
  const scope = project.scope || '';
  const normalizedText = `${request.title || ''} ${request.description || ''}`.toLowerCase();
  
  // Apartment single unit exclusions
  if (buildingType === 'apartment' && project.ownership_scope === 'single_unit_only') {
    const excludedCodes = ['ELV-001', 'FAC-004', 'INS-003', 'PLM-012', 'PLM-013'];
    if (excludedCodes.includes(candidate.item_code)) {
      return { reason: 'النطاق يخص وحدة سكنية مستقلة لا المبنى كاملًا' };
    }
  }
  
  // Cafe without cooking
  if (buildingType === 'cafe' && /دون طبخ|بدون طبخ|مشروبات فقط|قهوه فقط/.test(normalizedText)) {
    const excludedCodes = ['GAS-001', 'HVAC-012', 'HVAC-013', 'FIR-011', 'PLM-014'];
    if (excludedCodes.includes(candidate.item_code)) {
      return { reason: 'الوصف ينفي وجود الطبخ التجاري' };
    }
  }
  
  // Clinic without x-ray
  if (buildingType === 'clinic' && /دون اشعه|بدون اشعه|لا يوجد اشعه/.test(normalizedText)) {
    if (candidate.item_code === 'MED-002') {
      return { reason: 'الوصف ينفي وجود الأشعة' };
    }
  }
  
  // Warehouse without cooling
  if (buildingType === 'warehouse' && /دون تبريد|بدون تبريد|جاف/.test(normalizedText)) {
    if (candidate.item_code === 'HVAC-015') {
      return { reason: 'المستودع جاف والوصف ينفي التبريد' };
    }
  }
  
  // Renovation projects don't need excavation
  if (['existing_building_fitout', 'renovation', 'shell_and_core'].includes(scope)) {
    const excludedCodes = ['EXC-001', 'CON-001', 'CON-002', 'CON-003'];
    if (excludedCodes.includes(candidate.item_code)) {
      return { reason: 'حالة المشروع لا تبدأ من الحفر والأساسات' };
    }
  }
  
  return null;
}

/**
 * Map classification to standard types
 */
function mapToStandardClassification(classification, sectionStatus) {
  const standardMap = {
    'core': 'required',
    'required': 'required',
    'essential': 'required',
    'ضروري': 'required',
    'أساسي': 'required',
    
    'recommended': 'recommended',
    'موصى_به': 'recommended',
    'موصى به': 'recommended',
    
    'conditional': 'conditional',
    'مشروط': 'conditional',
    
    'optional': 'optional',
    'اختياري': 'optional',
    'تحسيني': 'optional',
    
    'alternative': 'alternative',
    'بديل': 'alternative',
    
    'excluded': 'excluded',
    'forbidden': 'excluded',
    'ممنوع': 'excluded'
  };
  
  let mapped = standardMap[classification] || classification;
  
  // Override based on section status
  if (sectionStatus === 'conditional' && mapped === 'required') {
    mapped = 'conditional';
  }
  
  // Check for special cases
  if (mapped === 'required' && classification.includes('pending')) {
    mapped = 'pending_information';
  }
  
  return mapped;
}

/**
 * Find the coverage rule key for the given building type and scope
 */
function findCoverageRuleKey(buildingType, scope) {
  // Normalize inputs
  const normalizedBT = String(buildingType).toLowerCase().trim();
  const normalizedScope = String(scope).toLowerCase().trim();
  
  // Direct match
  const directKey = `${normalizedBT}_${normalizedScope}`;
  if (sectionCoverage.coverage_rules[directKey]) {
    return directKey;
  }
  
  // Fallback mappings
  const mappings = {
    'apartment': 'apartment_fitout',
    'office': 'office_fitout',
    'villa': 'villa_full_construction',
    'shop': 'retail_shop'
  };
  
  const fallbackKey = mappings[normalizedBT] || `${normalizedBT}_fitout`;
  return fallbackKey;
}

/**
 * Main function to generate and classify items
 */
function generateAndClassifyItems(project, request = {}) {
  // Stage 1: High Recall Candidate Generation
  const candidateResult = generateHighRecallCandidates(project, request);
  
  // Stage 2: High Precision Classification
  const classificationResult = classifyWithHighPrecision(
    candidateResult.candidates,
    project,
    request
  );
  
  return {
    ...classificationResult,
    section_coverage: candidateResult.section_coverage,
    coverage_rule_key: candidateResult.coverage_rule_key,
    total_candidates: candidateResult.total_candidates,
    pipeline_trace: [
      'high_recall_candidate_generation',
      'section_coverage_analysis',
      'specialized_model_integration',
      'high_precision_classification',
      'exclusion_filtering',
      'final_classification'
    ]
  };
}

module.exports = {
  generateHighRecallCandidates,
  classifyWithHighPrecision,
  generateAndClassifyItems,
  findCoverageRuleKey
};
