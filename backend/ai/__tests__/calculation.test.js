const path = require('path');

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { passed++; }
  else { console.error('FAIL:', message); failed++; }
}

const calcEngine = require(path.resolve(__dirname, '..', 'calculation-engine.js'));

const params = { area: 150, rooms: 3, bathrooms: 2, hasKitchen: true, hasHall: true, floorCount: 1, finishLevel: 'جيد جداً', projectType: 'شقة' };

const testCodes = ['FLR-004', 'PNT-005', 'ELC-001', 'PLM-001', 'WOD-001'];
for (const code of testCodes) {
  const result = calcEngine.calculate(code, params);
  assert(result !== null, `calculate(${code}) should not return null`);
  assert(typeof result.quantity === 'number' && result.quantity >= 0,
    `${code}: quantity should be a number >= 0, got ${result.quantity}`);
  assert(typeof result.min === 'number', `${code}: should have min`);
  assert(typeof result.max === 'number', `${code}: should have max`);
  assert(typeof result.unit === 'string' && result.unit, `${code}: should have unit`);
  assert(typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1,
    `${code}: confidence should be between 0 and 1`);
}

// Test calculateItemTotal
const totalResult = calcEngine.calculateItemTotal(100, 50, 0.05, 0.20, 0.15);
assert(totalResult !== null, 'calculateItemTotal should return result');
assert(totalResult.quantity === 100, 'calculateItemTotal: quantity should be 100');
assert(totalResult.unitPrice === 50, 'calculateItemTotal: unitPrice should be 50');
assert(typeof totalResult.total === 'number' && totalResult.total > 0,
  'calculateItemTotal: total should be a positive number');
assert(Array.isArray(totalResult.breakdown), 'calculateItemTotal should have breakdown array');
assert(totalResult.breakdown.length > 0, 'calculateItemTotal breakdown should not be empty');

// Verify financial calculation: directCost = quantity * (1 + wasteRate) * unitPrice
const expectedDirect = 100 * (1 + 0.05) * 50;
assert(Math.abs(totalResult.directCost - expectedDirect) < 0.01,
  `Expected directCost ~${expectedDirect}, got ${totalResult.directCost}`);

// Test edge cases
const zeroAreaResult = calcEngine.calculate('FLR-004', { area: 0, rooms: 0, bathrooms: 0 });
assert(zeroAreaResult !== null, 'calculate with zero area should still return result');
assert(zeroAreaResult.quantity === 0, 'zero area should give 0 quantity');

const divByZero = calcEngine.calculate('FLR-008', { area: 0, rooms: 0, bathrooms: 0 });
assert(divByZero !== null, 'division-safe calculation should never crash');
assert(typeof divByZero.quantity === 'number', 'edge case result should have numeric quantity');

// Test calculateBatch
const batchResult = calcEngine.calculateBatch(
  testCodes.map(c => ({ code: c })),
  params
);
assert(batchResult && batchResult.results, 'calculateBatch should return results array');
assert(batchResult.results.length === testCodes.length,
  'calculateBatch should return result for each item');
assert(batchResult.summary && batchResult.summary.totalItems === testCodes.length,
  'calculateBatch summary should have totalItems');

console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
