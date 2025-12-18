/**
 * PingCheckout Widget SDK
 * 
 * Usage:
 *   <script src="https://api.pingpay.io/widget.js" data-ping-publishable-key="pk_..."></script>
 *   <script>
 *     PingCheckout.open({ pingLinkId: 'plink_...' });
 *   </script>
 */

(function(window, document) {
  'use strict';

  // Configuration
  const EMBED_BASE_URL = 'https://pay.pingpay.io';
  const API_BASE_URL = 'https://api.pingpay.io/api/v1';

  // State
  let bootstrapConfig = null;
  let publishableKey = null;
  let isInitialized = false;
  let isOriginAllowed = false;
  let currentOverlay = null;
  let currentIframe = null;
  let messageHandler = null;

  /**
   * Check if origin is allowed
   */
  function checkOriginAllowed(origin, allowedOrigins) {
    if (!allowedOrigins || allowedOrigins.length === 0) return true;
    if (allowedOrigins.includes('*')) return true;
    return allowedOrigins.includes(origin);
  }

  /**
   * Bootstrap widget configuration
   */
  async function bootstrap(key) {
    try {
      const response = await fetch(`${API_BASE_URL}/widget/bootstrap?publishableKey=${encodeURIComponent(key)}`);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Bootstrap failed' }));
        throw new Error(error.message || 'Bootstrap failed');
      }

      const config = await response.json();
      
      // Validate origin
      const currentOrigin = window.location.origin;
      isOriginAllowed = checkOriginAllowed(currentOrigin, config.allowedOrigins);
      
      if (!isOriginAllowed) {
        console.error('[PingCheckout] Origin not allowed:', currentOrigin);
        return null;
      }

      bootstrapConfig = config;
      return config;
    } catch (error) {
      console.error('[PingCheckout] Bootstrap error:', error.message);
      return null;
    }
  }

  /**
   * Fetch ping link details (public endpoint needed)
   */
  async function getPingLink(pingLinkId) {
    try {
      // Note: This requires a public endpoint or the ping link API to accept publishable keys
      // For now, we'll try to fetch it - if it fails, we'll handle it gracefully
      const response = await fetch(`${bootstrapConfig.apiBaseUrl}/ping-links/${pingLinkId}`, {
        headers: {
          'X-Ping-Api-Key': publishableKey,
        },
      });

      if (!response.ok) {
        throw new Error('Ping link not found');
      }

      const data = await response.json();
      return data.pingLink;
    } catch (error) {
      console.error('[PingCheckout] Ping link fetch error:', error.message);
      throw error;
    }
  }

  /**
   * Create checkout session
   */
  async function createCheckoutSession(options) {
    try {
      let body = {};

      // If pingLinkId is provided, fetch the ping link first to get amount/recipient
      if (options.pingLinkId) {
        const pingLink = await getPingLink(options.pingLinkId);
        
        body = {
          amount: pingLink.amount,
          recipient: pingLink.recipient,
          theme: options.theme || pingLink.theme || bootstrapConfig?.defaultTheme,
          successUrl: options.successUrl || pingLink.successUrl,
          cancelUrl: options.cancelUrl || pingLink.cancelUrl,
          metadata: options.metadata || pingLink.metadata,
        };
      } else if (options.amount && options.recipient) {
        // Direct session creation with amount/recipient
        body = {
          amount: options.amount,
          recipient: options.recipient,
          theme: options.theme || bootstrapConfig?.defaultTheme,
          successUrl: options.successUrl,
          cancelUrl: options.cancelUrl,
          metadata: options.metadata,
        };
      } else {
        throw new Error('Either pingLinkId or amount+recipient must be provided');
      }

      const response = await fetch(`${bootstrapConfig.apiBaseUrl}/checkout/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ping-Api-Key': publishableKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Session creation failed' }));
        throw new Error(error.message || 'Session creation failed');
      }

      const data = await response.json();
      return data.session?.sessionId || data.sessionId;
    } catch (error) {
      console.error('[PingCheckout] Session creation error:', error.message);
      throw error;
    }
  }

  /**
   * Create overlay and iframe
   */
  function createOverlay(sessionId, callbacks) {
    // Remove existing overlay if any
    if (currentOverlay) {
      removeOverlay();
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'pingcheckout-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Create container
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
      width: 100%;
      max-width: 500px;
      height: 90vh;
      max-height: 800px;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(0, 0, 0, 0.1);
      border-radius: 50%;
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeButton.onclick = () => {
      removeOverlay();
      if (callbacks.onClose) {
        callbacks.onClose({ sessionId });
      }
    };

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.src = `${EMBED_BASE_URL}/embed/${sessionId}`;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      display: none;
    `;
    iframe.allow = 'payment';

    // Create loading/error container
    const statusContainer = document.createElement('div');
    statusContainer.id = 'pingcheckout-status';
    statusContainer.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      padding: 20px;
      box-sizing: border-box;
    `;

    // Assemble
    container.appendChild(closeButton);
    container.appendChild(statusContainer);
    container.appendChild(iframe);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    currentOverlay = overlay;
    currentIframe = iframe;

    // Setup message handler
    messageHandler = (event) => {
      // Verify origin
      if (event.origin !== new URL(EMBED_BASE_URL).origin) {
        return;
      }

      const { type, data } = event.data || {};

      switch (type) {
        case 'pingpay:ready':
          iframe.style.display = 'block';
          statusContainer.style.display = 'none';
          break;

        case 'pingpay:resize':
          if (data && data.height) {
            container.style.height = `${Math.min(data.height, window.innerHeight * 0.9)}px`;
          }
          break;

        case 'pingpay:completed':
          if (callbacks.onSuccess) {
            callbacks.onSuccess({
              sessionId: data?.sessionId || sessionId,
              paymentId: data?.paymentId,
            });
          }
          removeOverlay();
          break;

        case 'pingpay:cancelled':
          if (callbacks.onCancel) {
            callbacks.onCancel({ sessionId });
          }
          removeOverlay();
          break;

        case 'pingpay:closed':
          if (callbacks.onClose) {
            callbacks.onClose({ sessionId });
          }
          removeOverlay();
          break;
      }
    };

    window.addEventListener('message', messageHandler);

    return { overlay, iframe, statusContainer };
  }

  /**
   * Remove overlay
   */
  function removeOverlay() {
    if (messageHandler) {
      window.removeEventListener('message', messageHandler);
      messageHandler = null;
    }

    if (currentOverlay) {
      currentOverlay.remove();
      currentOverlay = null;
      currentIframe = null;
    }
  }

  /**
   * Show error in overlay
   */
  function showError(container, message) {
    container.innerHTML = `
      <div style="text-align: center; color: #dc2626;">
        <p style="font-size: 16px; margin-bottom: 10px;">${message}</p>
        <button onclick="location.reload()" style="
          padding: 10px 20px;
          background: #0EA5E9;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        ">Try Again</button>
      </div>
    `;
  }

  /**
   * PingCheckout API
   */
  const PingCheckout = {
    /**
     * Initialize with publishable key
     */
    async init(config) {
      if (!config || !config.publishableKey) {
        console.error('[PingCheckout] init() requires publishableKey');
        return false;
      }

      publishableKey = config.publishableKey;
      const configResult = await bootstrap(publishableKey);
      
      if (configResult) {
        isInitialized = true;
        return true;
      }

      return false;
    },

    /**
     * Open checkout overlay
     */
    async open(options = {}) {
      if (!isInitialized && !bootstrapConfig) {
        console.error('[PingCheckout] Not initialized. Call PingCheckout.init() first or include data-ping-publishable-key attribute.');
        return;
      }

      if (!isOriginAllowed) {
        console.error('[PingCheckout] Origin not allowed');
        return;
      }

      try {
        let sessionId = options.sessionId;

        // Create session if needed
        if (!sessionId) {
          if (options.pingLinkId || (options.amount && options.recipient)) {
            sessionId = await createCheckoutSession({
              pingLinkId: options.pingLinkId,
              amount: options.amount,
              recipient: options.recipient,
              theme: options.theme,
              successUrl: options.successUrl,
              cancelUrl: options.cancelUrl,
              metadata: options.metadata,
            });
          } else {
            console.error('[PingCheckout] open() requires either sessionId, pingLinkId, or amount+recipient');
            return;
          }
        }

        // Create overlay
        const { statusContainer } = createOverlay(sessionId, {
          onSuccess: options.onSuccess,
          onCancel: options.onCancel,
          onClose: options.onClose,
        });

        // Show loading state
        statusContainer.innerHTML = `
          <div style="text-align: center;">
            <div style="
              width: 40px;
              height: 40px;
              border: 4px solid #f3f3f3;
              border-top: 4px solid #0EA5E9;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 0 auto 20px;
            "></div>
            <p style="color: #666;">Loading checkout...</p>
          </div>
        `;

        // Add spinner animation
        const style = document.createElement('style');
        style.textContent = `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);

      } catch (error) {
        console.error('[PingCheckout] Error opening checkout:', error);
        
        // Show error in overlay if it exists
        if (currentOverlay) {
          const statusContainer = currentOverlay.querySelector('#pingcheckout-status');
          if (statusContainer) {
            showError(statusContainer, 'Unable to start payment, please try again.');
          }
        }
      }
    },

    /**
     * Mount button(s) to DOM elements
     */
    mountButton(selector, options = {}) {
      if (!isInitialized && !bootstrapConfig) {
        console.error('[PingCheckout] Not initialized. Call PingCheckout.init() first or include data-ping-publishable-key attribute.');
        return;
      }

      const elements = document.querySelectorAll(selector);
      
      elements.forEach((element) => {
        // Make it a button if it's not already
        if (element.tagName !== 'BUTTON') {
          element.style.cursor = 'pointer';
        }

        // Add click handler
        element.addEventListener('click', (e) => {
          e.preventDefault();
          PingCheckout.open(options);
        });

        // Set button text if provided
        if (options.text && element.tagName === 'BUTTON') {
          element.textContent = options.text;
        }
      });
    },

    /**
     * Close current overlay
     */
    close() {
      removeOverlay();
    },
  };

  // Auto-initialize from script tag attribute
  (function autoInit() {
    const script = document.currentScript || 
      document.querySelector('script[data-ping-publishable-key]');
    
    if (script) {
      const key = script.getAttribute('data-ping-publishable-key');
      if (key) {
        PingCheckout.init({ publishableKey: key }).catch((error) => {
          console.error('[PingCheckout] Auto-init failed:', error);
        });
      }
    }
  })();

  // Expose to window
  window.PingCheckout = PingCheckout;

})(window, document);

