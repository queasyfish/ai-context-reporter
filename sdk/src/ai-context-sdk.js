/**
 * AI Context SDK
 *
 * Provides rich context to AI coding agents via the AI Context Reporter
 * browser extension. Install this SDK to give AI agents better information
 * about your components, file paths, and application state.
 *
 * @example
 * ```js
 * import { AIContextReporter } from 'ai-context-sdk';
 *
 * const reporter = new AIContextReporter({
 *   repository: 'https://github.com/org/repo',
 *   branch: process.env.GIT_BRANCH
 * });
 *
 * reporter.registerComponent('UserCard', {
 *   file: 'src/components/UserCard.tsx',
 *   description: 'Displays user profile information'
 * });
 * ```
 */

/**
 * @typedef {Object} AIContextConfig
 * @property {string} [repository] - Git repository URL
 * @property {string} [branch] - Current git branch
 * @property {string} [commit] - Current git commit hash
 * @property {string} [environment] - Environment name (development, staging, production)
 * @property {Record<string, unknown>} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} ComponentRegistration
 * @property {string} file - File path relative to repository root
 * @property {string} [description] - Human-readable description of the component
 * @property {string[]} [tags] - Tags for categorization
 * @property {Record<string, unknown>} [metadata] - Additional component metadata
 */

/**
 * @typedef {Object} StateSnapshot
 * @property {string} name - Name of the state slice
 * @property {unknown} value - Current state value
 * @property {number} timestamp - Timestamp when captured
 */

const GLOBAL_KEY = '__AI_CONTEXT_REPORTER__';

class AIContextReporter {
  /**
   * Create a new AIContextReporter instance.
   * Only one instance should be created per application.
   *
   * @param {AIContextConfig} [config={}] - Configuration options
   */
  constructor(config = {}) {
    // Check if already initialized
    if (typeof window !== 'undefined' && window[GLOBAL_KEY]) {
      console.warn('AIContextReporter already initialized. Returning existing instance.');
      return window[GLOBAL_KEY];
    }

    this.config = {
      repository: config.repository || null,
      branch: config.branch || null,
      commit: config.commit || null,
      environment: config.environment || this._detectEnvironment(),
      metadata: config.metadata || {}
    };

    this.components = new Map();
    this.stateSnapshots = [];
    this.customContext = {};
    this.maxSnapshots = 50;

    // Expose globally for extension detection
    if (typeof window !== 'undefined') {
      window[GLOBAL_KEY] = this;
    }
  }

