const SCHEMA = {
  type: 'object',
  required: ['status', 'project', 'sections'],
  properties: {
    status: { type: 'string', enum: ['awaiting_execution_mode', 'ready', 'needs_review', 'error', 'completed', 'needs_info', 'review', 'incomplete'] },
    request_summary: { type: 'string' },
    document_type: { type: 'string' },
    execution_mode: { type: ['string', 'null'], enum: [null, 'no_additions', 'auto_add', 'show_before_add'] },
    inference_mode: { type: 'string', enum: ['trained_model', 'fallback_rules_and_similarity'] },
    project: {
      type: 'object',
      required: ['project_type', 'building_type', 'scope'],
      properties: {
        project_type: { type: 'string' },
        building_type: { type: 'string' },
        city: { type: 'string' },
        area: { type: ['number', 'null'] },
        floor_count: { type: ['number', 'null'] },
        room_count: { type: ['number', 'null'] },
        bathroom_count: { type: ['number', 'null'] },
        kitchen_count: { type: ['number', 'null'] },
        finish_level: { type: 'string' },
        scope: { type: 'string' },
        project_condition: { type: 'string' }
      }
    },
    data_completeness: { type: 'number', minimum: 0, maximum: 1 },
    estimate_level: { type: 'string', enum: ['initial', 'intermediate', 'detailed', 'approved'] },
    assumptions: { type: 'array', items: { type: 'string' } },
    missing_information: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          description: { type: 'string' },
          impact: { type: 'string' }
        }
      }
    },
    similar_projects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          similarity_score: { type: 'number' },
          similarity_reasons: { type: 'array', items: { type: 'object' } }
        }
      }
    },
    suggested_additions: { type: 'array', items: { type: 'object' } },
    sections: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'object',
        required: ['code', 'name', 'items'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          sort_order: { type: 'number' },
          section_total: { type: 'number' },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['code', 'name_ar', 'unit', 'quantity'],
              properties: {
                code: { type: 'string' },
                name_ar: { type: 'string' },
                unit: { type: 'string' },
                quantity: { type: 'number', minimum: 0 },
                quantity_min: { type: 'number', minimum: 0 },
                quantity_max: { type: 'number', minimum: 0 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                classification: { type: 'string', enum: ['أساسي', 'ضروري', 'مرتبط', 'موصى_به', 'اختياري', 'تحسين_جودة'] },
                calculation_method: { type: 'string' },
                quantity_source: { type: 'string', enum: ['model', 'rule', 'similarity', 'template', 'similar_projects'] },
                user_requested: { type: 'boolean' },
                ai_suggested: { type: 'boolean' },
                requires_confirmation: { type: 'boolean' },
                needs_confirmation: { type: 'boolean' },
                price_status: { type: 'string', enum: ['available', 'missing', 'expired', 'not_requested', 'غير_مسعر', 'estimated'] },
                unit_price: { type: ['number', 'null'] },
                total: { type: ['number', 'null'] },
                total_cost: { type: ['number', 'null'] }
              }
            }
          }
        }
      }
    },
    warnings: { type: 'array', items: { type: 'string' } },
    review_required: { type: 'boolean' },
    item_count: { type: 'number' },
    model: {
      type: 'object',
      properties: {
        version: { type: 'string' },
        trained_at: { type: 'string' },
        data_version: { type: 'string' },
        algorithm: { type: 'string' }
      }
    }
  }
};

const QuantitySheetSchema = {
  type: 'object',
  required: ['document_type', 'status', 'project', 'sections'],
  properties: {
    document_type: { type: 'string', enum: ['quantity_sheet'] },
    status: { type: 'string', enum: ['ready', 'error'] },
    project: {
      type: 'object',
      required: ['building_type', 'scope'],
      properties: {
        building_type: { type: 'string' },
        project_type: { type: 'string' },
        city: { type: 'string' },
        area: { type: 'number' },
        floor_count: { type: 'number' },
        room_count: { type: 'number' },
        bathroom_count: { type: 'number' },
        finish_level: { type: 'string' },
        scope: { type: 'string' }
      }
    },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['code', 'name', 'items'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          sort_order: { type: 'number' },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['code', 'name_ar', 'unit', 'quantity'],
              properties: {
                code: { type: 'string' },
                name_ar: { type: 'string' },
                unit: { type: 'string' },
                quantity: { type: 'number', minimum: 0 },
                quantity_min: { type: 'number', minimum: 0 },
                quantity_max: { type: 'number', minimum: 0 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                classification: { type: 'string' },
                calculation_method: { type: 'string' },
                quantity_source: { type: 'string' },
                ai_suggested: { type: 'boolean' },
                needs_confirmation: { type: 'boolean' },
                price_status: { type: 'string' },
                unit_price: { type: ['number', 'null'] },
                total_cost: { type: ['number', 'null'] }
              }
            }
          }
        }
      }
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    review_required: { type: 'boolean' },
    item_count: { type: 'number' }
  }
};

