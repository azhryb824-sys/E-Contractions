'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const aiRoot = path.join(__dirname, '..');
const bundleRoot = process.argv[2] || path.join(aiRoot, 'data', 'complete-training-bundle-v1', 'expanded');
const itemRoot = path.join(bundleRoot, 'contractor_item_prediction_340k_v3');
const outputRoot = path.join(aiRoot, 'models', 'complete-bundle-v1');
const itemOutput = path.join(aiRoot, 'models', 'item-presence-v1');

const splitFromName = file => path.basename(file).split('-')[0];
const projectKey = project => {
  const p = project || {};
  return [p.building_type || '', p.project_condition || '', p.scope || '', p.ownership_scope || '', p.finish_level || ''].join('|');
};
const jsonFiles = root => fs.readdirSync(path.join(root, 'data'), { recursive: true })
  .filter(name => name.endsWith('.jsonl.gz'))
  .map(name => path.join(root, 'data', name))
  .sort();

async function eachRow(files, visitor) {
  let count = 0;
  for (const file of files) {
    const input = fs.createReadStream(file).pipe(zlib.createGunzip());
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      await visitor(JSON.parse(line), file);
      count += 1;
    }
  }
  return count;
}

function labels(row) {
  const source = row.labels || row.item_labels || {};
  const result = {};
  for (const code of source.core_items || []) result[code] = 'core';
  for (const code of source.conditional_items || []) result[code] = 'conditional';
  for (const value of source.optional_items || []) result[value.item_code || value] = 'optional';
  for (const group of source.alternative_groups || []) {
    for (const code of group.candidates || []) result[code] = code === group.selected ? 'core' : 'alternative';
  }
  for (const value of source.excluded_items || []) result[value.item_code || value] = 'excluded';
  return result;
}

function ensureProfile(model, key) {
  model.profiles[key] ||= { count: 0, labels: {} };
  return model.profiles[key];
}

async function trainItems() {
  const files = jsonFiles(itemRoot);
  const trainFiles = files.filter(file => splitFromName(file) === 'train');
  const model = { profiles: {}, tokenStats: {}, model_version: 'item-presence-v2.0.0', dataset_version: 'contractor_item_prediction_340k_v3' };
  const seen = new Map();
  const splitCounts = {};

  await eachRow(files, row => {
    const split = row.split || splitFromName(row.__file || '');
    splitCounts[split] = (splitCounts[split] || 0) + 1;
    const identity = row.content_hash || `${row.seed_project_id}:${row.semantic_variant}:${row.language_variant}`;
    if (seen.has(identity) && seen.get(identity) !== split) throw new Error(`تسرب بين التقسيمات: ${identity}`);
    seen.set(identity, split);
  });

  model.training_projects = await eachRow(trainFiles, row => {
    const profile = ensureProfile(model, projectKey(row.normalized_project));
    profile.count += 1;
    for (const [code, classification] of Object.entries(labels(row))) {
      profile.labels[code] ||= {};
      profile.labels[code][classification] = (profile.labels[code][classification] || 0) + 1;
    }
  });

  function findProfile(row) {
    const key = projectKey(row.normalized_project);
    if (model.profiles[key]) return model.profiles[key];
    const prefix = key.split('|').slice(0, 3).join('|');
    return model.profiles[Object.keys(model.profiles).find(candidate => candidate.startsWith(prefix))];
  }
  async function evaluate(split) {
    let projects = 0, tp = 0, fp = 0, fn = 0, forbidden = 0, conflicts = 0, predicted = 0;
    await eachRow(files.filter(file => splitFromName(file) === split), row => {
      projects += 1;
      const truth = labels(row), profile = findProfile(row);
      const core = new Set();
      for (const [code, counts] of Object.entries(profile?.labels || {})) {
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const hasForbiddenExample = (counts.excluded || 0) > 0;
        if (!hasForbiddenExample && ranked[0]?.[0] === 'core' && ranked[0][1] / Object.values(counts).reduce((a, b) => a + b, 0) >= 0.45) core.add(code);
      }
      for (const code of core) { predicted += 1; if (truth[code] === 'core') tp += 1; else { fp += 1; if (truth[code] === 'excluded') forbidden += 1; } }
      for (const [code, value] of Object.entries(truth)) if (value === 'core' && !core.has(code)) fn += 1;
      const source = row.labels || row.item_labels || {};
      for (const group of source.alternative_groups || []) if ((group.candidates || []).filter(code => core.has(code)).length > 1) conflicts += 1;
    });
    const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
    return { projects, precision, core_item_recall: recall, micro_f1: 2 * precision * recall / (precision + recall || 1), forbidden_item_rate: forbidden / (predicted || 1), exclusive_conflict_rate: conflicts / (projects || 1) };
  }
  model.trained_at = new Date().toISOString();
  model.approved_by_user = true;
  const metrics = { split_counts: splitCounts, training_profiles: Object.keys(model.profiles).length, test: await evaluate('test'), holdout: await evaluate('holdout') };
  return { model, metrics };
}

