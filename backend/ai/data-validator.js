const path = require('path');
const fs = require('fs');
const dataLoader = require('./data-loader');

const PRICE_FIELDS = ['unit_price', 'total_cost', 'price', 'unit cost', 'total price'];

function validate(data) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(data)) {
    errors.push({
      type: 'error',
      field: 'root',
      message: 'الملف يجب أن يكون مصفوفة من المشاريع.'
    });
    return { valid: false, errors, warnings, reportPath: null };
  }

  const projectIds = new Set();
  const allItemCodes = new Map();
  let dictionary = null;

  try {
    const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'catalogs', 'items.json'), 'utf-8'));
    dictionary = {};
    if (Array.isArray(items)) { for (const i of items) { if (i && i.code) dictionary[i.code] = i; } }
  } catch {
    warnings.push({
      type: 'warning',
      field: 'item-dictionary',
      message: 'لم يتم العثور على items.json. سيتم تخطي التحقق من أكواد العناصر.'
    });
  }

  for (const project of data) {
    const pErrors = validateProject(project, dictionary);
    errors.push(...pErrors.errors);
    warnings.push(...pErrors.warnings);

    if (project && project.id) {
      if (projectIds.has(project.id)) {
        errors.push({
          type: 'error',
          project_id: project.id,
          field: 'id',
          message: `معرف المشروع "${project.id}" مكرر.`,
          expected: 'معرف فريد لكل مشروع',
          actual: { id: project.id }
        });
      }
      projectIds.add(project.id);
    }

    if (project && Array.isArray(project.sections)) {
      const sectionCodes = new Set();
      for (const section of project.sections) {
        if (section && section.code) {
          if (sectionCodes.has(section.code)) {
            warnings.push({
              type: 'warning',
              project_id: project.id,
              section: section.name,
              field: 'section.code',
              message: `كود القسم "${section.code}" مكرر في نفس المشروع.`,
              actual: { code: section.code }
            });
          }
          sectionCodes.add(section.code);
        }

        const sErrors = validateSection(section);
        errors.push(...sErrors.errors.map(e => ({ ...e, project_id: project.id })));
        warnings.push(...sErrors.warnings.map(w => ({ ...w, project_id: project.id })));

        if (section && Array.isArray(section.items)) {
          const itemCodes = new Set();
          for (const item of section.items) {
            if (item && item.code) {
              if (itemCodes.has(item.code)) {
                errors.push({
                  type: 'error',
                  project_id: project.id,
                  section: section.name,
                  item_code: item.code,
                  field: 'item.code',
                  message: `كود العنصر "${item.code}" مكرر في نفس القسم.`,
                  expected: 'أكواد عناصر فريدة داخل كل قسم',
                  actual: { code: item.code }
                });
              }
              itemCodes.add(item.code);

              if (!allItemCodes.has(item.code)) {
                allItemCodes.set(item.code, []);
              }
              allItemCodes.get(item.code).push({
                project_id: project.id,
                section: section.name
              });

              if (dictionary && !dictionary[item.code]) {
                warnings.push({
                  type: 'warning',
                  project_id: project.id,
                  section: section.name,
                  item_code: item.code,
                  field: 'item.code',
                  message: `العنصر "${item.code}" غير موجود في قاموس العناصر (item-dictionary.json).`,
                  expected: `العنصر "${item.code}" موجود في القاموس`,
                  actual: { code: item.code }
                });
              }
            }

            const iErrors = validateItem(item);
            errors.push(...iErrors.errors.map(e => ({ ...e, project_id: project.id, section: section ? section.name : undefined })));
            warnings.push(...iErrors.warnings.map(w => ({ ...w, project_id: project.id, section: section ? section.name : undefined })));
          }
        }
      }
    }
  }

  for (const [code, locations] of allItemCodes) {
    if (locations.length > 1) {
      warnings.push({
        type: 'warning',
        item_code: code,
        field: 'item.code',
        message: `كود العنصر "${code}" مستخدم في ${locations.length} مشاريع مختلفة.`,
        expected: 'استخدام متسق للكود',
        actual: { code, locations: locations.map(l => l.project_id) }
      });
    }
  }

  const { valid, reportPath } = generateReport({ errors, warnings });

  return { valid, errors, warnings, reportPath };
}