const QuotationSchema = {
  type: 'object',
  required: ['document_type', 'status', 'sections'],
  properties: {
    document_type: { type: 'string', enum: ['quotation'] },
    status: { type: 'string', enum: ['draft', 'incomplete', 'error'] },
    project: { type: 'object' },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['code', 'name', 'items'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          sort_order: { type: 'number' },
          section_total: { type: 'number' },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['code', 'name_ar', 'unit', 'quantity'],
              properties: {
                code: { type: 'string' },
                name_ar: { type: 'string' },
                unit: { type: 'string' },
                quantity: { type: 'number' },
                price_status: { type: 'string', enum: ['available', 'missing', 'estimated'] },
                unit_price: { type: ['number', 'null'] },
                total: { type: ['number', 'null'] }
              }
            }
          }
        }
      }
    },
    subtotal: { type: 'number' },
    tax: { type: 'number' },
    tax_rate: { type: 'number' },
    grand_total: { type: 'number' },
    unpriced_items: { type: 'array', items: { type: 'object' } },
    review_required: { type: 'boolean' },
    warnings: { type: 'array', items: { type: 'string' } }
  }
};

const PriceTableSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'name_ar', 'unit', 'price_status'],
        properties: {
          code: { type: 'string' },
          name_ar: { type: 'string' },
          unit: { type: 'string' },
          unit_price: { type: ['number', 'null'] },
          price_status: { type: 'string', enum: ['available', 'missing', 'expired'] },
          source: { type: 'string' },
          last_updated: { type: 'string' }
        }
      }
    }
  }
};

const SuggestedAdditionsSchema = {
  type: 'object',
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'name_ar'],
        properties: {
          code: { type: 'string' },
          name_ar: { type: 'string' },
          classification: { type: 'string' },
          reason: { type: 'string' },
          importance: { type: 'string' },
          confidence: { type: 'number' }
        }
      }
    }
  }
};

const TYPE_MAP = {
  string: 'string', number: 'number', boolean: 'boolean', object: 'object'
};

function isOfType(value, typeDef) {
  if (Array.isArray(typeDef)) {
    return typeDef.some(t => {
      if (t === 'null') return value === null || value === undefined;
      if (typeof value === 'number' && isNaN(value)) return false;
      return typeof value === TYPE_MAP[t];
    });
  }
  if (typeDef === 'array') return Array.isArray(value);
  if (typeDef === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === TYPE_MAP[typeDef];
}

function validateValue(value, schema, path, errors) {
  if (value === null || value === undefined) {
    if (schema.required || (Array.isArray(schema.type) && !schema.type.includes('null'))) {
      errors.push(`'${path}' مطلوب`);
    }
    return;
  }
  if (schema.enum) {
    const enumVals = schema.enum.map(e => e === null ? 'null' : e);
    if (!enumVals.includes(value === null ? 'null' : value) && !(Array.isArray(schema.type) && schema.type.includes('null') && value === null)) {
      errors.push(`'${path}' يجب أن يكون واحداً من [${enumVals.join(', ')}]`);
      return;
    }
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) { errors.push(`'${path}' يجب أن يكون مصفوفة`); return; }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`'${path}' يجب أن يحتوي على ${schema.minItems} عنصر على الأقل`);
    }
    if (schema.items) value.forEach((item, i) => validateValue(item, schema.items, `${path}[${i}]`, errors));
    return;
  }
  if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'))) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    if (schema.required) schema.required.forEach(req => {
      if (!(req in value) || value[req] === null || value[req] === undefined)
        errors.push(`'${path}' الخاصية المطلوبة '${req}' مفقودة`);
    });
    if (schema.properties) for (const key of Object.keys(value)) {
      if (schema.properties[key]) {
        const ps = schema.properties[key];
        const pp = `${path}.${key}`;
        if (!isOfType(value[key], ps.type)) {
          errors.push(`'${pp}' النوع متوقع ${JSON.stringify(ps.type)}، لكن القيمة من نوع ${typeof value[key]}`);
          continue;
        }
        if (ps.type === 'object' || (Array.isArray(ps.type) && ps.type.includes('object')))
          validateValue(value[key], ps, pp, errors);
        else if (ps.type === 'array') validateValue(value[key], ps, pp, errors);
        else {
          if (ps.minimum !== undefined && value[key] < ps.minimum) errors.push(`'${pp}' يجب أن يكون >= ${ps.minimum}`);
          if (ps.maximum !== undefined && value[key] > ps.maximum) errors.push(`'${pp}' يجب أن يكون <= ${ps.maximum}`);
        }
      }
    }
    return;
  }
  if (schema.minimum !== undefined && value < schema.minimum) errors.push(`'${path}' يجب أن يكون >= ${schema.minimum}`);
  if (schema.maximum !== undefined && value > schema.maximum) errors.push(`'${path}' يجب أن يكون <= ${schema.maximum}`);
}

function validateOutput(data) {
  const errors = [];
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { valid: false, errors: ['البيانات الجذرية يجب أن تكون كائناً'] };
  if (SCHEMA.required) SCHEMA.required.forEach(req => {
    if (!(req in data)) errors.push(`الخاصية المطلوبة '${req}' مفقودة من الجذر`);
  });
  for (const key of Object.keys(data)) {
    if (SCHEMA.properties[key]) {
      const ps = SCHEMA.properties[key];
      if (!isOfType(data[key], ps.type)) {
        errors.push(`'${key}' النوع متوقع ${JSON.stringify(ps.type)}`);
        continue;
      }
      if (ps.type === 'object' || (Array.isArray(ps.type) && ps.type.includes('object')))
        validateValue(data[key], ps, key, errors);
      else if (ps.type === 'array') validateValue(data[key], ps, key, errors);
      else validateValue(data[key], ps, key, errors);
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { SCHEMA, QuantitySheetSchema, QuotationSchema, PriceTableSchema, SuggestedAdditionsSchema, validateOutput };