function aggregateNumber(target, value, min, max) {
  target.count += 1;
  if (Number.isFinite(value)) { target.value_sum += value; target.value_count += 1; }
  if (Number.isFinite(min)) target.min_sum += min;
  if (Number.isFinite(max)) target.max_sum += max;
}

async function trainStructured(packageName, field) {
  const root = path.join(bundleRoot, packageName), files = jsonFiles(root);
  const profiles = {}, splits = {}, policies = [];
  await eachRow(files.filter(file => splitFromName(file) === 'train'), row => {
    const key = projectKey(row.normalized_project);
    profiles[key] ||= { count: 0, items: {} };
    profiles[key].count += 1;
    if (row.policy) policies.push(row.policy);
    for (const value of row[field] || []) {
      const code = value.item_code || value.trade_code;
      if (!code) continue;
      const item = profiles[key].items[code] ||= { count: 0, value_sum: 0, value_count: 0, min_sum: 0, max_sum: 0, unit: value.unit || null, driver: value.driver || null, status: value.status || null, confidence_sum: 0, confirmation_count: 0, trade_code: value.trade_code || null, trade_ar: value.trade_ar || null };
      const numeric = field === 'labor' ? value.labor_hours?.typical : value.quantity;
      const min = field === 'labor' ? value.labor_hours?.low : value.range_min;
      const max = field === 'labor' ? value.labor_hours?.high : value.range_max;
      aggregateNumber(item, numeric, min, max);
      item.confidence_sum += Number(value.confidence || 0);
      if (value.requires_confirmation || value.requires_local_calibration) item.confirmation_count += 1;
    }
  });
  const model = { model_version: `${field}-baseline-v1.0.0`, dataset_version: packageName, trained_at: new Date().toISOString(), production_approved: false, profiles, policy: policies[0] || {} };
  for (const profile of Object.values(profiles)) for (const item of Object.values(profile.items)) {
    item.mean = item.value_count ? item.value_sum / item.value_count : null;
    item.range_min_mean = item.count ? item.min_sum / item.count : null;
    item.range_max_mean = item.count ? item.max_sum / item.count : null;
    item.confidence_mean = item.count ? item.confidence_sum / item.count : 0;
    item.requires_confirmation_rate = item.count ? item.confirmation_count / item.count : 1;
  }
  async function evaluate(split) {
    let records = 0, values = 0, absoluteError = 0, percentageError = 0, covered = 0, nullSafe = 0;
    await eachRow(files.filter(file => splitFromName(file) === split), row => {
      records += 1;
      const profile = profiles[projectKey(row.normalized_project)];
      for (const actual of row[field] || []) {
        const code = actual.item_code || actual.trade_code, prediction = profile?.items?.[code];
        const value = field === 'labor' ? actual.labor_hours?.typical : actual.quantity;
        if (!Number.isFinite(value)) { if (prediction?.mean == null || actual.requires_confirmation) nullSafe += 1; continue; }
        if (!prediction || !Number.isFinite(prediction.mean)) continue;
        values += 1; absoluteError += Math.abs(prediction.mean - value); percentageError += Math.abs(prediction.mean - value) / Math.max(1, Math.abs(value));
        if (value >= prediction.range_min_mean && value <= prediction.range_max_mean) covered += 1;
      }
    });
    return { records, evaluated_values: values, mae: absoluteError / (values || 1), mape: percentageError / (values || 1), range_coverage: covered / (values || 1), null_safe_records: nullSafe };
  }
  for (const split of ['test', 'holdout']) splits[split] = await evaluate(split);
  return { model, metrics: splits };
}

