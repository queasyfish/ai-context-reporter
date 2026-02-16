/**
 * Console Capture Module
 *
 * Intercepts console.error and console.warn calls to capture
 * errors and warnings for AI context reports.
 *
 * This module provides code to be injected into the page context
 * to capture console messages. The captured messages are exposed
 * via window.__AI_CONTEXT_CONSOLE_LOG__.
 */

/**
 * Returns injectable code that patches console.error and console.warn
 * to capture messages. Should be injected once per page.
 *
 * The injected code:
 * - Patches console.error and console.warn
 * - Maintains a buffer of the last 50 messages
 * - Captures timestamp, message, and stack trace
 * - Exposes data via window.__AI_CONTEXT_CONSOLE_LOG__
 *
 * @returns {string} JavaScript code to inject into page
 */
export function getConsoleInjectorCode() {
  return `
    (function() {
      // Don't inject twice
      if (window.__AI_CONTEXT_CONSOLE_INITIALIZED__) return;
      window.__AI_CONTEXT_CONSOLE_INITIALIZED__ = true;

      var MAX_ENTRIES = 50;
      var MAX_MESSAGE_LENGTH = 2000;
      var MAX_STACK_LENGTH = 3000;

      // Initialize the log storage
      window.__AI_CONTEXT_CONSOLE_LOG__ = [];

      // Store original console methods
      var originalError = console.error;
      var originalWarn = console.warn;

      function formatArgs(args) {
        return Array.from(args).map(function(arg) {
          if (arg === null) return 'null';
          if (arg === undefined) return 'undefined';
          if (typeof arg === 'string') return arg;
          if (arg instanceof Error) {
            return arg.name + ': ' + arg.message;
          }
          try {
            var str = JSON.stringify(arg, null, 2);
            return str.length > 500 ? str.substring(0, 500) + '...' : str;
          } catch (e) {
            return String(arg);
          }
        }).join(' ');
      }

      function captureEntry(type, args) {
        var message = formatArgs(args);
        if (message.length > MAX_MESSAGE_LENGTH) {
          message = message.substring(0, MAX_MESSAGE_LENGTH) + '...';
        }

        // Capture stack trace
        var stack = null;
        try {
          var err = new Error();
          if (err.stack) {
            // Remove the first few lines (Error + captureEntry + console.error/warn)
            var stackLines = err.stack.split('\\n');
            stack = stackLines.slice(3).join('\\n');
            if (stack.length > MAX_STACK_LENGTH) {
              stack = stack.substring(0, MAX_STACK_LENGTH) + '...';
            }
          }
        } catch (e) {
          // Stack trace not available
        }

        // If the first argument is an Error, use its stack instead
        if (args.length > 0 && args[0] instanceof Error && args[0].stack) {
          stack = args[0].stack;
          if (stack.length > MAX_STACK_LENGTH) {
            stack = stack.substring(0, MAX_STACK_LENGTH) + '...';
          }
        }

        var entry = {
          type: type,
          message: message,
          stack: stack,
          timestamp: Date.now(),
          url: location.href
        };

        // Add to buffer, maintaining max size
        window.__AI_CONTEXT_CONSOLE_LOG__.push(entry);
        if (window.__AI_CONTEXT_CONSOLE_LOG__.length > MAX_ENTRIES) {
          window.__AI_CONTEXT_CONSOLE_LOG__.shift();
        }
      }

      // Patch console.error
      console.error = function() {
        captureEntry('error', arguments);
        return originalError.apply(console, arguments);
      };

      // Patch console.warn
      console.warn = function() {
        captureEntry('warn', arguments);
        return originalWarn.apply(console, arguments);
      };

      // Also capture unhandled errors
      window.addEventListener('error', function(event) {
        var entry = {
          type: 'error',
          message: event.message || 'Unknown error',
          stack: event.error ? event.error.stack : null,
          timestamp: Date.now(),
          url: location.href,
          source: event.filename,
          line: event.lineno,
          column: event.colno
        };

        window.__AI_CONTEXT_CONSOLE_LOG__.push(entry);
        if (window.__AI_CONTEXT_CONSOLE_LOG__.length > MAX_ENTRIES) {
          window.__AI_CONTEXT_CONSOLE_LOG__.shift();
        }
      });

      // Capture unhandled promise rejections
      window.addEventListener('unhandledrejection', function(event) {
        var message = 'Unhandled Promise Rejection';
        var stack = null;

        if (event.reason) {
          if (event.reason instanceof Error) {
            message = event.reason.message || message;
            stack = event.reason.stack;
          } else if (typeof event.reason === 'string') {
            message = event.reason;
          } else {
            try {
              message = JSON.stringify(event.reason);
            } catch (e) {
              message = String(event.reason);
            }
          }
        }

        var entry = {
          type: 'error',
          message: '[Promise] ' + message,
          stack: stack,
          timestamp: Date.now(),
          url: location.href
        };

        window.__AI_CONTEXT_CONSOLE_LOG__.push(entry);
        if (window.__AI_CONTEXT_CONSOLE_LOG__.length > MAX_ENTRIES) {
          window.__AI_CONTEXT_CONSOLE_LOG__.shift();
        }
      });
    })();
  `;
}

/**
 * Returns code to read the captured console log.
 * Use this to retrieve the current console entries.
 *
 * @returns {string} JavaScript code to execute via eval
 */
export function getConsoleLogReaderCode() {
  return `
    (function() {
      return window.__AI_CONTEXT_CONSOLE_LOG__ || [];
    })()
  `;
}

/**
 * Returns code to clear the captured console log.
 *
 * @returns {string} JavaScript code to execute
 */
export function getConsoleClearCode() {
  return `
    (function() {
      if (window.__AI_CONTEXT_CONSOLE_LOG__) {
        window.__AI_CONTEXT_CONSOLE_LOG__ = [];
      }
    })()
  `;
}

/**
 * Returns code to get recent errors only (for quick reports).
 * Filters to just error types and limits to most recent 10.
 *
 * @returns {string} JavaScript code to execute via eval
 */
export function getRecentErrorsCode() {
  return `
    (function() {
      var log = window.__AI_CONTEXT_CONSOLE_LOG__ || [];
      return log
        .filter(function(entry) { return entry.type === 'error'; })
        .slice(-10);
    })()
  `;
}
