const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const root = path.join(__dirname, '..', 'data', 'dynamic-questionnaire-v1', 'raw', 'contractor_dynamic_questionnaire_1_7m_v1');
const dataRoot = path.join(root, 'data');
const outDir = path.join(__dirname, '..', 'models', 'dynamic-questionnaire-v1');
const splits = ['train', 'validation', 'test', 'holdout'];
const nextCounts = new Map();
const priors = {};
const tokenCounts = {};
const metrics = Object.fromEntries(splits.map(s => [s, { records: 0, next_total: 0, next_correct: 0, readiness_total: 0, readiness_correct: 0 }]));

function signature(row) {
  return `${row.dataset_group}|${row.scenario}|${Object.entries(row.submitted_fields || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, a]) => `${id}:${a.state}`).join(',')}`;
}
function genericSignature(row) {
  return `${row.dataset_group}|*|${Object.entries(row.submitted_fields || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, a]) => `${id}:${a.state}`).join(',')}`;
}
function addNext(key, value) {
  if (!nextCounts.has(key)) nextCounts.set(key, {});
  const counts = nextCounts.get(key); const label = value == null ? '__DONE__' : value;
  counts[label] = (counts[label] || 0) + 1;
}
function best(counts) { return counts ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined; }
function tokenize(text) { return [...new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].slice(0, 80); }

async function eachFile(file, onRow) {
  const input = fs.createReadStream(file).pipe(zlib.createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) onRow(JSON.parse(line));
}

async function main() {
  if (!fs.existsSync(dataRoot)) throw new Error(`Dataset not found: ${dataRoot}`);
  const files = fs.readdirSync(dataRoot).flatMap(group => fs.readdirSync(path.join(dataRoot, group))
    .filter(name => name.endsWith('.jsonl.gz')).map(name => ({ group, name, file: path.join(dataRoot, group, name) })));
  for (const split of splits) {
    const splitFiles = files.filter(f => f.name.startsWith(`${split}-`)).sort((a, b) => a.file.localeCompare(b.file));
    for (const item of splitFiles) {
      await eachFile(item.file, row => {
        const m = metrics[split]; m.records++;
        const key = signature(row);
        if (split === 'train') {
          addNext(key, row.expected_next_question_id);
          addNext(genericSignature(row), row.expected_next_question_id);
          priors[row.dataset_group] = (priors[row.dataset_group] || 0) + 1;
          tokenCounts[row.dataset_group] ||= {};
          for (const token of tokenize(row.request_text_ar)) tokenCounts[row.dataset_group][token] = (tokenCounts[row.dataset_group][token] || 0) + 1;
        } else {
          const prediction = best(nextCounts.get(key));
          const expected = row.expected_next_question_id == null ? '__DONE__' : row.expected_next_question_id;
          m.next_total++; if (prediction === expected) m.next_correct++;
          const expectedReady = Boolean(row.ready_for_approved_boq);
          const ruleReady = (row.critical_blockers || []).length === 0 && (row.contradictions || []).length === 0 && expected === '__DONE__';
          m.readiness_total++; if (ruleReady === expectedReady) m.readiness_correct++;
        }
      });
      process.stdout.write(`${split}: ${metrics[split].records.toLocaleString()}\n`);
    }
  }
  const nextBySignature = {};
  for (const [key, counts] of nextCounts) nextBySignature[key] = best(counts);
  for (const group of Object.keys(tokenCounts)) {
    tokenCounts[group] = Object.fromEntries(Object.entries(tokenCounts[group]).sort((a, b) => b[1] - a[1]).slice(0, 5000));
  }
  for (const split of splits.slice(1)) {
    const m = metrics[split]; m.next_accuracy = m.next_total ? m.next_correct / m.next_total : null;
    m.readiness_accuracy = m.readiness_total ? m.readiness_correct / m.readiness_total : null;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dataset_manifest.json'), 'utf8'));
  const model = { model_version: 'dynamic-questionnaire-v1', trained_at: new Date().toISOString(),
    source_dataset: manifest.dataset_name, source_records_processed: Object.values(metrics).reduce((n, m) => n + m.records, 0),
    engineering_reviewed: manifest.engineering_reviewed, approved_for_production: manifest.approved_for_production,
    next_by_signature: nextBySignature, project_type_priors: priors, project_type_token_counts: tokenCounts };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'model.json'), JSON.stringify(model));
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify({ model_version: model.model_version, metrics,
    note: 'Synthetic package metrics; not an independently engineering-reviewed production benchmark.' }, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
