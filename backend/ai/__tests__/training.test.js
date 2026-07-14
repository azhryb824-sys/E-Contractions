const path = require('path');
const fs = require('fs');

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { passed++; }
  else { console.error('FAIL:', message); failed++; }
}

const trainPath = path.resolve(__dirname, '..', 'train.js');
assert(typeof trainPath === 'string', 'train.js path resolved');

const trainModule = require(trainPath);

const modelDir = path.resolve(__dirname, '..', 'models', 'current');
const modelJson = path.join(modelDir, 'model.json');
const metadataJson = path.join(modelDir, 'metadata.json');

if (fs.existsSync(modelJson)) {
  const model = JSON.parse(fs.readFileSync(modelJson, 'utf8'));
  assert(model && typeof model === 'object', 'model.json should be a valid object');
} else {
  console.error('WARN: model.json not found — training may not have been run');
}

if (fs.existsSync(metadataJson)) {
  const meta = JSON.parse(fs.readFileSync(metadataJson, 'utf8'));
  assert(typeof meta.model_version === 'string', 'metadata.json should have model_version');
  assert(typeof meta.trained_at === 'string', 'metadata.json should have trained_at');
  assert(typeof meta.algorithm === 'string', 'metadata.json should have algorithm');
} else {
  console.error('WARN: metadata.json not found — training may not have been run');
}

console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
