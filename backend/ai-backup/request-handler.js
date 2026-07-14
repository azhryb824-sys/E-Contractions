const inferenceEngine = require('./inference-engine');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_MODE = 'show_before_add';
const SESSION_TTL = 30 * 60 * 1000;
const CALC_TIMEOUT = 10000;

const sessions = new Map();

const MODE_INFO = {
  no_additions: { description: 'فقط البنود التي يطلبها المستخدم، بدون اقتراحات ذكية', requiresConfirmation: false, autoApprovesRelated: false },
  auto_add: { description: 'الإضافة التلقائية للعناصر المرتبطة بدون تأكيد', requiresConfirmation: false, autoApprovesRelated: true },
  show_before_add: { description: 'عرض الاقتراحات وطرح الأسئلة قبل إنشاء الملفات', requiresConfirmation: true, autoApprovesRelated: false }
};

const REQUIRED_QUESTIONS = [
  { field: 'area', question: 'ما هي المساحة التقريبية للمشروع؟', type: 'number', required: true },
  { field: 'rooms', question: 'كم عدد الغرف؟', type: 'number', required: true },
  { field: 'bathrooms', question: 'كم عدد دورات المياه؟', type: 'number', required: true },
  { field: 'kitchen', question: 'هل لديك مطبخ؟', type: 'confirm', required: false },
  { field: 'finish_level', question: 'ما هو مستوى التشطيب المطلوب؟ (عادي - جيد - جيد جداً - فاخر - ممتاز)', type: 'choice', options: ['عادي', 'جيد', 'جيد جداً', 'فاخر', 'ممتاز'], required: true },
  { field: 'extra_items', question: 'هل توجد أي بنود إضافية تريد إضافتها؟', type: 'text', required: false }
];

const VILLA_QUESTION = { field: 'pergolas_cladding', question: 'هل توجد برجولات او اشتراط كسوة جدران خارجية؟', type: 'confirm', required: false };

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms));
}

function createSession(request, mode) {
  return {
    id: uuidv4(),
    request: JSON.parse(JSON.stringify(request)),
    mode: mode || DEFAULT_MODE,
    questions: [],
    answers: {},
    status: 'needs_info',
    result: null,
    suggestedItems: [],
    createdAt: Date.now()
  };
}

function buildQuestions(request, analysis) {
  const questions = [];
  const answered = new Set(Object.keys(request).filter(k => request[k] !== undefined && request[k] !== null && request[k] !== ''));

  for (const q of REQUIRED_QUESTIONS) {
    if (q.required && !answered.has(q.field)) {
      questions.push({ id: `q_${q.field}`, field: q.field, question: q.question, type: q.type, options: q.options || null, required: q.required });
    }
  }

  const buildingType = analysis.buildingType || '';
  if (buildingType.includes('فيلا') && !answered.has('pergolas_cladding')) {
    questions.push({ id: 'q_pergolas_cladding', field: 'pergolas_cladding', question: VILLA_QUESTION.question, type: VILLA_QUESTION.type, options: null, required: false });
  }

  return questions;
}

function deriveProjectParams(request, answers) {
  const merged = { ...request, ...answers };
  return {
    area: parseFloat(merged.area) || 150,
    rooms: parseInt(merged.rooms, 10) || 3,
    bathrooms: parseInt(merged.bathrooms, 10) || 2,
    floors: parseInt(merged.floors, 10) || 1,
    finish_level: merged.finish_level || 'جيد',
    city: merged.city || '',
    kitchen: merged.kitchen,
    extra_items: merged.extra_items,
    pergolas_cladding: merged.pergolas_cladding
  };
}

function prepareSuggestedItemsQuestions(session) {
  const questions = [];
  const mode = session.mode || DEFAULT_MODE;

  if (mode !== 'show_before_add') return questions;

  if (session.suggestedItems.length === 0) {
    const params = deriveProjectParams(session.request, session.answers);
    const requestWithParams = { ...session.request, ...params, execution_mode: 'show_before_add' };
    try {
      const estimate = inferenceEngine.generateEstimate(requestWithParams);
      for (const section of estimate.sections || []) {
        for (const item of section.items || []) {
          if (item.ai_suggested && item.needs_confirmation) {
            session.suggestedItems.push(item);
          }
        }
      }
    } catch (e) {
      return questions;
    }
  }

  for (const item of session.suggestedItems) {
    questions.push({
      id: `suggest_${item.code}`,
      field: `approve_${item.code}`,
      question: `نقترح إضافة ${item.name_ar} لأن ${(item.assumptions && item.assumptions[0]) || 'مرتبط بالمشروع'}. هل توافق؟`,
      type: 'confirm',
      required: true,
      item
    });
  }

  return questions;
}

