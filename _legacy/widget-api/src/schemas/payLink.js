// src/schemas/payLink.js
import { VALIDATION_CONFIG, validateWithConfig } from './validationConfig.js';

/**
 * Validate product JSON structure using configuration
 * @param {Object} product - Product data
 * @returns {Object} Validated product
 */
export function validateProduct(product) {
  return validateWithConfig(product, VALIDATION_CONFIG.product, 'product');
}

/**
 * Validate advanced options JSON structure using configuration
 * @param {Object} advancedOptions - Advanced options data
 * @returns {Object} Validated advanced options
 */
export function validateAdvancedOptions(advancedOptions) {
  const validated = validateWithConfig(advancedOptions, VALIDATION_CONFIG.advancedOptions, 'advancedOptions');
  
  // Validate nested objects
  validated.gating = validateGating(validated.gating);
  validated.discounts = validateDiscounts(validated.discounts);
  validated.quantity = validateQuantity(validated.quantity);
  validated.window = validateWindow(validated.window);
  validated.payments = validatePayments(validated.payments);
  validated.onramp = validateOnramp(validated.onramp);
  
  return validated;
}

/**
 * Validate gating configuration using configuration
 * @param {Object} gating - Gating configuration
 * @returns {Object} Validated gating
 */
function validateGating(gating) {
  const validated = validateWithConfig(gating, VALIDATION_CONFIG.gating, 'gating');
  
  // Validate assets array
  validated.assets = validateAssets(validated.assets);
  
  return validated;
}

/**
 * Validate assets array using configuration
 * @param {Array} assets - Assets array
 * @returns {Array} Validated assets
 */
function validateAssets(assets) {
  if (!Array.isArray(assets)) {
    return [];
  }
  
  return assets.map((asset, index) => {
    return validateWithConfig(asset, VALIDATION_CONFIG.asset, `gating.assets[${index}]`);
  });
}

/**
 * Validate discounts configuration using configuration
 * @param {Object} discounts - Discounts configuration
 * @returns {Object} Validated discounts
 */
function validateDiscounts(discounts) {
  const validated = validateWithConfig(discounts, VALIDATION_CONFIG.discounts, 'discounts');
  
  // Validate nested arrays
  validated.holderTokens = validateHolderTokens(validated.holderTokens);
  validated.bulk = validateBulkDiscounts(validated.bulk);
  
  return validated;
}

/**
 * Validate holder tokens for discounts using configuration
 * @param {Array} holderTokens - Holder tokens array
 * @returns {Array} Validated holder tokens
 */
function validateHolderTokens(holderTokens) {
  if (!Array.isArray(holderTokens)) {
    return [];
  }
  
  return holderTokens.map((token, index) => {
    return validateWithConfig(token, VALIDATION_CONFIG.holderToken, `discounts.holderTokens[${index}]`);
  });
}

/**
 * Validate bulk discounts using configuration
 * @param {Array} bulk - Bulk discounts array
 * @returns {Array} Validated bulk discounts
 */
function validateBulkDiscounts(bulk) {
  if (!Array.isArray(bulk)) {
    return [];
  }
  
  return bulk.map((discount, index) => {
    return validateWithConfig(discount, VALIDATION_CONFIG.bulkDiscount, `discounts.bulk[${index}]`);
  });
}

/**
 * Validate quantity configuration using configuration
 * @param {Object} quantity - Quantity configuration
 * @returns {Object} Validated quantity
 */
function validateQuantity(quantity) {
  return validateWithConfig(quantity, VALIDATION_CONFIG.quantity, 'quantity');
}

/**
 * Validate window configuration using configuration
 * @param {Object} window - Window configuration
 * @returns {Object} Validated window
 */
function validateWindow(window) {
  return validateWithConfig(window, VALIDATION_CONFIG.window, 'window');
}

/**
 * Validate payments configuration using configuration
 * @param {Object} payments - Payments configuration
 * @returns {Object} Validated payments
 */
function validatePayments(payments) {
  return validateWithConfig(payments, VALIDATION_CONFIG.payments, 'payments');
}

/**
 * Validate onramp configuration using configuration
 * @param {Object} onramp - Onramp configuration
 * @returns {Object} Validated onramp
 */
function validateOnramp(onramp) {
  return validateWithConfig(onramp, VALIDATION_CONFIG.onramp, 'onramp');
}

/**
 * Validate branding JSON structure using configuration
 * @param {Object} branding - Branding data
 * @returns {Object} Validated branding
 */
export function validateBranding(branding) {
  return validateWithConfig(branding, VALIDATION_CONFIG.branding, 'branding');
}

/**
 * Validate complete pay link data using configuration
 * @param {Object} payLink - Pay link data
 * @returns {Object} Validated pay link
 */
export function validatePayLink(payLink) {
  const validated = validateWithConfig(payLink, VALIDATION_CONFIG.payLink, 'payLink');
  
  // Validate nested objects
  validated.product = validateProduct(validated.product);
  validated.advancedOptions = validateAdvancedOptions(validated.advancedOptions);
  validated.branding = validateBranding(validated.branding);
  
  return validated;
}
