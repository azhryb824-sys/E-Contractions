'use strict';

const fs = require('fs');
const path = require('path');

const modelPath = path.join(__dirname, '..', 'models', 'sparse-spaces-v1', 'model.json');
let cachedModel = null;

function tokens(value) {
  const words = String(value || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return [...new Set([...words, ...words.slice(0, -1).map((word, index) => `${word}_${words[index + 1]}`)])];
}

function load() {
  if (!cachedModel && fs.existsSync(modelPath)) cachedModel = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  return cachedModel;
}

function explicitValue(request, names) {
  for (const name of names) if (request[name] !== undefined && request[name] !== null && request[name] !== '') return Number(request[name]);
  return null;
}

function inferOne(text, explicit, nounPattern) {
  if (Number.isFinite(explicit)) return { state: explicit === 0 ? 'explicit_zero' : 'explicit_positive', value: explicit, source: 'form', confidence: 1 };
  const outOfScope = new RegExp(`(?:${nounPattern}).{0,35}(?:خارج نطاق|ليست ضمن نطاق|غير مشمولة)|(?:خارج نطاق|ليست ضمن نطاق|غير مشمولة).{0,35}(?:${nounPattern})`, 'i');
  const unknown = new RegExp(`(?:لم يحدد|غير محدد|غير معروف|لم يذكر).{0,35}(?:${nounPattern})|(?:${nounPattern}).{0,35}(?:غير محدد|غير معروف)`, 'i');
  const zero = new RegExp(`(?:لا توجد|لا يوجد|دون|بدون|صفر).{0,20}(?:${nounPattern})|(?:${nounPattern}).{0,20}(?:غير موجودة|غير موجود|صفر)`, 'i');
  if (outOfScope.test(text)) return { state: 'out_of_scope', value: null, source: 'description', confidence: 0.99 };
  if (unknown.test(text)) return { state: 'unknown', value: null, source: 'description', confidence: 0.99 };
  if (zero.test(text)) return { state: 'explicit_zero', value: 0, source: 'description', confidence: 0.99 };
  return { state: 'unknown', value: null, source: 'missing', confidence: 0.5 };
}

function predictFromModel(model, text, dimension) {
  const classifier = model?.classifiers?.[dimension];
  if (!classifier) return null;
  const features = tokens(text), total = Object.values(classifier.class_counts).reduce((a, b) => a + b, 0), vocabulary = classifier.vocabulary_size || 1;
  let best = null;
  for (const [state, classCount] of Object.entries(classifier.class_counts)) {
    let score = Math.log((classCount + 1) / (total + Object.keys(classifier.class_counts).length));
    const counts = classifier.token_counts[state] || {}, denominator = (classifier.token_totals[state] || 0) + vocabulary;
    for (const feature of features) score += Math.log(((counts[feature] || 0) + 1) / denominator);
    if (!best || score > best.score) best = { state, score };
  }
  return best ? { state: best.state, value: best.state === 'explicit_zero' ? 0 : null, source: 'sparse_space_model', confidence: 0.99 } : null;
}

function inferSpaceStates(request = {}) {
  const text = `${request.title || ''} ${request.description || request.description_ar || ''}`;
  const model = load();
  const roomExplicit = explicitValue(request, ['rooms', 'room_count']);
  const bathroomExplicit = explicitValue(request, ['bathrooms', 'bathroom_count']);
  return {
    room_count: Number.isFinite(roomExplicit) ? inferOne(text, roomExplicit, 'غرف|الغرف|غرفة') : (predictFromModel(model, text, 'room_count') || inferOne(text, null, 'غرف|الغرف|غرفة')),
    bathroom_count: Number.isFinite(bathroomExplicit) ? inferOne(text, bathroomExplicit, 'حمامات|الحمامات|حمام') : (predictFromModel(model, text, 'bathroom_count') || inferOne(text, null, 'حمامات|الحمامات|حمام'))
  };
}

function codesFor(dimension, state, kind) {
  return load()?.dimensions?.[dimension]?.[state]?.[kind] || [];
}

function applyToPredictions(predictions = [], states) {
  const forbidden = new Set(), pending = new Set();
  for (const dimension of ['room_count', 'bathroom_count']) {
    const state = states[dimension]?.state;
    if (['explicit_zero', 'out_of_scope', 'not_applicable'].includes(state)) for (const code of codesFor(dimension, state, 'forbidden_codes')) forbidden.add(code);
    if (state === 'unknown') for (const code of codesFor(dimension, state, 'pending_codes')) pending.add(code);
  }
  const items = predictions.map(item => {
    if (forbidden.has(item.item_code)) return { ...item, classification: 'excluded', presence_confidence: 1, reason: 'حالة الفراغات المعتمدة تمنع هذا البند', requires_confirmation: false };
    if (pending.has(item.item_code) && item.classification === 'core') return { ...item, classification: 'conditional', reason: 'يتطلب البند تأكيد عدد الفراغات قبل اعتماده', requires_confirmation: true };
    return item;
  });
  const questions = [];
  if (states.room_count.state === 'unknown') questions.push({ field: 'room_count', question: 'كم عدد الغرف أو الفراغات المغلقة الداخلة ضمن نطاق المشروع؟' });
  if (states.bathroom_count.state === 'unknown') questions.push({ field: 'bathroom_count', question: 'كم عدد الحمامات الداخلة ضمن نطاق المشروع؟' });
  return { items, questions, forbidden_codes: [...forbidden], pending_codes: [...pending] };
}

module.exports = { inferSpaceStates, applyToPredictions, predictFromModel, tokens, load };
