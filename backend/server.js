const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize database
getDb();

// API Routes
app.use('/api/projects', require('./routes/projects'));
app.use('/api/items', require('./routes/items'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/files', require('./routes/files'));
app.use('/api/users', require('./routes/users'));
app.use('/api/logs', require('./routes/logs'));

// Settings endpoints
app.get('/api/settings', (req, res) => {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT key, value FROM system_settings').all();
    const result = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const db = getDb();
    const { key, value } = req.body;
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))').run(key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dashboard stats
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const db = getDb();
    const projects = db.prepare('SELECT COUNT(*) as total FROM projects').get();
    const activeProjects = db.prepare('SELECT COUNT(*) as total FROM projects WHERE status != \'complete\'').get();
    const suppliers = db.prepare('SELECT COUNT(*) as total FROM suppliers WHERE is_active = 1').get();
    const items = db.prepare('SELECT COUNT(*) as total FROM knowledge_items').get();
    const prices = db.prepare('SELECT COUNT(*) as total FROM prices WHERE status = \'معتمد\'').get();

    const recentProjects = db.prepare(`
      SELECT p.id, p.title, p.project_type, p.status, p.accuracy_level, p.updated_at,
             u.full_name as user_name
      FROM projects p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.updated_at DESC LIMIT 5
    `).all();

    res.json({
      success: true,
      data: {
        projectCount: projects.total,
        activeProjects: activeProjects.total,
        supplierCount: suppliers.total,
        itemsCount: items.total,
        approvedPrices: prices.total,
        recentProjects
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize seed data if empty
const db = getDb();
const count = db.prepare('SELECT COUNT(*) as c FROM knowledge_items').get();
if (count.c === 0) {
  console.log('⚠️ قاعدة البيانات فارغة - جاري البذر...');
  require('./db/seed');
  console.log('✅ تم بذر قاعدة البيانات');
}

// Serve frontend build in production
const fs = require('fs');
const frontendDist = path.resolve(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
  console.log(`🌐 الواجهة الأمامية: http://localhost:${PORT}`);
} else {
  console.log(`⚠️ لم يتم العثور على بناء الواجهة الأمامية. قم بتشغيل: cd frontend && npx vite build`);
}

app.listen(PORT, () => {
  console.log(`🚀 المقاول الإلكتروني - Backend يعمل على المنفذ ${PORT}`);
  console.log(`🌐 API: http://localhost:${PORT}/api`);
});
