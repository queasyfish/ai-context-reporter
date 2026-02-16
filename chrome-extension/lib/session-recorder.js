/**
 * Session Recorder Module
 *
 * Manages deep inspection recording sessions that capture console output,
 * network requests, user interactions, and state snapshots over time.
 *
 * Sessions help AI agents understand the sequence of events leading up to
 * an issue, not just the final state.
 */

/**
 * @typedef {Object} SessionSnapshot
 * @property {string} label - User-provided label for this snapshot
 * @property {number} timestamp - When the snapshot was taken
 * @property {Record<string, string>} [localStorage] - localStorage contents
 * @property {Record<string, string>} [sessionStorage] - sessionStorage contents
 * @property {string} [url] - Current URL at snapshot time
 * @property {string} [html] - Optional HTML snapshot (truncated)
 */

/**
 * @typedef {Object} ConsoleEntry
 * @property {string} type - 'log' | 'warn' | 'error' | 'info' | 'debug'
 * @property {string} message - Console message
 * @property {string} [stack] - Stack trace if available
 * @property {number} timestamp - When logged
 */

/**
 * @typedef {Object} NetworkEntry
 * @property {string} url - Request URL
 * @property {string} method - HTTP method
 * @property {number} status - Response status code
 * @property {string} [requestBody] - Request body (truncated)
 * @property {string} [responseBody] - Response body (truncated)
 * @property {number} duration - Request duration in ms
 * @property {number} timestamp - When request started
 * @property {boolean} failed - Whether request failed
 */

/**
 * @typedef {Object} InteractionEntry
 * @property {string} type - 'click' | 'input' | 'submit' | 'navigation' | 'scroll' | 'focus'
 * @property {string} target - CSS selector of target element
 * @property {string} [value] - Input value (for input events)
 * @property {string} [url] - URL (for navigation events)
 * @property {number} timestamp - When interaction occurred
 */

/**
 * @typedef {Object} CaptureSession
 * @property {string} sessionId - Unique session identifier
 * @property {number} startTime - When recording started
 * @property {number} [endTime] - When recording ended
 * @property {number} duration - Session duration in ms
 * @property {string} url - Starting URL
 * @property {string} title - Page title
 * @property {SessionSnapshot[]} snapshots - Manual snapshots
 * @property {ConsoleEntry[]} consoleLog - Console entries
 * @property {NetworkEntry[]} networkLog - Network requests
 * @property {InteractionEntry[]} interactions - User interactions
 * @property {string} [comment] - User comment about the session
 * @property {boolean} isRecording - Whether session is actively recording
 */

const MAX_CONSOLE_ENTRIES = 200;
const MAX_NETWORK_ENTRIES = 100;
const MAX_INTERACTIONS = 500;
const MAX_BODY_LENGTH = 5000;

/**
 * Returns injectable code that sets up session recording in the page context.
 * This captures console logs with more detail than the basic console-capture.
 *
 * @returns {string} JavaScript code to inject
 */
