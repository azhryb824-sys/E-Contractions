const path = require('path');
const fs = require('fs');

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { passed++; }
  else { console.error('FAIL:', message); failed++; }
}

const metricsPath = path.resolve(__dirname, '..', 'models', 'current', 'metrics.json');

if (fs.existsSync(metricsPath)) {
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  assert(metrics && typeof metrics === 'object', 'metrics.json should be a valid object');
  assert(metrics.item_prediction && typeof metrics.item_prediction === 'object',
    'metrics.json should have item_prediction section');
  assert(metrics.quantity_prediction && typeof metrics.quantity_prediction === 'object',
    'metrics.json should have quantity_prediction section');
  assert(metrics.item_prediction.micro && metrics.item_prediction.micro.f1 !== undefined,
    'item_prediction should have micro.f1 metric');
  assert(metrics.quantity_prediction.overall && metrics.quantity_prediction.overall.mae !== undefined,
    'quantity_prediction should have overall.mae metric');
  assert(typeof metrics.version === 'string', 'metrics.json should have version');
} else {
  console.error('WARN: metrics.json not found — evaluation may not have been run');
}

console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
