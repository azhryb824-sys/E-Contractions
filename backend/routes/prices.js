const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const priceEngine = require('../services/priceEngine');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { item_id, supplier_id, status, city } = req.query;
    let sql = `
      SELECT p.*, k.name_ar as item_name, k.code as item_code
      FROM prices p
      LEFT JOIN knowledge_items k ON k.id = p.item_id
      WHERE 1=1
    `;
    const params = [];

    if (item_id) { sql += ' AND p.item_id = ?'; params.push(item_id); }
    if (supplier_id) { sql += ' AND p.supplier_id = ?'; params.push(supplier_id); }
    if (status) { sql += ' AND p.status = ?'; params.push(status); }
    if (city) { sql += ' AND p.city = ?'; params.push(city); }

    sql += ' ORDER BY p.date_recorded DESC';
    const prices = db.prepare(sql).all(...params);
    res.json({ success: true, data: prices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const price = db.prepare(`
      SELECT p.*, k.name_ar as item_name, k.code as item_code, k.unit as item_unit
      FROM prices p
      LEFT JOIN knowledge_items k ON k.id = p.item_id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!price) return res.status(404).json({ success: false, error: 'السعر غير موجود' });
    res.json({ success: true, data: price });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { item_id, material_cost, labor_cost, equipment_cost, transport_cost, supplier_name, supplier_id, city, valid_until, status, added_by, source_document, notes } = req.body;

    if (!item_id) return res.status(400).json({ success: false, error: 'رقم العنصر مطلوب' });

    const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(item_id);
    if (!item) return res.status(400).json({ success: false, error: 'العنصر غير موجود في قاعدة المعرفة' });

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO prices (id, item_id, material_cost, labor_cost, equipment_cost, transport_cost, supplier_name, supplier_id, city, date_recorded, valid_until, status, added_by, source_document, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, item_id, material_cost ?? null, labor_cost ?? null, equipment_cost ?? null, transport_cost ?? null, supplier_name || null, supplier_id || null, city || null, now, valid_until || null, status || 'قيد_المراجعة', added_by || null, source_document || null, notes || null);

    const price = db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: price });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM prices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'السعر غير موجود' });

    const allowed = ['item_id', 'material_cost', 'labor_cost', 'equipment_cost', 'transport_cost', 'supplier_name', 'supplier_id', 'city', 'valid_until', 'status', 'source_document', 'notes'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) return res.json({ success: true, data: existing });

    fields.push('date_updated = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);

    db.prepare(`UPDATE prices SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const price = db.prepare('SELECT * FROM prices WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: price });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/approve', (req, res) => {
  try {
    const { user_id } = req.body;
    const price = priceEngine.approvePrice(req.params.id, user_id || null);
    if (!price) return res.status(404).json({ success: false, error: 'السعر غير موجود' });
    res.json({ success: true, data: price });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/reject', (req, res) => {
  try {
    const { user_id, reason } = req.body;
    const price = priceEngine.rejectPrice(req.params.id, user_id || null, reason);
    if (!price) return res.status(404).json({ success: false, error: 'السعر غير موجود' });
    res.json({ success: true, data: price });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/item/:itemId', (req, res) => {
  try {
    const price = priceEngine.getLatestPrice(req.params.itemId);
    if (!price) return res.status(404).json({ success: false, error: 'لا يوجد سعر معتمد للعنصر' });

    const validation = priceEngine.validatePrice(price, req.params.itemId);
    res.json({ success: true, data: { price, validation } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/item/:itemId/history', (req, res) => {
  try {
    const history = priceEngine.getPriceHistory(req.params.itemId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/import', (req, res) => {
  try {
    const { prices, user_id } = req.body;
    if (!Array.isArray(prices) || prices.length === 0) {
      return res.status(400).json({ success: false, error: 'مصفوفة prices مطلوبة' });
    }

    const result = priceEngine.importPrices(prices, user_id || null);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/export', (req, res) => {
  try {
    const db = getDb();
    const { item_id, supplier_id, status } = req.query;
    let sql = `
      SELECT p.*, k.name_ar as item_name, k.code as item_code, k.unit as item_unit
      FROM prices p
      LEFT JOIN knowledge_items k ON k.id = p.item_id
      WHERE 1=1
    `;
    const params = [];
    if (item_id) { sql += ' AND p.item_id = ?'; params.push(item_id); }
    if (supplier_id) { sql += ' AND p.supplier_id = ?'; params.push(supplier_id); }
    if (status) { sql += ' AND p.status = ?'; params.push(status); }
    sql += ' ORDER BY p.date_recorded DESC';

    const prices = db.prepare(sql).all(...params);
    res.json({ success: true, data: prices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