  /**
   * Detect the current environment based on common patterns.
   * @private
   */
  _detectEnvironment() {
    if (typeof window === 'undefined') return 'unknown';

    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
      return 'development';
    }
    if (hostname.includes('staging') || hostname.includes('stage') || hostname.includes('dev')) {
      return 'staging';
    }
    return 'production';
  }

  /**
   * Register a component with its file path and metadata.
   * This helps AI agents understand where to find the source code.
   *
   * @param {string} componentName - The name of the component (must match React/Vue component name)
   * @param {ComponentRegistration} registration - Component registration details
   *
   * @example
   * ```js
   * reporter.registerComponent('UserCard', {
   *   file: 'src/components/UserCard.tsx',
   *   description: 'Displays user profile with avatar and name',
   *   tags: ['user', 'profile', 'card']
   * });
   * ```
   */
  registerComponent(componentName, registration) {
    if (!componentName || typeof componentName !== 'string') {
      console.error('AIContextReporter: componentName must be a non-empty string');
      return this;
    }

    if (!registration || !registration.file) {
      console.error('AIContextReporter: registration must include a file path');
      return this;
    }

    this.components.set(componentName, {
      file: registration.file,
      description: registration.description || null,
      tags: registration.tags || [],
      metadata: registration.metadata || {},
      registeredAt: Date.now()
    });

    return this;
  }

  /**
   * Register multiple components at once.
   *
   * @param {Record<string, ComponentRegistration>} components - Map of component names to registrations
   *
   * @example
   * ```js
   * reporter.registerComponents({
   *   'UserCard': { file: 'src/components/UserCard.tsx' },
   *   'Button': { file: 'src/components/Button.tsx' },
   *   'Modal': { file: 'src/components/Modal.tsx' }
   * });
   * ```
   */
  registerComponents(components) {
    if (!components || typeof components !== 'object') {
      console.error('AIContextReporter: components must be an object');
      return this;
    }

    for (const [name, registration] of Object.entries(components)) {
      this.registerComponent(name, registration);
    }

    return this;
  }

  /**
   * Get registration info for a component by name.
   *
   * @param {string} componentName - The component name to look up
   * @returns {ComponentRegistration|null} The registration or null if not found
   */
  getComponent(componentName) {
    return this.components.get(componentName) || null;
  }

  /**
   * Get all registered components.
   *
   * @returns {Record<string, ComponentRegistration>} Map of all registered components
   */
  getAllComponents() {
    const result = {};
    for (const [name, registration] of this.components) {
      result[name] = registration;
    }
    return result;
  }

  /**
   * Capture a snapshot of application state.
   * Useful for debugging state-related issues.
   *
   * @param {string} name - Name for this state snapshot
   * @param {unknown} value - The state value to capture
   *
   * @example
   * ```js
   * reporter.captureState('user', { id: 1, name: 'John' });
   * reporter.captureState('cart', { items: [], total: 0 });
   * ```
   */
  captureState(name, value) {
    const snapshot = {
      name,
      value: this._sanitizeValue(value, 3),
      timestamp: Date.now()
    };

    this.stateSnapshots.push(snapshot);

    // Trim old snapshots
    if (this.stateSnapshots.length > this.maxSnapshots) {
      this.stateSnapshots.shift();
    }

    return this;
  }

  /**
   * Get all captured state snapshots.
   *
   * @returns {StateSnapshot[]} Array of state snapshots
   */
  getStateSnapshots() {
    return [...this.stateSnapshots];
  }

  /**
   * Clear all state snapshots.
   */
  clearStateSnapshots() {
    this.stateSnapshots = [];
    return this;
  }

  /**
   * Set custom context that will be included in reports.
   *
   * @param {string} key - Context key
   * @param {unknown} value - Context value
   *
   * @example
   * ```js
   * reporter.setContext('featureFlags', { newCheckout: true });
   * reporter.setContext('userId', '12345');
   * ```
   */
  setContext(key, value) {
    this.customContext[key] = this._sanitizeValue(value, 3);
    return this;
  }

  /**
   * Get a custom context value.
   *
   * @param {string} key - Context key
   * @returns {unknown} The context value or undefined
   */
  getContext(key) {
    return this.customContext[key];
  }

  /**
   * Get all custom context.
   *
   * @returns {Record<string, unknown>} All custom context
   */
  getAllContext() {
    return { ...this.customContext };
  }

  /**
   * Get the full context object for the extension to consume.
   * This is called by the browser extension when capturing elements.
   *
   * @returns {Object} Complete context object
   */
  getFullContext() {
    return {
      config: this.config,
      components: this.getAllComponents(),
      stateSnapshots: this.getStateSnapshots(),
      customContext: this.getAllContext(),
      timestamp: Date.now()
    };
  }

  /**
   * Sanitize a value for safe serialization.
   * @private
   */
  _sanitizeValue(value, depth) {
    if (depth <= 0) return '[max depth]';
    if (value === null) return null;
    if (value === undefined) return undefined;

    const type = typeof value;

    if (type === 'string') {
      return value.length > 1000 ? value.substring(0, 1000) + '...' : value;
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
    if (value instanceof RegExp) {
      return value.toString();
    }
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return '[Element: ' + value.tagName.toLowerCase() + ']';
    }
    if (Array.isArray(value)) {
      if (value.length > 100) {
        return '[Array(' + value.length + ')]';
      }
      return value.slice(0, 100).map(v => this._sanitizeValue(v, depth - 1));
    }
    if (type === 'object') {
      return this._sanitizeObject(value, depth - 1);
    }

    return String(value);
  }

  /**
   * Sanitize an object for safe serialization.
   * @private
   */
  _sanitizeObject(obj, depth) {
    if (depth <= 0) return '[max depth]';
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};
    let keys = Object.keys(obj);

    // Limit number of keys
    if (keys.length > 50) {
      keys = keys.slice(0, 50);
      result['...'] = '(' + (Object.keys(obj).length - 50) + ' more keys)';
    }

    for (const key of keys) {
      // Skip internal/private keys
      if (key.startsWith('__') || key.startsWith('$$') || key.startsWith('_')) {
        continue;
      }
      try {
        result[key] = this._sanitizeValue(obj[key], depth);
      } catch (e) {
        result[key] = '[Error reading property]';
      }
    }

    return result;
  }
}

/**
 * Create data-ai-context attribute value for an element.
 * Use this to add context directly to DOM elements.
 *
 * @param {Object} context - Context to encode
 * @param {string} [context.component] - Component name
 * @param {string} [context.file] - File path
 * @param {string} [context.description] - Description
 * @param {Record<string, unknown>} [context.metadata] - Additional metadata
 * @returns {string} JSON string to use as data-ai-context attribute value
 *
 * @example
 * ```jsx
 * <div data-ai-context={createContextAttribute({
 *   component: 'UserCard',
 *   file: 'src/components/UserCard.tsx'
 * })}>
 *   ...
 * </div>
 * ```
 */
function createContextAttribute(context) {
  return JSON.stringify(context);
}

/**
 * Get the global AIContextReporter instance if it exists.
 *
 * @returns {AIContextReporter|null} The global instance or null
 */
function getReporter() {
  if (typeof window !== 'undefined' && window[GLOBAL_KEY]) {
    return window[GLOBAL_KEY];
  }
  return null;
}

/**
 * Check if the AI Context Reporter extension is installed and active.
 *
 * @returns {boolean} True if the extension is detected
 */
function isExtensionInstalled() {
  if (typeof window === 'undefined') return false;
  // The extension sets this when it injects its capture scripts
  return !!(window.__AI_CONTEXT_CONSOLE_INITIALIZED__ || window.__AI_CONTEXT_NETWORK_INITIALIZED__);
}

// Export for different module systems
export {
  AIContextReporter,
  createContextAttribute,
  getReporter,
  isExtensionInstalled
};

export default AIContextReporter;
