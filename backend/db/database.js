const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'almoqawel.db');
let db;

function getDb() {
  if (db) return db;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema();
  return db;
}

function initSchema() {
  db.exec(`
    -- المستخدمون والصلاحيات
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'engineer',
      organization TEXT,
      logo_path TEXT,
      is_active INTEGER DEFAULT 1,
      preferences TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- العملاء
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- المشاريع
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      project_type TEXT NOT NULL,
      building_type TEXT,
      city TEXT,
      area REAL,
      floor_count INTEGER,
      room_count INTEGER,
      finish_level TEXT DEFAULT 'متوسط',
      status TEXT DEFAULT 'مسودة',
      accuracy_level TEXT DEFAULT 'تقدير_أولي',
      user_id TEXT REFERENCES users(id),
      client_id TEXT REFERENCES clients(id),
      assumptions TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- بنود الأعمال (قاعدة المعرفة)
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      category TEXT NOT NULL,
      parent_id TEXT REFERENCES knowledge_items(id),
      unit TEXT NOT NULL,
      description TEXT,
      typical_waste REAL DEFAULT 0.05,
      related_items TEXT DEFAULT '[]',
      suggested_sections TEXT DEFAULT '[]',
      phase TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- الأسعار
    CREATE TABLE IF NOT EXISTS prices (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES knowledge_items(id),
      material_cost REAL,
      labor_cost REAL,
      equipment_cost REAL,
      transport_cost REAL,
      unit_price REAL GENERATED ALWAYS AS (COALESCE(material_cost,0) + COALESCE(labor_cost,0) + COALESCE(equipment_cost,0) + COALESCE(transport_cost,0)) STORED,
      supplier_name TEXT,
      supplier_id TEXT REFERENCES suppliers(id),
      city TEXT,
      date_recorded TEXT DEFAULT (datetime('now')),
      date_updated TEXT DEFAULT (datetime('now')),
      valid_until TEXT,
      status TEXT DEFAULT 'قيد_المراجعة',
      added_by TEXT REFERENCES users(id),
      approved_by TEXT REFERENCES users(id),
      source_document TEXT,
      notes TEXT
    );

    -- الموردون
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      category TEXT,
      rating INTEGER DEFAULT 3,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- بنود المشروع (جدول الكميات)
    CREATE TABLE IF NOT EXISTS project_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      item_id TEXT REFERENCES knowledge_items(id),
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      waste_rate REAL DEFAULT 0.05,
      material_cost REAL,
      labor_cost REAL,
      equipment_cost REAL,
      transport_cost REAL,
      total_cost REAL GENERATED ALWAYS AS (
        quantity * (1 + COALESCE(waste_rate,0)) * (COALESCE(material_cost,0) + COALESCE(labor_cost,0) + COALESCE(equipment_cost,0) + COALESCE(transport_cost,0))
      ) STORED,
      source TEXT DEFAULT 'user',
      confidence REAL DEFAULT 1.0,
      notes TEXT,
      is_approved INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- الملفات المرفوعة
    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      file_name TEXT NOT NULL,
      file_path TEXT,
      file_type TEXT,
      file_size INTEGER,
      content_extracted TEXT,
      uploaded_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- الملفات المولدة
    CREATE TABLE IF NOT EXISTS generated_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_path TEXT,
      status TEXT DEFAULT 'مسودة',
      version INTEGER DEFAULT 1,
      generated_by TEXT REFERENCES users(id),
      approved_by TEXT REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      approved_at TEXT
    );

    -- المعاملات (سجل العمليات)
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      project_id TEXT REFERENCES projects(id),
      action_type TEXT NOT NULL,
      action_description TEXT NOT NULL,
      details TEXT DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- إعدادات النظام
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by TEXT REFERENCES users(id),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- الصلاحيات
    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      is_granted INTEGER DEFAULT 1,
      UNIQUE(role, permission_key)
    );

    -- الإشعارات
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT,
      type TEXT DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      related_type TEXT,
      related_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { getDb };
