'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { predictFromModel, tokens } = require('./space-state-predictor');

const root = process.argv[2] || path.join(__dirname, '..', 'data', 'sparse-spaces-complete-bundle-v1', 'expanded', 'integrated_sparse_spaces_51k');
const output = path.join(__dirname, '..', 'models', 'sparse-spaces-v1');
const files = fs.readdirSync(path.join(root, 'data'), { recursive: true }).filter(name => name.endsWith('.jsonl.gz')).map(name => path.join(root, 'data', name)).sort();
const splitOf = file => path.basename(file).split('-')[0];

async function eachRow(selected, visitor) {
  let count = 0;
  for (const file of selected) {
    const lines = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    for await (const line of lines) if (line.trim()) { visitor(JSON.parse(line)); count += 1; }
  }
  return count;
}

const model = { model_version: 'sparse-spaces-v1.0.0', dataset_version: 'integrated_sparse_spaces_51k', user_accuracy_designation: 'high', dimensions: {}, classifiers: {} };
function stateOf(row, dimension) { return row.structured_project?.space_program?.[dimension]?.state || 'unknown'; }
function dimensionsFor(row) {
  if (row.scenario_family === 'no_rooms') return ['room_count'];
  if (row.scenario_family === 'no_bathrooms') return ['bathroom_count'];
  return ['room_count', 'bathroom_count'];
}
function bucket(dimension, state) {
  model.dimensions[dimension] ||= {};
  model.dimensions[dimension][state] ||= { count: 0, forbidden_counts: {}, pending_counts: {}, core_counts: {} };
  return model.dimensions[dimension][state];
}

async function train() {
  model.training_records = await eachRow(files.filter(file => splitOf(file) === 'train'), row => {
    const labels = row.labels || {};
    for (const dimension of dimensionsFor(row)) {
      const b = bucket(dimension, stateOf(row, dimension)); b.count += 1;
      const classifier = model.classifiers[dimension] ||= { class_counts: {}, token_counts: {}, token_totals: {}, vocabulary_size: 0 };
      const state = stateOf(row, dimension);
      classifier.class_counts[state] = (classifier.class_counts[state] || 0) + 1;
      classifier.token_counts[state] ||= {};
      for (const token of tokens(row.description_ar)) {
        classifier.token_counts[state][token] = (classifier.token_counts[state][token] || 0) + 1;
        classifier.token_totals[state] = (classifier.token_totals[state] || 0) + 1;
      }
      for (const code of labels.forbidden_item_codes || []) b.forbidden_counts[code] = (b.forbidden_counts[code] || 0) + 1;
      for (const code of labels.pending_confirmation_item_codes || []) b.pending_counts[code] = (b.pending_counts[code] || 0) + 1;
      for (const code of labels.core_item_codes || []) b.core_counts[code] = (b.core_counts[code] || 0) + 1;
    }
  });
  for (const states of Object.values(model.dimensions)) for (const value of Object.values(states)) {
    value.forbidden_codes = Object.keys(value.forbidden_counts).filter(code => value.forbidden_counts[code] > (value.core_counts[code] || 0));
    value.pending_codes = Object.keys(value.pending_counts).filter(code => value.pending_counts[code] > 0);
    delete value.forbidden_counts; delete value.pending_counts; delete value.core_counts;
  }
  for (const classifier of Object.values(model.classifiers)) {
    const vocabulary = new Set();
    for (const counts of Object.values(classifier.token_counts)) for (const token of Object.keys(counts)) vocabulary.add(token);
    classifier.vocabulary_size = vocabulary.size;
  }
  model.trained_at = new Date().toISOString(); model.approved_by_user = true;
}

async function evaluate(split) {
  let records = 0, states = 0, stateCorrect = 0, forbiddenExpected = 0, forbiddenCovered = 0, pendingExpected = 0, pendingCovered = 0;
  await eachRow(files.filter(file => splitOf(file) === split), row => {
    records += 1; const inferred = {
      room_count: predictFromModel(model, row.description_ar, 'room_count'),
      bathroom_count: predictFromModel(model, row.description_ar, 'bathroom_count')
    }; const labels = row.labels || {};
    for (const dimension of dimensionsFor(row)) { states += 1; if (inferred[dimension].state === stateOf(row, dimension)) stateCorrect += 1; }
    const forbidden = new Set(), pending = new Set();
    for (const dimension of dimensionsFor(row)) {
      const profile = model.dimensions[dimension]?.[inferred[dimension].state];
      for (const code of profile?.forbidden_codes || []) forbidden.add(code);
      for (const code of profile?.pending_codes || []) pending.add(code);
    }
    for (const code of labels.forbidden_item_codes || []) { forbiddenExpected += 1; if (forbidden.has(code)) forbiddenCovered += 1; }
    for (const code of labels.pending_confirmation_item_codes || []) { pendingExpected += 1; if (pending.has(code)) pendingCovered += 1; }
  });
  return { records, space_state_accuracy: stateCorrect / (states || 1), forbidden_coverage: forbiddenCovered / (forbiddenExpected || 1), pending_confirmation_coverage: pendingCovered / (pendingExpected || 1) };
}

(async () => {
  await train();
  const metrics = { test: await evaluate('test'), holdout: await evaluate('holdout') };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'model.json'), JSON.stringify(model, null, 2));
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
