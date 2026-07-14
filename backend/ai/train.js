const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dataLoader = require('./data-loader');
const dataValidator = require('./data-validator');
const modelManager = require('./model-manager');

function safeDivide(a, b) {
  if (b === 0 || b === undefined || b === null) return 0;
  if (a === undefined || a === null) return 0;
  return a / b;
}

function safeNum(v, fallback) {
  if (v === undefined || v === null || isNaN(v)) return fallback !== undefined ? fallback : 0;
  return v;
}

function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function flattenItems(project) {
  const items = [];
  const itemSet = new Set();
  if (!project.sections) return { items, itemCodes: [], itemMap: {} };
  const itemMap = {};
  for (const section of project.sections) {
    if (!section.items) continue;
    for (const item of section.items) {
      if (!item.code) continue;
      if (!itemSet.has(item.code)) {
        itemSet.add(item.code);
        items.push({
          code: item.code,
          name_ar: item.name_ar,
          unit: item.unit,
          quantity: safeNum(item.quantity, 0),
          quantity_min: safeNum(item.quantity_min, 0),
          quantity_max: safeNum(item.quantity_max, 0),
          classification: item.classification || 'أساسي',
          is_essential: item.is_essential !== false,
          section_code: section.code,
          section_name: section.name
        });
        itemMap[item.code] = items[items.length - 1];
      }
    }
  }
  return { items, itemCodes: [...itemSet], itemMap };
}

function buildItemPredictionData(trainProjects, allItemCodes) {
  const buildingTypeCounts = {};
  const finishLevelCounts = {};
  const scopeCounts = {};
  const itemByBuildingType = {};
  const itemByFinishLevel = {};
  const itemByScope = {};
  const itemCounts = {};
  const sectionCounts = {};
  const itemSectionMap = {};

  for (const code of allItemCodes) itemCounts[code] = 0;

  for (const proj of trainProjects) {
    const p = proj.project;
    const bt = p.building_type || 'أخرى';
    const fl = p.finish_level || 'جيد';
    const sc = p.scope || 'تشطيب كامل';

    buildingTypeCounts[bt] = (buildingTypeCounts[bt] || 0) + 1;
    finishLevelCounts[fl] = (finishLevelCounts[fl] || 0) + 1;
    scopeCounts[sc] = (scopeCounts[sc] || 0) + 1;

    if (!itemByBuildingType[bt]) itemByBuildingType[bt] = {};
    if (!itemByFinishLevel[fl]) itemByFinishLevel[fl] = {};
    if (!itemByScope[sc]) itemByScope[sc] = {};

    const { itemCodes } = flattenItems(proj);
    for (const code of itemCodes) {
      itemCounts[code] = (itemCounts[code] || 0) + 1;
      itemByBuildingType[bt][code] = (itemByBuildingType[bt][code] || 0) + 1;
      itemByFinishLevel[fl][code] = (itemByFinishLevel[fl][code] || 0) + 1;
      itemByScope[sc][code] = (itemByScope[sc][code] || 0) + 1;
    }

    if (proj.sections) {
      for (const section of proj.sections) {
        if (!section.items) continue;
        sectionCounts[section.code] = (sectionCounts[section.code] || 0) + 1;
        for (const item of section.items) {
          if (item.code && !itemSectionMap[item.code]) {
            itemSectionMap[item.code] = section.code;
          }
        }
      }
    }
  }

  const buildingTypeItemStats = {};
  for (const bt of Object.keys(itemByBuildingType)) {
    buildingTypeItemStats[bt] = {};
    for (const code of allItemCodes) {
      const count = itemByBuildingType[bt][code] || 0;
      if (count > 0) buildingTypeItemStats[bt][code] = count;
    }
  }

  const finishLevelItemStats = {};
  for (const fl of Object.keys(itemByFinishLevel)) {
    finishLevelItemStats[fl] = {};
    for (const code of allItemCodes) {
      const count = itemByFinishLevel[fl][code] || 0;
      if (count > 0) finishLevelItemStats[fl][code] = count;
    }
  }

  const itemItemMatrix = {};
  for (const code of allItemCodes) {
    itemItemMatrix[code] = {};
    for (const code2 of allItemCodes) {
      if (code === code2) continue;
      let both = 0;
      for (const proj of trainProjects) {
        const { itemCodes } = flattenItems(proj);
        if (itemCodes.includes(code) && itemCodes.includes(code2)) both++;
      }
      const totalWithCode = itemCounts[code] || 0;
      if (totalWithCode > 0) {
        const prob = both / totalWithCode;
        if (prob > 0) itemItemMatrix[code][code2] = prob;
      }
    }
  }

  const itemProbabilities = {};
  for (const code of allItemCodes) {
    itemProbabilities[code] = safeDivide(itemCounts[code] || 0, trainProjects.length);
  }

  const sectionProbabilities = {};
  for (const code of Object.keys(sectionCounts)) {
    sectionProbabilities[code] = safeDivide(sectionCounts[code], trainProjects.length);
  }

  const scopeItemStats = {};
  for (const sc of Object.keys(itemByScope)) {
    scopeItemStats[sc] = {};
    for (const code of allItemCodes) {
      const count = itemByScope[sc][code] || 0;
      if (count > 0) scopeItemStats[sc][code] = count;
    }
  }

  return {
    itemItemMatrix,
    itemSectionMap,
    sectionProbabilities,
    itemProbabilities,
    buildingTypeItemStats,
    finishLevelItemStats,
    scopeItemStats,
    buildingTypeCounts,
    finishLevelCounts,
    scopeCounts,
    itemCounts
  };
}

