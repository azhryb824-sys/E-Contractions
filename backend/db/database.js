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

    CREATE TABLE IF NOT EXISTS question_catalog (
      question_id TEXT PRIMARY KEY,
      definition_json TEXT NOT NULL,
      catalog_version TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS question_versions (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      catalog_version TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(question_id, catalog_version)
    );

    CREATE TABLE IF NOT EXISTS project_answers (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('explicit','inferred','unknown','out_of_scope','not_applicable')),
      value_json TEXT,
      source TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1,
      confirmed_by_user INTEGER DEFAULT 0,
      answered_at TEXT DEFAULT (datetime('now')),
      catalog_version TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(project_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS project_inferences (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      state TEXT NOT NULL,
      value_json TEXT,
      source TEXT NOT NULL,
      confidence REAL NOT NULL,
      confirmed_by_user INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, field_key)
    );

    CREATE TABLE IF NOT EXISTS project_question_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      dataset_group TEXT,
      current_stage TEXT DEFAULT 'description',
      revision INTEGER NOT NULL DEFAULT 1,
      status TEXT DEFAULT 'draft',
      last_saved_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_blockers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      blocker_type TEXT NOT NULL,
      blocker_key TEXT NOT NULL,
      details_json TEXT DEFAULT '{}',
      is_resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS project_zones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      zone_type TEXT NOT NULL,
      name_ar TEXT,
      area REAL,
      floors_json TEXT,
      state TEXT DEFAULT 'explicit',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_path TEXT,
      document_type TEXT,
      extraction_state TEXT DEFAULT 'pending',
      extracted_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quantity_driver_catalog (
      item_code TEXT PRIMARY KEY,
      item_name_ar TEXT NOT NULL,
      canonical_unit TEXT NOT NULL,
      quantity_driver TEXT,
      calculation_method TEXT NOT NULL,
      required_inputs_json TEXT NOT NULL,
      fallback_policy TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      engineering_reviewed INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const projectColumns = new Set(db.prepare('PRAGMA table_info(projects)').all().map(column => column.name));
  const additions = {
    execution_mode: "TEXT NOT NULL DEFAULT 'show_for_approval'",
    questionnaire_version: "TEXT NOT NULL DEFAULT 'dynamic-questionnaire-v1'",
    revision: 'INTEGER NOT NULL DEFAULT 1',
    scope: 'TEXT',
    bathroom_count: 'INTEGER'
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!projectColumns.has(name)) db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${definition}`);
  }
  const itemColumns = new Set(db.prepare('PRAGMA table_info(project_items)').all().map(column => column.name));
  const itemAdditions = {
    quantity_state: 'TEXT', quantity_driver: 'TEXT', required_inputs_json: 'TEXT', quantity_confidence: 'REAL',
    can_enter_approved_boq: 'INTEGER DEFAULT 0', rule_id: 'TEXT', rule_version: 'TEXT', zone_id: 'TEXT',
    pricing_status: "TEXT DEFAULT 'unpriced'"
  };
  for (const [name, definition] of Object.entries(itemAdditions)) {
    if (!itemColumns.has(name)) db.exec(`ALTER TABLE project_items ADD COLUMN ${name} ${definition}`);
  }
}

module.exports = { getDb };