async function generateEstimateWithTimeout(session) {
  const params = deriveProjectParams(session.request, session.answers);
  const requestWithParams = { ...session.request, ...params, execution_mode: session.mode };

  const calculation = new Promise((resolve) => {
    resolve(inferenceEngine.generateEstimate(requestWithParams));
  });

  try {
    const result = await Promise.race([calculation, timeout(CALC_TIMEOUT)]);
    return { status: 'completed', result, questions: [], sessionId: session.id };
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      let partialData = null;
      try {
        partialData = inferenceEngine.generateEstimate(requestWithParams);
      } catch (e) {
        partialData = { error: 'فشل في التقدير الجزئي' };
      }
      return { status: 'timeout', result: null, questions: [], sessionId: session.id, message: 'تجاوزت العملية الوقت المحدد', partialData };
    }
    throw err;
  }
}

async function processRequest(request, mode) {
  try {
    const actualMode = mode || DEFAULT_MODE;

    if (actualMode === 'no_additions') {
      const params = deriveProjectParams(request, {});
      const requestWithParams = { ...request, ...params, execution_mode: 'no_additions' };

      const calcPromise = new Promise((resolve) => {
        resolve(inferenceEngine.generateEstimate(requestWithParams));
      });

      try {
        const result = await Promise.race([calcPromise, timeout(CALC_TIMEOUT)]);
        return { status: 'completed', result, questions: [], sessionId: null };
      } catch (err) {
        if (err.message === 'TIMEOUT') {
          let partialData = null;
          try {
            partialData = inferenceEngine.generateEstimate(requestWithParams);
          } catch (e) {
            partialData = { error: 'فشل في التقدير الجزئي' };
          }
          return { status: 'timeout', result: null, questions: [], sessionId: null, message: 'تجاوزت العملية الوقت المحدد', partialData };
        }
        throw err;
      }
    }

    const analysis = inferenceEngine.analyzeRequest(request);
    const session = createSession(request, actualMode);
    const infoQuestions = buildQuestions(request, analysis);
    session.questions = infoQuestions;

    if (infoQuestions.length > 0) {
      sessions.set(session.id, session);
      return { status: 'needs_info', result: null, questions: infoQuestions, sessionId: session.id };
    }

    if (actualMode === 'show_before_add') {
      const suggestionQuestions = prepareSuggestedItemsQuestions(session);
      session.questions = [...session.questions, ...suggestionQuestions];

      if (suggestionQuestions.length > 0) {
        session.status = 'review';
        sessions.set(session.id, session);
        return { status: 'review', result: null, questions: session.questions, sessionId: session.id };
      }
    }

    const result = await generateEstimateWithTimeout(session);
    if (result.status === 'completed') {
      session.status = 'completed';
      session.result = result.result;
      sessions.set(session.id, session);
    }
    return { ...result, sessionId: session.id };
  } catch (err) {
    return { status: 'error', result: null, questions: [], sessionId: null, message: err.message };
  }
}

