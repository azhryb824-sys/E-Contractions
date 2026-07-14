const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname;
let trainingData = [];

try {
  trainingData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'training-data.json'), 'utf-8'));
} catch (e) {
  console.error('Error loading training data:', e.message);
}

const PROJECT_TYPES = ['سكني', 'تجاري', 'ترميم'];
const BUILDING_TYPES = ['شقة', 'فيلا', 'تجاري'];
const SCOPES = ['تشطيب كامل', 'كهرباء فقط', 'سباكة فقط'];
const CITIES = ['الرياض', 'جدة', 'مكة', 'الدمام'];
const FINISH_LEVELS = ['عادي', 'جيد', 'جيد جداً', 'فاخر', 'ممتاز'];

function oneHot(value, options, prefix) {
  const result = {};
  for (const opt of options) {
    result[`${prefix}_${opt}`] = value === opt ? 1 : 0;
  }
  return result;
}

function extractProjectFeatures(project) {
  const features = {};
  const featureNames = [];

  const area = project.area || 0;
  const areaNorm = area / 1000;
  features.area = areaNorm;
  featureNames.push('area');

  features.room_count = project.room_count || 0;
  featureNames.push('room_count');

  features.bathroom_count = project.bathroom_count || 0;
  featureNames.push('bathroom_count');

  features.floor_count = project.floor_count || 1;
  featureNames.push('floor_count');

  features.has_kitchen = 1;
  featureNames.push('has_kitchen');

  features.has_hall = 1;
  featureNames.push('has_hall');

  const buildingType = project.building_type || '';
  const btHot = oneHot(buildingType, BUILDING_TYPES, 'building_type');
  for (const [k, v] of Object.entries(btHot)) {
    features[k] = v;
    featureNames.push(k);
  }

  const projectType = project.project_type || '';
  const ptHot = oneHot(projectType, PROJECT_TYPES, 'project_type');
  for (const [k, v] of Object.entries(ptHot)) {
    features[k] = v;
    featureNames.push(k);
  }

  const scope = project.scope || '';
  const scopeHot = oneHot(scope, SCOPES, 'scope');
  for (const [k, v] of Object.entries(scopeHot)) {
    features[k] = v;
    featureNames.push(k);
  }

  const city = project.city || '';
  const cityHot = oneHot(city, CITIES, 'city');
  for (const [k, v] of Object.entries(cityHot)) {
    features[k] = v;
    featureNames.push(k);
  }

  const finishLevel = project.finish_level || '';
  const flHot = oneHot(finishLevel, FINISH_LEVELS, 'finish_level');
  for (const [k, v] of Object.entries(flHot)) {
    features[k] = v;
    featureNames.push(k);
  }

  const rooms = Math.max(project.room_count || 1, 1);
  features.area_to_rooms_ratio = area / rooms;
  featureNames.push('area_to_rooms_ratio');

  return { features, featureNames };
}

function extractRequestFeatures(request) {
  const project = {
    area: request.area || 0,
    room_count: request.rooms || request.room_count || 0,
    bathroom_count: request.bathrooms || request.bathroom_count || 0,
    floor_count: request.floors || request.floor_count || 1,
    building_type: request.building_type || '',
    project_type: request.project_type || '',
    scope: request.scope || '',
    city: request.city || '',
    finish_level: request.finish_level || ''
  };
  return extractProjectFeatures(project);
}

function buildFeatureMatrix(trainingEntries) {
  const X = [];
  const y = {};
  let featureNames = [];
  const itemCodes = [];

  for (let i = 0; i < trainingEntries.length; i++) {
    const entry = trainingEntries[i];
    const project = entry.project;
    if (!project) continue;

    const { features, featureNames: names } = extractProjectFeatures(project);
    if (i === 0) {
      featureNames = names;
    }

    const row = featureNames.map(name => features[name] !== undefined ? features[name] : 0);
    X.push(row);
    itemCodes.push(entry.id || `proj_${i}`);

    const sections = entry.sections || [];
    for (const section of sections) {
      const items = section.items || [];
      for (const item of items) {
        const code = item.code;
        if (!y[code]) {
          y[code] = new Array(trainingEntries.length).fill(0);
        }
        y[code][i] = item.quantity || 0;
      }
    }
  }

  for (const code of Object.keys(y)) {
    while (y[code].length < X.length) {
      y[code].push(0);
    }
  }

  return { X, y, featureNames, itemCodes };
}

function normalizeFeatures(X, mins, maxs) {
  if (!mins || !maxs) {
    mins = [];
    maxs = [];
    if (X.length === 0) return { X_normalized: X, mins, maxs };
    const n = X[0].length;
    for (let j = 0; j < n; j++) {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < X.length; i++) {
        if (X[i][j] < min) min = X[i][j];
        if (X[i][j] > max) max = X[i][j];
      }
      mins.push(min);
      maxs.push(max);
    }
  }

  const X_normalized = X.map(row =>
    row.map((val, j) => {
      const range = maxs[j] - mins[j];
      if (range === 0) return 0;
      return (val - mins[j]) / range;
    })
  );

  return { X_normalized, mins, maxs };
}

function getFeatureImportance(X, featureNames) {
  if (X.length === 0 || featureNames.length === 0) return [];

  const n = X[0].length;
  const means = new Array(n).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < n; j++) {
      means[j] += X[i][j];
    }
  }
  for (let j = 0; j < n; j++) {
    means[j] /= X.length;
  }

  const variances = new Array(n).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < n; j++) {
      variances[j] += Math.pow(X[i][j] - means[j], 2);
    }
  }
  for (let j = 0; j < n; j++) {
    variances[j] /= X.length;
  }

  const totalVar = variances.reduce((s, v) => s + v, 0);

  const importance = featureNames.map((name, j) => ({
    name,
    importance: totalVar > 0 ? variances[j] / totalVar : 0
  }));

  importance.sort((a, b) => b.importance - a.importance);
  return importance;
}

module.exports = {
  extractProjectFeatures,
  extractRequestFeatures,
  buildFeatureMatrix,
  normalizeFeatures,
  getFeatureImportance
};