async function summarizeAssumptions() {
  const root = path.join(bundleRoot, 'assumptions_17k'), files = jsonFiles(root), profiles = {}, splitCounts = {};
  await eachRow(files, row => {
    splitCounts[row.split] = (splitCounts[row.split] || 0) + 1;
    if (row.split !== 'train') return;
    const key = projectKey(row.normalized_project), a = row.assumptions || {};
    const profile = profiles[key] ||= { count: 0, explicit_fields: {}, derived_fields: {}, forbidden: {}, confirmation_fields: {} };
    profile.count += 1;
    for (const value of a.explicit || []) profile.explicit_fields[value.field] = (profile.explicit_fields[value.field] || 0) + 1;
    for (const value of a.derived || []) profile.derived_fields[value.field] = (profile.derived_fields[value.field] || 0) + 1;
    for (const value of a.forbidden || []) profile.forbidden[value] = (profile.forbidden[value] || 0) + 1;
    for (const value of a.confirmation_required || []) profile.confirmation_fields[value] = (profile.confirmation_fields[value] || 0) + 1;
  });
  return { model: { model_version: 'assumption-policy-v1.0.0', dataset_version: 'assumptions_17k', production_approved: false, profiles }, metrics: { split_counts: splitCounts, profiles: Object.keys(profiles).length } };
}

async function validateCatalog() {
  const root = path.join(bundleRoot, 'catalog_integrity');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'item_catalog.json'), 'utf8'));
  const mapping = JSON.parse(fs.readFileSync(path.join(root, 'ui_catalog_mapping_tests.json'), 'utf8'));
  const regression = JSON.parse(fs.readFileSync(path.join(root, 'office_30m2_regression.json'), 'utf8'));
  const items = Array.isArray(catalog) ? catalog : catalog.items || [];
  const codes = new Set(items.map(item => item.code || item.item_code));
  const duplicates = items.length - codes.size;
  return { catalog_items: items.length, duplicate_codes: duplicates, mapping_tests: Array.isArray(mapping) ? mapping.length : Object.keys(mapping).length, office_regression_loaded: Boolean(regression) };
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(itemOutput, { recursive: true });
  const items = await trainItems();
  const quantities = await trainStructured('quantity_17k', 'quantities');
  const labor = await trainStructured('labor_17k', 'labor');
  const assumptions = await summarizeAssumptions();
  const catalog = await validateCatalog();
  const integrated = { records: {}, catalog, production_approved: false };
  await eachRow(jsonFiles(path.join(bundleRoot, 'integrated_17k')), row => { integrated.records[row.split] = (integrated.records[row.split] || 0) + 1; });
  fs.writeFileSync(path.join(itemOutput, 'model.json'), JSON.stringify(items.model));
  fs.writeFileSync(path.join(itemOutput, 'metrics.json'), JSON.stringify(items.metrics, null, 2));
  for (const [name, result] of Object.entries({ quantities, labor, assumptions })) {
    fs.writeFileSync(path.join(outputRoot, `${name}.json`), JSON.stringify(result.model));
    fs.writeFileSync(path.join(outputRoot, `${name}-metrics.json`), JSON.stringify(result.metrics, null, 2));
  }
  const report = { dataset: 'contractor_complete_training_bundle_v1', trained_at: new Date().toISOString(), item_prediction: items.metrics, quantities: quantities.metrics, labor: labor.metrics, assumptions: assumptions.metrics, integrated, safety: { engineering_reviewed: false, production_approved: false, quantity_and_labor_require_confirmation: true } };
  fs.writeFileSync(path.join(outputRoot, 'training-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
