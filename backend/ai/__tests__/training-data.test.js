const path = require('path');
const fs = require('fs');

const dataPath = path.resolve(__dirname, '..', 'training-data.json');

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { passed++; }
  else { console.error('FAIL:', message); failed++; }
}

const raw = fs.readFileSync(dataPath, 'utf8');
let data;
try { data = JSON.parse(raw); } catch (e) { console.error('FAIL: training-data.json is not valid JSON'); process.exit(1); }

assert(Array.isArray(data), 'training-data.json should be an array');
assert(data.length === 8, `Expected 8 projects, got ${data.length}`);

const seenIds = new Set();
for (let i = 0; i < data.length; i++) {
  const proj = data[i];
  assert(typeof proj.id === 'string' && proj.id, `Project ${i}: missing or invalid id`);
  assert(typeof proj.type === 'string', `Project ${proj.id}: missing type`);
  assert(typeof proj.project === 'object' && proj.project !== null, `Project ${proj.id}: missing project object`);
  assert(Array.isArray(proj.sections), `Project ${proj.id}: missing sections array`);

  assert(!seenIds.has(proj.id), `Duplicate project id: ${proj.id}`);
  seenIds.add(proj.id);

  for (const sec of proj.sections) {
    assert(typeof sec.code === 'string' && sec.code, `Project ${proj.id}, section: missing code`);
    assert(typeof sec.name === 'string' && sec.name, `Project ${proj.id}, section ${sec.code}: missing name`);
    assert(Array.isArray(sec.items), `Project ${proj.id}, section ${sec.code}: missing items array`);

    for (const item of sec.items) {
      assert(typeof item.code === 'string' && item.code, `Section ${sec.code}: missing item code`);
      assert(typeof item.name_ar === 'string' && item.name_ar, `Item ${item.code}: missing name_ar`);
      assert(typeof item.unit === 'string' && item.unit, `Item ${item.code}: missing unit`);
      assert(typeof item.quantity === 'number' && !isNaN(item.quantity), `Item ${item.code}: quantity must be a number`);
      assert(item.quantity >= 0, `Item ${item.code}: quantity must be >= 0, got ${item.quantity}`);
    }
  }
}

console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
