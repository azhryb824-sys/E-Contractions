const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODELS_DIR = path.join(__dirname, 'models');
const CURRENT_DIR = path.join(MODELS_DIR, 'current');
const ARCHIVE_DIR = path.join(MODELS_DIR, 'archive');

const MODEL_FILE = path.join(CURRENT_DIR, 'model.json');
const METADATA_FILE = path.join(CURRENT_DIR, 'metadata.json');
const METRICS_FILE = path.join(CURRENT_DIR, 'metrics.json');

const ITEM_DICTIONARY_PATH = path.join(__dirname, 'data', 'catalogs', 'items.json');

const REQUIRED_MODEL_FIELDS = ['type', 'algorithm', 'trained_at', 'data'];
const REQUIRED_DATA_KEYS = ['item_item_matrix', 'item_section_map', 'section_probabilities', 'item_probabilities', 'building_type_item_stats', 'finish_level_item_stats', 'item_quantity_stats', 'quantity_models'];

function generateVersion(newAlgorithm) {
  const now = new Date();
  const dateStr = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  let major = 1, minor = 0, patch = 0;
  try {
    if (fs.existsSync(METADATA_FILE)) {
      const meta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
      const current = meta.model_version || '';
      const match = current.match(/v(\d+)\.(\d+)\.(\d+)/);
      if (match) {
        const oldAlgo = meta.algorithm || '';
        if (newAlgorithm && newAlgorithm !== oldAlgo) {
          major = parseInt(match[1], 10) + 1;
          minor = 0;
          patch = 0;
        } else {
          major = parseInt(match[1], 10);
          minor = parseInt(match[2], 10) + 1;
          patch = 0;
        }
      }
    }
  } catch (e) {
    major = 1; minor = 0; patch = 0;
  }
  return `v${major}.${minor}.${patch}-${dateStr}`;
}

function modelExists() {
  return fs.existsSync(MODEL_FILE) && fs.existsSync(METADATA_FILE);
}

function safeParseJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { data: JSON.parse(raw), error: null };
  } catch (e) {
    return { data: null, error: `فشل في قراءة ${path.basename(filePath)}: ${e.message}` };
  }
}

function loadItemDictionary() {
  if (!fs.existsSync(ITEM_DICTIONARY_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(ITEM_DICTIONARY_PATH, 'utf-8'));
    // Convert array to map if needed
    if (Array.isArray(raw)) {
      const map = {};
      for (const item of raw) { if (item && item.code) map[item.code] = item; }
      return map;
    }
    return raw;
  } catch (e) {
    return null;
  }
}

function validateModelCompatibility(model) {
  const issues = [];
  if (!model || !model.data) {
    return { compatible: false, issues: ['النموذج لا يحتوي على بيانات صالحة'] };
  }
  const dict = loadItemDictionary();
  if (!dict) {
    return { compatible: true, issues: ['لا يمكن التحقق من التوافق - قاموس العناصر غير متوفر'] };
  }
  const modelItems = Object.keys(model.data.item_item_matrix || {});
  for (const itemCode of modelItems) {
    if (!dict[itemCode]) {
      issues.push(`العنصر ${itemCode} موجود في النموذج ولكنه غير موجود في قاموس العناصر الحالي`);
    }
  }
  const dictVersion = dict._version || '1.0';
  const modelSchemaVersion = model.data.feature_schema_version || '1.0';
  if (dictVersion !== modelSchemaVersion) {
    issues.push(`إصدار قاموس العناصر (${dictVersion}) لا يتطابق مع إصدار ميزات النموذج (${modelSchemaVersion})`);
  }
  return { compatible: issues.length === 0, issues };
}

function loadModel() {
  if (!modelExists()) {
    return { success: false, model: null, metadata: null, error: 'لا يوجد نموذج مدرب حالياً' };
  }
  const modelResult = safeParseJSON(MODEL_FILE);
  if (!modelResult.data) {
    return { success: false, model: null, metadata: null, error: modelResult.error };
  }
  const metaResult = safeParseJSON(METADATA_FILE);
  if (!metaResult.data) {
    return { success: false, model: null, metadata: null, error: metaResult.error };
  }
  const compatibility = validateModelCompatibility(modelResult.data);
  if (!compatibility.compatible) {
    return { success: false, model: null, metadata: null, error: 'النموذج غير متوافق مع الإصدار الحالي: ' + compatibility.issues.join('; ') };
  }
  let metrics = null;
  if (fs.existsSync(METRICS_FILE)) {
    const metricsResult = safeParseJSON(METRICS_FILE);
    if (metricsResult.data) metrics = metricsResult.data;
  }
  return { success: true, model: modelResult.data, metadata: { ...metaResult.data, metrics }, error: null };
}

