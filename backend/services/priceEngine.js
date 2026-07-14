const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

function getLatestPrice(itemId) {
  const db = getDb();
  const now = new Date().toISOString();
  const price = db.prepare(`
    SELECT * FROM prices
    WHERE item_id = ? AND status = 'معتمد'
      AND (valid_until IS NULL OR valid_until >= ?)
    ORDER BY date_recorded DESC
    LIMIT 1
  `).get(itemId, now);
  return price || null;
}

function getPricesForItem(itemId, includeExpired = false) {
  const db = getDb();
  if (includeExpired) {
    return db.prepare('SELECT * FROM prices WHERE item_id = ? ORDER BY date_recorded DESC').all(itemId);
  }
  const now = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM prices
    WHERE item_id = ? AND status = 'معتمد'
      AND (valid_until IS NULL OR valid_until >= ?)
    ORDER BY date_recorded DESC
  `).all(itemId, now);
}

function getPricesBySupplier(supplierId) {
  const db = getDb();
  return db.prepare('SELECT * FROM prices WHERE supplier_id = ? ORDER BY date_recorded DESC').all(supplierId);
}

function addPrice(data) {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO prices (id, item_id, material_cost, labor_cost, equipment_cost, transport_cost, supplier_name, supplier_id, city, date_recorded, valid_until, status, added_by, source_document, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.item_id,
    data.material_cost ?? null,
    data.labor_cost ?? null,
    data.equipment_cost ?? null,
    data.transport_cost ?? null,
    data.supplier_name || null,
    data.supplier_id || null,
    data.city || null,
    now,
    data.valid_until || null,
    data.status || 'قيد_المراجعة',
    data.added_by || null,
    data.source_document || null,
    data.notes || null
  );
  logPriceChange({ action: 'price_added', price_id: id, item_id: data.item_id, user_id: data.added_by, details: { material_cost: data.material_cost, labor_cost: data.labor_cost } });
  return db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
}

function updatePrice(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
  if (!existing) return null;
  const fields = [];
  const values = [];
  for (const key of ['material_cost', 'labor_cost', 'equipment_cost', 'transport_cost', 'supplier_name', 'supplier_id', 'city', 'valid_until', 'status', 'source_document', 'notes']) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (data.approved_by !== undefined) {
    fields.push('approved_by = ?');
    values.push(data.approved_by);
    fields.push('date_updated = ?');
    values.push(new Date().toISOString());
  }
  if (fields.length === 0) return existing;
  fields.push('date_updated = ?');
  values.push(new Date().toISOString());
  values.push(id);
  db.prepare(`UPDATE prices SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  logPriceChange({ action: 'price_updated', price_id: id, item_id: existing.item_id, details: data });
  return db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
}

function approvePrice(id, userId) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE prices SET status = ?, approved_by = ?, date_updated = ? WHERE id = ?').run('معتمد', userId, now, id);
  logPriceChange({ action: 'price_approved', price_id: id, item_id: existing.item_id, user_id: userId });
  return db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
}

function rejectPrice(id, userId, reason) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE prices SET status = ?, approved_by = ?, notes = ?, date_updated = ? WHERE id = ?').run('مرفوض', userId, reason || existing.notes, now, id);
  logPriceChange({ action: 'price_rejected', price_id: id, item_id: existing.item_id, user_id: userId, details: { reason } });
  return db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
}

function isPriceValid(price) {
  if (!price) return false;
  if (price.status !== 'معتمد') return false;
  if (price.valid_until) {
    const now = new Date();
    const validUntil = new Date(price.valid_until);
    if (now > validUntil) return false;
  }
  return true;
}

