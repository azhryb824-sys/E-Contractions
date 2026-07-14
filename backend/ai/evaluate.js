const path = require('path');
const fs = require('fs');
const modelManager = require('./model-manager');
const dataLoader = require('./data-loader');

const METRICS_FILE = path.join(__dirname, 'models', 'current', 'metrics.json');

function safeDivide(a, b) {
  if (b === 0 || b === undefined || b === null) return 0;
  if (a === undefined || a === null) return 0;
  return a / b;
}

function safeNum(v, fallback) {
  if (v === undefined || v === null || isNaN(v)) return fallback !== undefined ? fallback : 0;
  return v;
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

function computeClassificationMetrics(actualItems, predictedItems) {
  const tp = actualItems.filter(a => predictedItems.includes(a)).length;
  const fp = predictedItems.filter(p => !actualItems.includes(p)).length;
  const fn = actualItems.filter(a => !predictedItems.includes(a)).length;
  const precision = safeDivide(tp, tp + fp);
  const recall = safeDivide(tp, tp + fn);
  const f1 = safeDivide(2 * precision * recall, precision + recall);
  return { precision, recall, f1, tp, fp, fn };
}

function computeRegressionMetrics(actualValues, predictedValues) {
  const n = actualValues.length;
  if (n === 0) return { mae: 0, rmse: 0, mape: 0, median_ae: 0 };

  const absErrors = actualValues.map((a, i) => Math.abs(a - predictedValues[i]));
  const sqErrors = actualValues.map((a, i) => (a - predictedValues[i]) ** 2);
  const pctErrors = actualValues.map((a, i) => a !== 0 ? Math.abs(a - predictedValues[i]) / a : 0);

  const mae = absErrors.reduce((s, e) => s + e, 0) / n;
  const rmse = Math.sqrt(sqErrors.reduce((s, e) => s + e, 0) / n);
  const mape = (pctErrors.reduce((s, e) => s + e, 0) / n) * 100;
  const sorted = [...absErrors].sort((a, b) => a - b);
  const median_ae = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];

  return { mae, rmse, mape, median_ae };
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

function predictItems(modelData, project) {
  const d = modelData.data || modelData;
  const bt = project.building_type || 'شقة';
  const sc = project.scope || 'تشطيب كامل';
  const fl = project.finish_level || 'جيد';

  const btStats = d.building_type_item_stats || d.building_type_probabilities || {};
  const flStats = d.finish_level_item_stats || d.finish_level_probabilities || {};
  const scStats = d.scope_item_stats || {};
  const itemPrior = d.item_prior || d.item_probabilities || {};
  const allItems = Object.keys(itemPrior);

  if (allItems.length === 0) return [];

  const scoreMap = {};
  const numBT = Math.max(Object.keys(btStats).length, 1);
  const numFL = Math.max(Object.keys(flStats).length, 1);
  const numSC = Math.max(Object.keys(scStats).length, 1);

  for (const code of allItems) {
    const btEntry = btStats[bt] || {};
    const flEntry = flStats[fl] || {};
    const scEntry = scStats[sc] || {};

    const totalBT = btStats[bt] && btStats[bt].total !== undefined ? btStats[bt].total : 1;
    const totalFL = flStats[fl] && flStats[fl].total !== undefined ? flStats[fl].total : 1;
    const totalSC = scStats[sc] && scStats[sc].total !== undefined ? scStats[sc].total : 1;

    const cntBT = typeof btEntry[code] === 'number' ? btEntry[code] : 0;
    const cntFL = typeof flEntry[code] === 'number' ? flEntry[code] : 0;
    const cntSC = typeof scEntry[code] === 'number' ? scEntry[code] : 0;

    const pBT = cntBT > 0 ? cntBT / numBT : 0;
    const pFL = cntFL > 0 ? cntFL / numFL : 0;
    const pSC = cntSC > 0 ? cntSC / numSC : 0;

    let score = pBT * 0.4 + pSC * 0.35 + pFL * 0.25;
    const prior = itemPrior[code] || 0;
    if (prior > 0) score = score * 0.7 + prior * 0.3;
    scoreMap[code] = score;
  }

  const meanScore = allItems.reduce((s, c) => s + (scoreMap[c] || 0), 0) / allItems.length;
  const threshold = Math.max(meanScore, 0.1);
  return allItems.filter(c => (scoreMap[c] || 0) >= threshold);
}

function predictQuantity(modelData, code, project) {
  const d = modelData.data || modelData;
  const qm = d.quantity_models || {};
  const entry = qm[code];
  if (!entry) return 0;

  const algo = d.best_quantity_algorithm || 'similarity_weighted';
  const query = {
    area: project.area || 0,
    building_type: project.building_type || 'شقة',
    scope: project.scope || '',
    finish_level: project.finish_level || '',
    room_count: project.room_count || 0,
    bathroom_count: project.bathroom_count || 0
  };

  let predicted = 0;
  if (algo === 'baseline') {
    predicted = entry.baseline && entry.baseline[query.building_type];
    if (predicted === undefined || predicted === null) predicted = entry.global_mean || 0;
  } else if (algo === 'linear_regression') {
    predicted = (entry.regression ? entry.regression.slope : 0) * query.area + (entry.regression ? entry.regression.intercept : 0);
    if (predicted < 0 || isNaN(predicted)) predicted = entry.global_mean || 0;
  } else {
    predicted = predictSimilarityWeighted(query, entry.data_points || [], 3);
  }

  return Math.max(0, predicted);
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
  console.log('تقييم النموذج');
  console.log('='.repeat(48));
  console.log();

  // Load model
  const modelResult = modelManager.loadModel();
  if (!modelResult.success) {
    console.error('❌ لا يوجد نموذج مدرب. قم بتشغيل ai/train.js أولاً.');
    process.exit(1);
  }
  const model = modelResult.model;
  const metadata = modelResult.metadata;

  console.log(`الإصدار: ${metadata ? metadata.model_version : model.version || 'غير معروف'}`);
  console.log(`التاريخ: ${model.trained_at || 'غير معروف'}`);
  console.log();

  // Load test data
  const loadResult = dataLoader.loadAll();
  if (!loadResult.success) {
    console.error('❌ فشل تحميل بيانات الاختبار:', loadResult.error);
    process.exit(1);
  }
  const { trainingData: allData } = loadResult.data;

  if (!allData || allData.length === 0) {
    console.error('❌ لا توجد بيانات للتقييم');
    process.exit(1);
  }

  const testSet = [...allData];

  // [1] Item prediction
  console.log('[1] توقع البنود');

  let totalTP = 0, totalFP = 0, totalFN = 0;
  const itemResults = [];

  for (const testProj of testSet) {
    const { itemCodes: actualItems } = flattenItems(testProj);
    const predictedItems = predictItems(model, testProj.project);
    const metrics = computeClassificationMetrics(actualItems, predictedItems);
    totalTP += metrics.tp;
    totalFP += metrics.fp;
    totalFN += metrics.fn;
    itemResults.push({
      id: testProj.id,
      name: testProj.project.name,
      precision: metrics.precision,
      recall: metrics.recall,
      f1: metrics.f1,
      tp: metrics.tp,
      fp: metrics.fp,
      fn: metrics.fn
    });
  }

  const microPrecision = safeDivide(totalTP, totalTP + totalFP);
  const microRecall = safeDivide(totalTP, totalTP + totalFN);
  const microF1 = safeDivide(2 * microPrecision * microRecall, microPrecision + microRecall);
  const macroPrecision = itemResults.reduce((s, r) => s + r.precision, 0) / Math.max(itemResults.length, 1);
  const macroRecall = itemResults.reduce((s, r) => s + r.recall, 0) / Math.max(itemResults.length, 1);
  const macroF1 = itemResults.reduce((s, r) => s + r.f1, 0) / Math.max(itemResults.length, 1);

  if (itemResults.length > 0) {
    const rows = itemResults.map(r => [r.id, r.precision.toFixed(2), r.recall.toFixed(2), r.f1.toFixed(2)]);
    rows.push(['─'.repeat(8), '─'.repeat(8), '─'.repeat(8), '─'.repeat(8)]);
    rows.push(['Macro F1', macroPrecision.toFixed(2), macroRecall.toFixed(2), macroF1.toFixed(2)]);
    rows.push(['Micro F1', microPrecision.toFixed(2), microRecall.toFixed(2), microF1.toFixed(2)]);
    printTable(rows, ['المشروع', 'Precision', 'Recall', 'F1']);
  }
  console.log();

  // [2] Quantity prediction
  console.log('[2] توقع الكميات');

  const allActual = [];
  const allPredicted = [];
  const perProjectQty = [];

  for (const testProj of testSet) {
    const { itemMap } = flattenItems(testProj);
    const actuals = [];
    const predicted = [];

    const qModels = (model.data || model).quantity_models || {};
    for (const code of Object.keys(qModels)) {
      const item = itemMap[code];
      if (!item || item.quantity === undefined) continue;
      const predQty = predictQuantity(model, code, testProj.project);
      actuals.push(item.quantity);
      predicted.push(predQty);
      allActual.push(item.quantity);
      allPredicted.push(predQty);
    }

    const m = computeRegressionMetrics(actuals, predicted);
    perProjectQty.push({ id: testProj.id, name: testProj.project.name, mae: m.mae, rmse: m.rmse, mape: m.mape, median_ae: m.median_ae });
  }

  const overallQty = computeRegressionMetrics(allActual, allPredicted);

  if (perProjectQty.length > 0) {
    printTable(
      perProjectQty.map(r => [r.id, r.mae.toFixed(2), r.rmse.toFixed(2), r.mape.toFixed(1) + '%', r.median_ae.toFixed(2)]),
      ['المشروع', 'MAE', 'RMSE', 'MAPE', 'Median AE']
    );
    console.log();
    console.log(`    الإجمالي: MAE=${overallQty.mae.toFixed(2)}, RMSE=${overallQty.rmse.toFixed(2)}, MAPE=${overallQty.mape.toFixed(1)}%`);
  }
  console.log();

  // [3] By building type
  console.log('[3] النتائج حسب نوع المبنى');

  const byBT = {};
  for (const testProj of testSet) {
    const bt = testProj.project.building_type || 'أخرى';
    if (!byBT[bt]) byBT[bt] = { actual: [], predicted: [] };
    const { itemMap } = flattenItems(testProj);
    const qModels = (model.data || model).quantity_models || {};
    for (const code of Object.keys(qModels)) {
      const item = itemMap[code];
      if (!item || item.quantity === undefined) continue;
      byBT[bt].actual.push(item.quantity);
      byBT[bt].predicted.push(predictQuantity(model, code, testProj.project));
    }
  }

  const btRows = Object.keys(byBT).sort().map(bt => {
    const m = computeRegressionMetrics(byBT[bt].actual, byBT[bt].predicted);
    return [bt, m.mae.toFixed(2), m.rmse.toFixed(2), m.mape.toFixed(1) + '%'];
  });
  if (btRows.length > 0) printTable(btRows, ['نوع المبنى', 'MAE', 'RMSE', 'MAPE']);
  console.log();

  // [4] By section
  console.log('[4] النتائج حسب القسم');

  const bySection = {};
  for (const testProj of testSet) {
    if (!testProj.sections) continue;
    for (const section of testProj.sections) {
      if (!section.items) continue;
      if (!bySection[section.code]) bySection[section.code] = { name: section.name, actual: [], predicted: [] };
      for (const item of section.items) {
        if (!item.code || item.quantity === undefined) continue;
        bySection[section.code].actual.push(item.quantity);
        bySection[section.code].predicted.push(predictQuantity(model, item.code, testProj.project));
      }
    }
  }

  const secRows = Object.keys(bySection).sort().map(code => {
    const s = bySection[code];
    const m = computeRegressionMetrics(s.actual, s.predicted);
    return [s.name, m.mae.toFixed(2), m.rmse.toFixed(2), m.mape.toFixed(1) + '%'];
  });
  if (secRows.length > 0) printTable(secRows, ['القسم', 'MAE', 'RMSE', 'MAPE']);
  console.log();

  // [5] Limitations
  console.log('[5] القيود');
  const totalProjCount = allData.length;
  console.log(`    - بيانات التدريب محدودة (${totalProjCount} مشاريع)`);
  console.log('    - النموذج غير مدرب على المشاريع التجارية');
  console.log('    - دقة التوقع تعتمد على تشابه المشاريع في مجموعة التدريب');
  console.log('    - قد لا تكون الكميات دقيقة للمشاريع ذات المواصفات الفريدة');
  console.log();

  // Save metrics
  const metrics = {
    version: metadata ? metadata.model_version : model.version,
    timestamp: new Date().toISOString(),
    model_info: {
      version: metadata ? metadata.model_version : model.version,
      algorithm: model.algorithm,
      best_quantity_algorithm: (model.data || model).best_quantity_algorithm || 'similarity_weighted',
      trained_at: model.trained_at
    },
    item_prediction: {
      micro: { precision: microPrecision, recall: microRecall, f1: microF1 },
      macro: { precision: macroPrecision, recall: macroRecall, f1: macroF1 },
      per_project: itemResults.map(r => ({ id: r.id, name: r.name, precision: r.precision, recall: r.recall, f1: r.f1, tp: r.tp, fp: r.fp, fn: r.fn }))
    },
    quantity_prediction: {
      overall: { mae: overallQty.mae, rmse: overallQty.rmse, mape: overallQty.mape, median_ae: overallQty.median_ae },
      per_project: perProjectQty.map(r => ({ id: r.id, name: r.name, mae: r.mae, rmse: r.rmse, mape: r.mape, median_ae: r.median_ae })),
      by_building_type: Object.keys(byBT).map(bt => {
        const m = computeRegressionMetrics(byBT[bt].actual, byBT[bt].predicted);
        return { building_type: bt, mae: m.mae, rmse: m.rmse, mape: m.mape };
      }),
      by_section: Object.keys(bySection).map(code => {
        const s = bySection[code];
        const m = computeRegressionMetrics(s.actual, s.predicted);
        return { code, name: s.name, mae: m.mae, rmse: m.rmse, mape: m.mape };
      })
    },
    data_info: { test_projects: testSet.length, total_projects: totalProjCount }
  };

  try {
    const dir = path.dirname(METRICS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2), 'utf-8');
    console.log(`✅ تم حفظ المقاييس في backend/ai/models/current/metrics.json`);
  } catch (e) {
    console.error('❌ فشل حفظ المقاييس:', e.message);
  }
}

run();
