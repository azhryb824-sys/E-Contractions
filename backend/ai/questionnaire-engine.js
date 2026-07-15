const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data', 'questionnaire');
const VERSION = 'dynamic-questionnaire-v1';
const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'question_catalog.json'), 'utf8'));
const groupPlans = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'group_question_plans.json'), 'utf8'));
const byId = new Map(catalog.map((question) => [question.question_id, question]));
const VALID_STATES = new Set(['explicit', 'inferred', 'unknown', 'out_of_scope', 'not_applicable']);
let trainedModel = null;
try { trainedModel = require('./models/dynamic-questionnaire-v1/model.json'); } catch { trainedModel = null; }

function seedCatalog(db) {
  const insert = db.prepare(`INSERT OR REPLACE INTO question_catalog
    (question_id, definition_json, catalog_version, is_active) VALUES (?, ?, ?, 1)`);
  const version = db.prepare(`INSERT OR IGNORE INTO question_versions
    (id, question_id, catalog_version, definition_json) VALUES (?, ?, ?, ?)`);
  const tx = db.transaction(() => catalog.forEach((q) => {
    const json = JSON.stringify(q);
    insert.run(q.question_id, json, VERSION);
    version.run(`${VERSION}:${q.question_id}`, q.question_id, VERSION, json);
  }));
  tx();
}

function datasetGroup(project = {}) {
  const type = String(project.building_type || project.project_type || '').toLowerCase();
  const condition = String(project.project_condition || project.scope || '').toLowerCase();
  if (/mixed|متعدد|مختلط/.test(type)) return 'mixed_use_building';
  if (/mosque|مسجد|إسلام/.test(type)) return 'mosque';
  if (/factory|workshop|مصنع|ورشة/.test(type)) return 'food_factory';
  if (/cold|freezer|تبريد|مجمد/.test(type)) return 'cold_storage';
  if (/warehouse|مستودع|مخزن/.test(type)) return 'dry_warehouse';
  if (/hotel|فندق/.test(type)) return 'hotel';
  if (/school|nursery|مدرس|حضانة/.test(type)) return 'school';
  if (/clinic|medical|dental|عياد|طبي/.test(type)) return 'dental_clinic';
  if (/restaurant|مطعم/.test(type)) return 'restaurant_commercial_kitchen';
  if (/cafe|coffee|مقهى|كافيه/.test(type)) return 'cafe_no_cooking';
  if (/shop|retail|showroom|محل|معرض/.test(type)) return 'retail_shop';
  if (/office|مكتب|إداري/.test(type)) return 'office_fitout';
  if (/building|عمارة|مبنى سكن/.test(type)) return 'residential_building';
  if (/villa|فيلا/.test(type)) return /full|new|إنشاء/.test(condition) ? 'villa_full_construction' : 'villa_shell_fitout';
  if (/renov|ترميم|تجديد/.test(condition)) return 'apartment_renovation';
  return 'apartment_fitout';
}

function parseValue(row) {
  if (!row || row.value_json == null) return null;
  try { return JSON.parse(row.value_json); } catch { return row.value_json; }
}

function loadAnswers(db, projectId) {
  const rows = db.prepare('SELECT * FROM project_answers WHERE project_id = ?').all(projectId);
  return Object.fromEntries(rows.map((row) => [row.question_id, { ...row, value: parseValue(row) }]));
}

function isAnswered(answer) {
  return Boolean(answer && answer.state !== 'unknown');
}

function buildPlan(group, answers = {}) {
  const base = groupPlans[group] || groupPlans.apartment_fitout;
  const result = [];
  const hidden = new Set();
  for (const id of base) {
    if (hidden.has(id)) continue;
    const question = byId.get(id);
    if (!question) continue;
    result.push(id);
    const answer = answers[id];
    if (answer && (answer.value === false || ['out_of_scope', 'not_applicable'].includes(answer.state))) {
      (question.no_skip || question.yes_followups || []).forEach((child) => hidden.add(child));
    } else if (answer?.value === true) {
      for (const child of question.yes_followups || []) if (!result.includes(child)) result.push(child);
    }
  }
  return result.map((id, index) => ({ ...byId.get(id), order: index + 1, answer: answers[id] || null }));
}

function detectContradictions(answers) {
  const contradictions = [];
  for (const question of catalog) {
    const parent = answers[question.question_id];
    if (!parent || parent.value !== false) continue;
    for (const childId of question.yes_followups || []) {
      const child = answers[childId];
      if (child && isAnswered(child) && child.value !== false && child.value !== null) {
        contradictions.push({ key: `${question.question_id}:${childId}`, parent: question.question_id, child: childId });
      }
    }
  }
  return contradictions;
}