function validatePrice(price, itemId) {
  const db = getDb();
  const item = db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(itemId || price.item_id);
  const warnings = [];
  const errors = [];
  if (!price) return { valid: false, errors: ['لا يوجد سعر'], warnings: [] };
  if (price.status !== 'معتمد') errors.push('السعر غير معتمد');
  if (price.valid_until) {
    const now = new Date();
    if (new Date(price.valid_until) < now) errors.push('السعر منتهي الصلاحية');
  }
  const total = (price.material_cost || 0) + (price.labor_cost || 0) + (price.equipment_cost || 0) + (price.transport_cost || 0);
  if (total <= 0) errors.push('السعر الإجمالي صفر أو سالب');
  if (item && price.material_cost != null) {
    const avgPrice = db.prepare('SELECT AVG(material_cost) as avg_cost FROM prices WHERE item_id = ? AND status = ? AND material_cost > 0').get(price.item_id, 'معتمد');
    if (avgPrice && avgPrice.avg_cost) {
      const ratio = price.material_cost / avgPrice.avg_cost;
      if (ratio > 2) warnings.push('تكلفة المواد أعلى بكثير من المتوسط');
      if (ratio < 0.5 && ratio > 0) warnings.push('تكلفة المواد أقل بكثير من المتوسط');
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

function calculateTotal({ price, quantity, wasteRate, profitMargin, vatRate }) {
  if (!price) return null;
  const unitCost = (price.material_cost || 0) + (price.labor_cost || 0) + (price.equipment_cost || 0) + (price.transport_cost || 0);
  const qty = quantity || 1;
  const waste = wasteRate || price.typical_waste || 0;
  const profit = profitMargin || 0.15;
  const vat = vatRate || 0.15;
  const costBeforeProfit = qty * (1 + waste) * unitCost;
  const profitAmount = costBeforeProfit * profit;
  const subtotal = costBeforeProfit + profitAmount;
  const vatAmount = subtotal * vat;
  const total = subtotal + vatAmount;
  return {
    unitCost,
    quantity: qty,
    wasteRate: waste,
    costWithWaste: qty * (1 + waste) * unitCost,
    profitMargin: profit,
    profitAmount,
    subtotal,
    vatRate: vat,
    vatAmount,
    total: Math.round(total * 100) / 100,
    breakdown: {
      materials: price.material_cost || 0,
      labor: price.labor_cost || 0,
      equipment: price.equipment_cost || 0,
      transport: price.transport_cost || 0,
    },
  };
}

function importPrices(prices, userId) {
  const db = getDb();
  const results = { imported: 0, skipped: 0, errors: [] };
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO prices (id, item_id, material_cost, labor_cost, equipment_cost, transport_cost, supplier_name, supplier_id, city, date_recorded, valid_until, status, added_by, source_document, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const transaction = db.transaction((items) => {
    for (const data of items) {
      if (!data.item_id) {
        results.errors.push({ item: data.name || 'unknown', error: 'رقم العنصر مطلوب' });
        results.skipped++;
        continue;
      }
      const itemExists = db.prepare('SELECT id FROM knowledge_items WHERE id = ?').get(data.item_id);
      if (!itemExists) {
        results.errors.push({ item: data.item_id, error: 'العنصر غير موجود في قاعدة المعرفة' });
        results.skipped++;
        continue;
      }
      const id = uuidv4();
      insert.run(
        id,
        data.item_id,
        data.material_cost ?? null,
        data.labor_cost ?? null,
        data.equipment_cost ?? null,
        data.transport_cost ?? null,
        data.supplier_name || null,
        data.supplier_id || null,
        data.city || null,
        now,
        data.valid_until || null,
        'قيد_المراجعة',
        userId || null,
        data.source_document || null,
        data.notes || null
      );
      logPriceChange({ action: 'price_imported', price_id: id, item_id: data.item_id, user_id: userId, details: { supplier: data.supplier_name } });
      results.imported++;
    }
  });
  transaction(prices);
  return results;
}

function getPriceHistory(itemId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM prices WHERE item_id = ? ORDER BY date_recorded DESC
  `).all(itemId);
}

function getPendingApprovals() {
  const db = getDb();
  return db.prepare(`
    SELECT p.*, k.name_ar as item_name, k.code as item_code
    FROM prices p
    JOIN knowledge_items k ON k.id = p.item_id
    WHERE p.status = 'قيد_المراجعة'
    ORDER BY p.date_recorded ASC
  `).all();
}

function logPriceChange({ action, price_id, item_id, user_id, details }) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO activity_logs (id, user_id, action_type, action_description, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), user_id || null, action, `تغيير سعر العنصر ${item_id || ''}`, JSON.stringify(details || {}));
  } catch (e) {
    console.error('Failed to log price change:', e.message);
  }
}

module.exports = {
  getLatestPrice,
  getPricesForItem,
  getPricesBySupplier,
  addPrice,
  updatePrice,
  approvePrice,
  rejectPrice,
  isPriceValid,
  validatePrice,
  calculateTotal,
  importPrices,
  getPriceHistory,
  getPendingApprovals,
};