function buildQuantityModels(trainProjects, allItemCodes) {
  const quantityModels = {};
  const itemQuantityStats = {};

  for (const code of allItemCodes) {
    const baseline = {};
    const points = [];

    for (const proj of trainProjects) {
      const { itemMap } = flattenItems(proj);
      const item = itemMap[code];
      if (!item || item.quantity === undefined) continue;

      const bt = proj.project.building_type || 'أخرى';
      if (!baseline[bt]) baseline[bt] = [];
      baseline[bt].push(item.quantity);

      points.push({
        area: proj.project.area || 0,
        quantity: item.quantity,
        building_type: bt,
        scope: proj.project.scope || '',
        finish_level: proj.project.finish_level || '',
        room_count: proj.project.room_count || 0,
        bathroom_count: proj.project.bathroom_count || 0
      });
    }

    const baselineMeans = {};
    for (const bt of Object.keys(baseline)) {
      const vals = baseline[bt];
      baselineMeans[bt] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
    const allQuantities = points.map(p => p.quantity);
    const globalMean = allQuantities.length > 0 ? allQuantities.reduce((s, v) => s + v, 0) / allQuantities.length : 0;

    const xAreas = points.map(p => p.area);
    const yQuantities = points.map(p => p.quantity);
    const n = xAreas.length;
    let slope = 0, intercept = globalMean;

    if (n >= 2) {
      const sumX = xAreas.reduce((s, v) => s + v, 0);
      const sumY = yQuantities.reduce((s, v) => s + v, 0);
      const sumXY = xAreas.reduce((s, v, i) => s + v * yQuantities[i], 0);
      const sumXX = xAreas.reduce((s, v) => s + v * v, 0);
      const denom = n * sumXX - sumX * sumX;
      if (Math.abs(denom) >= 1e-10) {
        slope = (n * sumXY - sumX * sumY) / denom;
        intercept = (sumY - slope * sumX) / n;
      }
    }

    const stats = {
      mean: globalMean,
      min: allQuantities.length > 0 ? Math.min(...allQuantities) : 0,
      max: allQuantities.length > 0 ? Math.max(...allQuantities) : 0,
      count: allQuantities.length
    };

    quantityModels[code] = {
      baseline: baselineMeans,
      global_mean: globalMean,
      regression: { slope, intercept },
      data_points: points,
      count: points.length
    };
    itemQuantityStats[code] = stats;
  }

  return { quantityModels, itemQuantityStats };
}

function computeSimilarity(query, point) {
  let score = 0;
  if (query.building_type === point.building_type) score += 0.4;
  if (query.scope === point.scope) score += 0.3;
  if (query.finish_level === point.finish_level) score += 0.1;
  if (query.area > 0 && point.area > 0) {
    score += (Math.min(query.area, point.area) / Math.max(query.area, point.area)) * 0.2;
  }
  return score;
}

function predictSimilarityWeighted(query, points, k) {
  const kVal = Math.min(k || 3, points.length);
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].quantity;

  const sims = points.map(p => ({ sim: computeSimilarity(query, p), quantity: p.quantity }));
  sims.sort((a, b) => b.sim - a.sim);
  const topK = sims.slice(0, kVal);
  const totalSim = topK.reduce((s, item) => s + item.sim, 0);

  if (totalSim < 1e-10) return topK.reduce((s, item) => s + item.quantity, 0) / topK.length;
  return topK.reduce((s, item) => s + safeDivide(item.sim * item.quantity, totalSim), 0);
}