function getModelMetadata() {
  if (!modelExists()) return null;
  const metaResult = safeParseJSON(METADATA_FILE);
  if (!metaResult.data) return null;
  let metrics = null;
  if (fs.existsSync(METRICS_FILE)) {
    const metricsResult = safeParseJSON(METRICS_FILE);
    if (metricsResult.data) metrics = metricsResult.data;
  }
  let algorithm = null;
  const modelResult = safeParseJSON(MODEL_FILE);
  if (modelResult.data) algorithm = modelResult.data.algorithm;
  return {
    version: metaResult.data.model_version,
    trainedAt: metaResult.data.trained_at,
    algorithm: algorithm || metaResult.data.algorithm,
    metrics
  };
}

function archiveCurrentModel() {
  if (!modelExists()) {
    return { success: false, archivePath: null, error: 'لا يوجد نموذج حالي لأرشفته' };
  }
  const metaResult = safeParseJSON(METADATA_FILE);
  if (!metaResult.data) {
    return { success: false, archivePath: null, error: metaResult.error };
  }
  const version = metaResult.data.model_version;
  if (!version) {
    return { success: false, archivePath: null, error: 'إصدار النموذج غير معروف' };
  }
  const archiveDir = path.join(ARCHIVE_DIR, version);
  try {
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    if (fs.existsSync(MODEL_FILE)) {
      fs.copyFileSync(MODEL_FILE, path.join(archiveDir, 'model.json'));
    }
    if (fs.existsSync(METADATA_FILE)) {
      fs.copyFileSync(METADATA_FILE, path.join(archiveDir, 'metadata.json'));
    }
    if (fs.existsSync(METRICS_FILE)) {
      fs.copyFileSync(METRICS_FILE, path.join(archiveDir, 'metrics.json'));
    }
    return { success: true, archivePath: archiveDir, error: null };
  } catch (e) {
    return { success: false, archivePath: null, error: `فشل في الأرشفة: ${e.message}` };
  }
}

function saveModel(modelData) {
  if (!modelData || typeof modelData !== 'object') {
    return { success: false, version: null, path: null, error: 'بيانات النموذج غير صالحة' };
  }
  for (const field of REQUIRED_MODEL_FIELDS) {
    if (!(field in modelData)) {
      return { success: false, version: null, path: null, error: `الحقل المطلوب '${field}' غير موجود` };
    }
  }
  for (const key of REQUIRED_DATA_KEYS) {
    if (!(key in (modelData.data || {}))) {
      return { success: false, version: null, path: null, error: `حقل البيانات المطلوب '${key}' غير موجود في model.data` };
    }
  }
  if (modelExists()) {
    const archiveResult = archiveCurrentModel();
    if (!archiveResult.success) {
      return { success: false, version: null, path: null, error: `فشل في أرشفة النموذج الحالي: ${archiveResult.error}` };
    }
  }
  const version = generateVersion(modelData.algorithm);
  modelData.version = version;
  const trainedAt = modelData.trained_at || new Date().toISOString();
  modelData.trained_at = trainedAt;
  try {
    if (!fs.existsSync(CURRENT_DIR)) {
      fs.mkdirSync(CURRENT_DIR, { recursive: true });
    }
    const dataHash = crypto.createHash('sha256').update(JSON.stringify(modelData.data)).digest('hex');
    const currentMeta = fs.existsSync(METADATA_FILE) ? safeParseJSON(METADATA_FILE).data || {} : {};
    const metadata = {
      model_version: version,
      trained_at: trainedAt,
      training_data_hash: modelData.training_data_hash || dataHash,
      training_projects_count: modelData.training_projects_count || currentMeta.training_projects_count || 0,
      training_items_count: modelData.training_items_count || currentMeta.training_items_count || 0,
      algorithm: modelData.algorithm,
      feature_schema_version: modelData.feature_schema_version || '1.0',
      item_dictionary_version: modelData.item_dictionary_version || '1.0',
      random_seed: modelData.random_seed || currentMeta.random_seed || 42,
      metrics_summary: modelData.metrics_summary || {},
      limitations: modelData.limitations || []
    };
    fs.writeFileSync(MODEL_FILE, JSON.stringify(modelData, null, 2), 'utf-8');
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
    if (modelData.metrics) {
      fs.writeFileSync(METRICS_FILE, JSON.stringify(modelData.metrics, null, 2), 'utf-8');
    }
    return { success: true, version, path: CURRENT_DIR, error: null };
  } catch (e) {
    return { success: false, version: null, path: null, error: `فشل في حفظ النموذج: ${e.message}` };
  }
}

