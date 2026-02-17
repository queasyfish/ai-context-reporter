// AI Context Reporter - Content Script
// Handles element picking, data extraction, and capture modal
// Includes Phase 1 enhancements: framework detection, console/network capture

(function() {
  "use strict";

  // Prevent multiple injections
  if (window.__aiContextReporterInjected) return;
  window.__aiContextReporterInjected = true;

  // Constants
  const DEBOUNCE_MS = 16; // ~60fps
  const MAX_TEXT_LENGTH = 500;
  const MAX_HTML_LENGTH = 1000;
  const MAX_ATTR_LENGTH = 200;
  const MAX_SELECTOR_DEPTH = 10;
  const MAX_CONSOLE_ENTRIES = 50;
  const MAX_NETWORK_ENTRIES = 50;

  // State
  let pickerActive = false;
  let highlightOverlay = null;
  let infoTooltip = null;
  let currentElement = null;
  let captureModal = null;
  let lastMouseMoveTime = 0;
  let pendingMouseMove = null;

  // ========== PHASE 1: Console and Network Capture ==========

  // Initialize console capture
  function initConsoleCapture() {
    if (window.__AI_CONTEXT_CONSOLE_INITIALIZED__) return;
    window.__AI_CONTEXT_CONSOLE_INITIALIZED__ = true;
    window.__AI_CONTEXT_CONSOLE_LOG__ = [];

    const originalError = console.error;
    const originalWarn = console.warn;

    function captureEntry(type, args) {
      const message = Array.from(args).map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.name + ': ' + arg.message;
        try {
          const str = JSON.stringify(arg);
          return str.length > 500 ? str.substring(0, 500) + '...' : str;
        } catch (e) {
          return String(arg);
        }
      }).join(' ').substring(0, 2000);

      let stack = null;
      try {
        const err = new Error();
        if (err.stack) {
          stack = err.stack.split('\n').slice(3).join('\n').substring(0, 3000);
        }
      } catch (e) {}

      if (args.length > 0 && args[0] instanceof Error && args[0].stack) {
        stack = args[0].stack.substring(0, 3000);
      }

      window.__AI_CONTEXT_CONSOLE_LOG__.push({
        type,
        message,
        stack,
        timestamp: Date.now(),
        url: location.href
      });

      if (window.__AI_CONTEXT_CONSOLE_LOG__.length > MAX_CONSOLE_ENTRIES) {
        window.__AI_CONTEXT_CONSOLE_LOG__.shift();
      }
    }

    console.error = function() {
      captureEntry('error', arguments);
      return originalError.apply(console, arguments);
    };

    console.warn = function() {
      captureEntry('warn', arguments);
      return originalWarn.apply(console, arguments);
    };

    window.addEventListener('error', function(event) {
      window.__AI_CONTEXT_CONSOLE_LOG__.push({
        type: 'error',
        message: event.message || 'Unknown error',
        stack: event.error ? event.error.stack : null,
        timestamp: Date.now(),
        url: location.href,
        source: event.filename,
        line: event.lineno
      });
      if (window.__AI_CONTEXT_CONSOLE_LOG__.length > MAX_CONSOLE_ENTRIES) {
        window.__AI_CONTEXT_CONSOLE_LOG__.shift();
      }
    });

    window.addEventListener('unhandledrejection', function(event) {
      let message = 'Unhandled Promise Rejection';
      let stack = null;
      if (event.reason) {
        if (event.reason instanceof Error) {
          message = event.reason.message || message;
          stack = event.reason.stack;
        } else if (typeof event.reason === 'string') {
          message = event.reason;
        }
      }
      window.__AI_CONTEXT_CONSOLE_LOG__.push({
        type: 'error',
        message: '[Promise] ' + message,
        stack,
        timestamp: Date.now(),
        url: location.href
      });
      if (window.__AI_CONTEXT_CONSOLE_LOG__.length > MAX_CONSOLE_ENTRIES) {
        window.__AI_CONTEXT_CONSOLE_LOG__.shift();
      }
    });
  }

  // Initialize network capture
  function initNetworkCapture() {
    if (window.__AI_CONTEXT_NETWORK_INITIALIZED__) return;
    window.__AI_CONTEXT_NETWORK_INITIALIZED__ = true;
    window.__AI_CONTEXT_NETWORK_LOG__ = [];

    let requestIdCounter = 0;

    function addNetworkEntry(entry) {
      if (entry.url && entry.url.length > 500) {
        entry.url = entry.url.substring(0, 500) + '...';
      }
      window.__AI_CONTEXT_NETWORK_LOG__.push(entry);
      if (window.__AI_CONTEXT_NETWORK_LOG__.length > MAX_NETWORK_ENTRIES) {
        window.__AI_CONTEXT_NETWORK_LOG__.shift();
      }
    }

    // Patch fetch
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const startTime = performance.now();
      let url = '';
      let method = 'GET';

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

      return originalFetch.apply(this, arguments)
        .then(function(response) {
          addNetworkEntry({
            url,
            method: method.toUpperCase(),
            status: response.status,
            statusText: response.statusText,
            duration: Math.round(performance.now() - startTime),
            failed: !response.ok,
            type: 'fetch',
            timestamp: Date.now()
          });
          return response;
        })
        .catch(function(error) {
          addNetworkEntry({
            url,
            method: method.toUpperCase(),
            status: 0,
            statusText: error.message || 'Network Error',
            duration: Math.round(performance.now() - startTime),
            failed: true,
            type: 'fetch',
            timestamp: Date.now()
          });
          throw error;
        });
    };

    // Patch XMLHttpRequest
    const XHROpen = XMLHttpRequest.prototype.open;
    const XHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._aiContextMethod = method ? method.toUpperCase() : 'GET';
      this._aiContextUrl = url;
      return XHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      const startTime = performance.now();

      xhr.addEventListener('loadend', function() {
        addNetworkEntry({
          url: xhr._aiContextUrl,
          method: xhr._aiContextMethod,
          status: xhr.status,
          statusText: xhr.statusText,
          duration: Math.round(performance.now() - startTime),
          failed: xhr.status === 0 || xhr.status >= 400,
          type: 'xhr',
          timestamp: Date.now()
        });
      });

      return XHRSend.apply(this, arguments);
    };
  }

  // Initialize captures on load
  initConsoleCapture();
  initNetworkCapture();

  // Styles for picker UI
  const HIGHLIGHT_STYLE = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #2563eb;
    background: rgba(37, 99, 235, 0.1);
    z-index: 2147483646;
    transition: all 0.05s ease-out;
  `;

  const TOOLTIP_STYLE = `
    position: fixed;
    background: #1e293b;
    color: #f8fafc;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
    z-index: 2147483647;
    pointer-events: none;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  const MODAL_STYLES = `
    .ccr-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
    }
    .ccr-modal {
      background: #ffffff;
      border-radius: 12px;
      width: 480px;
      max-width: 90vw;
      max-height: 80vh;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .ccr-modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ccr-modal-title {
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
      margin: 0;
    }
    .ccr-modal-close {
      background: none;
      border: none;
      font-size: 24px;
      color: #64748b;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .ccr-modal-close:hover {
      color: #1e293b;
    }
    .ccr-modal-body {
      padding: 20px;
      overflow-y: auto;
      max-height: calc(80vh - 140px);
    }
    .ccr-element-info {
      background: #f8fafc;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 13px;
      color: #475569;
      word-break: break-all;
    }
    .ccr-element-tag {
      font-weight: 600;
      color: #2563eb;
    }
    .ccr-element-id {
      color: #059669;
    }
    .ccr-element-class {
      color: #7c3aed;
    }
    .ccr-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #475569;
      margin-bottom: 6px;
    }
    .ccr-textarea {
      width: 100%;
      min-height: 100px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      box-sizing: border-box;
    }
    .ccr-textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    .ccr-hint {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 6px;
    }
    .ccr-modal-footer {
      padding: 16px 20px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .ccr-btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .ccr-btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }
    .ccr-btn-secondary:hover {
      background: #e2e8f0;
    }
    .ccr-btn-primary {
      background: #2563eb;
      color: white;
    }
    .ccr-btn-primary:hover {
      background: #1d4ed8;
    }
    .ccr-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .ccr-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 2147483647;
      animation: ccr-slide-in 0.3s ease;
    }
    .ccr-toast-success {
      background: #059669;
      color: white;
    }
    .ccr-toast-error {
      background: #dc2626;
      color: white;
    }
    @keyframes ccr-slide-in {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;

  // Utility: safe string truncation
  function safeString(value, maxLength = MAX_TEXT_LENGTH) {
    if (value == null) return "";
    const str = String(value);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "…";
  }

  // Utility: check if element is valid for selection
  function isValidElement(el) {
    return el &&
           el.nodeType === Node.ELEMENT_NODE &&
           el !== document.documentElement &&
           el !== document.body?.parentElement;
  }

  // Utility: check if element belongs to our UI
  function isOurElement(el) {
    if (!el) return false;
    return el === highlightOverlay ||
           el === infoTooltip ||
           el.closest?.(".ccr-modal-overlay");
  }

  // Utility: get class string safely
  function getClassString(element, maxClasses) {
    try {
      const className = element.className;
      if (!className || typeof className !== "string") return "";

      const classes = className.trim().split(/\s+/).filter(Boolean);
      if (classes.length === 0) return "";

      const truncated = classes.slice(0, maxClasses);
      return "." + truncated.map(c => safeString(c, 20)).join(".");
    } catch {
      return "";
    }
  }

  // Utility: escape HTML
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== PHASE 3: Session Recording ==========

  // Session state
  let sessionState = {
    isRecording: false,
    sessionId: null,
    startTime: null,
    consoleLog: [],
    networkLog: [],
    interactions: [],
    snapshots: []
  };

  const MAX_SESSION_CONSOLE = 200;
  const MAX_SESSION_NETWORK = 100;
  const MAX_SESSION_INTERACTIONS = 500;
  const MAX_SESSION_BODY_LENGTH = 5000;

  // Initialize session recording (patches console/network for session capture)
  function initSessionRecording() {
    if (window.__AI_CONTEXT_SESSION_INITIALIZED__) return;
    window.__AI_CONTEXT_SESSION_INITIALIZED__ = true;

    // Store original console methods
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug
    };

    function formatArgs(args) {
      return Array.from(args).map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.name + ': ' + arg.message;
        try {
          const str = JSON.stringify(arg, null, 2);
          return str && str.length > 1000 ? str.substring(0, 1000) + '...' : str;
        } catch (e) {
          return String(arg);
        }
      }).join(' ');
    }

    function captureSessionConsole(type, args) {
      if (!sessionState.isRecording) return;

      const message = formatArgs(args);
      let stack = null;

      try {
        const err = new Error();
        if (err.stack) {
          stack = err.stack.split('\n').slice(3, 8).join('\n');
        }
      } catch (e) {}

      if (args.length > 0 && args[0] instanceof Error && args[0].stack) {
        stack = args[0].stack;
      }

      sessionState.consoleLog.push({
        type: type,
        message: message.substring(0, 2000),
        stack: stack ? stack.substring(0, 1000) : null,
        timestamp: Date.now()
      });

      if (sessionState.consoleLog.length > MAX_SESSION_CONSOLE) {
        sessionState.consoleLog.shift();
      }
    }

    // Patch console methods for session recording
    ['log', 'warn', 'error', 'info', 'debug'].forEach(type => {
      const original = originalConsole[type];
      console[type] = function() {
        captureSessionConsole(type, arguments);
        return original.apply(console, arguments);
      };
    });

    // Capture unhandled errors during session
    window.addEventListener('error', function(event) {
      if (!sessionState.isRecording) return;
      sessionState.consoleLog.push({
        type: 'error',
        message: event.message || 'Unknown error',
        stack: event.error ? event.error.stack : null,
        timestamp: Date.now(),
        source: event.filename,
        line: event.lineno
      });
    });

    // Capture unhandled promise rejections during session
    window.addEventListener('unhandledrejection', function(event) {
      if (!sessionState.isRecording) return;
      let message = 'Unhandled Promise Rejection';
      let stack = null;
      if (event.reason) {
        if (event.reason instanceof Error) {
          message = event.reason.message || message;
          stack = event.reason.stack;
        } else if (typeof event.reason === 'string') {
          message = event.reason;
        }
      }
      sessionState.consoleLog.push({
        type: 'error',
        message: '[Promise] ' + message,
        stack: stack,
        timestamp: Date.now()
      });
    });

    // Enhanced network capture for sessions (with request/response bodies)
    const sessionOriginalFetch = window.fetch;
    window.fetch = function(input, init) {
      if (!sessionState.isRecording) {
        return sessionOriginalFetch.apply(this, arguments);
      }

      const startTime = Date.now();
      let url = typeof input === 'string' ? input : (input.url || String(input));
      let method = (init && init.method) || (input.method) || 'GET';
      let requestBody = null;

      if (init && init.body) {
        try {
          requestBody = typeof init.body === 'string'
            ? init.body.substring(0, MAX_SESSION_BODY_LENGTH)
            : '[Binary/FormData]';
        } catch (e) {
          requestBody = '[Unable to capture]';
        }
      }

      return sessionOriginalFetch.apply(this, arguments)
        .then(function(response) {
          const clonedResponse = response.clone();
          const entry = {
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
            entry.responseBody = text.substring(0, MAX_SESSION_BODY_LENGTH);
          }).catch(function() {});

          sessionState.networkLog.push(entry);
          if (sessionState.networkLog.length > MAX_SESSION_NETWORK) {
            sessionState.networkLog.shift();
          }

          return response;
        })
        .catch(function(error) {
          sessionState.networkLog.push({
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

    // Enhanced XHR capture for sessions
    const sessionXHROpen = XMLHttpRequest.prototype.open;
    const sessionXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._sessionMethod = method;
      this._sessionUrl = url;
      return sessionXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      if (!sessionState.isRecording) {
        return sessionXHRSend.apply(this, arguments);
      }

      const startTime = Date.now();
      let requestBody = null;

      if (body) {
        try {
          requestBody = typeof body === 'string'
            ? body.substring(0, MAX_SESSION_BODY_LENGTH)
            : '[Binary/FormData]';
        } catch (e) {}
      }

      xhr.addEventListener('loadend', function() {
        let responseBody = null;
        try {
          responseBody = xhr.responseText
            ? xhr.responseText.substring(0, MAX_SESSION_BODY_LENGTH)
            : null;
        } catch (e) {}

        sessionState.networkLog.push({
          url: (xhr._sessionUrl || '').substring(0, 500),
          method: (xhr._sessionMethod || 'GET').toUpperCase(),
          status: xhr.status,
          requestBody: requestBody,
          responseBody: responseBody,
          duration: Date.now() - startTime,
          timestamp: startTime,
          failed: xhr.status === 0 || xhr.status >= 400
        });

        if (sessionState.networkLog.length > MAX_SESSION_NETWORK) {
          sessionState.networkLog.shift();
        }
      });

      return sessionXHRSend.apply(this, arguments);
    };

    // Capture user interactions during session
    function captureInteraction(type, event) {
      if (!sessionState.isRecording) return;

      let target = '';
      try {
        const el = event.target;
        if (el && el.tagName) {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? '#' + el.id : '';
          const className = el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
            : '';
          target = tag + id + className;
        }
      } catch (e) {}

      const interaction = {
        type: type,
        target: target.substring(0, 100),
        timestamp: Date.now()
      };

      // Capture input value for input events
      if (type === 'input' && event.target) {
        try {
          const value = event.target.value || '';
          interaction.value = value.substring(0, 50) + (value.length > 50 ? '...' : '');
        } catch (e) {}
      }

      sessionState.interactions.push(interaction);
      if (sessionState.interactions.length > MAX_SESSION_INTERACTIONS) {
        sessionState.interactions.shift();
      }
    }

    // Add interaction event listeners
    document.addEventListener('click', e => captureInteraction('click', e), true);
    document.addEventListener('input', e => captureInteraction('input', e), true);
    document.addEventListener('submit', e => captureInteraction('submit', e), true);
    document.addEventListener('scroll', (() => {
      let lastScroll = 0;
      return function(e) {
        const now = Date.now();
        if (now - lastScroll > 500) { // Debounce scroll events
          captureInteraction('scroll', e);
          lastScroll = now;
        }
      };
    })(), true);
  }

  // Start session recording
  function startSession() {
    initSessionRecording();

    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    sessionState = {
      isRecording: true,
      sessionId: sessionId,
      startTime: Date.now(),
      consoleLog: [],
      networkLog: [],
      interactions: [],
      snapshots: []
    };

    console.info('[AI Context] Recording session started: ' + sessionId);
    return { success: true, sessionId: sessionId };
  }

  // Stop session recording
  function stopSession() {
    sessionState.isRecording = false;
    const endTime = Date.now();

    const session = {
      sessionId: sessionState.sessionId,
      startTime: sessionState.startTime,
      endTime: endTime,
      duration: endTime - sessionState.startTime,
      consoleLog: sessionState.consoleLog,
      networkLog: sessionState.networkLog,
      interactions: sessionState.interactions,
      snapshots: sessionState.snapshots
    };

    console.info('[AI Context] Recording session stopped');
    return { success: true, session: session };
  }

  // Take a snapshot
  function takeSnapshot(label) {
    if (!sessionState.isRecording) {
      return { success: false, error: 'Not recording' };
    }

    const snapshot = {
      label: label || 'Snapshot ' + (sessionState.snapshots.length + 1),
      timestamp: Date.now(),
      url: location.href,
      localStorage: {},
      sessionStorage: {}
    };

    // Capture localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        if (value && value.length < 1000) {
          snapshot.localStorage[key] = value;
        }
      }
    } catch (e) {}

    // Capture sessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key);
        if (value && value.length < 1000) {
          snapshot.sessionStorage[key] = value;
        }
      }
    } catch (e) {}

    sessionState.snapshots.push(snapshot);
    console.info('[AI Context] Snapshot taken: ' + snapshot.label);
    return { success: true, snapshot: snapshot };
  }

  // Get session status
  function getSessionStatus() {
    return {
      success: true,
      status: {
        isRecording: sessionState.isRecording,
        sessionId: sessionState.sessionId,
        startTime: sessionState.startTime,
        duration: sessionState.isRecording ? Date.now() - sessionState.startTime : 0,
        consoleCount: sessionState.consoleLog.length,
        networkCount: sessionState.networkLog.length,
        interactionCount: sessionState.interactions.length,
        snapshotCount: sessionState.snapshots.length
      }
    };
  }

  // Listen for messages from background script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "startPicker") {
      try {
        startPicker();
        sendResponse({ success: true });
      } catch (error) {
        console.error("Failed to start picker:", error);
        sendResponse({ success: false, error: error.message });
      }
    } else if (message.action === "startSession") {
      try {
        sendResponse(startSession());
      } catch (error) {
        console.error("Failed to start session:", error);
        sendResponse({ success: false, error: error.message });
      }
    } else if (message.action === "stopSession") {
      try {
        sendResponse(stopSession());
      } catch (error) {
        console.error("Failed to stop session:", error);
        sendResponse({ success: false, error: error.message });
      }
    } else if (message.action === "takeSnapshot") {
      try {
        sendResponse(takeSnapshot(message.label));
      } catch (error) {
        console.error("Failed to take snapshot:", error);
        sendResponse({ success: false, error: error.message });
      }
    } else if (message.action === "getSessionStatus") {
      try {
        sendResponse(getSessionStatus());
      } catch (error) {
        console.error("Failed to get session status:", error);
        sendResponse({ success: false, error: error.message });
      }
    }
    return true;
  });

  // Start element picker mode
  function startPicker() {
    if (pickerActive) return;
    pickerActive = true;

    try {
      // Inject styles if not already done
      injectStyles();

      // Create highlight overlay
      highlightOverlay = document.createElement("div");
      highlightOverlay.style.cssText = HIGHLIGHT_STYLE;
      highlightOverlay.setAttribute("data-ccr", "highlight");
      document.body.appendChild(highlightOverlay);

      // Create info tooltip
      infoTooltip = document.createElement("div");
      infoTooltip.style.cssText = TOOLTIP_STYLE;
      infoTooltip.setAttribute("data-ccr", "tooltip");
      document.body.appendChild(infoTooltip);

      // Add event listeners
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("click", onElementClick, true);
      document.addEventListener("keydown", onKeyDown, true);

      // Change cursor
      document.body.style.cursor = "crosshair";
    } catch (error) {
      console.error("Error starting picker:", error);
      stopPicker();
      throw error;
    }
  }

  // Stop element picker mode
  function stopPicker() {
    if (!pickerActive) return;
    pickerActive = false;

    // Cancel pending mouse move
    if (pendingMouseMove) {
      cancelAnimationFrame(pendingMouseMove);
      pendingMouseMove = null;
    }

    // Remove overlay and tooltip safely
    try {
      highlightOverlay?.remove();
      infoTooltip?.remove();
    } catch (e) {
      // Elements may already be removed
    }

    highlightOverlay = null;
    infoTooltip = null;

    // Remove event listeners
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onElementClick, true);
    document.removeEventListener("keydown", onKeyDown, true);

    // Restore cursor
    if (document.body) {
      document.body.style.cursor = "";
    }
    currentElement = null;
  }

  // Mouse move handler with frame-rate limiting
  function onMouseMove(e) {
    const now = performance.now();

    // Skip if we're processing too fast
    if (now - lastMouseMoveTime < DEBOUNCE_MS) {
      // Schedule update for next frame if not already pending
      if (!pendingMouseMove) {
        pendingMouseMove = requestAnimationFrame(() => {
          pendingMouseMove = null;
          updateHighlight(e.clientX, e.clientY);
        });
      }
      return;
    }

    lastMouseMoveTime = now;
    updateHighlight(e.clientX, e.clientY);
  }

  // Update highlight position and tooltip
  function updateHighlight(clientX, clientY) {
    if (!pickerActive || !highlightOverlay || !infoTooltip) return;

    try {
      const element = document.elementFromPoint(clientX, clientY);

      if (!element || isOurElement(element) || !isValidElement(element)) {
        return;
      }

      currentElement = element;
      const rect = element.getBoundingClientRect();

      // Update highlight position
      highlightOverlay.style.top = `${rect.top}px`;
      highlightOverlay.style.left = `${rect.left}px`;
      highlightOverlay.style.width = `${rect.width}px`;
      highlightOverlay.style.height = `${rect.height}px`;

      // Build tooltip text
      const tagName = element.tagName.toLowerCase();
      const id = element.id ? `#${safeString(element.id, 30)}` : "";
      const classes = getClassString(element, 2);

      infoTooltip.textContent = `${tagName}${id}${classes}`;

      // Position tooltip above element, or below if no space
      let tooltipTop = rect.top - 30;
      if (tooltipTop < 5) {
        tooltipTop = rect.bottom + 5;
      }

      // Keep tooltip in viewport horizontally
      const tooltipLeft = Math.max(5, Math.min(rect.left, window.innerWidth - 310));

      infoTooltip.style.top = `${tooltipTop}px`;
      infoTooltip.style.left = `${tooltipLeft}px`;
    } catch (error) {
      console.error("Error updating highlight:", error);
    }
  }

  // Click handler - select element
  function onElementClick(e) {
    if (!pickerActive) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (!currentElement || isOurElement(e.target)) return;

    const element = currentElement;
    stopPicker();

    try {
      showCaptureModal(element);
    } catch (error) {
      console.error("Error showing capture modal:", error);
      showToast("Failed to capture element", "error");
    }
  }

  // Keyboard handler - ESC to cancel
  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      stopPicker();
    }
  }

  // Inject modal styles
  function injectStyles() {
    if (document.getElementById("ccr-styles")) return;

    const style = document.createElement("style");
    style.id = "ccr-styles";
    style.textContent = MODAL_STYLES;

    // Insert into head, or body if head not available
    const target = document.head || document.body || document.documentElement;
    target.appendChild(style);
  }

  // Show capture modal
  function showCaptureModal(element) {
    const elementData = extractElementData(element);

    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${safeString(element.id, 30)}` : "";
    const classes = getClassString(element, 3);

    const overlay = document.createElement("div");
    overlay.className = "ccr-modal-overlay";
    overlay.innerHTML = `
      <div class="ccr-modal">
        <div class="ccr-modal-header">
          <h2 class="ccr-modal-title">Capture Element Context</h2>
          <button class="ccr-modal-close" id="ccr-close" aria-label="Close">&times;</button>
        </div>
        <div class="ccr-modal-body">
          <div class="ccr-element-info">
            <span class="ccr-element-tag">&lt;${tagName}&gt;</span>
            ${id ? `<span class="ccr-element-id">${escapeHtml(id)}</span>` : ""}
            ${classes ? `<span class="ccr-element-class">${escapeHtml(classes)}</span>` : ""}
          </div>
          <label class="ccr-label" for="ccr-comment">Your Comment</label>
          <textarea
            class="ccr-textarea"
            id="ccr-comment"
            placeholder="Describe the issue, behavior, or context..."
          ></textarea>
          <div class="ccr-hint">Press Cmd+Enter to save</div>
        </div>
        <div class="ccr-modal-footer">
          <button class="ccr-btn ccr-btn-secondary" id="ccr-cancel">Cancel</button>
          <button class="ccr-btn ccr-btn-primary" id="ccr-save">Save Report</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    captureModal = overlay;

    const textarea = overlay.querySelector("#ccr-comment");
    const saveBtn = overlay.querySelector("#ccr-save");

    // Focus textarea after a short delay to ensure modal is rendered
    setTimeout(() => textarea?.focus(), 50);

    // Event handlers
    const closeHandler = () => closeModal();
    const saveHandler = () => {
      saveBtn.disabled = true;
      saveReport(elementData, textarea.value);
    };

    overlay.querySelector("#ccr-close").addEventListener("click", closeHandler);
    overlay.querySelector("#ccr-cancel").addEventListener("click", closeHandler);
    saveBtn.addEventListener("click", saveHandler);

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        saveHandler();
      }
    });

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeHandler();
    });

    // Close on escape
    document.addEventListener("keydown", onModalKeyDown);
  }

  function onModalKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  }

  function closeModal() {
    if (captureModal) {
      captureModal.remove();
      captureModal = null;
    }
    document.removeEventListener("keydown", onModalKeyDown);
  }

  // ========== PHASE 1: Framework Detection ==========

  function detectFramework() {
    // React detection - check multiple methods
    // Method 1: Check for React DevTools hook (most reliable when DevTools installed)
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      let version = null;
      const renderers = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
      if (renderers && renderers.size > 0) {
        const firstRenderer = renderers.values().next().value;
        if (firstRenderer && firstRenderer.version) {
          version = firstRenderer.version;
        }
      }
      return { name: 'react', version };
    }

    // Method 2: Check for React on window (older apps or exposed React)
    if (window.React && window.React.version) {
      return { name: 'react', version: window.React.version };
    }

    // Method 3: Check for React fiber keys on root element (works for bundled React)
    const rootElement = document.getElementById('root') || document.getElementById('app') || document.body.firstElementChild;
    if (rootElement) {
      const hasFiber = Object.keys(rootElement).some(k =>
        k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$') || k.startsWith('__reactContainer$')
      );
      if (hasFiber) {
        return { name: 'react', version: null };
      }
    }

    // Method 4: Check for data-reactroot attribute
    if (document.querySelector('[data-reactroot], [data-reactid]')) {
      return { name: 'react', version: null };
    }

    // Method 5: Check any element for React fiber (broader search)
    const anyReactElement = document.querySelector('*');
    if (anyReactElement) {
      // Check first few elements for React keys
      const elements = document.querySelectorAll('body *');
      for (let i = 0; i < Math.min(elements.length, 20); i++) {
        const hasReactKey = Object.keys(elements[i]).some(k =>
          k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
        );
        if (hasReactKey) {
          return { name: 'react', version: null };
        }
      }
    }

    // Vue detection
    if (window.Vue) {
      return { name: 'vue', version: window.Vue.version || null };
    }
    if (window.__VUE__) {
      return { name: 'vue', version: '3.x' };
    }
    if (document.querySelector('[data-v-]') || document.querySelector('[v-cloak]')) {
      return { name: 'vue', version: null };
    }

    // Angular detection
    if (window.ng || window.getAllAngularRootElements) {
      let version = null;
      if (window.ng && window.ng.VERSION) {
        version = window.ng.VERSION.full || window.ng.VERSION.major + '.' + window.ng.VERSION.minor;
      } else if (document.querySelector('[ng-version]')) {
        version = document.querySelector('[ng-version]').getAttribute('ng-version');
      }
      return { name: 'angular', version };
    }
    if (document.querySelector('[_ngcontent-]') || document.querySelector('[ng-reflect-]')) {
      return { name: 'angular', version: null };
    }

    // Svelte detection
    if (document.querySelector('[class*="svelte-"]') || window.__svelte) {
      return { name: 'svelte', version: null };
    }

    return { name: null, version: null };
  }

  function getComponentInfo(el) {
    const component = { name: null, props: null, state: null, file: null };

    // React component extraction
    const fiberKey = Object.keys(el).find(k =>
      k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );

    if (fiberKey) {
      let fiber = el[fiberKey];
      let current = fiber;
      while (current) {
        if (current.type && typeof current.type === 'function') {
          component.name = current.type.displayName || current.type.name || 'Anonymous';
          if (current.memoizedProps) {
            component.props = sanitizeObjectForReport(current.memoizedProps, 2);
          }
          if (current.memoizedState && current.tag === 1) {
            component.state = sanitizeObjectForReport(current.memoizedState, 2);
          }
          if (current._debugSource) {
            component.file = current._debugSource.fileName;
          }
          break;
        }
        current = current.return;
      }
      return component;
    }

    // Vue 3 component extraction
    if (el.__vueParentComponent) {
      const vc = el.__vueParentComponent;
      component.name = vc.type && (vc.type.name || vc.type.__name) || 'Anonymous';
      if (vc.props) {
        component.props = sanitizeObjectForReport(vc.props, 2);
      }
      if (vc.setupState) {
        component.state = sanitizeObjectForReport(vc.setupState, 2);
      }
      if (vc.type && vc.type.__file) {
        component.file = vc.type.__file;
      }
      return component;
    }

    // Vue 2 component extraction
    if (el.__vue__) {
      const vm = el.__vue__;
      component.name = vm.$options && (vm.$options.name || vm.$options._componentTag) || 'Anonymous';
      if (vm.$props) {
        component.props = sanitizeObjectForReport(vm.$props, 2);
      }
      if (vm.$data) {
        component.state = sanitizeObjectForReport(vm.$data, 2);
      }
      if (vm.$options && vm.$options.__file) {
        component.file = vm.$options.__file;
      }
      return component;
    }

    // Angular component extraction
    if (window.ng && window.ng.getComponent) {
      try {
        const ngComponent = window.ng.getComponent(el);
        if (ngComponent) {
          component.name = ngComponent.constructor.name || 'Anonymous';
          const props = {};
          Object.getOwnPropertyNames(ngComponent).forEach(key => {
            if (!key.startsWith('_') && typeof ngComponent[key] !== 'function') {
              props[key] = sanitizeValueForReport(ngComponent[key], 2);
            }
          });
          component.props = props;
        }
      } catch (e) {}
    }

    return component;
  }

  function sanitizeValueForReport(value, depth) {
    if (depth <= 0) return '[max depth]';
    if (value === null) return null;
    if (value === undefined) return undefined;

    const type = typeof value;
    if (type === 'string') {
      return value.length > 200 ? value.substring(0, 200) + '...' : value;
    }
    if (type === 'number' || type === 'boolean') {
      return value;
    }
    if (type === 'function') {
      return '[Function: ' + (value.name || 'anonymous') + ']';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Element) {
      return '[Element: ' + value.tagName.toLowerCase() + ']';
    }
    if (Array.isArray(value)) {
      if (value.length > 10) {
        return '[Array(' + value.length + ')]';
      }
      return value.slice(0, 10).map(v => sanitizeValueForReport(v, depth - 1));
    }
    if (type === 'object') {
      return sanitizeObjectForReport(value, depth - 1);
    }
    return String(value);
  }

  function sanitizeObjectForReport(obj, depth) {
    if (depth <= 0) return '[max depth]';
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};
    let keys = Object.keys(obj);
    if (keys.length > 20) {
      keys = keys.slice(0, 20);
      result['...'] = '(' + (Object.keys(obj).length - 20) + ' more keys)';
    }

    keys.forEach(key => {
      if (key.startsWith('__') || key.startsWith('$$')) return;
      try {
        result[key] = sanitizeValueForReport(obj[key], depth);
      } catch (e) {
        result[key] = '[Error reading property]';
      }
    });

    return result;
  }

  function getDataAttributesFromElement(el) {
    const attrs = {};
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      if (attr.name.startsWith('data-') && !attr.name.startsWith('data-ccr')) {
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  // Extract element data with comprehensive error handling
  function extractElementData(element) {
    const data = {
      selector: "",
      xpath: "",
      tagName: "",
      id: null,
      className: null,
      textContent: "",
      innerHTML: "",
      attributes: {},
      computedStyles: {},
      boundingRect: null,
      pageUrl: "",
      pageTitle: "",
      // Phase 1 fields
      framework: null,
      component: null,
      dataAttributes: {},
      consoleErrors: [],
      networkRequests: [],
      developerContext: null
    };

    try {
      data.tagName = element.tagName?.toLowerCase() || "unknown";
    } catch { /* ignore */ }

    try {
      data.id = element.id || null;
    } catch { /* ignore */ }

    try {
      data.className = (typeof element.className === "string")
        ? element.className
        : null;
    } catch { /* ignore */ }

    try {
      data.selector = getCssSelector(element);
    } catch (e) {
      console.warn("Failed to generate CSS selector:", e);
      data.selector = data.tagName;
    }

    try {
      data.xpath = getXPath(element);
    } catch (e) {
      console.warn("Failed to generate XPath:", e);
      data.xpath = "//" + data.tagName;
    }

    try {
      const text = element.textContent || "";
      data.textContent = safeString(text.trim(), MAX_TEXT_LENGTH);
    } catch { /* ignore */ }

    try {
      data.innerHTML = safeString(element.innerHTML, MAX_HTML_LENGTH);
    } catch { /* ignore */ }

    try {
      data.attributes = getAttributes(element);
    } catch { /* ignore */ }

    try {
      data.computedStyles = getComputedStyles(element);
    } catch { /* ignore */ }

    try {
      data.boundingRect = getBoundingRect(element);
    } catch { /* ignore */ }

    try {
      data.pageUrl = window.location.href;
      data.pageTitle = document.title || "";
    } catch { /* ignore */ }

    // Phase 1: Framework detection
    try {
      data.framework = detectFramework();
    } catch { /* ignore */ }

    // Phase 1: Component info
    try {
      data.component = getComponentInfo(element);
    } catch { /* ignore */ }

    // Phase 1: Data attributes
    try {
      data.dataAttributes = getDataAttributesFromElement(element);
      // Check for developer-provided context
      if (data.dataAttributes['data-ai-context']) {
        try {
          data.developerContext = JSON.parse(data.dataAttributes['data-ai-context']);
          if (data.developerContext.component && !data.component.name) {
            data.component.name = data.developerContext.component;
          }
          if (data.developerContext.file) {
            data.component.file = data.developerContext.file;
          }
        } catch { /* invalid JSON */ }
      }
    } catch { /* ignore */ }

    // Phase 1: Console errors
    try {
      data.consoleErrors = (window.__AI_CONTEXT_CONSOLE_LOG__ || []).slice(-10);
    } catch { /* ignore */ }

    // Phase 1: Network requests
    try {
      data.networkRequests = (window.__AI_CONTEXT_NETWORK_LOG__ || []).slice(-20);
    } catch { /* ignore */ }

    return data;
  }

  // Generate CSS selector with depth limiting and edge case handling
  function getCssSelector(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const parts = [];
    let el = element;
    let depth = 0;

    while (el && el.nodeType === Node.ELEMENT_NODE && depth < MAX_SELECTOR_DEPTH) {
      // Skip html and body for cleaner selectors
      if (el === document.documentElement || el === document.body) {
        break;
      }

      let selector = el.tagName.toLowerCase();

      // Handle SVG elements (they're in a different namespace)
      if (el.namespaceURI === "http://www.w3.org/2000/svg" && selector !== "svg") {
        // Just use the tag name for SVG children
      }

      // ID is unique - we can stop here (validate ID format)
      if (el.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(el.id)) {
        selector = `#${el.id}`;
        parts.unshift(selector);
        break;
      }

      // Add nth-of-type for disambiguation
      const parent = el.parentElement;
      if (parent) {
        try {
          const siblings = Array.from(parent.children).filter(
            c => c.tagName === el.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(el) + 1;
            selector += `:nth-of-type(${index})`;
          }
        } catch {
          // Shadow DOM or other edge case - skip disambiguation
        }
      }

      parts.unshift(selector);
      el = parent;
      depth++;
    }

    return parts.join(" > ") || element.tagName?.toLowerCase() || "element";
  }

  // Generate XPath with depth limiting
  function getXPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const parts = [];
    let el = element;
    let depth = 0;

    while (el && el.nodeType === Node.ELEMENT_NODE && depth < MAX_SELECTOR_DEPTH) {
      if (el === document.documentElement) {
        parts.unshift("html");
        break;
      }

      let index = 1;
      let sibling = el.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === el.tagName) index++;
        sibling = sibling.previousElementSibling;
      }

      const tagName = el.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      el = el.parentElement;
      depth++;
    }

    return "/" + parts.join("/");
  }

  // Get element attributes safely
  function getAttributes(element) {
    const attrs = {};

    try {
      const attributes = element.attributes;
      if (!attributes) return attrs;

      for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        // Skip style (we capture computed styles) and our data attributes
        if (attr.name === "style" || attr.name.startsWith("data-ccr")) {
          continue;
        }
        attrs[attr.name] = safeString(attr.value, MAX_ATTR_LENGTH);
      }
    } catch {
      // Some elements may not support attribute access
    }

    return attrs;
  }

  // Get computed styles with proper CSS property names
  function getComputedStyles(element) {
    const styles = {};

    try {
      const computed = window.getComputedStyle(element);
      if (!computed) return styles;

      const styleProps = [
        // Layout
        "display", "position", "top", "right", "bottom", "left",
        "width", "height", "min-width", "max-width", "min-height", "max-height",
        "margin", "padding", "box-sizing",
        // Flexbox
        "flex-direction", "flex-wrap", "justify-content", "align-items", "gap",
        // Grid
        "grid-template-columns", "grid-template-rows",
        // Typography
        "font-family", "font-size", "font-weight", "line-height", "text-align", "color",
        // Background
        "background-color", "background-image",
        // Border
        "border", "border-radius",
        // Effects
        "opacity", "visibility", "overflow", "z-index",
        // Transform
        "transform"
      ];

      for (const prop of styleProps) {
        try {
          const value = computed.getPropertyValue(prop);
          // Skip default/empty/zero values
          if (value &&
              value !== "none" &&
              value !== "auto" &&
              value !== "normal" &&
              value !== "0px" &&
              value !== "rgba(0, 0, 0, 0)") {
            styles[prop] = value;
          }
        } catch {
          // Skip properties that fail
        }
      }
    } catch {
      // getComputedStyle may fail for detached elements
    }

    return styles;
  }

  // Get bounding rect safely
  function getBoundingRect(element) {
    try {
      const rect = element.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    } catch {
      return null;
    }
  }

  // Save report with error handling
  async function saveReport(elementData, comment) {
    const report = {
      ...elementData,
      comment: safeString(comment.trim(), 2000)
    };

    try {
      const response = await browser.runtime.sendMessage({
        action: "saveReport",
        report
      });

      if (response?.success) {
        closeModal();
        showToast("Report saved successfully!", "success");
      } else {
        showToast(response?.error || "Failed to save report", "error");
      }
    } catch (error) {
      console.error("Failed to save report:", error);
      showToast("Failed to save report: " + error.message, "error");
    }
  }

  // Show toast notification
  function showToast(message, type) {
    // Remove any existing toasts
    document.querySelectorAll(".ccr-toast").forEach(t => t.remove());

    const toast = document.createElement("div");
    toast.className = `ccr-toast ccr-toast-${type}`;
    toast.textContent = message;
    toast.setAttribute("role", "alert");
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "ccr-slide-in 0.3s ease reverse";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
})();
