const { extractProjectFeatures, extractRequestFeatures } = require('./feature-extractor');

function loadTrainingData() {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataDir = path.join(__dirname, 'data', 'projects');
    const all = [];
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') || f.endsWith('.jsonl'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8').trim();
      if (!content) continue;
      if (file.endsWith('.jsonl')) {
        const lines = content.split('\n').filter(l => l.trim());
        for (const line of lines) {
          try { const d = JSON.parse(line); if (d && d.type === 'project_example' && d.project) all.push(d); } catch(e) {}
        }
      } else {
        try {
          const arr = JSON.parse(content);
          if (Array.isArray(arr)) {
            for (const d of arr) { if (d && d.type === 'project_example' && d.project) all.push(d); }
          }
        } catch(e) {}
      }
    }
    return all;
  } catch (e) {
    console.error('Error loading training data:', e.message);
    return [];
  }
}

function scopeSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const n1 = s1.replace(/[^\w\u0600-\u06FF]/g, '').toLowerCase();
  const n2 = s2.replace(/[^\w\u0600-\u06FF]/g, '').toLowerCase();
  if (n1.includes(n2) || n2.includes(n1)) return 0.7;
  const words1 = s1.split(/[\s\-_]+/);
  const words2 = s2.split(/[\s\-_]+/);
  const common = words1.filter(w => words2.includes(w)).length;
  return common / Math.max(words1.length, words2.length);
}

function computeSimilarity(features1, features2) {
  let score = 0;
  const maxScore = 100;

  if (features1.project_type && features2.project_type) {
    if (features1.project_type === features2.project_type) {
      score += 10;
    } else {
      const types = ['سكني', 'تجاري', 'ترميم', 'مكتبي', 'صناعي'];
      const i1 = types.indexOf(features1.project_type);
      const i2 = types.indexOf(features2.project_type);
      if (i1 >= 0 && i2 >= 0) {
        score += Math.max(0, 10 - Math.abs(i1 - i2) * 3);
      }
    }
  }

  if (features1.building_type && features2.building_type) {
    if (features1.building_type === features2.building_type) {
      score += 25;
    } else {
      const btypes = ['شقة', 'فيلا', 'عمارة', 'محل', 'مكتب', 'مستودع', 'قصر'];
      const i1 = btypes.indexOf(features1.building_type);
      const i2 = btypes.indexOf(features2.building_type);
      if (i1 >= 0 && i2 >= 0) {
        score += Math.max(0, 25 - Math.abs(i1 - i2) * 5);
      }
    }
  }

  if (features1.scope && features2.scope) {
    score += scopeSimilarity(features1.scope, features2.scope) * 20;
  }

  if (features1.area > 0 && features2.area > 0) {
    const ratio = Math.min(features1.area, features2.area) / Math.max(features1.area, features2.area);
    score += ratio * 20;
  }

  if (features1.room_count > 0 && features2.room_count > 0) {
    const ratio = Math.min(features1.room_count, features2.room_count) / Math.max(features1.room_count, features2.room_count);
    score += ratio * 8;
  }

  if (features1.bathroom_count > 0 && features2.bathroom_count > 0) {
    const ratio = Math.min(features1.bathroom_count, features2.bathroom_count) / Math.max(features1.bathroom_count, features2.bathroom_count);
    score += ratio * 7;
  }

  if (features1.finish_level && features2.finish_level) {
    if (features1.finish_level === features2.finish_level) {
      score += 10;
    } else {
      const levels = ['عادي', 'جيد', 'جيد جداً', 'فاخر'];
      const i1 = levels.indexOf(features1.finish_level);
      const i2 = levels.indexOf(features2.finish_level);
      if (i1 >= 0 && i2 >= 0) {
        score += Math.max(0, 10 - Math.abs(i1 - i2) * 3);
      }
    }
  }

  if (features1.floor_count > 0 && features2.floor_count > 0) {
    if (features1.floor_count === features2.floor_count) {
      score += 5;
    } else {
      const ratio = Math.min(features1.floor_count, features2.floor_count) / Math.max(features1.floor_count, features2.floor_count);
      score += ratio * 5;
    }
  }

  if (features1.city && features2.city) {
    if (features1.city === features2.city) {
      score += 5;
    }
  }

  return Math.min(score / maxScore, 1);
}

