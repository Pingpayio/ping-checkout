// src/schemas/validationConfig.js

/**
 * Centralized validation configuration - no hardcoding
 * All validation rules are defined here and can be easily modified
 */

export const VALIDATION_CONFIG = {
  // Product validation rules
  product: {
    required: ['title'],
    fields: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      image: { type: 'string', maxLength: 500, pattern: '^https?://.*' },
      description: { type: 'string', maxLength: 1000 },
      priceFiat: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$', minValue: 0 },
      fiatCurrency: { type: 'string', pattern: '^[A-Z]{3}$', maxLength: 3 }
    },
    defaults: {
      title: '',
      image: '',
      description: '',
      priceFiat: '0',
      fiatCurrency: 'USD'
    }
  },

  // Gating validation rules
  gating: {
    fields: {
      allowlist: { type: 'array', itemType: 'string', maxItems: 1000 },
      assets: { type: 'array', itemType: 'object', maxItems: 50 },
      nftContracts: { type: 'array', itemType: 'string', maxItems: 100 }
    },
    defaults: {
      allowlist: [],
      assets: [],
      nftContracts: []
    }
  },

  // Advanced options validation rules
  advancedOptions: {
    fields: {
      collect: { type: 'array', itemType: 'string', maxItems: 10, allowedValues: ['email', 'phone', 'address', 'x', 'name'] },
      gating: { type: 'object' },
      discounts: { type: 'object' },
      quantity: { type: 'object' },
      window: { type: 'object' },
      payments: { type: 'object' },
      onramp: { type: 'object' }
    },
    defaults: {
      collect: [],
      gating: {},
      discounts: {},
      quantity: {},
      window: {},
      payments: {},
      onramp: {}
    }
  },

  // Asset validation rules
  asset: {
    required: ['id'],
    fields: {
      id: { type: 'string', pattern: '^(nep141|nep171):[a-zA-Z0-9._-]+$', maxLength: 100 },
      min: { type: 'string', pattern: '^\\d+(\\.\\d+)?$', minValue: 0 }
    },
    defaults: {
      id: '',
      min: '0'
    }
  },

  // Discounts validation rules
  discounts: {
    fields: {
      holderTokens: { type: 'array', itemType: 'object', maxItems: 20 },
      bulk: { type: 'array', itemType: 'object', maxItems: 20 }
    },
    defaults: {
      holderTokens: [],
      bulk: []
    }
  },

  // Holder token validation rules
  holderToken: {
    required: ['id'],
    fields: {
      id: { type: 'string', pattern: '^(nep141|nep171):[a-zA-Z0-9._-]+$', maxLength: 100 },
      percent: { type: 'number', min: 0, max: 100 }
    },
    defaults: {
      id: '',
      percent: 0
    }
  },

  // Bulk discount validation rules
  bulkDiscount: {
    required: ['minQuantity'],
    fields: {
      minQuantity: { type: 'number', min: 1, max: 999999 },
      percent: { type: 'number', min: 0, max: 100 }
    },
    defaults: {
      minQuantity: 1,
      percent: 0
    }
  },

  // Quantity validation rules
  quantity: {
    fields: {
      min: { type: 'number', min: 1, max: 999999 },
      max: { type: 'number', min: 1, max: 999999 },
      step: { type: 'number', min: 1, max: 1000 }
    },
    defaults: {
      min: 1,
      max: 999,
      step: 1
    }
  },

  // Window validation rules
  window: {
    fields: {
      start: { type: 'string', pattern: '^(|\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z?)$', maxLength: 30 },
      end: { type: 'string', pattern: '^(|\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z?)$', maxLength: 30 },
      timezone: { type: 'string', pattern: '^[A-Za-z/_]+$', maxLength: 50 }
    },
    defaults: {
      start: '',
      end: '',
      timezone: 'UTC'
    }
  },

  // Payments validation rules
  payments: {
    fields: {
      onramp: { type: 'boolean' }
    },
    defaults: {
      onramp: false
    }
  },

  // Onramp validation rules
  onramp: {
    fields: {
      enabled: { type: 'boolean' },
      environment: { type: 'string', enum: ['sandbox', 'production'], maxLength: 20 },
      popupUrl: { type: 'string', pattern: '^https?://.*', maxLength: 500 }
    },
    defaults: {
      enabled: false,
      environment: 'sandbox',
      popupUrl: ''
    }
  },

  // Branding validation rules
  branding: {
    fields: {
      logo: { type: 'string', pattern: '^https?://.*', maxLength: 500 },
      colorPrimary: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', maxLength: 7 },
      theme: { type: 'string', enum: ['light', 'dark', 'auto', 'blackdragon'], maxLength: 20 }
    },
    defaults: {
      logo: '',
      colorPrimary: '#000000',
      theme: 'light'
    }
  },

  // Pay link validation rules
  payLink: {
    required: ['id', 'receiveAssetId'],
    fields: {
      id: { type: 'string', pattern: '^[a-zA-Z0-9._-]+$', minLength: 1, maxLength: 100 },
      receiveAssetId: { type: 'string', pattern: '^(nep141|nep171):[a-zA-Z0-9._-]+$', maxLength: 100 },
      product: { type: 'object' },
      advancedOptions: { type: 'object' },
      branding: { type: 'object' }
    }
  }
};