function validateProject(project, dictionary) {
  const errors = [];
  const warnings = [];

  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    errors.push({
      type: 'error',
      field: 'project',
      message: 'المشروع غير صالح.'
    });
    return { errors, warnings };
  }

  if (!project.id) {
    errors.push({
      type: 'error',
      field: 'id',
      message: 'المشروع يفتقر إلى معرف (id).'
    });
  }

  if (!project.type) {
    errors.push({
      type: 'error',
      project_id: project.id,
      field: 'type',
      message: 'المشروع يفتقر إلى النوع (type).'
    });
  }

  if (!project.project || typeof project.project !== 'object') {
    errors.push({
      type: 'error',
      project_id: project.id,
      field: 'project',
      message: 'المشروع يفتقر إلى كائن المشروع (project object).'
    });
  } else {
    const proj = project.project;
    if (!proj.name) {
      errors.push({
        type: 'error',
        project_id: project.id,
        field: 'project.name',
        message: 'المشروع يفتقر إلى اسم المشروع (project.name).'
      });
    }
    if (!proj.project_type) {
      errors.push({
        type: 'error',
        project_id: project.id,
        field: 'project.project_type',
        message: 'المشروع يفتقر إلى نوع المشروع (project_type).'
      });
    }
    if (!proj.building_type) {
      warnings.push({
        type: 'warning',
        project_id: project.id,
        field: 'project.building_type',
        message: 'المشروع يفتقر إلى نوع المبنى (building_type).'
      });
    }
    if (proj.area === undefined || proj.area === null) {
      warnings.push({
        type: 'warning',
        project_id: project.id,
        field: 'project.area',
        message: 'المشروع يفتقر إلى المساحة (area).'
      });
    } else if (typeof proj.area !== 'number' || proj.area < 0) {
      errors.push({
        type: 'error',
        project_id: project.id,
        field: 'project.area',
        message: 'مساحة المشروع غير صالحة.',
        expected: 'رقم موجب',
        actual: { area: proj.area }
      });
    }
    if (!proj.scope) {
      errors.push({
        type: 'error',
        project_id: project.id,
        field: 'project.scope',
        message: 'المشروع يفتقر إلى نطاق العمل (scope).'
      });
    }

    if (proj.area_min !== undefined && proj.area !== undefined && proj.area_min > proj.area) {
      warnings.push({
        type: 'warning',
        project_id: project.id,
        field: 'project.area_min',
        message: 'الحد الأدنى للمساحة أكبر من المساحة الأساسية.',
        expected: 'area_min <= area',
        actual: { area_min: proj.area_min, area: proj.area }
      });
    }
    if (proj.area_max !== undefined && proj.area !== undefined && proj.area_max < proj.area) {
      warnings.push({
        type: 'warning',
        project_id: project.id,
        field: 'project.area_max',
        message: 'الحد الأقصى للمساحة أصغر من المساحة الأساسية.',
        expected: 'area_max >= area',
        actual: { area_max: proj.area_max, area: proj.area }
      });
    }
  }

  if (!project.sections || !Array.isArray(project.sections)) {
    errors.push({
      type: 'error',
      project_id: project.id,
      field: 'sections',
      message: 'المشروع يفتقر إلى مصفوفة الأقسام (sections).'
    });
  }

  for (const field of PRICE_FIELDS) {
    if (project[field] !== undefined) {
      errors.push({
        type: 'error',
        project_id: project.id,
        field,
        message: `حقل السعر "${field}" موجود في المشروع ولا يُسمح به في بيانات التدريب.`
      });
    }
  }

  if (project.project) {
    for (const field of PRICE_FIELDS) {
      if (project.project[field] !== undefined) {
        errors.push({
          type: 'error',
          project_id: project.id,
          field: `project.${field}`,
          message: `حقل السعر "${field}" موجود في project object ولا يُسمح به في بيانات التدريب.`
        });
      }
    }
  }

  return { errors, warnings };
}

function validateSection(section) {
  const errors = [];
  const warnings = [];

  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    errors.push({
      type: 'error',
      field: 'section',
      message: 'القسم غير صالح.'
    });
    return { errors, warnings };
  }

  if (!section.code) {
    errors.push({
      type: 'error',
      field: 'section.code',
      message: 'القسم يفتقر إلى كود (code).'
    });
  }

  if (!section.name) {
    errors.push({
      type: 'error',
      field: 'section.name',
      message: 'القسم يفتقر إلى اسم (name).'
    });
  } else {
    const normalized = dataLoader.normalizeText(section.name);
    if (normalized !== section.name.trim()) {
      warnings.push({
        type: 'warning',
        section: section.name,
        field: 'section.name',
        message: 'اسم القسم يحتوي على مسافات زائدة أو حروف غير طبيعية.',
        expected: `"${normalized}"`,
        actual: { name: section.name }
      });
    }
  }

  if (!section.items || !Array.isArray(section.items)) {
    errors.push({
      type: 'error',
      section: section.name,
      field: 'section.items',
      message: 'القسم يفتقر إلى مصفوفة العناصر (items).'
    });
  }

  for (const field of PRICE_FIELDS) {
    if (section[field] !== undefined) {
      errors.push({
        type: 'error',
        section: section.name,
        field,
        message: `حقل السعر "${field}" موجود في القسم ولا يُسمح به في بيانات التدريب.`
      });
    }
  }

  return { errors, warnings };
}

