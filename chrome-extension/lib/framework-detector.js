/**
 * Framework Detector Module
 *
 * Detects frontend frameworks (React, Vue, Angular, Svelte) and extracts
 * component information from the selected element.
 *
 * Returns code to be executed via chrome.devtools.inspectedWindow.eval()
 * or directly in the page context.
 */

/**
 * Returns an eval-ready code string that detects the framework
 * and extracts component information from the selected element ($0).
 *
 * @returns {string} JavaScript code string to execute via eval
 *
 * Returns object structure:
 * {
 *   framework: {
 *     name: 'react' | 'vue' | 'angular' | 'svelte' | null,
 *     version: string | null
 *   },
 *   component: {
 *     name: string | null,
 *     props: Record<string, unknown> | null,
 *     state: Record<string, unknown> | null,
 *     file: string | null
 *   },
 *   dataAttributes: Record<string, string>,
 *   eventListeners: string[]
 * }
 */
export function getFrameworkDetectorCode() {
  return `
    (function() {
      var result = {
        framework: { name: null, version: null },
        component: { name: null, props: null, state: null, file: null },
        dataAttributes: {},
        eventListeners: []
      };

      // =========================================
      // Framework Detection
      // =========================================

      function detectFramework() {
        // React detection
        if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          var version = null;
          if (window.React && window.React.version) {
            version = window.React.version;
          } else if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers) {
            // Try to get version from DevTools hook
            var renderers = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
            if (renderers.size > 0) {
              var firstRenderer = renderers.values().next().value;
              if (firstRenderer && firstRenderer.version) {
                version = firstRenderer.version;
              }
            }
          }
          return { name: 'react', version: version };
        }

        // Vue detection
        if (window.Vue) {
          return { name: 'vue', version: window.Vue.version || null };
        }
        // Vue 3 detection (different global structure)
        if (window.__VUE__) {
          return { name: 'vue', version: '3.x' };
        }

        // Angular detection
        if (window.ng || window.getAllAngularRootElements) {
          var version = null;
          if (window.ng && window.ng.VERSION) {
            version = window.ng.VERSION.full || window.ng.VERSION.major + '.' + window.ng.VERSION.minor;
          } else if (document.querySelector('[ng-version]')) {
            version = document.querySelector('[ng-version]').getAttribute('ng-version');
          }
          return { name: 'angular', version: version };
        }

        // Svelte detection
        if (document.querySelector('[class*="svelte-"]') || window.__svelte) {
          return { name: 'svelte', version: null };
        }

        // Check for framework indicators in DOM
        if (document.querySelector('[data-reactroot], [data-reactid]')) {
          return { name: 'react', version: null };
        }
        if (document.querySelector('[data-v-]') || document.querySelector('[v-cloak]')) {
          return { name: 'vue', version: null };
        }
        if (document.querySelector('[_ngcontent-]') || document.querySelector('[ng-reflect-]')) {
          return { name: 'angular', version: null };
        }

        return { name: null, version: null };
      }

      result.framework = detectFramework();

      // =========================================
      // Component Extraction (if element provided)
      // =========================================

      if (typeof $0 !== 'undefined' && $0) {
        var element = $0;

        // Extract data attributes
        function getDataAttributes(el) {
          var attrs = {};
          for (var i = 0; i < el.attributes.length; i++) {
            var attr = el.attributes[i];
            if (attr.name.startsWith('data-')) {
              attrs[attr.name] = attr.value;
            }
          }
          return attrs;
        }
        result.dataAttributes = getDataAttributes(element);

        // Extract event listeners (via getEventListeners if available in DevTools)
        function getEventListenerTypes(el) {
          var listeners = [];
          try {
            if (typeof getEventListeners === 'function') {
              var elListeners = getEventListeners(el);
              listeners = Object.keys(elListeners);
            }
          } catch (e) {
            // getEventListeners only available in DevTools console
          }
          return listeners;
        }
        result.eventListeners = getEventListenerTypes(element);

        // =========================================
        // React Component Extraction
        // =========================================

        function getReactComponent(el) {
          var component = { name: null, props: null, state: null, file: null };

          // Find React fiber key
          var fiberKey = Object.keys(el).find(function(k) {
            return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$');
          });

          if (!fiberKey) {
            // Try React 15 and earlier
            fiberKey = Object.keys(el).find(function(k) {
              return k.startsWith('__reactInternalInstance');
            });
          }

          if (fiberKey) {
            var fiber = el[fiberKey];

            // Walk up the fiber tree to find component
            var current = fiber;
            while (current) {
              // Check for function/class component
              if (current.type && typeof current.type === 'function') {
                component.name = current.type.displayName || current.type.name || 'Anonymous';

                // Get props (sanitized)
                if (current.memoizedProps) {
                  component.props = sanitizeObject(current.memoizedProps, 2);
                }

                // Get state (for class components)
                if (current.memoizedState && current.tag === 1) {
                  // tag 1 = ClassComponent
                  component.state = sanitizeObject(current.memoizedState, 2);
                }

                // Try to get file from _debugSource or _source
                if (current._debugSource) {
                  component.file = current._debugSource.fileName;
                } else if (current._source) {
                  component.file = current._source.fileName;
                }

                break;
              }
              current = current.return;
            }
          }

          return component;
        }

        // =========================================
        // Vue Component Extraction
        // =========================================

        function getVueComponent(el) {
          var component = { name: null, props: null, state: null, file: null };

          // Vue 3
          if (el.__vueParentComponent) {
            var vc = el.__vueParentComponent;
            component.name = vc.type && (vc.type.name || vc.type.__name) || 'Anonymous';

            if (vc.props) {
              component.props = sanitizeObject(vc.props, 2);
            }

            // Vue 3 uses setupState for Composition API state
            if (vc.setupState) {
              component.state = sanitizeObject(vc.setupState, 2);
            } else if (vc.data) {
              component.state = sanitizeObject(vc.data, 2);
            }

            if (vc.type && vc.type.__file) {
              component.file = vc.type.__file;
            }
          }
          // Vue 2
          else if (el.__vue__) {
            var vm = el.__vue__;
            component.name = vm.$options && (vm.$options.name || vm.$options._componentTag) || 'Anonymous';

            if (vm.$props) {
              component.props = sanitizeObject(vm.$props, 2);
            }

            if (vm.$data) {
              component.state = sanitizeObject(vm.$data, 2);
            }

            if (vm.$options && vm.$options.__file) {
              component.file = vm.$options.__file;
            }
          }

          return component;
        }

        // =========================================
        // Angular Component Extraction
        // =========================================

        function getAngularComponent(el) {
          var component = { name: null, props: null, state: null, file: null };

          try {
            if (window.ng && window.ng.getComponent) {
              var ngComponent = window.ng.getComponent(el);
              if (ngComponent) {
                component.name = ngComponent.constructor.name || 'Anonymous';

                // Get component's public properties (inputs/state)
                var props = {};
                var proto = Object.getPrototypeOf(ngComponent);
                Object.getOwnPropertyNames(ngComponent).forEach(function(key) {
                  if (!key.startsWith('_') && typeof ngComponent[key] !== 'function') {
                    props[key] = sanitizeValue(ngComponent[key], 2);
                  }
                });
                component.props = props;
              }
            }
          } catch (e) {
            // Angular debugging APIs may not be available
          }

          return component;
        }

        // =========================================
        // Svelte Component Extraction
        // =========================================

        function getSvelteComponent(el) {
          var component = { name: null, props: null, state: null, file: null };

          // Svelte stores component reference in __svelte
          if (el.__svelte_component_instance) {
            var sv = el.__svelte_component_instance;
            component.name = sv.constructor.name || 'SvelteComponent';

            // Svelte 3/4 props
            if (sv.$$.props) {
              var props = {};
              Object.keys(sv.$$.props).forEach(function(key) {
                props[key] = sanitizeValue(sv[key], 2);
              });
              component.props = props;
            }
          }

          // Try to get component name from class
          var svelteClass = Array.from(el.classList || []).find(function(c) {
            return c.startsWith('svelte-');
          });
          if (svelteClass && !component.name) {
            component.name = 'SvelteComponent (' + svelteClass + ')';
          }

          return component;
        }

        // =========================================
        // Utility Functions
        // =========================================

        function sanitizeValue(value, depth) {
          if (depth <= 0) return '[max depth]';

          if (value === null) return null;
          if (value === undefined) return undefined;

          var type = typeof value;

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
          if (value instanceof RegExp) {
            return value.toString();
          }
          if (value instanceof Element) {
            return '[Element: ' + value.tagName.toLowerCase() + ']';
          }
          if (Array.isArray(value)) {
            if (value.length > 10) {
              return '[Array(' + value.length + ')]';
            }
            return value.slice(0, 10).map(function(v) {
              return sanitizeValue(v, depth - 1);
            });
          }
          if (type === 'object') {
            return sanitizeObject(value, depth - 1);
          }

          return String(value);
        }

        function sanitizeObject(obj, depth) {
          if (depth <= 0) return '[max depth]';
          if (!obj || typeof obj !== 'object') return obj;

          var result = {};
          var keys = Object.keys(obj);

          // Limit number of keys to prevent huge objects
          if (keys.length > 20) {
            keys = keys.slice(0, 20);
            result['...'] = '(' + (Object.keys(obj).length - 20) + ' more keys)';
          }

          keys.forEach(function(key) {
            // Skip React internal keys and functions
            if (key.startsWith('__') || key.startsWith('$$')) return;
            try {
              result[key] = sanitizeValue(obj[key], depth);
            } catch (e) {
              result[key] = '[Error reading property]';
            }
          });

          return result;
        }

        // Extract component based on detected framework
        if (result.framework.name === 'react') {
          result.component = getReactComponent(element);
        } else if (result.framework.name === 'vue') {
          result.component = getVueComponent(element);
        } else if (result.framework.name === 'angular') {
          result.component = getAngularComponent(element);
        } else if (result.framework.name === 'svelte') {
          result.component = getSvelteComponent(element);
        }

        // Check for developer-provided context via data attribute
        if (result.dataAttributes['data-ai-context']) {
          try {
            var devContext = JSON.parse(result.dataAttributes['data-ai-context']);
            if (devContext.component) {
              result.component.name = result.component.name || devContext.component;
            }
            if (devContext.file) {
              result.component.file = devContext.file;
            }
            result.developerContext = devContext;
          } catch (e) {
            // Invalid JSON in data-ai-context
          }
        }
      }

      return result;
    })()
  `;
}