function readiness(group, answers) {
  const plan = buildPlan(group, answers);
  const missingCritical = plan.filter((q) => q.critical && !isAnswered(answers[q.question_id])).map((q) => q.question_id);
  const requiredInputs = new Set();
  for (const question of catalog) if (answers[question.question_id]?.value === true) {
    for (const child of question.yes_followups || []) {
      const definition = byId.get(child);
      if (definition && ['integer', 'decimal', 'measurement_object', 'repeatable_measurement'].includes(definition.answer_type)) requiredInputs.add(child);
    }
  }
  const missingRequiredInputs = [...requiredInputs].filter(id => !isAnswered(answers[id]));
  const contradictions = detectContradictions(answers);
  return {
    ready_for_item_prediction: missingCritical.length === 0 && contradictions.length === 0,
    ready_for_approved_boq: missingCritical.length === 0 && missingRequiredInputs.length === 0 && contradictions.length === 0,
    missing_critical: missingCritical,
    required_input: missingRequiredInputs,
    contradictions,
    blockers: [...missingCritical.map((key) => ({ type: 'missing_critical', key })),
      ...missingRequiredInputs.map((key) => ({ type: 'pending_missing_count', key, status: 'required_input' })),
      ...contradictions.map((c) => ({ type: 'contradiction', key: c.key }))]
  };
}

function nextQuestion(group, answers) {
  const plan = buildPlan(group, answers);
  if (trainedModel) {
    const signature = `${group}|*|${Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)).map(([id, a]) => `${id}:${a.state}`).join(',')}`;
    const predicted = trainedModel.next_by_signature?.[signature];
    if (predicted && predicted !== '__DONE__') {
      const question = plan.find(q => q.question_id === predicted && !isAnswered(answers[q.question_id]));
      if (question) return { ...question, selection_source: trainedModel.model_version };
    }
  }
  return plan.find((q) => !isAnswered(answers[q.question_id])) || null;
}

function saveAnswers(db, projectId, entries, expectedRevision) {
  const session = db.prepare('SELECT * FROM project_question_sessions WHERE project_id = ?').get(projectId);
  if (expectedRevision != null && session && Number(expectedRevision) !== session.revision) {
    const error = new Error('revision_conflict'); error.status = 409; throw error;
  }
  const upsert = db.prepare(`INSERT INTO project_answers
    (project_id, question_id, state, value_json, source, confidence, confirmed_by_user, catalog_version, revision, answered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(project_id, question_id) DO UPDATE SET state=excluded.state, value_json=excluded.value_json,
      source=excluded.source, confidence=excluded.confidence, confirmed_by_user=excluded.confirmed_by_user,
      catalog_version=excluded.catalog_version, revision=project_answers.revision+1, answered_at=datetime('now')`);
  const transaction = db.transaction(() => {
    for (const entry of entries) {
      if (!byId.has(entry.question_id)) throw new Error(`unknown_question:${entry.question_id}`);
      const state = entry.state || 'explicit';
      if (!VALID_STATES.has(state)) throw new Error(`invalid_state:${state}`);
      if (state === 'explicit' && entry.value === undefined) throw new Error(`missing_value:${entry.question_id}`);
      upsert.run(projectId, entry.question_id, state, entry.value === undefined ? null : JSON.stringify(entry.value),
        entry.source || 'user', Number(entry.confidence ?? 1), entry.confirmed_by_user === false ? 0 : 1, VERSION, 1);
    }
    db.prepare(`UPDATE project_question_sessions SET revision=revision+1, last_saved_at=datetime('now') WHERE project_id=?`).run(projectId);
  });
  transaction();
  return db.prepare('SELECT * FROM project_question_sessions WHERE project_id = ?').get(projectId);
}

function ensureSession(db, project) {
  const group = datasetGroup(project);
  db.prepare(`INSERT OR IGNORE INTO project_question_sessions (id, project_id, dataset_group)
    VALUES (?, ?, ?)`).run(uuid(), project.id, group);
  db.prepare('UPDATE project_question_sessions SET dataset_group=? WHERE project_id=?').run(group, project.id);
  return db.prepare('SELECT * FROM project_question_sessions WHERE project_id=?').get(project.id);
}

module.exports = { VERSION, catalog, groupPlans, seedCatalog, datasetGroup, loadAnswers, buildPlan,
  detectContradictions, readiness, nextQuestion, saveAnswers, ensureSession };