function compareModels(version1, version2) {
  const defaultMetrics = {
    item_prediction: { precision: 0, recall: 0, f1: 0, micro_f1: 0, macro_f1: 0 },
    quantity_prediction: { mae: 0, rmse: 0, mape: 0, median_ae: 0, within_range_pct: 0 }
  };
  function loadMetrics(version) {
    if (!version) return defaultMetrics;
    const archivePath = path.join(ARCHIVE_DIR, version);
    const metricsPath = path.join(archivePath, 'metrics.json');
    if (fs.existsSync(metricsPath)) {
      const result = safeParseJSON(metricsPath);
      if (result.data) return result.data;
    }
    if (version === 'current') {
      if (fs.existsSync(METRICS_FILE)) {
        const result = safeParseJSON(METRICS_FILE);
        if (result.data) return result.data;
      }
    }
    return defaultMetrics;
  }
  const metrics1 = loadMetrics(version1);
  const metrics2 = loadMetrics(version2);
  const f1_1 = metrics1.item_prediction ? metrics1.item_prediction.f1 || 0 : 0;
  const f1_2 = metrics2.item_prediction ? metrics2.item_prediction.f1 || 0 : 0;
  const mae1 = metrics1.quantity_prediction ? metrics1.quantity_prediction.mae || Infinity : Infinity;
  const mae2 = metrics2.quantity_prediction ? metrics2.quantity_prediction.mae || Infinity : Infinity;
  const score1 = f1_1 - (mae1 === Infinity ? 0 : mae1 / 10000);
  const score2 = f1_2 - (mae2 === Infinity ? 0 : mae2 / 10000);
  let better;
  if (score1 > score2) better = version1;
  else if (score2 > score1) better = version2;
  else better = 'equal';
  return { better, metrics1, metrics2 };
}

function listArchivedModels() {
  if (!fs.existsSync(ARCHIVE_DIR)) return [];
  const versions = [];
  try {
    const entries = fs.readdirSync(ARCHIVE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(ARCHIVE_DIR, entry.name, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        const result = safeParseJSON(metaPath);
        if (result.data) {
          versions.push({
            version: entry.name,
            date: result.data.trained_at || null,
            algorithm: result.data.algorithm || null
          });
          continue;
        }
      }
      versions.push({
        version: entry.name,
        date: null,
        algorithm: null
      });
    }
  } catch (e) {
    return [];
  }
  versions.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    return b.version.localeCompare(a.version);
  });
  return versions;
}

function deleteArchivedModel(version) {
  if (!version) {
    return { success: false, error: 'رقم الإصدار مطلوب' };
  }
  const archivePath = path.join(ARCHIVE_DIR, version);
  if (!fs.existsSync(archivePath)) {
    return { success: false, error: `الإصدار ${version} غير موجود في الأرشيف` };
  }
  try {
    const entries = fs.readdirSync(archivePath);
    for (const entry of entries) {
      fs.unlinkSync(path.join(archivePath, entry));
    }
    fs.rmdirSync(archivePath);
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: `فشل في حذف الإصدار ${version}: ${e.message}` };
  }
}

function loadArchivedModel(version) {
  if (!version) {
    return { success: false, model: null, metadata: null, error: 'رقم الإصدار مطلوب' };
  }
  const archivePath = path.join(ARCHIVE_DIR, version);
  if (!fs.existsSync(archivePath)) {
    return { success: false, model: null, metadata: null, error: `الإصدار ${version} غير موجود في الأرشيف` };
  }
  const modelPath = path.join(archivePath, 'model.json');
  const metaPath = path.join(archivePath, 'metadata.json');
  if (!fs.existsSync(modelPath)) {
    return { success: false, model: null, metadata: null, error: `ملف النموذج للإصدار ${version} غير موجود` };
  }
  const modelResult = safeParseJSON(modelPath);
  if (!modelResult.data) {
    return { success: false, model: null, metadata: null, error: modelResult.error };
  }
  let metadata = null;
  if (fs.existsSync(metaPath)) {
    const metaResult = safeParseJSON(metaPath);
    if (metaResult.data) metadata = metaResult.data;
  }
  const compatibility = validateModelCompatibility(modelResult.data);
  if (!compatibility.compatible) {
    return { success: false, model: null, metadata: null, error: 'النموذج المؤرشف غير متوافق: ' + compatibility.issues.join('; ') };
  }
  return { success: true, model: modelResult.data, metadata, error: null };
}

module.exports = {
  saveModel,
  loadModel,
  modelExists,
  getModelMetadata,
  archiveCurrentModel,
  compareModels,
  listArchivedModels,
  deleteArchivedModel,
  loadArchivedModel,
  generateVersion,
  validateModelCompatibility
};