/**
 * Standalone framework detection (no element context needed)
 * Useful for just detecting which framework the page uses.
 */
export function getFrameworkOnlyCode() {
  return `
    (function() {
      // React detection
      if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        var version = null;
        if (window.React && window.React.version) {
          version = window.React.version;
        }
        return { name: 'react', version: version };
      }

      // Vue detection
      if (window.Vue) {
        return { name: 'vue', version: window.Vue.version || null };
      }
      if (window.__VUE__) {
        return { name: 'vue', version: '3.x' };
      }

      // Angular detection
      if (window.ng || window.getAllAngularRootElements) {
        var version = null;
        if (document.querySelector('[ng-version]')) {
          version = document.querySelector('[ng-version]').getAttribute('ng-version');
        }
        return { name: 'angular', version: version };
      }

      // Svelte detection
      if (document.querySelector('[class*="svelte-"]') || window.__svelte) {
        return { name: 'svelte', version: null };
      }

      // Check for framework indicators in DOM
      if (document.querySelector('[data-reactroot], [data-reactid]')) {
        return { name: 'react', version: null };
      }
      if (document.querySelector('[data-v-]')) {
        return { name: 'vue', version: null };
      }
      if (document.querySelector('[_ngcontent-]')) {
        return { name: 'angular', version: null };
      }

      return { name: null, version: null };
    })()
  `;
}
