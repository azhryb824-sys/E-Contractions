'use strict';

const assert = require('assert');
const predictor = require('../specialized/space-state-predictor');
const inference = require('../inference-engine');

const noRooms = predictor.inferSpaceStates({ description: 'تشطيب استوديو مفتوح دون غرف، ويوجد حمام واحد ضمن النطاق.' });
assert.strictEqual(noRooms.room_count.state, 'explicit_zero');
assert.strictEqual(noRooms.room_count.value, 0);

const noBathrooms = predictor.inferSpaceStates({ description: 'تجهيز مستودع جاف ولا توجد حمامات ضمن نطاق العقد.' });
assert(['explicit_zero', 'out_of_scope'].includes(noBathrooms.bathroom_count.state));

const explicitZero = predictor.inferSpaceStates({ room_count: 0, bathroom_count: 0, description: 'مشروع مساحة مفتوحة' });
assert.strictEqual(explicitZero.room_count.state, 'explicit_zero');
assert.strictEqual(explicitZero.bathroom_count.state, 'explicit_zero');

const boq = inference.generateBoq({
  title: 'استوديو مفتوح',
  description: 'تشطيب استوديو مفتوح دون غرف ولا توجد حمامات ضمن النطاق.',
  building_type: 'apartment',
  scope: 'full_fitout',
  room_count: 0,
  bathroom_count: 0,
  area: 80,
  finish_level: 'standard',
  city: 'الرياض'
}, 'no_additions');

assert.strictEqual(boq.space_states.room_count.value, 0);
assert.strictEqual(boq.space_states.bathroom_count.value, 0);
const forbidden = new Set(['LVC-002', 'LVC-003', 'WOD-001', 'WOD-005', 'PLM-005', 'PLM-006', 'PLM-007', 'PLM-008', 'FLR-009', 'FLR-010', 'INS-001', 'HVAC-011']);
assert(!boq.approvedBoq.some(item => forbidden.has(item.code)), 'يجب ألا تدخل بنود الغرف والحمامات الممنوعة في الحصر المعتمد');
assert.strictEqual(boq.space_state_model, 'sparse-spaces-v1.0.0');

console.log(JSON.stringify({ model: boq.space_state_model, approved_items: boq.approvedBoq.length, assertions: 9 }));
