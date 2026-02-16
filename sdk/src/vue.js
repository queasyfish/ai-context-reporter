/**
 * AI Context SDK - Vue Integration
 *
 * Provides Vue-specific helpers for the AI Context Reporter.
 * Supports both Vue 2 and Vue 3.
 *
 * @example
 * ```js
 * // Vue 3
 * import { createApp } from 'vue';
 * import { AIContextPlugin } from 'ai-context-sdk/vue';
 *
 * const app = createApp(App);
 * app.use(AIContextPlugin, {
 *   repository: 'https://github.com/org/repo'
 * });
 *
 * // In components, use the directive
 * <template>
 *   <div v-ai-context="{ file: 'src/components/UserCard.vue' }">
 *     ...
 *   </div>
 * </template>
 * ```
 */

import { AIContextReporter, getReporter, createContextAttribute } from './ai-context-sdk.js';

/**
 * @typedef {Object} VueAIContextOptions
 * @property {string} file - File path relative to repository root
 * @property {string} [description] - Component description
 * @property {string[]} [tags] - Component tags
 * @property {Record<string, unknown>} [metadata] - Additional metadata
 */

/**
 * Vue directive for adding AI context to elements.
 * Works with both Vue 2 and Vue 3.
 *
 * @example
 * ```vue
 * <template>
 *   <div v-ai-context="{ file: 'src/components/UserCard.vue' }">
 *     {{ user.name }}
 *   </div>
 * </template>
 * ```
 */
const aiContextDirective = {
  // Vue 3 hooks
  mounted(el, binding) {
    applyContext(el, binding.value, binding.instance);
  },
  updated(el, binding) {
    applyContext(el, binding.value, binding.instance);
  },

  // Vue 2 hooks
  bind(el, binding, vnode) {
    applyContext(el, binding.value, vnode.context);
  },
  update(el, binding, vnode) {
    applyContext(el, binding.value, vnode.context);
  }
};

/**
 * Apply AI context to an element.
 * @private
 */
function applyContext(el, options, componentInstance) {
  if (!options || !options.file) {
    console.warn('v-ai-context: file option is required');
    return;
  }

  // Get component name
  let componentName = 'UnknownComponent';
  if (componentInstance) {
    // Vue 3
    if (componentInstance.$options && componentInstance.$options.name) {
      componentName = componentInstance.$options.name;
    }
    // Vue 3 script setup
    else if (componentInstance.$.type && componentInstance.$.type.name) {
      componentName = componentInstance.$.type.name;
    }
    // Vue 3 __name (from script setup)
    else if (componentInstance.$.type && componentInstance.$.type.__name) {
      componentName = componentInstance.$.type.__name;
    }
  }

  // Register component with reporter
  const reporter = getReporter();
  if (reporter) {
    reporter.registerComponent(componentName, {
      file: options.file,
      description: options.description,
      tags: options.tags,
      metadata: options.metadata
    });
  }

  // Set data attribute
  const contextValue = {
    component: componentName,
    file: options.file,
    description: options.description,
    ...options.metadata
  };

  el.setAttribute('data-ai-context', JSON.stringify(contextValue));
}

/**
 * Vue plugin that installs AI Context integration.
 *
 * @example
 * ```js
 * // Vue 3
 * import { createApp } from 'vue';
 * import { AIContextPlugin } from 'ai-context-sdk/vue';
 *
 * const app = createApp(App);
 * app.use(AIContextPlugin, {
 *   repository: 'https://github.com/org/repo',
 *   branch: 'main'
 * });
 *
 * // Vue 2
 * import Vue from 'vue';
 * import { AIContextPlugin } from 'ai-context-sdk/vue';
 *
 * Vue.use(AIContextPlugin, {
 *   repository: 'https://github.com/org/repo'
 * });
 * ```
 */
