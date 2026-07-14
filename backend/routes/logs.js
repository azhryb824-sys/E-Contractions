const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { user_id, project_id, action_type, date_from, date_to, limit, offset } = req.query;
    let sql = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];

    if (user_id) { sql += ' AND user_id = ?'; params.push(user_id); }
    if (project_id) { sql += ' AND project_id = ?'; params.push(project_id); }
    if (action_type) { sql += ' AND action_type = ?'; params.push(action_type); }
    if (date_from) { sql += ' AND created_at >= ?'; params.push(date_from); }
    if (date_to) { sql += ' AND created_at <= ?'; params.push(date_to); }

    sql += ' ORDER BY created_at DESC';

    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
    if (offset) { sql += ' OFFSET ?'; params.push(parseInt(offset)); }

    const logs = db.prepare(sql).all(...params);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const log = db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(req.params.id);
    if (!log) return res.status(404).json({ success: false, error: 'السجل غير موجود' });

    let details = {};
    try { details = JSON.parse(log.details || '{}'); } catch {}

    res.json({ success: true, data: { ...log, details } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { user_id, project_id, action_type, action_description, details, ip_address } = req.body;

    if (!action_type) return res.status(400).json({ success: false, error: 'نوع العملية مطلوب' });
    if (!action_description) return res.status(400).json({ success: false, error: 'وصف العملية مطلوب' });

    const id = uuidv4();
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});

    db.prepare(`
      INSERT INTO activity_logs (id, user_id, project_id, action_type, action_description, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, user_id || null, project_id || null, action_type, action_description, detailsStr, ip_address || null);

    const log = db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
