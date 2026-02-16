/**
 * Interaction Recorder Module
 *
 * Captures user interactions (clicks, inputs, form submits, navigation, scrolls)
 * during a recording session. Works with session-recorder.js to provide a complete
 * picture of user behavior leading up to an issue.
 */

/**
 * Returns injectable code that sets up interaction recording in the page context.
 * This must be injected AFTER session-recorder.js.
 *
 * @returns {string} JavaScript code to inject
 */
export function getInteractionRecorderInjectorCode() {
  return `
    (function() {
      // Don't inject twice
      if (window.__AI_CONTEXT_INTERACTIONS_INITIALIZED__) return;
      window.__AI_CONTEXT_INTERACTIONS_INITIALIZED__ = true;

      // Ensure session recorder is initialized
      if (!window.__AI_CONTEXT_ADD_INTERACTION__) {
        console.warn('[AI Context] Session recorder not initialized, skipping interaction capture');
        return;
      }

      var addInteraction = window.__AI_CONTEXT_ADD_INTERACTION__;
      var lastScrollTime = 0;
      var lastScrollTarget = null;

      /**
       * Generate a CSS selector for an element.
       * Tries to create a unique, readable selector.
       */
      function getSelector(element) {
        if (!element || element === document.body || element === document.documentElement) {
          return 'body';
        }

        // Check for ID
        if (element.id) {
          return '#' + CSS.escape(element.id);
        }

        // Check for unique test ID or other identifiers
        var testId = element.getAttribute('data-testid') ||
                     element.getAttribute('data-test-id') ||
                     element.getAttribute('data-cy') ||
                     element.getAttribute('data-test');
        if (testId) {
          return '[data-testid="' + testId + '"]';
        }

        // Build selector with tag name and classes
        var selector = element.tagName.toLowerCase();

        // Add meaningful classes (skip utility classes)
        var meaningfulClasses = Array.from(element.classList || [])
          .filter(function(c) {
            // Skip common utility/framework classes
            return c.length > 2 &&
                   !/^(p|m|px|py|mx|my|w|h|flex|grid|text|bg|border|rounded|shadow|hover|focus|active|disabled|hidden|visible|overflow|cursor|transition|transform|animate|z-|col-|row-|gap-|space-|font-|leading-|tracking-|opacity-|scale-|rotate-|translate-|skew-|origin-)[0-9-]*$/.test(c) &&
                   !/^(sm:|md:|lg:|xl:|2xl:)/.test(c);
          })
          .slice(0, 2);

        if (meaningfulClasses.length > 0) {
          selector += '.' + meaningfulClasses.map(function(c) {
            return CSS.escape(c);
          }).join('.');
        }

        // Add type attribute for inputs
        if (element.tagName === 'INPUT' && element.type) {
          selector += '[type="' + element.type + '"]';
        }

        // Add name attribute if present
        if (element.name) {
          selector += '[name="' + CSS.escape(element.name) + '"]';
        }

        // Add role if present
        if (element.getAttribute('role')) {
          selector += '[role="' + element.getAttribute('role') + '"]';
        }

        // Check if selector is unique
        try {
          var matches = document.querySelectorAll(selector);
          if (matches.length === 1) {
            return selector;
          }
        } catch (e) {}

        // Add nth-child if not unique
        var parent = element.parentElement;
        if (parent) {
          var siblings = Array.from(parent.children);
          var index = siblings.indexOf(element);
          if (index >= 0) {
            var sameTagSiblings = siblings.filter(function(s) {
              return s.tagName === element.tagName;
            });
            if (sameTagSiblings.length > 1) {
              var tagIndex = sameTagSiblings.indexOf(element);
              selector += ':nth-of-type(' + (tagIndex + 1) + ')';
            }
          }
        }

        // Limit selector length
        if (selector.length > 80) {
          selector = selector.substring(0, 77) + '...';
        }

        return selector;
      }

      /**
       * Get a human-readable label for an element.
       */
      function getElementLabel(element) {
        // Check for aria-label
        var ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.substring(0, 50);

        // Check for title
        if (element.title) return element.title.substring(0, 50);

        // Check for button/link text
        var text = (element.innerText || element.textContent || '').trim();
        if (text && text.length < 50) return text;
        if (text && text.length >= 50) return text.substring(0, 47) + '...';

        // Check for placeholder
        if (element.placeholder) return element.placeholder.substring(0, 50);

        // Check for alt text
        if (element.alt) return element.alt.substring(0, 50);

        return null;
      }

      /**
       * Format interaction data for logging.
       */
      function formatInteraction(type, element, extras) {
        var selector = getSelector(element);
        var label = getElementLabel(element);

        var interaction = {
          type: type,
          target: selector,
          timestamp: Date.now()
        };

        if (label) {
          interaction.label = label;
        }

        if (extras) {
          Object.keys(extras).forEach(function(key) {
            interaction[key] = extras[key];
          });
        }

        return interaction;
      }

      // Click capture
      document.addEventListener('click', function(event) {
        var target = event.target;
        if (!target) return;

        // Skip if clicking on extension elements
        if (target.closest && target.closest('[data-ai-context-extension]')) return;

        var interaction = formatInteraction('click', target);

        // Add click position for debugging
        interaction.x = event.clientX;
        interaction.y = event.clientY;

        addInteraction(interaction);
      }, true);

      // Double-click capture
      document.addEventListener('dblclick', function(event) {
        var target = event.target;
        if (!target) return;

        addInteraction(formatInteraction('dblclick', target));
      }, true);

      // Input capture (debounced)
      var inputDebounce = {};
      document.addEventListener('input', function(event) {
        var target = event.target;
        if (!target) return;

        // Skip password fields for privacy
        if (target.type === 'password') return;

        // Debounce rapid input
        var selector = getSelector(target);
        clearTimeout(inputDebounce[selector]);

        inputDebounce[selector] = setTimeout(function() {
          var value = target.value || '';
          // Truncate long values
          if (value.length > 100) {
            value = value.substring(0, 97) + '...';
          }

          // Mask sensitive fields
          var isSensitive = /email|phone|ssn|credit|card|cvv|pin/i.test(target.name || '') ||
                           /email|phone|ssn|credit|card|cvv|pin/i.test(target.id || '');
          if (isSensitive && value) {
            value = '[masked]';
          }

          addInteraction(formatInteraction('input', target, { value: value }));
        }, 300);
      }, true);

      // Change capture (for selects and checkboxes)
      document.addEventListener('change', function(event) {
        var target = event.target;
        if (!target) return;

        var value;
        if (target.type === 'checkbox' || target.type === 'radio') {
          value = target.checked ? 'checked' : 'unchecked';
        } else if (target.tagName === 'SELECT') {
          value = target.options[target.selectedIndex]
            ? target.options[target.selectedIndex].text
            : target.value;
        } else {
          return; // Other inputs handled by 'input' event
        }

        addInteraction(formatInteraction('change', target, { value: value }));
      }, true);

      // Form submit capture
      document.addEventListener('submit', function(event) {
        var target = event.target;
        if (!target || target.tagName !== 'FORM') return;

        var formData = {};
        try {
          var inputs = target.querySelectorAll('input, select, textarea');
          inputs.forEach(function(input) {
            if (input.name && input.type !== 'password') {
              var value = input.value;
              if (value && value.length > 50) {
                value = value.substring(0, 47) + '...';
              }
              // Mask sensitive fields
              if (/email|phone|ssn|credit|card/i.test(input.name) && value) {
                value = '[masked]';
              }
              formData[input.name] = value;
            }
          });
        } catch (e) {}

        var interaction = formatInteraction('submit', target, {
          formData: Object.keys(formData).length > 0 ? formData : null
        });

        // Add form action
        if (target.action) {
          interaction.action = target.action.substring(0, 200);
        }

        addInteraction(interaction);
      }, true);

      // Focus capture (for form field navigation)
      document.addEventListener('focus', function(event) {
        var target = event.target;
        if (!target) return;

        // Only capture focus on form elements
        if (!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;

        addInteraction(formatInteraction('focus', target));
      }, true);

      // Blur capture (for form field exits)
      document.addEventListener('blur', function(event) {
        var target = event.target;
        if (!target) return;

        // Only capture blur on form elements
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

        addInteraction(formatInteraction('blur', target));
      }, true);

      // Scroll capture (throttled)
      var scrollTimeout = null;
      window.addEventListener('scroll', function() {
        var now = Date.now();

        // Throttle to max once per second
        if (now - lastScrollTime < 1000) {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(function() {
            recordScroll();
          }, 1000);
          return;
        }

        recordScroll();
      }, { passive: true });

      function recordScroll() {
        lastScrollTime = Date.now();
        var scrollY = window.scrollY || document.documentElement.scrollTop;
        var scrollX = window.scrollX || document.documentElement.scrollLeft;
        var maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
        var scrollPercent = maxScrollY > 0 ? Math.round((scrollY / maxScrollY) * 100) : 0;

        addInteraction({
          type: 'scroll',
          target: 'window',
          timestamp: Date.now(),
          scrollY: Math.round(scrollY),
          scrollX: Math.round(scrollX),
          scrollPercent: scrollPercent
        });
      }

      // Navigation capture (pushState/replaceState)
      var originalPushState = history.pushState;
      var originalReplaceState = history.replaceState;

      history.pushState = function() {
        var result = originalPushState.apply(this, arguments);
        recordNavigation('pushState');
        return result;
      };

      history.replaceState = function() {
        var result = originalReplaceState.apply(this, arguments);
        recordNavigation('replaceState');
        return result;
      };

      window.addEventListener('popstate', function() {
        recordNavigation('popstate');
      });

      function recordNavigation(trigger) {
        addInteraction({
          type: 'navigation',
          target: 'history',
          timestamp: Date.now(),
          url: location.href,
          trigger: trigger
        });
      }

      // Keyboard shortcuts capture (for important keys)
      document.addEventListener('keydown', function(event) {
        // Only capture shortcuts with modifiers
        if (!event.ctrlKey && !event.metaKey && !event.altKey) return;

        // Skip if typing in an input
        var target = event.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        var key = [];
        if (event.ctrlKey) key.push('Ctrl');
        if (event.metaKey) key.push('Cmd');
        if (event.altKey) key.push('Alt');
        if (event.shiftKey) key.push('Shift');
        key.push(event.key);

        addInteraction({
          type: 'keydown',
          target: getSelector(target),
          timestamp: Date.now(),
          key: key.join('+')
        });
      }, true);

      // Copy/paste capture
      document.addEventListener('copy', function(event) {
        addInteraction({
          type: 'copy',
          target: getSelector(event.target),
          timestamp: Date.now()
        });
      }, true);

      document.addEventListener('paste', function(event) {
        addInteraction({
          type: 'paste',
          target: getSelector(event.target),
          timestamp: Date.now()
        });
      }, true);

      // Drag and drop capture
      document.addEventListener('dragstart', function(event) {
        addInteraction({
          type: 'dragstart',
          target: getSelector(event.target),
          timestamp: Date.now()
        });
      }, true);

      document.addEventListener('drop', function(event) {
        addInteraction({
          type: 'drop',
          target: getSelector(event.target),
          timestamp: Date.now(),
          x: event.clientX,
          y: event.clientY
        });
      }, true);

      // Context menu capture (right-click)
      document.addEventListener('contextmenu', function(event) {
        addInteraction({
          type: 'contextmenu',
          target: getSelector(event.target),
          timestamp: Date.now(),
          x: event.clientX,
          y: event.clientY
        });
      }, true);

      console.info('[AI Context] Interaction recorder initialized');
    })();
  `;
}

/**
 * Returns code to check if interaction recorder is initialized.
 *
 * @returns {string} JavaScript code to execute
 */
export function getInteractionRecorderStatusCode() {
  return `!!window.__AI_CONTEXT_INTERACTIONS_INITIALIZED__`;
}