const AIContextPlugin = {
  install(app, options = {}) {
    // Initialize the reporter
    const reporter = new AIContextReporter(options);

    // Detect Vue version
    const isVue3 = typeof app.directive === 'function';

    if (isVue3) {
      // Vue 3
      app.directive('ai-context', aiContextDirective);

      // Provide reporter to all components
      app.provide('aiContextReporter', reporter);

      // Add global property
      app.config.globalProperties.$aiContext = reporter;
    } else {
      // Vue 2
      app.directive('ai-context', aiContextDirective);

      // Add to prototype
      app.prototype.$aiContext = reporter;
    }
  }
};

/**
 * Vue 3 Composition API composable for AI context.
 *
 * @param {VueAIContextOptions} options - Context options
 * @returns {Object} Composable return value
 *
 * @example
 * ```vue
 * <script setup>
 * import { useAIContext } from 'ai-context-sdk/vue';
 *
 * const { captureState, setContext } = useAIContext({
 *   file: 'src/components/UserCard.vue'
 * });
 *
 * // Capture state for debugging
 * captureState('user', user.value);
 * </script>
 * ```
 */
function useAIContext(options) {
  const reporter = getReporter();

  // Register component if options provided
  if (options && options.file) {
    // Try to get component name from Vue internals
    let componentName = 'UnknownComponent';

    // In Vue 3 script setup, we can try to get the name
    try {
      const instance = getCurrentInstance && getCurrentInstance();
      if (instance) {
        componentName = instance.type.name || instance.type.__name || 'UnknownComponent';
      }
    } catch (e) {
      // getCurrentInstance not available
    }

    if (reporter) {
      reporter.registerComponent(componentName, options);
    }
  }

  return {
    /**
     * Capture state for AI debugging.
     * @param {string} name - State name
     * @param {unknown} value - State value
     */
    captureState(name, value) {
      if (reporter) {
        reporter.captureState(name, value);
      }
    },

    /**
     * Set custom context.
     * @param {string} key - Context key
     * @param {unknown} value - Context value
     */
    setContext(key, value) {
      if (reporter) {
        reporter.setContext(key, value);
      }
    },

    /**
     * Get the reporter instance.
     * @returns {AIContextReporter|null}
     */
    getReporter() {
      return reporter;
    }
  };
}

// Try to get getCurrentInstance for Vue 3
let getCurrentInstance = null;
if (typeof window !== 'undefined') {
  try {
    // This will be available if Vue 3 is loaded
    const Vue = window.Vue;
    if (Vue && Vue.getCurrentInstance) {
      getCurrentInstance = Vue.getCurrentInstance;
    }
  } catch (e) {
    // Vue not available
  }
}

/**
 * Vue mixin for Vue 2 class components or options API.
 *
 * @param {VueAIContextOptions} options - Context options
 * @returns {Object} Vue mixin
 *
 * @example
 * ```js
 * export default {
 *   mixins: [aiContextMixin({ file: 'src/components/UserCard.vue' })],
 *   // ...
 * }
 * ```
 */
function aiContextMixin(options) {
  return {
    mounted() {
      if (!options || !options.file) return;

      const componentName = this.$options.name || 'UnknownComponent';
      const reporter = getReporter();

      if (reporter) {
        reporter.registerComponent(componentName, options);
      }

      // Add data attribute to root element
      if (this.$el && this.$el.setAttribute) {
        const contextValue = {
          component: componentName,
          file: options.file,
          description: options.description,
          ...options.metadata
        };
        this.$el.setAttribute('data-ai-context', JSON.stringify(contextValue));
      }
    }
  };
}

/**
 * Create context attribute helper for templates.
 *
 * @param {VueAIContextOptions} options - Context options
 * @returns {string} JSON string for data-ai-context attribute
 *
 * @example
 * ```vue
 * <template>
 *   <div :data-ai-context="$aiContextAttr({ file: 'src/UserCard.vue' })">
 *     ...
 *   </div>
 * </template>
 * ```
 */
function aiContextAttr(options) {
  return createContextAttribute({
    component: options.component,
    file: options.file,
    description: options.description,
    ...options.metadata
  });
}

export {
  AIContextPlugin,
  aiContextDirective,
  useAIContext,
  aiContextMixin,
  aiContextAttr
};

export default AIContextPlugin;
