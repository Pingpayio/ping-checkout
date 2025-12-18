// src/hooks/useQuoteError.js
// React hook for handling quote errors with proper UI patterns

import { useState, useCallback } from 'react';
import { normalizeApiError, isRetryableError, getRetryDelay } from '../utils/errorHandler';

/**
 * Hook for managing quote request errors and retry logic
 * @returns {Object} Error state and handlers
 */
export function useQuoteError() {
  const [error, setError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);

  /**
   * Handle API error response
   * @param {Object} response - API response
   * @param {Function} onRetry - Optional retry function
   */
  const handleError = useCallback((response, onRetry = null) => {
    const normalized = normalizeApiError(response);
    setError({
      ...normalized,
      onRetry: onRetry && isRetryableError(normalized.code) ? onRetry : null,
      retryDelay: getRetryDelay(normalized.code)
    });
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
    setIsRetrying(false);
  }, []);

  /**
   * Execute retry with delay
   */
  const retry = useCallback(async () => {
    if (!error?.onRetry) return;
    
    setIsRetrying(true);
    
    // Wait for retry delay
    await new Promise(resolve => setTimeout(resolve, error.retryDelay));
    
    try {
      await error.onRetry();
      clearError();
    } catch (err) {
      // Error will be handled by the calling function
      setIsRetrying(false);
    }
  }, [error, clearError]);

  return {
    error,
    isRetrying,
    handleError,
    clearError,
    retry
  };
}

/**
 * UI pattern helpers
 */
export const ErrorPatterns = {
  /**
   * Inline error for form fields
   */
  Inline: ({ error, field }) => {
    if (!error || error.kind !== 'inline') return null;
    
    return (
      <div className="error-inline" data-field={field}>
        <span className="error-icon">⚠️</span>
        <span className="error-message">{error.msg}</span>
      </div>
    );
  },

  /**
   * Card error for blocking issues
   */
  Card: ({ error, onRetry, onDismiss }) => {
    if (!error || error.kind !== 'card') return null;
    
    return (
      <div className="error-card">
        <div className="error-header">
          <span className="error-icon">🚫</span>
          <span className="error-title">Action Required</span>
        </div>
        <div className="error-message">{error.msg}</div>
        <div className="error-actions">
          {error.onRetry && (
            <button onClick={onRetry} disabled={isRetrying}>
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          )}
          <button onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    );
  },

  /**
   * Toast error for non-blocking issues
   */
  Toast: ({ error, onRetry, onDismiss }) => {
    if (!error || error.kind !== 'toast') return null;
    
    return (
      <div className="error-toast">
        <span className="error-message">{error.msg}</span>
        {error.onRetry && (
          <button onClick={onRetry} disabled={isRetrying}>
            Retry
          </button>
        )}
        <button onClick={onDismiss}>×</button>
      </div>
    );
  }
};
