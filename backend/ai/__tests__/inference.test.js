const path = require('path');
const fs = require('fs');

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { passed++; }
  else { console.error('FAIL:', message); failed++; }
}

const inferenceEngine = require(path.resolve(__dirname, '..', 'inference-engine.js'));
const testRequests = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'test-requests.json'), 'utf8')
);

// Test 1: analyzeRequest with complete info
const analysis1 = inferenceEngine.analyzeRequest(testRequests[0]);
assert(analysis1 && typeof analysis1 === 'object', 'analyzeRequest should return an object');
assert(analysis1.type === 'سكني', `Expected type سكني, got ${analysis1.type}`);
assert(typeof analysis1.confidence === 'number', 'analysis should have confidence');
assert(Array.isArray(analysis1.missingInfo), 'analysis should have missingInfo array');

// Test 2: generateEstimate with complete info
const estimate1 = inferenceEngine.generateEstimate(testRequests[0]);
assert(estimate1.status === 'ready', `Expected status "ready", got "${estimate1.status}"`);
assert(estimate1.project && typeof estimate1.project === 'object', 'estimate should have project object');
assert(Array.isArray(estimate1.sections), 'estimate should have sections array');
assert(estimate1.sections.length > 0, 'estimate sections should not be empty');
assert(typeof estimate1.inference_mode === 'string', 'estimate should have inference_mode');

for (const sec of estimate1.sections) {
  assert(Array.isArray(sec.items), `Section ${sec.code} should have items array`);
  for (const item of sec.items) {
    assert(typeof item.code === 'string', `Item missing code in section ${sec.code}`);
    assert(typeof item.name_ar === 'string', `Item ${item.code} missing name_ar`);
    assert(typeof item.unit === 'string', `Item ${item.code} missing unit`);
    assert(typeof item.quantity === 'number' || item.quantity === null,
      `Item ${item.code} quantity should be number or null`);
    assert(typeof item.quantity_source === 'string',
      `Item ${item.code} should have quantity_source`);
  }
}

// Test 3: generateEstimate with minimal info (only title)
const estimate3 = inferenceEngine.generateEstimate(testRequests[2]);
assert(estimate3.status === 'ready', 'Minimal request should still return ready status');
assert(estimate3.project && typeof estimate3.project === 'object', 'Minimal request should have project');
assert(Array.isArray(estimate3.sections) && estimate3.sections.length > 0,
  'Minimal request should have sections');
assert(estimate3.data_completeness < 0.5,
  'Minimal request should have low data_completeness');

// Test 4: generateEstimate with medium info
const estimate2 = inferenceEngine.generateEstimate(testRequests[1]);
assert(estimate2.status === 'ready', 'Medium request should return ready status');
assert(estimate2.project && typeof estimate2.project === 'object', 'Medium request should have project');

// Test 5: model info in output if model exists
if (estimate1.model) {
  assert(typeof estimate1.model.version === 'string' || estimate1.model.version === null,
    'model.version should be string or null');
  assert(typeof estimate1.model.algorithm === 'string' || estimate1.model.algorithm === null,
    'model.algorithm should be string or null');
}

console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
