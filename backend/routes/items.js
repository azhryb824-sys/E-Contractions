const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

router.get('/:projectId', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const items = db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY sort_order, category, name_ar').all(req.params.projectId);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const { item_id, code, name_ar, category, unit, quantity, waste_rate, material_cost, labor_cost, equipment_cost, transport_cost, source, confidence, notes, is_approved } = req.body;

    if (!name_ar) return res.status(400).json({ success: false, error: 'اسم البند مطلوب' });

    const id = uuidv4();
    const maxSort = db.prepare('SELECT MAX(sort_order) as max_order FROM project_items WHERE project_id = ?').get(req.params.projectId);
    const sortOrder = (maxSort?.max_order ?? -1) + 1;

    db.prepare(`
      INSERT INTO project_items (id, project_id, item_id, code, name_ar, category, unit, quantity, waste_rate, material_cost, labor_cost, equipment_cost, transport_cost, source, confidence, notes, is_approved, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.projectId, item_id || null, code || `ITEM-${Date.now()}`, name_ar, category || 'عام', unit || 'م²', quantity ?? 0, waste_rate ?? 0.05, material_cost ?? null, labor_cost ?? null, equipment_cost ?? null, transport_cost ?? null, source || 'user', confidence ?? 1.0, notes || null, is_approved ? 1 : 0, sortOrder);

    const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:projectId/:itemId', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM project_items WHERE id = ? AND project_id = ?').get(req.params.itemId, req.params.projectId);
    if (!existing) return res.status(404).json({ success: false, error: 'البند غير موجود' });

    const allowed = ['item_id', 'code', 'name_ar', 'category', 'unit', 'quantity', 'waste_rate', 'material_cost', 'labor_cost', 'equipment_cost', 'transport_cost', 'source', 'confidence', 'notes', 'is_approved', 'sort_order'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'is_approved' ? (req.body[key] ? 1 : 0) : req.body[key]);
      }
    }

    if (fields.length === 0) return res.json({ success: true, data: existing });

    values.push(req.params.itemId);
    db.prepare(`UPDATE project_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.itemId);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:projectId/:itemId', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM project_items WHERE id = ? AND project_id = ?').get(req.params.itemId, req.params.projectId);
    if (!existing) return res.status(404).json({ success: false, error: 'البند غير موجود' });

    db.prepare('DELETE FROM project_items WHERE id = ?').run(req.params.itemId);
    res.json({ success: true, data: existing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:projectId/batch', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'مصفوفة items مطلوبة' });
    }

    const updated = [];
    const update = db.prepare(`
      UPDATE project_items SET quantity = ?, waste_rate = ?, material_cost = ?, labor_cost = ?, equipment_cost = ?, transport_cost = ?, notes = ?, is_approved = ? WHERE id = ? AND project_id = ?
    `);

    const transaction = db.transaction(() => {
      for (const item of items) {
        if (!item.id) continue;
        const existing = db.prepare('SELECT * FROM project_items WHERE id = ? AND project_id = ?').get(item.id, req.params.projectId);
        if (!existing) continue;

        update.run(
          item.quantity ?? existing.quantity,
          item.waste_rate ?? existing.waste_rate,
          item.material_cost !== undefined ? item.material_cost : existing.material_cost,
          item.labor_cost !== undefined ? item.labor_cost : existing.labor_cost,
          item.equipment_cost !== undefined ? item.equipment_cost : existing.equipment_cost,
          item.transport_cost !== undefined ? item.transport_cost : existing.transport_cost,
          item.notes !== undefined ? item.notes : existing.notes,
          item.is_approved !== undefined ? (item.is_approved ? 1 : 0) : existing.is_approved,
          item.id,
          req.params.projectId
        );

        updated.push(db.prepare('SELECT * FROM project_items WHERE id = ?').get(item.id));
      }
    });

    transaction();
    res.json({ success: true, data: { project_id: req.params.projectId, updated, count: updated.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId/reorder', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ success: false, error: 'مصفوفة itemIds مطلوبة' });
    }

    const updateOrder = db.prepare('UPDATE project_items SET sort_order = ? WHERE id = ? AND project_id = ?');
    const transaction = db.transaction(() => {
      itemIds.forEach((id, index) => {
        updateOrder.run(index, id, req.params.projectId);
      });
    });

    transaction();

    const items = db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY sort_order').all(req.params.projectId);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
