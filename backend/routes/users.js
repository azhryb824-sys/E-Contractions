const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { role, is_active } = req.query;
    let sql = 'SELECT id, username, full_name, email, phone, role, organization, is_active, created_at, updated_at FROM users WHERE 1=1';
    const params = [];

    if (role) { sql += ' AND role = ?'; params.push(role); }
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(is_active === '1' || is_active === 'true' ? 1 : 0); }
    sql += ' ORDER BY full_name';

    const users = db.prepare(sql).all(...params);
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, username, full_name, email, phone, role, organization, logo_path, is_active, preferences, created_at, updated_at FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    let preferences = {};
    try { preferences = JSON.parse(user.preferences || '{}'); } catch { preferences = {}; }

    const projectsCount = db.prepare('SELECT COUNT(*) as count FROM projects WHERE user_id = ?').get(req.params.id).count;

    res.json({ success: true, data: { ...user, preferences, projects_count: projectsCount } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { username, password_hash, full_name, email, phone, role, organization } = req.body;

    if (!username) return res.status(400).json({ success: false, error: 'اسم المستخدم مطلوب' });
    if (!password_hash) return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });
    if (!full_name) return res.status(400).json({ success: false, error: 'الاسم الكامل مطلوب' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ success: false, error: 'اسم المستخدم موجود مسبقاً' });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, full_name, email, phone, role, organization)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, password_hash, full_name, email || null, phone || null, role || 'engineer', organization || null);

    const user = db.prepare('SELECT id, username, full_name, email, phone, role, organization, is_active, created_at FROM users WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    const allowed = ['username', 'password_hash', 'full_name', 'email', 'phone', 'role', 'organization', 'logo_path', 'is_active'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (req.body.username && req.body.username !== existing.username) {
      const duplicate = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(req.body.username, req.params.id);
      if (duplicate) return res.status(409).json({ success: false, error: 'اسم المستخدم موجود مسبقاً' });
    }

    if (fields.length === 0) return res.json({ success: true, data: existing });

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);

    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const user = db.prepare('SELECT id, username, full_name, email, phone, role, organization, is_active, created_at, updated_at FROM users WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id/preferences', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    const currentPrefs = {};
    try { Object.assign(currentPrefs, JSON.parse(existing.preferences || '{}')); } catch {}

    const merged = { ...currentPrefs, ...req.body };
    const prefsStr = JSON.stringify(merged);

    db.prepare('UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?').run(prefsStr, new Date().toISOString(), req.params.id);
    const user = db.prepare('SELECT id, username, full_name, email, phone, role, organization, preferences, updated_at FROM users WHERE id = ?').get(req.params.id);

    let parsedPrefs = {};
    try { parsedPrefs = JSON.parse(user.preferences || '{}'); } catch {}

    res.json({ success: true, data: { ...user, preferences: parsedPrefs } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/logs', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });

    const { limit, offset, action_type } = req.query;
    let sql = 'SELECT * FROM activity_logs WHERE user_id = ?';
    const params = [req.params.id];

    if (action_type) { sql += ' AND action_type = ?'; params.push(action_type); }
    sql += ' ORDER BY created_at DESC';
    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
    if (offset) { sql += ' OFFSET ?'; params.push(parseInt(offset)); }

    const logs = db.prepare(sql).all(...params);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
