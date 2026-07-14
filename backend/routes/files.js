const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const fileGenerator = require('../services/fileGenerator');
const path = require('path');
const fs = require('fs');

router.get('/:projectId', (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const files = db.prepare('SELECT * FROM generated_files WHERE project_id = ? ORDER BY created_at DESC').all(req.params.projectId);
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId/generate', async (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'المشروع غير موجود' });

    const { file_type, file_format } = req.body;
    if (!file_type) return res.status(400).json({ success: false, error: 'نوع الملف مطلوب' });

    const format = file_format || 'xlsx';
    if (!['xlsx', 'pdf', 'docx'].includes(format)) {
      return res.status(400).json({ success: false, error: 'صيغة غير مدعومة. اختر xlsx, pdf, أو docx' });
    }

    const result = await fileGenerator.generateFile({
      projectId: req.params.projectId,
      fileType: file_type,
      format,
      outputDir: path.join(__dirname, '..', 'generated'),
    });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    const fileRecord = db.prepare('SELECT * FROM generated_files WHERE file_path = ?').get(result.filePath);

    db.prepare(`
      INSERT INTO activity_logs (id, user_id, project_id, action_type, action_description, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), req.body.user_id || null, req.params.projectId, 'file_generated', `تم إنشاء ملف: ${result.fileName}`, JSON.stringify({ file_type, format, filePath: result.filePath }));

    res.status(201).json({ success: true, data: { ...result, file: fileRecord } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:projectId/download/:fileId', (req, res) => {
  try {
    const db = getDb();
    const file = db.prepare('SELECT * FROM generated_files WHERE id = ? AND project_id = ?').get(req.params.fileId, req.params.projectId);
    if (!file) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

    if (!file.file_path || !fs.existsSync(file.file_path)) {
      return res.status(404).json({ success: false, error: 'ملف غير موجود على الخادم' });
    }

    const ext = path.extname(file.file_path).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.csv': 'text/csv; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
    res.download(file.file_path, file.file_name);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:projectId/:fileId/approve', (req, res) => {
  try {
    const db = getDb();
    const file = db.prepare('SELECT * FROM generated_files WHERE id = ? AND project_id = ?').get(req.params.fileId, req.params.projectId);
    if (!file) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

    const { user_id, notes } = req.body;
    const now = new Date().toISOString();

    db.prepare('UPDATE generated_files SET status = ?, approved_by = ?, approved_at = ?, notes = ? WHERE id = ?')
      .run('معتمد', user_id || null, now, notes || file.notes, req.params.fileId);

    const updated = db.prepare('SELECT * FROM generated_files WHERE id = ?').get(req.params.fileId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:projectId/:fileId', (req, res) => {
  try {
    const db = getDb();
    const file = db.prepare('SELECT * FROM generated_files WHERE id = ? AND project_id = ?').get(req.params.fileId, req.params.projectId);
    if (!file) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

    res.json({ success: true, data: file });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
