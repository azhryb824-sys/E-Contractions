'use strict';

// Trains only from the supplied train split. Validation, test and holdout are
// read-only evaluation splits; this is intentionally a shadow-model artifact.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'data', 'apartment-quantity-30k-v2', 'raw', 'contractor_apartment_quantity_30k_v2');
const output = path.join(__dirname, '..', 'models', 'apartment-quantity-30k-v2');
const splits = { train: [21000, 850155], validation: [4500, 181947], test: [3000, 121288], holdout: [1500, 62489] };
const regressionStates = new Set(['exact_from_explicit_count', 'calculated_from_confirmed_area', 'calculated_from_confirmed_dimensions', 'calculated_from_zone_geometry']);

function streamJsonl(file, onRow) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(file).pipe(zlib.createGunzip());
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    let count = 0;
    lines.on('line', line => { if (line) { count++; onRow(JSON.parse(line)); } });
    lines.once('close', () => resolve(count));
    input.once('error', reject); lines.once('error', reject);
  });
}
function key(row) { return `${row.item_code}|${row.zone_id}`; }
function mode(counts) { return Object.entries(counts || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null; }
function add(counts, value) { if (value !== null && value !== undefined) counts[value] = (counts[value] || 0) + 1; }
function emptyStat() { return { n: 0, state: {}, driver: {}, unit: {}, zone: {}, classification: {}, approved: {}, formula: {}, requiredInputs: {}, reg: { n: 0, sum: 0, min: null, max: null } }; }
function addRow(stats, row) {
  const stat = stats[key(row)] ||= emptyStat(); stat.n++;
  for (const [field, value] of [['state', row.quantity_state], ['driver', row.quantity_driver], ['unit', row.unit], ['zone', row.zone_id], ['classification', row.classification], ['approved', String(Boolean(row.can_enter_approved_boq))], ['formula', row.formula_id]]) add(stat[field], value);
  for (const input of row.required_inputs || []) add(stat.requiredInputs, input);
  if (regressionStates.has(row.quantity_state) && Number.isFinite(row.quantity)) {
    const r = stat.reg; r.n++; r.sum += row.quantity; r.min = r.min === null ? row.quantity : Math.min(r.min, row.quantity); r.max = r.max === null ? row.quantity : Math.max(r.max, row.quantity);
  }
}
function predict(stat) {
  const reg = stat?.reg || {}; return { quantity_state: mode(stat?.state), quantity_driver: mode(stat?.driver), unit: mode(stat?.unit), zone_id: mode(stat?.zone), classification: mode(stat?.classification), can_enter_approved_boq: mode(stat?.approved) === 'true', formula_id: mode(stat?.formula), required_inputs: Object.keys(stat?.requiredInputs || {}).sort(), quantity: reg.n ? reg.sum / reg.n : null, range_min: reg.min, range_max: reg.max };
}
async function validateAndIndex() {
  const indexes = {}, allProjects = new Set(), report = { splits: {}, leakage: [], item_project_mismatches: 0 };
  for (const [split, expected] of Object.entries(splits)) {
    const ids = new Set();
    const projectFile = path.join(root, 'data', 'projects', `${split}-001.jsonl.gz`);
    const projects = await streamJsonl(projectFile, row => {
      if (row.split !== split) throw new Error(`project split mismatch: ${row.project_id}`);
      if (ids.has(row.project_id) || allProjects.has(row.project_id)) report.leakage.push(row.project_id);
      ids.add(row.project_id); allProjects.add(row.project_id);
    });
    if (projects !== expected[0]) throw new Error(`${split} project count ${projects}, expected ${expected[0]}`);
    indexes[split] = ids; report.splits[split] = { projects };
  }
  if (report.leakage.length) throw new Error(`project split leakage: ${report.leakage.slice(0, 5).join(', ')}`);
  for (const [split, expected] of Object.entries(splits)) {
    let mismatches = 0;
    const items = await streamJsonl(path.join(root, 'data', 'items', `${split}-001.jsonl.gz`), row => {
      if (row.split !== split || !indexes[split].has(row.project_id)) mismatches++;
    });
    if (items !== expected[1]) throw new Error(`${split} item count ${items}, expected ${expected[1]}`);
    if (mismatches) throw new Error(`${split} has ${mismatches} item/project split mismatches`);
    report.splits[split].items = items;
  }
  return report;
}
function metrics() { return { records: 0, state_correct: 0, driver_correct: 0, unit_correct: 0, zone_correct: 0, approval_tp: 0, approval_fp: 0, approval_fn: 0, regression_records: 0, absolute_error: 0, code_name_mismatches: 0 }; }
function finalMetrics(m) {
  const precision = m.approval_tp / (m.approval_tp + m.approval_fp || 1), recall = m.approval_tp / (m.approval_tp + m.approval_fn || 1);
  return { records: m.records, quantity_state_accuracy: +(m.state_correct / (m.records || 1)).toFixed(6), quantity_driver_accuracy: +(m.driver_correct / (m.records || 1)).toFixed(6), unit_accuracy: +(m.unit_correct / (m.records || 1)).toFixed(6), zone_accuracy: +(m.zone_correct / (m.records || 1)).toFixed(6), safe_abstention_precision: +precision.toFixed(6), safe_abstention_recall: +recall.toFixed(6), safe_abstention_f1: +((2 * precision * recall) / (precision + recall || 1)).toFixed(6), regression_records: m.regression_records, conditional_regression_mae: +(m.absolute_error / (m.regression_records || 1)).toFixed(6), code_name_mismatches: m.code_name_mismatches };
}
async function evaluate(split, stats, catalog) {
  const m = metrics();
  await streamJsonl(path.join(root, 'data', 'items', `${split}-001.jsonl.gz`), row => {
    m.records++; const p = predict(stats[key(row)]); const catalogName = catalog[row.item_code]?.name_ar;
    if (catalogName && catalogName !== row.item_name_ar) m.code_name_mismatches++;
    if (p.quantity_state === row.quantity_state) m.state_correct++;
    if (p.quantity_driver === row.quantity_driver) m.driver_correct++;
    if (p.unit === row.unit) m.unit_correct++;
    if (p.zone_id === row.zone_id) m.zone_correct++;
    const truth = Boolean(row.can_enter_approved_boq), guessed = p.can_enter_approved_boq;
    if (guessed && truth) m.approval_tp++; else if (guessed) m.approval_fp++; else if (truth) m.approval_fn++;
    if (regressionStates.has(row.quantity_state) && Number.isFinite(row.quantity) && Number.isFinite(p.quantity)) { m.regression_records++; m.absolute_error += Math.abs(p.quantity - row.quantity); }
  });
  return finalMetrics(m);
}
async function main() {
  if (!fs.existsSync(root)) throw new Error(`Dataset not found: ${root}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const catalogRows = JSON.parse(fs.readFileSync(path.join(root, 'catalogs', 'item_catalog.json'), 'utf8'));
  const catalog = Object.fromEntries(catalogRows.map(row => [row.item_code, row]));
  const integrity = await validateAndIndex();
  const stats = {};
  await streamJsonl(path.join(root, 'data', 'items', 'train-001.jsonl.gz'), row => addRow(stats, row));
  const validation = await evaluate('validation', stats, catalog);
  const test = await evaluate('test', stats, catalog);
  const holdout = await evaluate('holdout', stats, catalog);
  if (validation.code_name_mismatches || test.code_name_mismatches || holdout.code_name_mismatches) throw new Error('catalog code/name mismatch detected');
  const model = { model_version: 'apartment-quantity-30k-v2.0.0-shadow', trained_at: new Date().toISOString(), mode: 'shadow_only', dataset: { name: manifest.dataset_name, version: manifest.version, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'manifest.json'))).digest('hex') }, training_policy: { train_split_only: true, validation_used_for_tuning: false, test_used_for_tuning: false, holdout_used_for_tuning: false, regression_states: [...regressionStates], null_quantity_policy: 'excluded_from_regression' }, components: ['quantity_state', 'quantity_driver', 'required_inputs', 'zone_assignment', 'unit_validation', 'safe_abstention', 'formula_selection', 'conditional_quantity_regression'], stats };
  const report = { integrity, validation, test, holdout, limitations: ['Synthetic, rule-grounded data; engineering_reviewed is false.', 'Model is shadow-only and does not change approved BOQ output.', 'Quantities are emitted only where a calculable state and observed evidence exist.'] };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'model.json'), JSON.stringify(model));
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'model-card.md'), `# Apartment quantity shadow model\n\n- Dataset: ${manifest.dataset_name} ${manifest.version}\n- Training: train split only (${splits.train[0]} projects)\n- Deployment mode: shadow only\n- Engineering review: no\n- Holdout was evaluation-only; no threshold tuning was performed.\n`);
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
