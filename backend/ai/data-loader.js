const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const CATALOGS_DIR = path.join(DATA_DIR, 'catalogs');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
const TRAINING_DIR = path.join(DATA_DIR, 'training');
const EVAL_DIR = path.join(DATA_DIR, 'evaluation');

let trainingData = null;
let itemDictionary = null;
let itemRelationships = null;
let dataHash = null;
let projectIndex = null;
let cachedStats = null;

function loadJSON(filepath) {
  try {
    if (filepath.endsWith('.jsonl')) {
      const text = fs.readFileSync(filepath, 'utf-8').trim();
      if (!text) return [];
      return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function loadAllProjects() {
  const allProjects = [];
  const projectFiles = [
    path.join(PROJECTS_DIR, 'seed-projects.json'),
    path.join(PROJECTS_DIR, 'synthetic-projects.jsonl'),
    path.join(PROJECTS_DIR, 'residential-projects.jsonl'),
    path.join(PROJECTS_DIR, 'commercial-projects.jsonl'),
    path.join(PROJECTS_DIR, 'renovation-projects.jsonl'),
    path.join(PROJECTS_DIR, 'specialized-projects.jsonl')
  ];
  for (const f of projectFiles) {
    if (fs.existsSync(f)) {
      try {
        const data = loadJSON(f);
        if (Array.isArray(data)) allProjects.push(...data);
      } catch (e) {}
    }
  }
  return allProjects;
}

function normalizeText(text) {
  if (typeof text !== 'string') return text;
  let t = text.replace(/\s+/g, ' ').trim();
  t = t.replace(/[إأآا]/g, 'ا');
  t = t.replace(/[ىي]/g, 'ي');
  t = t.replace(/ة/g, 'ه');
  return t;
}

function computeDataHash(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function buildProjectIndex(data) {
  const index = {};
  if (Array.isArray(data)) {
    for (const project of data) {
      if (project && project.id) {
        index[project.id] = project;
      }
    }
  }
  return index;
}

function computeStats(data) {
  const projectCount = Array.isArray(data) ? data.length : 0;
  let sectionCount = 0;
  let itemCount = 0;
  const uniqueCodes = new Set();

  if (Array.isArray(data)) {
    for (const project of data) {
      if (project && Array.isArray(project.sections)) {
        sectionCount += project.sections.length;
        for (const section of project.sections) {
          if (section && Array.isArray(section.items)) {
            for (const item of section.items) {
              itemCount++;
              if (item && item.code) uniqueCodes.add(item.code);
            }
          }
        }
      }
    }
  }

  return { projectCount, sectionCount, itemCount, uniqueCodes: uniqueCodes.size };
}

function loadAll() {
  try {
    const projects = loadAllProjects();
    const itemsPath = path.join(CATALOGS_DIR, 'items.json');
    const relsPath = path.join(KNOWLEDGE_DIR, 'item-relationships.json');

    const id = loadJSON(itemsPath);
    const ir = loadJSON(relsPath);

    const itemDict = {};
    if (Array.isArray(id)) {
      for (const item of id) {
        if (item && item.code) itemDict[item.code] = item;
      }
    }

    const rels = { relationship_groups: [] };
    if (Array.isArray(ir)) {
      rels.relationship_groups = ir.map(r => ({
        trigger_items: [r.trigger],
        name: r.reason || 'علاقة',
        essential_related: (r.required || []).map(rc => ({ item: rc, reason: r.reason || 'مطلوب', priority: 1 })),
        recommended: (r.recommended || []).map(rc => ({ item: rc, reason: r.reason || 'موصى به', classification: 'موصى_به' })),
        optional_related: []
      }));
    }

    trainingData = projects;
    itemDictionary = itemDict;
    itemRelationships = rels;
    dataHash = computeDataHash(projects);
    projectIndex = buildProjectIndex(projects);
    cachedStats = computeStats(projects);

    return {
      success: true,
      data: {
        trainingData: projects,
        itemDictionary: itemDict,
        itemRelationships: rels,
        dataHash,
        stats: cachedStats
      },
      error: null
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to load training data: ${err.message}`
    };
  }
}

function loadTrainingData() {
  const data = loadAllProjects();
  return { success: true, data, error: null };
}

function getProjectById(id) {
  if (!projectIndex) {
    const result = loadTrainingData();
    if (result.success) {
      projectIndex = buildProjectIndex(result.data);
    } else {
      return null;
    }
  }
  return projectIndex[id] || null;
}

function getItemsForProject(projectId) {
  const project = getProjectById(projectId);
  if (!project || !Array.isArray(project.sections)) return [];

  const items = [];
  for (const section of project.sections) {
    if (section && Array.isArray(section.items)) {
      for (const item of section.items) {
        if (item) {
          items.push({ code: item.code, name_ar: item.name_ar, unit: item.unit, quantity: item.quantity, min: item.quantity_min, max: item.quantity_max });
        }
      }
    }
  }
  return items;
}

function getDataStats() {
  if (cachedStats) return cachedStats;
  const result = loadTrainingData();
  if (result.success) {
    cachedStats = computeStats(result.data);
    return cachedStats;
  }
  return { projectCount: 0, sectionCount: 0, itemCount: 0, uniqueCodes: 0 };
}

module.exports = {
  loadAll,
  loadTrainingData,
  getProjectById,
  getItemsForProject,
  getDataStats,
  computeDataHash,
  normalizeText
};
