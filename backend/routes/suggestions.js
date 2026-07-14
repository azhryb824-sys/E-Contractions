const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const suggestionEngine = require('../services/suggestionEngine');

router.get('/:projectId', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const mode = req.query.mode || 'show_before_add';
    const result = suggestionEngine.getSuggestedItemsForProject(req.params.projectId, mode);

    if (!result) return res.status(500).json({ success: false, error: 'فشل في جلب الاقتراحات' });

    console.log('Suggestions API - project:', project.id, 'type:', project.project_type, 'mode:', mode, 'count:', result.count);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Suggestions API error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId/generate', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const mode = req.body.mode || 'show_before_add';
    const result = suggestionEngine.getSuggestedItemsForProject(req.params.projectId, mode);

    if (!result) return res.status(500).json({ success: false, error: 'فشل في إنشاء الاقتراحات' });

    if (!db.prepare('SELECT id FROM activity_logs WHERE project_id = ? AND action_type = ?').get(req.params.projectId, 'suggestions_generated')) {
      db.prepare(`
        INSERT INTO activity_logs (id, user_id, project_id, action_type, action_description, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), req.body.user_id || null, req.params.projectId, 'suggestions_generated', 'تم إنشاء اقتراحات ذكية للمشروع', JSON.stringify({ count: result.count, mode }));
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId/accept/:suggestionId', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const result = suggestionEngine.getSuggestedItemsForProject(req.params.projectId, 'show_before_add');
    if (!result) return res.status(500).json({ success: false, error: 'فشل في جلب الاقتراحات' });

    const suggestion = result.suggestions.find(s => s.id === req.params.suggestionId);
    if (!suggestion) return res.status(404).json({ success: false, error: 'الاقتراح غير موجود' });

    const existing = db.prepare('SELECT * FROM project_items WHERE project_id = ? AND name_ar = ?').get(req.params.projectId, suggestion.name);
    if (existing) return res.status(400).json({ success: false, error: 'البند موجود بالفعل في المشروع' });

    const maxSort = db.prepare('SELECT MAX(sort_order) as max_order FROM project_items WHERE project_id = ?').get(req.params.projectId);
    const sortOrder = (maxSort?.max_order ?? -1) + 1;
    const itemId = uuidv4();

    db.prepare(`
      INSERT INTO project_items (id, project_id, item_id, code, name_ar, category, unit, quantity, waste_rate, source, confidence, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, req.params.projectId, suggestion.item_id || null, `SUG-${Date.now()}`, suggestion.name, suggestion.category || 'مقترح', suggestion.unit || 'م²', 0, 0.05, 'suggestion', suggestion.confidence || 0.5, sortOrder);

    const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(itemId);
    res.json({ success: true, data: { suggestion, item } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId/reject/:suggestionId', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const result = suggestionEngine.getSuggestedItemsForProject(req.params.projectId, 'show_before_add');
    if (!result) return res.status(500).json({ success: false, error: 'فشل في جلب الاقتراحات' });

    const suggestion = result.suggestions.find(s => s.id === req.params.suggestionId);
    if (!suggestion) return res.status(404).json({ success: false, error: 'الاقتراح غير موجود' });

    db.prepare(`
      INSERT INTO activity_logs (id, user_id, project_id, action_type, action_description, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), req.body.user_id || null, req.params.projectId, 'suggestion_rejected', `تم رفض الاقتراح: ${suggestion.name}`, JSON.stringify({ suggestion_id: req.params.suggestionId, name: suggestion.name }));

    res.json({ success: true, data: { suggestion_id: req.params.suggestionId, name: suggestion.name, rejected: true } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId/accept-all', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const result = suggestionEngine.getSuggestedItemsForProject(req.params.projectId, 'show_before_add');
    if (!result) return res.status(500).json({ success: false, error: 'فشل في جلب الاقتراحات' });

    const existingNames = new Set(
      db.prepare('SELECT name_ar FROM project_items WHERE project_id = ?').all(req.params.projectId).map(r => r.name_ar)
    );

    const added = [];
    const maxSort = db.prepare('SELECT MAX(sort_order) as max_order FROM project_items WHERE project_id = ?').get(req.params.projectId);
    let sortOrder = (maxSort?.max_order ?? -1) + 1;

    const insert = db.prepare(`
      INSERT INTO project_items (id, project_id, item_id, code, name_ar, category, unit, quantity, waste_rate, source, confidence, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const suggestion of result.suggestions) {
        if (existingNames.has(suggestion.name)) continue;
        const itemId = uuidv4();
        insert.run(itemId, req.params.projectId, suggestion.item_id || null, `SUG-${Date.now()}-${added.length}`, suggestion.name, suggestion.category || 'مقترح', suggestion.unit || 'م²', 0, 0.05, 'suggestion', suggestion.confidence || 0.5, sortOrder++);
        added.push(db.prepare('SELECT * FROM project_items WHERE id = ?').get(itemId));
        existingNames.add(suggestion.name);
      }
    });

    transaction();

    res.json({ success: true, data: { project_id: req.params.projectId, added, count: added.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId/reject-all', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const result = suggestionEngine.getSuggestedItemsForProject(req.params.projectId, 'show_before_add');
    if (!result) return res.status(500).json({ success: false, error: 'فشل في جلب الاقتراحات' });

    db.prepare(`
      INSERT INTO activity_logs (id, user_id, project_id, action_type, action_description, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), req.body.user_id || null, req.params.projectId, 'all_suggestions_rejected', `تم رفض جميع الاقتراحات (${result.count})`, JSON.stringify({ count: result.count }));

    res.json({ success: true, data: { project_id: req.params.projectId, rejected: true, count: result.count } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