function validateQuantityAlgo(quantityModels, valProjects, algo) {
  let totalMAE = 0, totalRMSE = 0, totalCount = 0;
  let within = 0, withinTotal = 0;

  for (const proj of valProjects) {
    const { itemMap } = flattenItems(proj);
    const query = {
      area: proj.project.area || 0,
      building_type: proj.project.building_type || 'شقة',
      scope: proj.project.scope || '',
      finish_level: proj.project.finish_level || '',
      room_count: proj.project.room_count || 0,
      bathroom_count: proj.project.bathroom_count || 0
    };

    for (const code of Object.keys(quantityModels)) {
      const item = itemMap[code];
      if (!item || item.quantity === undefined) continue;
      const actual = item.quantity;
      const entry = quantityModels[code];
      let predicted = 0;

      if (algo === 'baseline') {
        predicted = entry.baseline[query.building_type];
        if (predicted === undefined) predicted = entry.global_mean || 0;
      } else if (algo === 'linear_regression') {
        predicted = entry.regression.slope * query.area + entry.regression.intercept;
        if (predicted < 0 || isNaN(predicted)) predicted = entry.global_mean || 0;
      } else {
        predicted = predictSimilarityWeighted(query, entry.data_points, 3);
      }

      totalMAE += Math.abs(actual - predicted);
      totalRMSE += (actual - predicted) ** 2;
      totalCount++;

      if (item.quantity_min !== undefined && item.quantity_max !== undefined) {
        withinTotal++;
        if (predicted >= item.quantity_min && predicted <= item.quantity_max) within++;
      }
    }
  }

  if (totalCount === 0) return { mae: 0, rmse: 0, withinPct: 0 };
  return {
    mae: Math.round((totalMAE / totalCount) * 100) / 100,
    rmse: Math.round(Math.sqrt(totalRMSE / totalCount) * 100) / 100,
    withinPct: Math.round((withinTotal > 0 ? (within / withinTotal) * 100 : 0) * 10) / 10
  };
}

function printTable(rows, headers) {
  const colWidths = headers.map((h, i) => {
    const dataMax = rows.reduce((max, r) => Math.max(max, String(r[i] || '').length), 0);
    return Math.max(h.length, dataMax) + 2;
  });
  console.log('┌' + colWidths.map(w => '─'.repeat(w)).join('┬') + '┐');
  console.log('│' + headers.map((h, i) => ' ' + h.padEnd(colWidths[i] - 1)).join('│') + '│');
  console.log('├' + colWidths.map(w => '─'.repeat(w)).join('┼') + '┤');
  for (const row of rows) {
    console.log('│' + row.map((v, i) => ' ' + String(v).padEnd(colWidths[i] - 1)).join('│') + '│');
  }
  console.log('└' + colWidths.map(w => '─'.repeat(w)).join('┴') + '┘');
}