/**
 * Generic validation function using configuration
 * @param {Object} data - Data to validate
 * @param {Object} config - Validation configuration
 * @param {string} context - Context for error messages
 * @returns {Object} Validated data
 */
export function validateWithConfig(data, config, context = 'data') {
  if (!data || typeof data !== 'object') {
    throw new Error(`${context} must be an object`);
  }

  const validated = {};

  // Apply defaults first
  if (config.defaults) {
    Object.assign(validated, config.defaults);
  }

  // Validate each field
  for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
    const value = data[fieldName];
    
    if (value === undefined || value === null) {
      continue; // Use default value
    }

    // Type validation
    if (fieldConfig.type === 'string' && typeof value !== 'string') {
      validated[fieldName] = String(value);
    } else if (fieldConfig.type === 'number' && typeof value !== 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        throw new Error(`${context}.${fieldName} must be a valid number`);
      }
      validated[fieldName] = num;
    } else if (fieldConfig.type === 'array' && !Array.isArray(value)) {
      throw new Error(`${context}.${fieldName} must be an array`);
    } else if (fieldConfig.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      throw new Error(`${context}.${fieldName} must be an object`);
    } else {
      validated[fieldName] = value;
    }

    // String validations
    if (fieldConfig.type === 'string') {
      const str = validated[fieldName];
      
      if (fieldConfig.minLength && str.length < fieldConfig.minLength) {
        throw new Error(`${context}.${fieldName} must be at least ${fieldConfig.minLength} characters`);
      }
      
      if (fieldConfig.maxLength && str.length > fieldConfig.maxLength) {
        throw new Error(`${context}.${fieldName} must be no more than ${fieldConfig.maxLength} characters`);
      }
      
      if (fieldConfig.pattern && !new RegExp(fieldConfig.pattern).test(str)) {
        throw new Error(`${context}.${fieldName} has invalid format`);
      }
    }

    // Number validations
    if (fieldConfig.type === 'number') {
      const num = validated[fieldName];
      
      if (fieldConfig.min !== undefined && num < fieldConfig.min) {
        throw new Error(`${context}.${fieldName} must be at least ${fieldConfig.min}`);
      }
      
      if (fieldConfig.max !== undefined && num > fieldConfig.max) {
        throw new Error(`${context}.${fieldName} must be no more than ${fieldConfig.max}`);
      }
    }

    // Array validations
    if (fieldConfig.type === 'array') {
      const arr = validated[fieldName];
      
      if (fieldConfig.maxItems && arr.length > fieldConfig.maxItems) {
        throw new Error(`${context}.${fieldName} must have no more than ${fieldConfig.maxItems} items`);
      }
      
      if (fieldConfig.itemType === 'string') {
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== 'string') {
            throw new Error(`${context}.${fieldName}[${i}] must be a string`);
          }
          // Check allowed values if specified
          if (fieldConfig.allowedValues && !fieldConfig.allowedValues.includes(arr[i])) {
            throw new Error(`${context}.${fieldName}[${i}] must be one of: ${fieldConfig.allowedValues.join(', ')}`);
          }
        }
      } else if (fieldConfig.itemType === 'object') {
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== 'object' || Array.isArray(arr[i])) {
            throw new Error(`${context}.${fieldName}[${i}] must be an object`);
          }
        }
      }
    }

    // Enum validation
    if (fieldConfig.enum && !fieldConfig.enum.includes(validated[fieldName])) {
      throw new Error(`${context}.${fieldName} must be one of: ${fieldConfig.enum.join(', ')}`);
    }
  }

  // Check required fields
  if (config.required) {
    for (const fieldName of config.required) {
      if (!validated[fieldName] || (typeof validated[fieldName] === 'string' && validated[fieldName].trim() === '')) {
        throw new Error(`${context}.${fieldName} is required`);
      }
    }
  }

  return validated;
}