export function getSessionRecorderInjectorCode() {
  return `
    (function() {
      // Don't inject twice
      if (window.__AI_CONTEXT_SESSION_INITIALIZED__) return;
      window.__AI_CONTEXT_SESSION_INITIALIZED__ = true;

      // Session state
      window.__AI_CONTEXT_SESSION__ = {
        isRecording: false,
        sessionId: null,
        startTime: null,
        consoleLog: [],
        networkLog: [],
        interactions: [],
        snapshots: []
      };

      var session = window.__AI_CONTEXT_SESSION__;
      var MAX_ENTRIES = 200;
      var MAX_BODY = 5000;

      // Store original console methods
      var originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
      };

      function formatArgs(args) {
        return Array.from(args).map(function(arg) {
          if (arg === null) return 'null';
          if (arg === undefined) return 'undefined';
          if (typeof arg === 'string') return arg;
          if (arg instanceof Error) return arg.name + ': ' + arg.message;
          try {
            var str = JSON.stringify(arg, null, 2);
            return str && str.length > 1000 ? str.substring(0, 1000) + '...' : str;
          } catch (e) {
            return String(arg);
          }
        }).join(' ');
      }

      function captureConsole(type, args) {
        if (!session.isRecording) return;

        var message = formatArgs(args);
        var stack = null;

        try {
          var err = new Error();
          if (err.stack) {
            stack = err.stack.split('\\n').slice(3, 8).join('\\n');
          }
        } catch (e) {}

        if (args.length > 0 && args[0] instanceof Error && args[0].stack) {
          stack = args[0].stack;
        }

        session.consoleLog.push({
          type: type,
          message: message.substring(0, 2000),
          stack: stack ? stack.substring(0, 1000) : null,
          timestamp: Date.now()
        });

        if (session.consoleLog.length > MAX_ENTRIES) {
          session.consoleLog.shift();
        }
      }

      // Patch console methods
      ['log', 'warn', 'error', 'info', 'debug'].forEach(function(type) {
        console[type] = function() {
          captureConsole(type, arguments);
          return originalConsole[type].apply(console, arguments);
        };
      });

      // Capture unhandled errors
      window.addEventListener('error', function(event) {
        if (!session.isRecording) return;
        session.consoleLog.push({
          type: 'error',
          message: event.message || 'Unknown error',
          stack: event.error ? event.error.stack : null,
          timestamp: Date.now(),
          source: event.filename,
          line: event.lineno
        });
      });

      // Capture unhandled promise rejections
      window.addEventListener('unhandledrejection', function(event) {
        if (!session.isRecording) return;
        var message = 'Unhandled Promise Rejection';
        var stack = null;
        if (event.reason) {
          if (event.reason instanceof Error) {
            message = event.reason.message || message;
            stack = event.reason.stack;
          } else if (typeof event.reason === 'string') {
            message = event.reason;
          }
        }
        session.consoleLog.push({
          type: 'error',
          message: '[Promise] ' + message,
          stack: stack,
          timestamp: Date.now()
        });
      });

      // Enhanced network capture with request/response bodies
      var originalFetch = window.fetch;
      window.fetch = function(input, init) {
        if (!session.isRecording) {
          return originalFetch.apply(this, arguments);
        }

        var startTime = Date.now();
        var url = typeof input === 'string' ? input : (input.url || String(input));
        var method = (init && init.method) || (input.method) || 'GET';
        var requestBody = null;

        if (init && init.body) {
          try {
            requestBody = typeof init.body === 'string'
              ? init.body.substring(0, MAX_BODY)
              : '[Binary/FormData]';
          } catch (e) {
            requestBody = '[Unable to capture]';
          }
        }

        return originalFetch.apply(this, arguments)
          .then(function(response) {
            var clonedResponse = response.clone();
            var entry = {
              url: url.substring(0, 500),
              method: method.toUpperCase(),
              status: response.status,
              requestBody: requestBody,
              responseBody: null,
              duration: Date.now() - startTime,
              timestamp: startTime,
              failed: !response.ok
            };

            // Try to capture response body
            clonedResponse.text().then(function(text) {
              entry.responseBody = text.substring(0, MAX_BODY);
            }).catch(function() {});

            session.networkLog.push(entry);
            if (session.networkLog.length > 100) {
              session.networkLog.shift();
            }

            return response;
          })
          .catch(function(error) {
            session.networkLog.push({
              url: url.substring(0, 500),
              method: method.toUpperCase(),
              status: 0,
              requestBody: requestBody,
              responseBody: null,
              duration: Date.now() - startTime,
              timestamp: startTime,
              failed: true,
              error: error.message
            });
            throw error;
          });
      };

      // Enhanced XHR capture
      var XHROpen = XMLHttpRequest.prototype.open;
      var XHRSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        this._sessionMethod = method;
        this._sessionUrl = url;
        return XHROpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function(body) {
        var xhr = this;
        if (!session.isRecording) {
          return XHRSend.apply(this, arguments);
        }

        var startTime = Date.now();
        var requestBody = null;

        if (body) {
          try {
            requestBody = typeof body === 'string'
              ? body.substring(0, MAX_BODY)
              : '[Binary/FormData]';
          } catch (e) {}
        }

        xhr.addEventListener('loadend', function() {
          var responseBody = null;
          try {
            responseBody = xhr.responseText
              ? xhr.responseText.substring(0, MAX_BODY)
              : null;
          } catch (e) {}

          session.networkLog.push({
            url: (xhr._sessionUrl || '').substring(0, 500),
            method: (xhr._sessionMethod || 'GET').toUpperCase(),
            status: xhr.status,
            requestBody: requestBody,
            responseBody: responseBody,
            duration: Date.now() - startTime,
            timestamp: startTime,
            failed: xhr.status === 0 || xhr.status >= 400
          });

          if (session.networkLog.length > 100) {
            session.networkLog.shift();
          }
        });

        return XHRSend.apply(this, arguments);
      };

      // Session control functions
      window.__AI_CONTEXT_START_SESSION__ = function(sessionId) {
        session.isRecording = true;
        session.sessionId = sessionId || Date.now().toString(36);
        session.startTime = Date.now();
        session.consoleLog = [];
        session.networkLog = [];
        session.interactions = [];
        session.snapshots = [];
        console.info('[AI Context] Recording session started: ' + session.sessionId);
        return session.sessionId;
      };

      window.__AI_CONTEXT_STOP_SESSION__ = function() {
        session.isRecording = false;
        session.endTime = Date.now();
        console.info('[AI Context] Recording session stopped');
        return {
          sessionId: session.sessionId,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.endTime - session.startTime,
          consoleLog: session.consoleLog,
          networkLog: session.networkLog,
          interactions: session.interactions,
          snapshots: session.snapshots
        };
      };

      window.__AI_CONTEXT_TAKE_SNAPSHOT__ = function(label) {
        if (!session.isRecording) return null;

        var snapshot = {
          label: label || 'Snapshot ' + (session.snapshots.length + 1),
          timestamp: Date.now(),
          url: location.href,
          localStorage: {},
          sessionStorage: {}
        };

        // Capture localStorage
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            var value = localStorage.getItem(key);
            if (value && value.length < 1000) {
              snapshot.localStorage[key] = value;
            }
          }
        } catch (e) {}

        // Capture sessionStorage
        try {
          for (var i = 0; i < sessionStorage.length; i++) {
            var key = sessionStorage.key(i);
            var value = sessionStorage.getItem(key);
            if (value && value.length < 1000) {
              snapshot.sessionStorage[key] = value;
            }
          }
        } catch (e) {}

        session.snapshots.push(snapshot);
        console.info('[AI Context] Snapshot taken: ' + snapshot.label);
        return snapshot;
      };

      window.__AI_CONTEXT_GET_SESSION__ = function() {
        return {
          isRecording: session.isRecording,
          sessionId: session.sessionId,
          startTime: session.startTime,
          duration: session.isRecording ? Date.now() - session.startTime : 0,
          consoleCount: session.consoleLog.length,
          networkCount: session.networkLog.length,
          interactionCount: session.interactions.length,
          snapshotCount: session.snapshots.length
        };
      };

      window.__AI_CONTEXT_ADD_INTERACTION__ = function(interaction) {
        if (!session.isRecording) return;
        interaction.timestamp = interaction.timestamp || Date.now();
        session.interactions.push(interaction);
        if (session.interactions.length > 500) {
          session.interactions.shift();
        }
      };
    })();
  `;
}

