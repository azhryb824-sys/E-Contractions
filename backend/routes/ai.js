const express = require('express');
const router = express.Router();
const inferenceEngine = require('../ai/inference-engine');
const requestHandler = require('../ai/request-handler');
const calculationEngine = require('../ai/calculation-engine');
const templateEngine = require('../ai/template-engine');
const path = require('path');
const fs = require('fs');

// POST /api/ai/estimate - Generate a complete estimate from a user request
router.post('/estimate', async (req, res) => {
  try {
    const { request, mode } = req.body;
    if (!request) return res.status(400).json({ success: false, error: 'بيانات الطلب مطلوبة' });

    const execMode = mode || 'show_before_add';
    const result = await requestHandler.processRequest(request, execMode);

    if (result.status === 'timeout') {
      return res.status(408).json({ success: false, status: 'timeout', error: result.message, partialData: result.partialData });
    }

    if (result.status === 'error') {
      return res.status(500).json({ success: false, error: result.message });
    }

    res.json({ success: true, status: result.status, data: result.result || result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/analyze - Analyze a request (no generation)
router.post('/analyze', (req, res) => {
  try {
    const { request } = req.body;
    if (!request) return res.status(400).json({ success: false, error: 'بيانات الطلب مطلوبة' });

    const analysis = inferenceEngine.analyzeRequest(request);
    res.json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/question-flow - Start/continue the mandatory question flow
router.post('/question-flow', (req, res) => {
  try {
    const { projectId, mode, sessionId, answers } = req.body;

    if (sessionId && answers) {
      const result = requestHandler.handleQuestionAnswers(sessionId, answers);
      return res.json({
        success: true,
        status: result.status,
        data: result.result || result,
        sessionId: result.sessionId || sessionId,
        questions: result.questions
      });
    }

    if (projectId) {
      const result = requestHandler.initiateQuestionFlow(projectId, mode || 'show_before_add');
      return res.json({
        success: true,
        status: result.status,
        sessionId: result.sessionId,
        questions: result.questions
      });
    }

    res.status(400).json({ success: false, error: 'projectId أو sessionId+answers مطلوب' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/calculate - Calculate quantities for an item
router.post('/calculate', (req, res) => {
  try {
    const { itemCode, projectParams } = req.body;
    if (!itemCode) return res.status(400).json({ success: false, error: 'رمز البند مطلوب' });

    const result = calculationEngine.calculate(itemCode, projectParams || {});
    const breakdown = calculationEngine.getCalculationBreakdown(itemCode, projectParams || {});

    res.json({ success: true, data: { ...result, breakdown } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/calculate-batch - Calculate quantities for multiple items
router.post('/calculate-batch', (req, res) => {
  try {
    const { items, projectParams } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, error: 'قائمة البنود مطلوبة' });

    const result = calculationEngine.calculateBatch(items, projectParams || {});
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/validate-quantity - Validate a user-provided quantity
router.post('/validate-quantity', (req, res) => {
  try {
    const { itemCode, userQuantity, projectParams } = req.body;
    if (!itemCode || userQuantity === undefined) return res.status(400).json({ success: false, error: 'رمز البند والكمية مطلوبان' });

    const result = calculationEngine.validateQuantity(itemCode, userQuantity, projectParams || {});
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ai/supported-calculations - Get all supported calculation formulas
router.get('/supported-calculations', (req, res) => {
  try {
    const calculations = calculationEngine.getSupportedCalculations();
    res.json({ success: true, data: calculations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/generate-file - Generate file(s) from estimate data
router.post('/generate-file', (req, res) => {
  try {
    const { data, options } = req.body;
    if (!data) return res.status(400).json({ success: false, error: 'بيانات التقدير مطلوبة' });

    const format = options?.format || 'all';
    let result;

    switch (format) {
      case 'pdf':
        result = templateEngine.generatePDF(data, options);
        break;
      case 'word':
        result = templateEngine.generateWord(data, options);
        break;
      case 'excel':
        result = templateEngine.generateExcel(data, options);
        break;
      case 'boq':
        result = templateEngine.generateBOQ(data, options);
        break;
      case 'all':
      default:
        result = templateEngine.generateAll(data, options);
        break;
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/check-items - Check for missing essential items
router.post('/check-items', (req, res) => {
  try {
    const { existingItems, projectType } = req.body;
    if (!existingItems || !Array.isArray(existingItems)) return res.status(400).json({ success: false, error: 'قائمة البنود الحالية مطلوبة' });

    const missing = inferenceEngine.getMissingEssentialItems(existingItems, projectType);
    res.json({ success: true, data: { missing, count: missing.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ai/mode-info/:mode - Get info about execution mode
router.get('/mode-info/:mode', (req, res) => {
  try {
    const modeInfo = requestHandler.getModeInfo(req.params.mode);
    if (!modeInfo) return res.status(400).json({ success: false, error: 'وضع غير معروف' });

    res.json({ success: true, data: modeInfo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/manual-item - Process a manual item addition
router.post('/manual-item', (req, res) => {
  try {
    const { projectId, itemData } = req.body;
    if (!projectId || !itemData) return res.status(400).json({ success: false, error: 'معرف المشروع وبيانات البند مطلوبان' });

    const result = requestHandler.processManualItem(projectId, itemData);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ai/compare - Compare estimated vs actual quantities for a project
router.post('/compare', (req, res) => {
  try {
    const { items, projectParams } = req.body;
    if (!items || !projectParams) return res.status(400).json({ success: false, error: 'البيانات مطلوبة' });

    const comparisons = items.map(item => {
      const estimated = calculationEngine.calculate(item.code, projectParams);
      const userValue = item.quantity;
      const comparison = inferenceEngine.compareEstimate(estimated, userValue);
      return { itemCode: item.code, name: item.name_ar, userQuantity: userValue, estimatedQuantity: estimated.quantity, ...comparison };
    });

    res.json({ success: true, data: comparisons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/cleanup - Clean up expired sessions
router.post('/cleanup', (req, res) => {
  try {
    const maxAge = req.body.maxAge || 30 * 60 * 1000;
    const result = requestHandler.cleanupExpiredSessions(maxAge);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