function validateItem(item) {
  const errors = [];
  const warnings = [];

  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    errors.push({
      type: 'error',
      field: 'item',
      message: 'العنصر غير صالح.'
    });
    return { errors, warnings };
  }

  if (!item.code) {
    errors.push({
      type: 'error',
      field: 'item.code',
      message: 'العنصر يفتقر إلى كود (code).'
    });
  }

  if (!item.name_ar) {
    errors.push({
      type: 'error',
      field: 'item.name_ar',
      message: `العنصر "${item.code || '?'}" يفتقر إلى الاسم العربي (name_ar).`
    });
  } else if (typeof item.name_ar === 'string') {
    const normalized = dataLoader.normalizeText(item.name_ar);
    if (normalized !== item.name_ar.trim()) {
      warnings.push({
        type: 'warning',
        item_code: item.code,
        field: 'item.name_ar',
        message: `اسم العنصر "${item.code}" يحتوي على مسافات زائدة أو حروف غير طبيعية.`,
        expected: `"${normalized}"`,
        actual: { name_ar: item.name_ar }
      });
    }
  }

  if (!item.unit) {
    errors.push({
      type: 'error',
      item_code: item.code,
      field: 'item.unit',
      message: `العنصر "${item.code}" يفتقر إلى الوحدة (unit).`
    });
  }

  if (item.quantity === undefined || item.quantity === null) {
    errors.push({
      type: 'error',
      item_code: item.code,
      field: 'item.quantity',
      message: `العنصر "${item.code}" يفتقر إلى الكمية (quantity).`
    });
  } else if (typeof item.quantity !== 'number' || item.quantity < 0) {
    errors.push({
      type: 'error',
      item_code: item.code,
      field: 'item.quantity',
      message: `الكمية للعنصر "${item.code}" غير صالحة.`,
      expected: 'رقم غير سالب',
      actual: { quantity: item.quantity }
    });
  }

  if (item.quantity_min !== undefined) {
    if (typeof item.quantity_min !== 'number' || item.quantity_min < 0) {
      errors.push({
        type: 'error',
        item_code: item.code,
        field: 'item.quantity_min',
        message: `الحد الأدنى للعنصر "${item.code}" غير صالح.`,
        expected: 'رقم غير سالب',
        actual: { quantity_min: item.quantity_min }
      });
    } else if (item.quantity !== undefined && item.quantity_min > item.quantity) {
      errors.push({
        type: 'error',
        item_code: item.code,
        field: 'item.quantity_min',
        message: `الحد الأدنى للعنصر "${item.code}" أكبر من الكمية الأساسية.`,
        expected: 'quantity_min <= quantity',
        actual: { quantity_min: item.quantity_min, quantity: item.quantity }
      });
    }
  }

  if (item.quantity_max !== undefined) {
    if (typeof item.quantity_max !== 'number' || item.quantity_max < 0) {
      errors.push({
        type: 'error',
        item_code: item.code,
        field: 'item.quantity_max',
        message: `الحد الأقصى للعنصر "${item.code}" غير صالح.`,
        expected: 'رقم غير سالب',
        actual: { quantity_max: item.quantity_max }
      });
    } else if (item.quantity !== undefined && item.quantity_max < item.quantity) {
      errors.push({
        type: 'error',
        item_code: item.code,
        field: 'item.quantity_max',
        message: `الحد الأقصى للعنصر "${item.code}" أصغر من الكمية الأساسية.`,
        expected: 'quantity_max >= quantity',
        actual: { quantity_max: item.quantity_max, quantity: item.quantity }
      });
    }
  }

  if (item.confidence !== undefined) {
    if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) {
      errors.push({
        type: 'error',
        item_code: item.code,
        field: 'item.confidence',
        message: `نسبة الثقة للعنصر "${item.code}" خارج النطاق المسموح (0-1).`,
        expected: 'قيمة بين 0 و 1',
        actual: { confidence: item.confidence }
      });
    }
  }

  for (const field of PRICE_FIELDS) {
    if (item[field] !== undefined) {
      errors.push({
        type: 'error',
        item_code: item.code,
        field,
        message: `حقل السعر "${field}" موجود في العنصر "${item.code}" ولا يُسمح به في بيانات التدريب.`
      });
    }
  }

  if (item.name_ar && typeof item.name_ar === 'string') {
    try {
      Buffer.from(item.name_ar, 'utf8').toString('utf8');
    } catch {
      warnings.push({
        type: 'warning',
        item_code: item.code,
        field: 'item.name_ar',
        message: `النص العربي للعنصر "${item.code}" قد يكون تالفاً أو غير UTF-8 صحيح.`
      });
    }
  }

  return { errors, warnings };
}

function generateReport(validationResult) {
  const reportDir = path.resolve(__dirname);
  const reportPath = path.join(reportDir, 'data-validation-report.json');

  const report = {
    valid: validationResult.errors.length === 0,
    timestamp: new Date().toISOString(),
    summary: {
      total_errors: validationResult.errors.length,
      total_warnings: validationResult.warnings.length
    },
    errors: validationResult.errors,
    warnings: validationResult.warnings
  };

  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    return { valid: false, report: null, reportPath: null };
  }

  return { valid: report.valid, report, reportPath };
}

module.exports = {
  validate,
  validateProject,
  validateSection,
  validateItem,
  generateReport
};