/**
 * Returns code to start a recording session.
 *
 * @param {string} [sessionId] - Optional session ID
 * @returns {string} JavaScript code to execute
 */
export function getStartSessionCode(sessionId) {
  const id = sessionId || Date.now().toString(36);
  return `window.__AI_CONTEXT_START_SESSION__('${id}')`;
}

/**
 * Returns code to stop the recording session and get results.
 *
 * @returns {string} JavaScript code to execute
 */
export function getStopSessionCode() {
  return `window.__AI_CONTEXT_STOP_SESSION__()`;
}

/**
 * Returns code to take a snapshot during recording.
 *
 * @param {string} [label] - Optional snapshot label
 * @returns {string} JavaScript code to execute
 */
export function getTakeSnapshotCode(label) {
  const labelStr = label ? `'${label.replace(/'/g, "\\'")}'` : 'null';
  return `window.__AI_CONTEXT_TAKE_SNAPSHOT__(${labelStr})`;
}

/**
 * Returns code to get current session status.
 *
 * @returns {string} JavaScript code to execute
 */
export function getSessionStatusCode() {
  return `window.__AI_CONTEXT_GET_SESSION__()`;
}

/**
 * Returns code to add an interaction to the session.
 *
 * @param {InteractionEntry} interaction - Interaction data
 * @returns {string} JavaScript code to execute
 */
export function getAddInteractionCode(interaction) {
  return `window.__AI_CONTEXT_ADD_INTERACTION__(${JSON.stringify(interaction)})`;
}

// Note: formatSessionAsMarkdown has been moved to markdown-formatter.js
