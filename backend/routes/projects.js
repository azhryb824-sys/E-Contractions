const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const suggestionEngine = require('../services/suggestionEngine');
const quantityEngine = require('../services/quantityEngine');
const validator = require('../services/validator');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { status, type, user_id } = req.query;
    let sql = 'SELECT * FROM projects WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (type) {
      sql += ' AND project_type = ?';
      params.push(type);
    }
    if (user_id) {
      sql += ' AND user_id = ?';
      params.push(user_id);
    }

    sql += ' ORDER BY created_at DESC';
    const projects = db.prepare(sql).all(...params);
    res.json({ success: true, data: projects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function normalizeAssumptions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(a => typeof a === 'string' && a.trim());
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(a => typeof a === 'string' && a.trim()) : []; }
    catch (e) { return value.trim() ? [value] : []; }
  }
  return [];
}

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    let items = db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY sort_order, category, name_ar').all(req.params.id);

    // Auto-predict if no items and auto_predict flag is set (default: true)
    const autoPredict = req.query.auto_predict !== 'false';
      if (items.length === 0 && autoPredict) {
        try {
          const inferenceEngine = require('../ai/inference-engine');

          // If no scope set, auto-infer from title/description
          let scope = project.scope || '';
          if (!scope) {
            const understanding = inferenceEngine.understandProject({
              title: project.title, description: project.description,
              project_type: project.project_type
            });
            if (understanding.inferred_values.scope) {
              scope = understanding.inferred_values.scope.value;
            } else {
              scope = 'تشطيب كامل'; // safest default
            }
          }

          const requestParams = {
            title: project.title,
            description: project.description,
            project_type: project.project_type,
            building_type: project.building_type,
            city: project.city,
            area: project.area || 150,
            rooms: project.room_count || 3,
            bathrooms: project.bathroom_count || 2,
            floors: project.floor_count || 1,
            finish_level: project.finish_level || 'متوسط',
            scope: scope,
          };
          const boqResult = inferenceEngine.generateBoq(requestParams, 'no_additions');
          if (boqResult.status === 'ready' || boqResult.status === 'validation_errors') {
            const sections = boqResult.sections || [];

            db.prepare('DELETE FROM project_items WHERE project_id = ? AND source LIKE ?').run(req.params.id, 'ai_%');
            const insert = db.prepare(`INSERT INTO project_items (id, project_id, item_id, code, name_ar, category, unit, quantity, confidence, source, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            const now = new Date().toISOString();
            let sortOrder = 0;

            const transaction = db.transaction(() => {
              for (const section of sections) {
                for (const item of section.items || []) {
                  const id = uuidv4();
                  const qty = item.quantity || 0;
                  const source = typeof item.source === 'string' ? item.source : 'ai_prediction';
                  insert.run(id, req.params.id, null, item.code, item.name_ar, item.category || section.name, item.unit || 'م²', typeof qty === 'number' ? Math.round(qty * 100) / 100 : 0, item.confidence || 0, source, sortOrder++, now);
                }
              }
            });
            transaction();

            db.prepare('UPDATE projects SET assumptions = ?, scope = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(boqResult.assumptions || []), boqResult.project?.scope || project.scope, now, req.params.id);
            items = db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY sort_order, category, name_ar').all(req.params.id);
          }
        } catch (e) {
          console.error('Auto-predict failed for project', req.params.id, e.message);
        }
      }

    const files = db.prepare('SELECT * FROM generated_files WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);
    const projectWithAssumptions = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);

    const normalized = {
      ...projectWithAssumptions,
      assumptions: normalizeAssumptions(projectWithAssumptions.assumptions),
      items: items.map(item => ({
        ...item,
        confidence: item.confidence != null ? item.confidence : null,
      })),
      files,
    };

    res.json({ success: true, data: normalized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { title, description, project_type, building_type, city, area, floor_count, room_count, finish_level, user_id, client_id } = req.body;

    const validation = validator.validateProjectData(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.errors.join('; '), warnings: validation.warnings });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO projects (id, title, description, project_type, building_type, city, area, floor_count, room_count, finish_level, user_id, client_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, description || null, project_type, building_type || null, city || null, area || null, floor_count || null, room_count || null, finish_level || 'متوسط', user_id || null, client_id || null, now, now);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const allowed = ['title', 'description', 'project_type', 'building_type', 'city', 'area', 'floor_count', 'room_count', 'finish_level', 'status', 'accuracy_level', 'user_id', 'client_id', 'assumptions'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'assumptions' ? (typeof req.body[key] === 'string' ? req.body[key] : JSON.stringify(req.body[key])) : req.body[key]);
      }
    }

    if (fields.length === 0) return res.json({ success: true, data: existing });

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);

    db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    db.prepare('DELETE FROM project_items WHERE project_id = ?').run(req.params.id);
    db.prepare('DELETE FROM generated_files WHERE project_id = ?').run(req.params.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);

    res.json({ success: true, data: existing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/predict', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const inferenceEngine = require('../ai/inference-engine');

    // First, analyze project understanding
    const understanding = inferenceEngine.understandProject({
      title: project.title,
      description: project.description,
      project_type: project.project_type,
      building_type: project.building_type,
      city: project.city,
      area: project.area,
      rooms: project.room_count,
      bathrooms: project.bathroom_count,
      floors: project.floor_count,
      finish_level: project.finish_level,
      scope: project.scope || req.body.scope || '',
    });

    // If scope is missing, return scope confirmation question
    if (understanding.status === 'awaiting_scope_confirmation' && !project.scope && !req.body.scope) {
      return res.json({
        success: true,
        data: {
          status: 'awaiting_scope_confirmation',
          understood_project: {
            explicit_values: understanding.explicit_values,
            inferred_values: understanding.inferred_values,
            missing_information: understanding.missing_information
          },
          question: 'ما نطاق المشروع المطلوب؟',
          options: inferenceEngine.getScopeConfirmationOptions()
        }
      });
    }

    const scope = project.scope || req.body.scope || (understanding.inferred_values.scope ? understanding.inferred_values.scope.value : '');

    const requestParams = {
      title: project.title,
      description: project.description,
      project_type: project.project_type,
      building_type: project.building_type,
      city: project.city,
      area: project.area || 150,
      rooms: project.room_count || 3,
      bathrooms: project.bathroom_count || 2,
      floors: project.floor_count || 1,
      finish_level: project.finish_level || 'متوسط',
      scope: scope,
    };

    const boqResult = inferenceEngine.generateBoq(requestParams, 'no_additions');
    if (boqResult.status === 'error') {
      return res.status(400).json({ success: false, error: boqResult.error });
    }

    const sections = boqResult.sections || [];

    // Save per-request debug files
    const requestId = uuidv4();
    const debugDir = path.join(__dirname, '..', 'generated', 'debug');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
    const debugPrefix = path.join(debugDir, requestId);

    fs.writeFileSync(debugPrefix + '-project.json', JSON.stringify({ project_id: req.params.id, request_id: requestId, project, inference_mode: boqResult.inference_mode || 'unknown', model_version: boqResult.model?.version || 'none', created_at: new Date().toISOString() }, null, 2));
    fs.writeFileSync(debugPrefix + '-prediction.json', JSON.stringify({ project_id: req.params.id, request_id: requestId, inference_mode: boqResult.inference_mode || 'unknown', model_version: boqResult.model?.version || 'none', sections_count: sections.length, items_count: sections.reduce((s, sec) => s + (sec.items || []).length, 0), assumptions: boqResult.assumptions || [], created_at: new Date().toISOString(), sections }, null, 2));

    // Delete existing AI predictions for this project
    db.prepare('DELETE FROM project_items WHERE project_id = ? AND source LIKE ?').run(req.params.id, 'ai_%');

    const insert = db.prepare(`
      INSERT INTO project_items (id, project_id, item_id, code, name_ar, category, unit, quantity, confidence, source, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    let sortOrder = 0;
    const flatItems = [];

    const transaction = db.transaction(() => {
      for (const section of sections) {
        for (const item of section.items || []) {
          const id = uuidv4();
          const itemSource = typeof item.source === 'string' ? item.source : (Array.isArray(item.sources) ? item.sources[0] : 'ai_prediction');
          const qty = item.quantity || 0;
          insert.run(id, req.params.id, null, item.code, item.name_ar, item.category || section.name, item.unit || 'م²', typeof qty === 'number' ? Math.round(qty * 100) / 100 : 0, item.confidence || 0, itemSource, sortOrder++, now);
          flatItems.push({ id, ...item, section_name: section.name });
        }
      }
    });

    transaction();

    const savedItems = db.prepare('SELECT * FROM project_items WHERE project_id = ? AND source NOT IN (?) ORDER BY sort_order LIMIT 500').all(req.params.id, '');

    // Update project with prediction summary and scope
    const totalSections = sections.length;
    const totalItems = flatItems.length;
    const predictionSummary = `تم توقع ${totalSections} قسم و ${totalItems} بند`;
    db.prepare('UPDATE projects SET assumptions = ?, scope = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(boqResult.assumptions || []), scope, now, req.params.id);

    res.json({
      success: true,
      data: {
        project_id: req.params.id,
        request_id: requestId,
        sections,
        items: savedItems,
        summary: predictionSummary,
        understanding: boqResult.understanding,
        has_inferred_values: boqResult.has_inferred_values,
        scope_confirmed: boqResult.scope_confirmed,
        validation_issues: boqResult.validation_issues || []
      }
    });
  } catch (err) {
    console.error('Predict error:', err.message);
    res.status(500).json({ success: false, error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
  }
});

router.post('/:id/analyze', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const estimates = quantityEngine.estimateFromProject(req.params.id);
    if (!estimates || !estimates.estimates || estimates.estimates.length === 0) {
      return res.status(400).json({ success: false, error: estimates?.message || 'لا يمكن تقدير الكميات - بيانات غير كافية', data: estimates });
    }

    const items = [];
    for (const est of estimates.estimates) {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO project_items (id, project_id, code, name_ar, category, unit, quantity, waste_rate, source, confidence, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.params.id, `EST-${Date.now()}-${items.length}`, est.item, 'تقدير آلي', est.unit, est.quantity, 0.05, 'ai_estimate', est.confidence, items.length);
      items.push(db.prepare('SELECT * FROM project_items WHERE id = ?').get(id));
    }

    db.prepare('UPDATE projects SET accuracy_level = ?, updated_at = ? WHERE id = ?').run('تقدير_تفصيلي', new Date().toISOString(), req.params.id);

    res.json({ success: true, data: { project_id: req.params.id, items, estimates: estimates.estimates, confidence: estimates.confidence } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/suggest', (req, res) => {
  try {
    const project = require('../db/database').getDb().prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const mode = req.body.mode || 'show_before_add';
    const result = suggestionEngine.getSuggestedItemsForProject(req.params.id, mode);

    if (!result) return res.status(500).json({ success: false, error: 'فشل في إنشاء الاقتراحات' });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/apply-suggestions', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const { suggestionIds, suggestions } = req.body;
    let itemsToAdd = [];

    if (Array.isArray(suggestionIds) && suggestionIds.length > 0) {
      const allSuggestions = suggestionEngine.getSuggestedItemsForProject(req.params.id, 'show_before_add');
      itemsToAdd = allSuggestions.suggestions.filter(s => suggestionIds.includes(s.id));
    } else if (Array.isArray(suggestions)) {
      itemsToAdd = suggestions;
    } else {
      return res.status(400).json({ success: false, error: 'يرجى تقديم suggestionIds أو suggestions' });
    }

    const existingItems = db.prepare('SELECT * FROM project_items WHERE project_id = ?').all(req.params.id);
    const existingNames = new Set(existingItems.map(i => i.name_ar));
    const added = [];

    for (const sug of itemsToAdd) {
      if (existingNames.has(sug.name)) continue;

      const id = uuidv4();
      const sortOrder = existingItems.length + added.length;

      db.prepare(`
        INSERT INTO project_items (id, project_id, code, name_ar, category, unit, quantity, waste_rate, source, confidence, sort_order, item_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.params.id, `SUG-${Date.now()}-${added.length}`, sug.name, sug.category || 'مقترح', sug.unit || 'م²', 0, 0.05, 'suggestion', sug.confidence || 0.5, sortOrder, sug.item_id || null);

      existingItems.push({ name_ar: sug.name });
      existingNames.add(sug.name);
      added.push(db.prepare('SELECT * FROM project_items WHERE id = ?').get(id));
    }

    res.json({ success: true, data: { project_id: req.params.id, added, count: added.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