async function handleQuestionAnswers(sessionId, answers) {
  try {
    const session = sessions.get(sessionId);
    if (!session) {
      return { status: 'error', result: null, questions: [], message: 'الجلسة غير موجودة أو انتهت صلاحيتها' };
    }

    Object.assign(session.answers, answers);

    const unansweredRequired = session.questions.filter(q => q.required && !session.answers[q.field] && session.answers[q.field] !== false && session.answers[q.field] !== 0);

    if (unansweredRequired.length > 0) {
      sessions.set(sessionId, session);
      return { status: 'needs_info', result: null, questions: session.questions, sessionId };
    }

    if (session.suggestedItems.length > 0) {
      const approvedItems = [];
      for (const item of session.suggestedItems) {
        const answer = session.answers[`approve_${item.code}`];
        if (answer === true || answer === 'yes' || answer === 'نعم' || answer === '1') {
          approvedItems.push(item);
        }
      }
      session.answers._approvedItems = approvedItems;
      session.answers._rejectedCount = session.suggestedItems.length - approvedItems.length;
    }

    const suggestionQuestions = prepareSuggestedItemsQuestions(session);
    const newQuestions = suggestionQuestions.filter(sq => !session.questions.find(q => q.id === sq.id));

    if (newQuestions.length > 0) {
      session.questions = [...session.questions, ...newQuestions];
      session.status = 'review';
      sessions.set(sessionId, session);
      return { status: 'review', result: null, questions: session.questions, sessionId };
    }

    const result = await generateEstimateWithTimeout(session);
    if (result.status === 'completed') {
      session.status = 'completed';
      session.result = result.result;
      sessions.set(sessionId, session);
    }
    return { ...result, sessionId };
  } catch (err) {
    return { status: 'error', result: null, questions: [], sessionId, message: err.message };
  }
}

async function initiateQuestionFlow(projectId, mode) {
  try {
    const actualMode = mode || DEFAULT_MODE;
    const request = { projectId, execution_mode: actualMode };

    const analysis = inferenceEngine.analyzeRequest(request);
    const session = createSession(request, actualMode);
    const questions = buildQuestions(request, analysis);
    session.questions = questions;

    sessions.set(session.id, session);

    const status = questions.length > 0 ? 'needs_info' : 'ready';
    return { status, sessionId: session.id, questions };
  } catch (err) {
    return { status: 'error', sessionId: null, questions: [], message: err.message };
  }
}

function processManualItem(projectId, itemData) {
  try {
    const validation = [];
    if (!itemData || !itemData.name) validation.push('اسم البند مطلوب');
    if (!itemData.unit) validation.push('وحدة القياس مطلوبة');
    if (itemData.quantity !== undefined && (isNaN(itemData.quantity) || itemData.quantity <= 0)) {
      validation.push('الكمية يجب أن تكون رقماً موجباً');
    }

    if (validation.length > 0) {
      return { status: 'error', validation, suggestions: [] };
    }

    const params = {
      area: parseFloat(itemData.area) || 150,
      rooms: parseInt(itemData.rooms, 10) || 3,
      bathrooms: parseInt(itemData.bathrooms, 10) || 2,
      finish_level: itemData.finish_level || 'جيد'
    };

    let estimated = null;
    if (itemData.code) {
      try {
        estimated = inferenceEngine.estimateQuantity(itemData.code, params);
      } catch (e) {
        estimated = null;
      }
    }

    const suggestions = [];
    if (estimated && estimated.quantity > 0 && itemData.quantity) {
      const deviation = Math.abs(itemData.quantity - estimated.quantity) / estimated.quantity;
      if (deviation > 0.25) {
        suggestions.push({ type: 'quantity_mismatch', message: `الكمية المدخلة (${itemData.quantity}) تختلف بشكل كبير عن التقدير الآلي (${Math.round(estimated.quantity)})` });
      }
    }

    const buildingType = itemData.building_type || '';
    if (buildingType.includes('فيلا') && !itemData.pergolas_cladding) {
      suggestions.push({ type: 'missing_villa_item', message: 'قد تحتاج إلى إضافة برجولات أو كسوة جدران خارجية للمشروع' });
    }

    return { status: 'ok', validation, suggestions };
  } catch (err) {
    return { status: 'error', validation: [err.message], suggestions: [] };
  }
}

function getModeInfo(mode) {
  const info = MODE_INFO[mode];
  if (!info) return null;
  return { ...info };
}

function cleanupExpiredSessions(maxAge) {
  const age = maxAge || SESSION_TTL;
  const now = Date.now();
  const expiredIds = [];

  for (const [id, session] of sessions) {
    if (now - session.createdAt > age) {
      expiredIds.push(id);
    }
  }

  for (const id of expiredIds) {
    sessions.delete(id);
  }

  return { cleaned: expiredIds.length, count: expiredIds.length };
}

module.exports = {
  processRequest,
  handleQuestionAnswers,
  initiateQuestionFlow,
  processManualItem,
  getModeInfo,
  cleanupExpiredSessions
};
