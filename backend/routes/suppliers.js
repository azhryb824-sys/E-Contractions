const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { category, is_active } = req.query;
    let sql = 'SELECT * FROM suppliers WHERE 1=1';
    const params = [];

    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (is_active !== undefined) { sql += ' AND is_active = ?'; params.push(is_active === '1' || is_active === 'true' ? 1 : 0); }
    sql += ' ORDER BY name';

    const suppliers = db.prepare(sql).all(...params);
    res.json({ success: true, data: suppliers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'المورد غير موجود' });

    const prices = db.prepare(`
      SELECT p.*, k.name_ar as item_name, k.code as item_code
      FROM prices p
      LEFT JOIN knowledge_items k ON k.id = p.item_id
      WHERE p.supplier_id = ?
      ORDER BY p.date_recorded DESC
    `).all(req.params.id);

    res.json({ success: true, data: { ...supplier, prices } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, contact_person, phone, email, address, category, rating, notes } = req.body;

    if (!name) return res.status(400).json({ success: false, error: 'اسم المورد مطلوب' });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO suppliers (id, name, contact_person, phone, email, address, category, rating, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, contact_person || null, phone || null, email || null, address || null, category || null, rating ?? 3, notes || null);

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'المورد غير موجود' });

    const allowed = ['name', 'contact_person', 'phone', 'email', 'address', 'category', 'rating', 'notes'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) return res.json({ success: true, data: existing });

    values.push(req.params.id);
    db.prepare(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'المورد غير موجود' });

    db.prepare('UPDATE suppliers SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true, data: { ...existing, is_active: 0 } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
