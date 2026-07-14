const SCHEMA = {
  type: 'object',
  required: ['project', 'assumptions', 'sections'],
  properties: {
    project: {
      type: 'object',
      required: ['name', 'type', 'scope', 'estimate_level', 'execution_mode'],
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['سكني', 'تجاري', 'مكتبي', 'صناعي', 'ترميم', 'تشطيب'] },
        scope: { type: 'string' },
        estimate_level: { type: 'string', enum: ['تقدير_أولي', 'تقدير_متوسط', 'حصر_تفصيلي'] },
        execution_mode: { type: 'string', enum: ['no_additions', 'auto_add', 'show_before_add'] },
        building_type: { type: 'string' },
        city: { type: 'string' },
        area: { type: 'number' },
        floor_count: { type: 'number' },
        room_count: { type: 'number' },
        finish_level: { type: 'string' }
      }
    },
    assumptions: {
      type: 'array',
      items: { type: 'string' }
    },
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
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'name', 'items'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          sort_order: { type: 'number' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['code', 'name_ar', 'unit', 'quantity'],
              properties: {
                code: { type: 'string' },
                name_ar: { type: 'string' },
                description: { type: 'string' },
                category: { type: 'string' },
                unit: { type: 'string' },
                quantity: { type: 'number' },
                quantity_min: { type: 'number' },
                quantity_max: { type: 'number' },
                quantity_calculated: { type: 'boolean' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                classification: { type: 'string', enum: ['أساسي', 'ضروري', 'مرتبط', 'موصى_به', 'اختياري', 'تحسين_جودة'] },
                calculation_method: { type: 'string' },
                ai_suggested: { type: 'boolean' },
                user_requested: { type: 'boolean' },
                needs_confirmation: { type: 'boolean' },
                price_status: { type: 'string', enum: ['مسعر', 'غير_مسعر', 'غير_متوفر'] },
                unit_price: { type: ['number', 'null'] },
                total_cost: { type: ['number', 'null'] },
                dependencies: { type: 'array', items: { type: 'string' } },
                assumptions: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    },
    warnings: { type: 'array', items: { type: 'string' } },
    review_required: { type: 'boolean' },
    suggestions_summary: { type: 'string' }
  }
};

const TYPE_MAP = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'object'
};

function isOfType(value, typeDef) {
  if (Array.isArray(typeDef)) {
    return typeDef.some(t => {
      if (t === 'null') return value === null;
      return typeof value === TYPE_MAP[t] || t === 'number' && typeof value === 'number';
    });
  }
  if (typeDef === 'array') return Array.isArray(value);
  if (typeDef === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === TYPE_MAP[typeDef];
}

function validateValue(value, schema, path, errors, allowExtra) {
  if (value === null || value === undefined) {
    if (schema.type && !(Array.isArray(schema.type) && schema.type.includes('null'))) {
      errors.push(`'${path}' is required`);
    }
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`'${path}' must be one of [${schema.enum.join(', ')}], got '${JSON.stringify(value)}'`);
    return;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`'${path}' must be an array`);
      return;
    }
    if (schema.items) {
      value.forEach((item, i) => {
        validateValue(item, schema.items, `${path}[${i}]`, errors, true);
      });
    }
    return;
  }

  if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'))) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    if (schema.required) {
      schema.required.forEach(req => {
        if (!(req in value) || value[req] === null || value[req] === undefined) {
          errors.push(`'${path}' missing required property '${req}'`);
        }
      });
    }
    if (schema.properties) {
      for (const key of Object.keys(value)) {
        if (schema.properties[key]) {
          const propSchema = schema.properties[key];
          const propPath = `${path}.${key}`;
          if (!isOfType(value[key], propSchema.type)) {
            errors.push(`'${propPath}' expected type ${JSON.stringify(propSchema.type)}, got ${typeof value[key]}`);
            continue;
          }
          if (propSchema.type === 'object' || (Array.isArray(propSchema.type) && propSchema.type.includes('object'))) {
            validateValue(value[key], propSchema, propPath, errors, true);
          } else if (propSchema.type === 'array') {
            validateValue(value[key], propSchema, propPath, errors, true);
          } else if (!Array.isArray(propSchema.type)) {
            if (propSchema.minimum !== undefined && value[key] < propSchema.minimum) {
              errors.push(`'${propPath}' must be >= ${propSchema.minimum}`);
            }
            if (propSchema.maximum !== undefined && value[key] > propSchema.maximum) {
              errors.push(`'${propPath}' must be <= ${propSchema.maximum}`);
            }
          }
        }
      }
    }
    return;
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`'${path}' must be >= ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`'${path}' must be <= ${schema.maximum}`);
  }
}

function validateOutput(data) {
  const errors = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['Root must be an object'] };
  }

  if (SCHEMA.required) {
    SCHEMA.required.forEach(req => {
      if (!(req in data)) {
        errors.push(`Missing required root property '${req}'`);
      }
    });
  }

  for (const key of Object.keys(data)) {
    if (SCHEMA.properties[key]) {
      const propSchema = SCHEMA.properties[key];
      const propPath = key;
      if (!isOfType(data[key], propSchema.type)) {
        errors.push(`'${propPath}' expected type ${JSON.stringify(propSchema.type)}, got ${typeof data[key]}`);
        continue;
      }
      if (propSchema.type === 'object' || (Array.isArray(propSchema.type) && propSchema.type.includes('object'))) {
        validateValue(data[key], propSchema, propPath, errors, true);
      } else if (propSchema.type === 'array') {
        validateValue(data[key], propSchema, propPath, errors, true);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { SCHEMA, validateOutput };
