/**
 * Network Capture Module
 *
 * Monitors XHR and Fetch requests using PerformanceObserver and
 * fetch/XHR interception to capture network activity for AI context reports.
 *
 * This module provides code to be injected into the page context
 * to capture network requests. The captured requests are exposed
 * via window.__AI_CONTEXT_NETWORK_LOG__.
 */

/**
 * Returns injectable code that monitors network requests.
 * Should be injected once per page.
 *
 * The injected code:
 * - Uses PerformanceObserver for resource timing
 * - Patches fetch() and XMLHttpRequest for more details
 * - Maintains a buffer of the last 50 requests
 * - Captures URL, method, status, duration, and failure state
 * - Exposes data via window.__AI_CONTEXT_NETWORK_LOG__
 *
 * @returns {string} JavaScript code to inject into page
 */
export function getNetworkInjectorCode() {
  return `
    (function() {
      // Don't inject twice
      if (window.__AI_CONTEXT_NETWORK_INITIALIZED__) return;
      window.__AI_CONTEXT_NETWORK_INITIALIZED__ = true;

      var MAX_ENTRIES = 50;
      var MAX_URL_LENGTH = 500;

      // Initialize the log storage
      window.__AI_CONTEXT_NETWORK_LOG__ = [];

      // Track pending requests (for correlation)
      var pendingRequests = new Map();
      var requestIdCounter = 0;

      function addEntry(entry) {
        // Truncate URL if needed
        if (entry.url && entry.url.length > MAX_URL_LENGTH) {
          entry.url = entry.url.substring(0, MAX_URL_LENGTH) + '...';
        }

        window.__AI_CONTEXT_NETWORK_LOG__.push(entry);
        if (window.__AI_CONTEXT_NETWORK_LOG__.length > MAX_ENTRIES) {
          window.__AI_CONTEXT_NETWORK_LOG__.shift();
        }
      }

      // =========================================
      // Fetch Interception
      // =========================================

      var originalFetch = window.fetch;
      window.fetch = function(input, init) {
        var requestId = ++requestIdCounter;
        var startTime = performance.now();
        var url = '';
        var method = 'GET';

        // Parse input
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof Request) {
          url = input.url;
          method = input.method;
        } else if (input && input.toString) {
          url = input.toString();
        }

        if (init && init.method) {
          method = init.method;
        }

        // Track pending request
        pendingRequests.set(requestId, {
          url: url,
          method: method.toUpperCase(),
          startTime: startTime,
          type: 'fetch'
        });

        return originalFetch.apply(this, arguments)
          .then(function(response) {
            var pending = pendingRequests.get(requestId);
            if (pending) {
              var duration = Math.round(performance.now() - pending.startTime);
              addEntry({
                url: pending.url,
                method: pending.method,
                status: response.status,
                statusText: response.statusText,
                duration: duration,
                failed: !response.ok,
                type: 'fetch',
                timestamp: Date.now()
              });
              pendingRequests.delete(requestId);
            }
            return response;
          })
          .catch(function(error) {
            var pending = pendingRequests.get(requestId);
            if (pending) {
              var duration = Math.round(performance.now() - pending.startTime);
              addEntry({
                url: pending.url,
                method: pending.method,
                status: 0,
                statusText: error.message || 'Network Error',
                duration: duration,
                failed: true,
                type: 'fetch',
                timestamp: Date.now()
              });
              pendingRequests.delete(requestId);
            }
            throw error;
          });
      };

      // =========================================
      // XMLHttpRequest Interception
      // =========================================

      var XHROpen = XMLHttpRequest.prototype.open;
      var XHRSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        this._aiContextMethod = method ? method.toUpperCase() : 'GET';
        this._aiContextUrl = url;
        return XHROpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function(body) {
        var xhr = this;
        var startTime = performance.now();
        var requestId = ++requestIdCounter;

        pendingRequests.set(requestId, {
          url: xhr._aiContextUrl,
          method: xhr._aiContextMethod,
          startTime: startTime,
          type: 'xhr'
        });

        xhr.addEventListener('loadend', function() {
          var pending = pendingRequests.get(requestId);
          if (pending) {
            var duration = Math.round(performance.now() - pending.startTime);
            addEntry({
              url: pending.url,
              method: pending.method,
              status: xhr.status,
              statusText: xhr.statusText,
              duration: duration,
              failed: xhr.status === 0 || xhr.status >= 400,
              type: 'xhr',
              timestamp: Date.now()
            });
            pendingRequests.delete(requestId);
          }
        });

        return XHRSend.apply(this, arguments);
      };

      // =========================================
      // PerformanceObserver for additional metrics
      // =========================================

      try {
        var observer = new PerformanceObserver(function(list) {
          var entries = list.getEntries();
          entries.forEach(function(entry) {
            // Only capture XHR and Fetch that we might have missed
            if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
              // Check if we already captured this via interception
              var exists = window.__AI_CONTEXT_NETWORK_LOG__.some(function(log) {
                return log.url === entry.name &&
                       Math.abs(log.timestamp - (performance.timeOrigin + entry.startTime)) < 1000;
              });

              if (!exists) {
                // This is a request we missed (might be from iframes or workers)
                addEntry({
                  url: entry.name,
                  method: 'UNKNOWN',
                  status: entry.responseStatus || 0,
                  duration: Math.round(entry.duration),
                  failed: false,
                  type: entry.initiatorType,
                  timestamp: Date.now(),
                  transferSize: entry.transferSize,
                  fromCache: entry.transferSize === 0 && entry.decodedBodySize > 0
                });
              }
            }
          });
        });

        observer.observe({ entryTypes: ['resource'] });
      } catch (e) {
        // PerformanceObserver not supported
      }
    })();
  `;
}

/**
 * Returns code to read the captured network log.
 * Use this to retrieve the current network entries.
 *
 * @returns {string} JavaScript code to execute via eval
 */
export function getNetworkLogReaderCode() {
  return `
    (function() {
      return window.__AI_CONTEXT_NETWORK_LOG__ || [];
    })()
  `;
}

/**
 * Returns code to clear the captured network log.
 *
 * @returns {string} JavaScript code to execute
 */
export function getNetworkClearCode() {
  return `
    (function() {
      if (window.__AI_CONTEXT_NETWORK_LOG__) {
        window.__AI_CONTEXT_NETWORK_LOG__ = [];
      }
    })()
  `;
}

/**
 * Returns code to get failed requests only.
 * Useful for quickly identifying API errors.
 *
 * @returns {string} JavaScript code to execute via eval
 */
export function getFailedRequestsCode() {
  return `
    (function() {
      var log = window.__AI_CONTEXT_NETWORK_LOG__ || [];
      return log.filter(function(entry) {
        return entry.failed || entry.status >= 400;
      });
    })()
  `;
}

/**
 * Returns code to get recent API requests (filtered by common patterns).
 * Excludes static assets like images, CSS, JS.
 *
 * @returns {string} JavaScript code to execute via eval
 */
export function getApiRequestsCode() {
  return `
    (function() {
      var log = window.__AI_CONTEXT_NETWORK_LOG__ || [];
      var staticExtensions = /\\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i;
      var staticPaths = /\\/(static|assets|images|fonts)\\//i;

      return log.filter(function(entry) {
        // Exclude static assets
        if (staticExtensions.test(entry.url)) return false;
        if (staticPaths.test(entry.url)) return false;
        // Include likely API calls
        return entry.url.includes('/api/') ||
               entry.url.includes('/graphql') ||
               entry.method !== 'GET' ||
               entry.status >= 400;
      });
    })()
  `;
}