function getSimilarityReasons(request, project) {
  const reasons = [];
  const rp = request;
  const pp = project.project || project;
  const reqType = rp.project_type || '';
  const reqBuilding = rp.building_type || '';
  const reqScope = rp.scope || '';
  const reqArea = rp.area || 0;
  const reqRooms = rp.rooms || rp.room_count || 0;
  const reqBath = rp.bathrooms || rp.bathroom_count || 0;
  const projType = pp.project_type || '';
  const projBuilding = pp.building_type || '';
  const projScope = pp.scope || '';
  const projArea = pp.area || 0;
  const projRooms = pp.room_count || 0;
  const projBath = pp.bathroom_count || 0;

  if (reqType && projType) {
    const match = reqType === projType;
    reasons.push({
      aspect: 'نوع المشروع',
      match: match ? true : `مختلف (${reqType} vs ${projType})`,
      score: match ? 30 : 10
    });
  }

  if (reqBuilding && projBuilding) {
    const match = reqBuilding === projBuilding;
    reasons.push({
      aspect: 'نوع المبنى',
      match: match ? true : `مختلف (${reqBuilding} vs ${projBuilding})`,
      score: match ? 20 : 5
    });
  }

  if (reqScope && projScope) {
    const sim = scopeSimilarity(reqScope, projScope);
    reasons.push({
      aspect: 'نطاق العمل',
      match: sim >= 0.7 ? true : `مشابه (${reqScope} vs ${projScope})`,
      score: Math.round(sim * 15)
    });
  }

  if (reqArea > 0 && projArea > 0) {
    const ratio = Math.min(reqArea, projArea) / Math.max(reqArea, projArea);
    reasons.push({
      aspect: 'المساحة',
      match: ratio >= 0.8 ? true : `قريبة (${reqArea} vs ${projArea})`,
      score: Math.round(ratio * 15)
    });
  }

  if (reqRooms > 0 && projRooms > 0) {
    const ratio = Math.min(reqRooms, projRooms) / Math.max(reqRooms, projRooms);
    reasons.push({
      aspect: 'عدد الغرف',
      match: ratio >= 0.8 ? true : `قريبة (${reqRooms} vs ${projRooms})`,
      score: Math.round(ratio * 10)
    });
  }

  if (reqBath > 0 && projBath > 0) {
    const ratio = Math.min(reqBath, projBath) / Math.max(reqBath, projBath);
    reasons.push({
      aspect: 'عدد الحمامات',
      match: ratio >= 0.8 ? true : `قريبة (${reqBath} vs ${projBath})`,
      score: Math.round(ratio * 7)
    });
  }

  if (rp.finish_level && pp.finish_level) {
    reasons.push({
      aspect: 'مستوى التشطيب',
      match: rp.finish_level === pp.finish_level ? true : `${rp.finish_level} vs ${pp.finish_level}`,
      score: rp.finish_level === pp.finish_level ? 10 : 3
    });
  }

  if (rp.floor_count && pp.floor_count) {
    reasons.push({
      aspect: 'عدد الطوابق',
      match: rp.floor_count === pp.floor_count ? true : `${rp.floor_count} vs ${pp.floor_count}`,
      score: rp.floor_count === pp.floor_count ? 5 : 2
    });
  }

  if (rp.city && pp.city) {
    reasons.push({
      aspect: 'المدينة',
      match: rp.city === pp.city ? true : `${rp.city} vs ${pp.city}`,
      score: rp.city === pp.city ? 5 : 0
    });
  }

  return reasons.sort((a, b) => b.score - a.score);
}

