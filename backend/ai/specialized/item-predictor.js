'use strict';
const fs = require('fs');
const path = require('path');
const modelPath = path.join(__dirname, '..', 'models', 'item-presence-v1', 'model.json');
let cached = null;
const normalize = s => String(s || '').toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = s => [...new Set(normalize(s).split(/\s+/).filter(x => x.length > 2 && !/^\d+$/.test(x)))];
function load() { if (!cached && fs.existsSync(modelPath)) cached = JSON.parse(fs.readFileSync(modelPath, 'utf8')); return cached; }
function projectKey(p) { return [p.building_type || '', p.project_condition || '', p.scope || '', p.ownership_scope || '', p.finish_level || ''].join('|'); }
function findProfile(model, p) {
  const key = projectKey(p), keys = Object.keys(model.profiles);
  if (model.profiles[key]) return model.profiles[key];
  const prefix = key.split('|').slice(0, 3).join('|'), matches = keys.filter(x => x.split('|').slice(0, 3).join('|') === prefix);
  if (!matches.length) return model.profiles[keys.find(x => x.split('|')[0] === p.building_type)];
  const merged = { count: 0, labels: {} };
  for (const match of matches) { const profile = model.profiles[match]; merged.count += profile.count; for (const [code, labels] of Object.entries(profile.labels)) for (const [label, count] of Object.entries(labels)) { merged.labels[code] ||= {}; merged.labels[code][label] = (merged.labels[code][label] || 0) + count; } }
  return merged;
}
function predict(request, understood = {}) {
  const model = load(); if (!model) return null;
  const project = { ...understood, ...request }, profile = findProfile(model, project);
  if (!profile) return { model_version: model.model_version, items: [], warnings: ['لا يوجد ملف تدريبي مطابق لنوع المشروع'] };
  const descriptionTokens = tokens(`${request.title || ''} ${request.description || request.description_ar || ''}`), items = [];
  for (const [code, counts] of Object.entries(profile.labels)) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0), ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    let classification = ranked[0][0], confidence = ranked[0][1] / Math.max(1, total);
    const evidence = descriptionTokens.filter(t => (model.tokenStats[t]?.[code]?.positive || 0) > (model.tokenStats[t]?.[code]?.excluded || 0)).slice(0, 3);
    if (!evidence.length && (request.description || request.description_ar)) evidence.push(String(request.description || request.description_ar).slice(0, 120));
    if (classification === 'core' && confidence < 0.45) classification = 'conditional';
    // A core prediction must never override an exclusion observed for the same
    // structured project profile. Ambiguous cases remain conditional and require
    // explicit confirmation instead of silently inserting a forbidden item.
    if (classification === 'core' && (counts.excluded || 0) > 0) classification = 'conditional';
    items.push({ item_code: code, classification, presence_confidence: +confidence.toFixed(3), evidence_from_description: evidence, reason: evidence.length ? `ارتبط البند بالدليل: ${evidence.join('، ')}` : 'ارتبط البند بنوع المشروع ونطاقه في البيانات المعتمدة', requires_confirmation: classification !== 'core' });
  }
  const normalizedText = normalize(`${request.title || ''} ${request.description || request.description_ar || ''}`);
  const forceExcluded = new Map();
  if (project.building_type === 'apartment' && project.ownership_scope === 'single_unit_only') for (const code of ['ELV-001','FAC-004','INS-003','PLM-012','PLM-013']) forceExcluded.set(code, 'النطاق يخص وحدة سكنية مستقلة لا المبنى كاملًا');
  if (project.building_type === 'cafe' && /دون طبخ|بدون طبخ|مشروبات فقط|قهوه فقط/.test(normalizedText)) for (const code of ['GAS-001','HVAC-012','HVAC-013','FIR-011','PLM-014']) forceExcluded.set(code, 'الوصف ينفي وجود الطبخ التجاري');
  if (project.building_type === 'clinic' && /دون اشعه|بدون اشعه|لا يوجد اشعه/.test(normalizedText)) for (const code of ['MED-002']) forceExcluded.set(code, 'الوصف ينفي وجود الأشعة');
  if (project.building_type === 'warehouse' && /دون تبريد|بدون تبريد|جاف/.test(normalizedText)) forceExcluded.set('HVAC-015', 'المستودع جاف والوصف ينفي التبريد');
  if (['existing_building_fitout','renovation','shell_and_core'].includes(project.project_condition)) for (const code of ['EXC-001','CON-001','CON-002','CON-003']) forceExcluded.set(code, 'حالة المشروع لا تبدأ من الحفر والأساسات');
  for (const item of items) if (forceExcluded.has(item.item_code)) Object.assign(item, { classification:'excluded', presence_confidence:0.99, reason:forceExcluded.get(item.item_code), requires_confirmation:false });
  return { model_version: model.model_version, items, questions: [], warnings: [], understood_project: project };
}
module.exports = { predict, load };