function run() {
  console.log('='.repeat(48));
  console.log('تدريب نموذج الذكاء الاصطناعي');
  console.log('='.repeat(48));
  console.log();

  // [1] Load data
  console.log('[1] تحميل البيانات');
  const loadResult = dataLoader.loadAll();
  if (!loadResult.success) {
    console.error('❌ فشل تحميل البيانات:', loadResult.error);
    process.exit(1);
  }
  const { trainingData, itemDictionary, itemRelationships, stats } = loadResult.data;
  const dictItemCount = Object.keys(itemDictionary).length;
  const relGroupCount = (itemRelationships.relationship_groups || []).length;
  console.log(`    ✅ training-data.json: ${stats.projectCount} مشاريع`);
  console.log(`    ✅ item-dictionary.json: ${dictItemCount} بند`);
  console.log(`    ✅ item-relationships.json: ${relGroupCount} مجموعات`);
  console.log();

  if (stats.projectCount === 0) {
    console.error('❌ لا توجد مشاريع تدريب');
    process.exit(1);
  }

  // [2] Validate data
  console.log('[2] التحقق من صحة البيانات');
  const validation = dataValidator.validate(trainingData);
  if (validation.errors.length === 0) {
    console.log('    ✅ لا توجد أخطاء');
  } else {
    console.log(`    ❌ أخطاء: ${validation.errors.length}`);
    validation.errors.forEach(e => console.log(`       - ${e.message}`));
  }
  console.log(`    ⚠️ تحذيرات: ${validation.warnings.length}`);
  console.log();

  // [3] Split data
  console.log('[3] تقسيم البيانات');
  const seed = 42;
  const projects = [...trainingData];

  const groups = {};
  for (const proj of projects) {
    const bt = proj.project.building_type || 'أخرى';
    if (!groups[bt]) groups[bt] = [];
    groups[bt].push(proj);
  }

  const trainSet = [], valSet = [], testSet = [];

  for (const bt of Object.keys(groups)) {
    const shuffled = seededShuffle(groups[bt], seed + bt.length);
    const total = shuffled.length;
    if (total === 1) {
      trainSet.push(shuffled[0]);
    } else if (total === 2) {
      trainSet.push(shuffled[0]);
      valSet.push(shuffled[1]);
    } else {
      let idx = 0;
      for (let i = 0; i < total - 2; i++) trainSet.push(shuffled[idx++]);
      valSet.push(shuffled[idx++]);
      testSet.push(shuffled[idx++]);
    }
  }

  if (valSet.length === 0 && testSet.length === 0) {
    const heldOut = trainSet.pop();
    if (heldOut) valSet.push(heldOut);
  }

  const totalCount = projects.length;
  const trainCount = trainSet.length;
  const valCount = valSet.length;
  const testCount = testSet.length;

  console.log(`    إجمالي المشاريع: ${totalCount}`);
  console.log(`    التدريب: ${trainCount} (${((trainCount / totalCount) * 100).toFixed(1)}%)`);
  console.log(`    التحقق: ${valCount} (${((valCount / totalCount) * 100).toFixed(1)}%)`);
  console.log(`    الاختبار: ${testCount} (${((testCount / totalCount) * 100).toFixed(1)}%)`);
  console.log(`    البذرة العشوائية: ${seed}`);
  console.log();

  if (trainCount === 0) {
    console.error('❌ لا توجد مشاريع تدريب بعد التقسيم');
    process.exit(1);
  }

  const allItemCodesSet = new Set();
  for (const proj of projects) {
    const { itemCodes } = flattenItems(proj);
    for (const code of itemCodes) allItemCodesSet.add(code);
  }
  const allItemCodes = [...allItemCodesSet].sort();

  // [4] Train item prediction
  console.log('[4] تدريب توقع البنود');
  const itemData = buildItemPredictionData(trainSet, allItemCodes);
  console.log(`    الخوارزمية: Co-occurrence + Probabilistic`);
  console.log(`    بنود التدريب: ${allItemCodes.length}`);
  console.log();

  // [5] Train quantity prediction
  console.log('[5] تدريب توقع الكميات');
  const { quantityModels, itemQuantityStats } = buildQuantityModels(trainSet, allItemCodes);

  const algoBaseline = validateQuantityAlgo(quantityModels, valSet, 'baseline');
  const algoLR = validateQuantityAlgo(quantityModels, valSet, 'linear_regression');
  const algoSim = validateQuantityAlgo(quantityModels, valSet, 'similarity_weighted');

  const algos = [
    { name: 'Baseline (Mean)', mae: algoBaseline.mae, rmse: algoBaseline.rmse, withinPct: algoBaseline.withinPct, key: 'baseline' },
    { name: 'Linear Regression', mae: algoLR.mae, rmse: algoLR.rmse, withinPct: algoLR.withinPct, key: 'linear_regression' },
    { name: 'Similarity-Weighted', mae: algoSim.mae, rmse: algoSim.rmse, withinPct: algoSim.withinPct, key: 'similarity_weighted' }
  ];

  algos.sort((a, b) => a.mae - b.mae);
  const bestAlgo = algos[0];

  console.log('    مقارنة الخوارزميات:');
  printTable(
    algos.map(a => [a.name, a.mae.toFixed(2), a.rmse.toFixed(2), a.withinPct.toFixed(1) + '%' + (a.key === bestAlgo.key ? ' ← مختارة' : '')]),
    ['الخوارزمية', 'MAE', 'RMSE', 'Within %']
  );
  console.log(`    الخوارزمية المختارة: ${bestAlgo.name}`);
  console.log();

  // [6] Save model
  console.log('[6] حفظ النموذج');

  const trainedAt = new Date().toISOString();
  const dataHash = crypto.createHash('sha256').update(JSON.stringify({ trainSet, allItemCodes })).digest('hex');

  const modelData = {
    type: 'item_prediction',
    algorithm: 'co_occurrence + similarity_weighted',
    trained_at: trainedAt,
    data: {
      item_item_matrix: itemData.itemItemMatrix,
      item_section_map: itemData.itemSectionMap,
      section_probabilities: itemData.sectionProbabilities,
      item_probabilities: itemData.itemProbabilities,
      building_type_item_stats: itemData.buildingTypeItemStats,
      finish_level_item_stats: itemData.finishLevelItemStats,
      item_quantity_stats: itemQuantityStats,
      quantity_models: quantityModels,
      co_occurrence: itemData.itemItemMatrix,
      item_prior: itemData.itemProbabilities,
      best_quantity_algorithm: bestAlgo.key,
      comparison: {
        baseline: algoBaseline,
        linear_regression: algoLR,
        similarity_weighted: algoSim,
        selected: bestAlgo.key
      },
      building_type_probabilities: itemData.buildingTypeItemStats,
      finish_level_probabilities: itemData.finishLevelItemStats,
      scope_item_stats: itemData.scopeItemStats,
      building_type_counts: itemData.buildingTypeCounts,
      finish_level_counts: itemData.finishLevelCounts,
      scope_counts: itemData.scopeCounts,
      section_membership: itemData.itemSectionMap
    },
    training_data_hash: dataHash,
    training_projects_count: trainCount,
    training_items_count: allItemCodes.length,
    feature_schema_version: '1.0',
    item_dictionary_version: '1.0',
    random_seed: seed,
    metrics_summary: {},
    limitations: [
      'بيانات التدريب محدودة (8 مشاريع)',
      'النموذج غير مدرب على المشاريع التجارية'
    ]
  };

  const saveResult = modelManager.saveModel(modelData);
  if (saveResult.success) {
    console.log('    ✅ تم حفظ النموذج');
    console.log(`    الإصدار: ${saveResult.version}`);
    console.log(`    المسار: backend/ai/models/current/`);
    console.log(`    الخوارزمية: co_occurrence + ${bestAlgo.key}`);
  } else {
    console.error('    ❌ فشل حفظ النموذج:', saveResult.error);
    process.exit(1);
  }
  console.log();
  console.log('='.repeat(48));
  console.log('✅ اكتمل التدريب بنجاح');
  console.log('='.repeat(48));
}

run();