function findSimilarProjects(request, trainingData, k) {
  const results = [];
  const requestId = request.id || request._excludeId;
  const requestFeatures = {
    project_type: request.project_type || '',
    building_type: request.building_type || '',
    scope: request.scope || '',
    area: request.area || 0,
    room_count: request.rooms || request.room_count || 0,
    bathroom_count: request.bathrooms || request.bathroom_count || 0,
    finish_level: request.finish_level || '',
    floor_count: request.floors || request.floor_count || 1,
    city: request.city || ''
  };

  const entries = trainingData || loadTrainingData();

  for (const entry of entries) {
    if (!entry.project) continue;
    if (requestId && (entry.id === requestId)) continue;

    const projectFeatures = {
      project_type: entry.project.project_type || '',
      building_type: entry.project.building_type || '',
      scope: entry.project.scope || '',
      area: entry.project.area || 0,
      room_count: entry.project.room_count || 0,
      bathroom_count: entry.project.bathroom_count || 0,
      finish_level: entry.project.finish_level || '',
      floor_count: entry.project.floor_count || 1,
      city: entry.project.city || ''
    };

    const score = computeSimilarity(requestFeatures, projectFeatures);
    if (score > 0) {
      const reasons = getSimilarityReasons(requestFeatures, entry);
      results.push({
        project: entry,
        similarityScore: score,
        reasons
      });
    }
  }

  results.sort((a, b) => b.similarityScore - a.similarityScore);
  return results.slice(0, k || results.length);
}

function weightedItemPrediction(similarProjects, request) {
  const itemMap = {};

  for (const sp of similarProjects) {
    const score = sp.similarityScore;
    const sections = sp.project.sections || [];
    for (const section of sections) {
      const items = section.items || [];
      for (const item of items) {
        if (!item.code) continue;
        if (!itemMap[item.code]) {
          itemMap[item.code] = { itemCode: item.code, weight: 0, projects: [] };
        }
        itemMap[item.code].weight += score;
        itemMap[item.code].projects.push({
          projectId: sp.project.id || sp.project.name,
          quantity: item.quantity || 0,
          similarityScore: score
        });
      }
    }
  }

  const items = Object.values(itemMap);
  items.sort((a, b) => b.weight - a.weight);

  const weights = {};
  for (const item of items) {
    weights[item.itemCode] = item.weight;
  }

  return { items, weights };
}

function consistentItems(similarProjects, threshold) {
  const itemCounts = {};
  const total = similarProjects.length;

  for (const sp of similarProjects) {
    const seenInProject = new Set();
    const sections = sp.project.sections || [];
    for (const section of sections) {
      const items = section.items || [];
      for (const item of items) {
        if (!item.code) continue;
        if (!seenInProject.has(item.code)) {
          seenInProject.add(item.code);
          if (!itemCounts[item.code]) {
            itemCounts[item.code] = { itemCode: item.code, count: 0, total };
          }
          itemCounts[item.code].count++;
        }
      }
    }
  }

  const result = Object.values(itemCounts);
  const freqThreshold = threshold || 0.5;
  return result
    .filter(item => item.count / item.total >= freqThreshold)
    .sort((a, b) => b.count - a.count);
}

function ensembleItemPrediction(request, trainingData) {
  const similar = findSimilarProjects(request, trainingData, 5);
  const weighted = weightedItemPrediction(similar, request);
  const consistent = consistentItems(similar, 0.5);
  const consistentCodes = new Set(consistent.map(c => c.itemCode));

  const ensembleItems = [];
  const weights = {};

  for (const item of weighted.items) {
    const consistencyBonus = consistentCodes.has(item.itemCode) ? 0.2 : 0;
    const finalWeight = item.weight * (1 + consistencyBonus);
    ensembleItems.push({
      itemCode: item.itemCode,
      weight: finalWeight,
      consistent: consistentCodes.has(item.itemCode),
      sourceProjects: item.projects.length
    });
    weights[item.itemCode] = finalWeight;
  }

  ensembleItems.sort((a, b) => b.weight - a.weight);

  return { items: ensembleItems, weights };
}

module.exports = {
  findSimilarProjects,
  computeSimilarity,
  getSimilarityReasons,
  weightedItemPrediction,
  consistentItems,
  ensembleItemPrediction
};
