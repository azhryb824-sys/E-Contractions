const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/database');
const engine = require('../ai/questionnaire-engine');

const router = express.Router();

function projectOr404(req, res) {
  const project = getDb().prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!project) res.status(404).json({ success: false, error: 'المشروع غير موجود' });
  return project;
}

function context(project) {
  const db = getDb();
  const session = engine.ensureSession(db, project);
  return { db, session, group: session.dataset_group, answers: engine.loadAnswers(db, project.id) };
}

router.post('/analyze-description', (req, res) => {
  try {
    const description = String(req.body.description || '').trim();
    if (!description) return res.status(400).json({ success: false, error: 'description_required' });
    const inference = require('../ai/inference-engine').understandProject({ ...req.body, description });
    const inferred = inference.inferred_values || {};
    const projectLike = { ...req.body, ...Object.fromEntries(Object.entries(inferred).map(([k, v]) => [k, v?.value ?? v])),
      building_type: req.body.building_type || description };
    res.json({ success: true, data: {
      dataset_group: engine.datasetGroup(projectLike),
      explicit_values: inference.explicit_values || {}, inferred_values: inferred,
      missing_information: inference.missing_information || [], status: inference.status,
      requires_confirmation: Object.keys(inferred)
    }});
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.get('/:id/question-plan', (req, res) => {
  const project = projectOr404(req, res); if (!project) return;
  const { session, group, answers } = context(project);
  const plan = engine.buildPlan(group, answers);
  res.json({ success: true, data: { version: engine.VERSION, dataset_group: group, revision: session.revision, plan } });
});

router.post('/:id/answers', (req, res) => {
  try {
    const project = projectOr404(req, res); if (!project) return;
    const entries = Array.isArray(req.body.answers) ? req.body.answers : [req.body];
    const session = engine.saveAnswers(getDb(), project.id, entries, req.body.revision);
    const answers = engine.loadAnswers(getDb(), project.id);
    res.json({ success: true, data: { revision: session.revision, saved_at: session.last_saved_at,
      next_question: engine.nextQuestion(session.dataset_group, answers), readiness: engine.readiness(session.dataset_group, answers) } });
  } catch (error) { res.status(error.status || 400).json({ success: false, error: error.message }); }
});

router.get('/:id/next-question', (req, res) => {
  const project = projectOr404(req, res); if (!project) return;
  const { session, group, answers } = context(project);
  res.json({ success: true, data: { revision: session.revision, question: engine.nextQuestion(group, answers) } });
});

router.get('/:id/readiness', (req, res) => {
  const project = projectOr404(req, res); if (!project) return;
  const { group, answers } = context(project);
  res.json({ success: true, data: engine.readiness(group, answers) });
});

router.post('/:id/confirm-inference', (req, res) => {
  try {
    const project = projectOr404(req, res); if (!project) return;
    const db = getDb();
    const result = db.prepare(`UPDATE project_inferences SET confirmed_by_user=?, state=?
      WHERE project_id=? AND field_key=?`).run(req.body.confirmed === false ? 0 : 1,
      req.body.confirmed === false ? 'unknown' : 'explicit', project.id, req.body.field_key);
    res.json({ success: true, data: { updated: result.changes } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/:id/generate-candidates', (req, res) => {
  try {
    const project = projectOr404(req, res); if (!project) return;
    const { group, answers } = context(project);
    const readiness = engine.readiness(group, answers);
    if (!readiness.ready_for_item_prediction) return res.status(409).json({ success: false, error: 'unresolved_blockers', data: readiness });
    const get = (id, fallback = null) => answers[id]?.value ?? fallback;
    const result = require('../ai/inference-engine').generateBoq({
      ...project, rooms: get('Q_ROOM_COUNT', project.room_count), bathrooms: get('Q_BATHROOM_COUNT', project.bathroom_count),
      area: get('Q_AREA', project.area), floors: get('Q_FLOORS', project.floor_count), scope: get('Q_SCOPE', project.scope),
      execution_mode: get('Q_EXEC_MODE', project.execution_mode)
    }, 'no_additions');
    res.json({ success: true, data: { ...result, readiness, execution_mode: get('Q_EXEC_MODE', 'show_for_approval') } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/:id/approve-boq', (req, res) => {
  try {
    const project = projectOr404(req, res); if (!project) return;
    const { db, group, answers } = context(project);
    const ready = engine.readiness(group, answers);
    if (!ready.ready_for_approved_boq) return res.status(409).json({ success: false, error: 'unresolved_blockers', data: ready });
    const approved = Array.isArray(req.body.approvedBoq) ? req.body.approvedBoq : [];
    if (!approved.length) return res.status(400).json({ success: false, error: 'approved_boq_required' });
    const insert = db.prepare(`INSERT INTO project_items
      (id, project_id, item_id, code, name_ar, category, unit, quantity, confidence, source, sort_order,
       quantity_state, quantity_driver, required_inputs_json, quantity_confidence, can_enter_approved_boq, rule_id, rule_version, pricing_status, is_approved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'questionnaire_approved', ?, ?, ?, ?, ?, ?, ?, ?, 'unpriced', 1)`);
    db.transaction(() => {
      db.prepare("DELETE FROM project_items WHERE project_id=? AND source='questionnaire_approved'").run(project.id);
      approved.forEach((item, index) => {
        if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.can_enter_approved_boq !== true) throw new Error(`invalid_approved_quantity:${item.code}`);
        insert.run(uuid(), project.id, item.item_id ?? null, item.code, item.name_ar, item.category ?? null, item.unit ?? null,
          item.quantity, item.confidence ?? null, index, item.quantity_state, item.quantity_driver,
          JSON.stringify(item.required_inputs || []), item.quantity_confidence ?? item.confidence ?? null, 1, item.rule_id ?? null, item.rule_version ?? null);
      });
      db.prepare("UPDATE project_question_sessions SET status='approved', last_saved_at=datetime('now') WHERE project_id=?").run(project.id);
    })();
    res.json({ success: true, data: { approved_count: approved.length } });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

module.exports = router;
