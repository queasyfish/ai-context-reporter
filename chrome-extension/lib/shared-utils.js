/**
 * Shared Utilities Module
 *
 * Contains common utility functions used across the extension:
 * - Object sanitization for safe serialization
 * - Element data extraction (CSS selector, XPath, etc.)
 * - Framework detection helpers
 *
 * These functions are designed to work both directly in content scripts
 * and as injectable code for devtools eval().
 */

import {
  MAX_STRING_LENGTH,
  MAX_OBJECT_DEPTH,
  MAX_OBJECT_KEYS,
  MAX_ARRAY_LENGTH,
  COMPUTED_STYLE_PROPERTIES
} from './constants.js';

// ========== SANITIZATION FUNCTIONS ==========

/**
 * Sanitizes a single value for safe JSON serialization.
 * Handles functions, DOM elements, dates, circular refs, etc.
 *
 * @param {*} value - Value to sanitize
 * @param {number} depth - Remaining recursion depth
 * @param {number} maxStringLength - Max string length before truncation
 * @returns {*} Sanitized value
 */
export function sanitizeValue(value, depth = MAX_OBJECT_DEPTH, maxStringLength = MAX_STRING_LENGTH) {
  if (depth <= 0) return '[max depth]';
  if (value === null) return null;
  if (value === undefined) return undefined;

  const type = typeof value;

  if (type === 'string') {
    return value.length > maxStringLength
      ? value.substring(0, maxStringLength) + '...'
      : value;
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
    return '[Error: ' + value.message + ']';
  }
  if (typeof Element !== 'undefined' && value instanceof Element) {
    return '[Element: ' + value.tagName.toLowerCase() + ']';
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      return '[Array(' + value.length + ')]';
    }
    return value.slice(0, MAX_ARRAY_LENGTH).map(function(v) {
      return sanitizeValue(v, depth - 1, maxStringLength);
    });
  }
  if (type === 'object') {
    return sanitizeObject(value, depth - 1, maxStringLength);
  }

  return String(value);
}

/**
 * Sanitizes an object for safe JSON serialization.
 * Limits keys, filters internal properties, handles circular refs.
 *
 * @param {Object} obj - Object to sanitize
 * @param {number} depth - Remaining recursion depth
 * @param {number} maxStringLength - Max string length for nested values
 * @returns {Object} Sanitized object
 */
export function sanitizeObject(obj, depth = MAX_OBJECT_DEPTH, maxStringLength = MAX_STRING_LENGTH) {
  if (depth <= 0) return '[max depth]';
  if (!obj || typeof obj !== 'object') return obj;

  const result = {};
  let keys = Object.keys(obj);

  // Limit number of keys
  if (keys.length > MAX_OBJECT_KEYS) {
    keys = keys.slice(0, MAX_OBJECT_KEYS);
    result['...'] = '(' + (Object.keys(obj).length - MAX_OBJECT_KEYS) + ' more keys)';
  }

  keys.forEach(function(key) {
    // Skip internal/framework keys
    if (key.startsWith('__') || key.startsWith('$$')) return;
    try {
      result[key] = sanitizeValue(obj[key], depth, maxStringLength);
    } catch (e) {
      result[key] = '[Error reading property]';
    }
  });

  return result;
}

// ========== ELEMENT UTILITIES ==========

/**
 * Generates a CSS selector path for an element.
 *
 * @param {Element} el - Target element
 * @returns {string} Full CSS selector path
 */
export function getCssSelector(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';

  const path = [];
  let current = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += '#' + current.id;
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }

    if (current.parentElement) {
      const siblings = [];
      let child = current.parentElement.firstElementChild;
      while (child) {
        if (child.tagName === current.tagName) {
          siblings.push(child);
        }
        child = child.nextElementSibling;
      }
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += ':nth-of-type(' + index + ')';
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * Generates an XPath for an element.
 *
 * @param {Element} el - Target element
 * @returns {string} Absolute XPath
 */
export function getXPath(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';

  const path = [];
  let current = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.tagName.toLowerCase();
    let index = 1;
    let sibling = current.previousElementSibling;

    while (sibling) {
      if (sibling.tagName === current.tagName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    let attrs = '';
    if (current.id) {
      attrs += '[@id="' + current.id + '"]';
    }
    if (current.className && typeof current.className === 'string') {
      const classStr = current.className.trim();
      if (classStr) {
        attrs += '[@class="' + classStr + '"]';
      }
    }

    path.unshift(tagName + attrs + '[' + index + ']');
    current = current.parentElement;
  }

  return '/' + path.join('/');
}

/**
 * Extracts computed styles for an element.
 *
 * @param {Element} el - Target element
 * @returns {Object} Key-value pairs of computed styles
 */
export function getComputedStyles(el) {
  const computed = window.getComputedStyle(el);
  const result = {};

  for (let i = 0; i < COMPUTED_STYLE_PROPERTIES.length; i++) {
    const prop = COMPUTED_STYLE_PROPERTIES[i];
    result[prop] = computed.getPropertyValue(prop);
  }

  return result;
}

/**
 * Gets a short identifier for an element (tag + id/class).
 *
 * @param {Element} el - Target element
 * @returns {string} Short element identifier
 */
export function getElementId(el) {
  const tag = el.tagName.toLowerCase();
  let identifier = tag;

  if (el.id) {
    identifier += '#' + el.id;
  } else if (el.className && typeof el.className === 'string') {
    const firstClass = el.className.trim().split(/\s+/)[0];
    if (firstClass) {
      identifier += '.' + firstClass;
    }
  }

  return identifier;
}

/**
 * Extracts direct text content from an element.
 *
 * @param {Element} el - Target element
 * @param {number} maxLength - Max length before truncation
 * @returns {string} Truncated text content
 */
export function getTextContent(el, maxLength = 30) {
  let textContent = '';

  // Get direct text nodes only
  for (let i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
      textContent += el.childNodes[i].textContent;
    }
  }
  textContent = textContent.trim();

  // Fallback to innerText if no direct text
  if (!textContent && el.innerText) {
    textContent = el.innerText.trim();
  }

  // Clean and truncate
  if (textContent) {
    textContent = textContent.replace(/\s+/g, ' ').substring(0, maxLength);
    if (el.innerText && el.innerText.trim().length > maxLength) {
      textContent += '...';
    }
  }

  return textContent;
}

/**
 * Extracts all data-* attributes from an element.
 *
 * @param {Element} el - Target element
 * @returns {Object} Key-value pairs of data attributes
 */
export function getDataAttributes(el) {
  const attrs = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name.startsWith('data-')) {
      attrs[attr.name] = attr.value;
    }
  }
  return attrs;
}

/**
 * Attempts to get event listener types (only works in DevTools console).
 *
 * @param {Element} el - Target element
 * @returns {string[]} Array of event type names
 */
export function getEventListenerTypes(el) {
  const listeners = [];
  try {
    if (typeof getEventListeners === 'function') {
      const elListeners = getEventListeners(el);
      listeners.push(...Object.keys(elListeners));
    }
  } catch (e) {
    // getEventListeners only available in DevTools console
  }
  return listeners;
}

// ========== INJECTABLE CODE GENERATORS ==========

/**
 * Returns injectable code string for sanitization functions.
 * Use this when you need to run sanitization in page context via eval().
 *
 * @returns {string} JavaScript code string
 */
export function getSanitizationCode() {
  return `
    var MAX_STRING_LENGTH = ${MAX_STRING_LENGTH};
    var MAX_OBJECT_KEYS = ${MAX_OBJECT_KEYS};
    var MAX_ARRAY_LENGTH = ${MAX_ARRAY_LENGTH};

    function sanitizeValue(value, depth, maxStringLength) {
      if (depth === undefined) depth = ${MAX_OBJECT_DEPTH};
      if (maxStringLength === undefined) maxStringLength = MAX_STRING_LENGTH;
      if (depth <= 0) return '[max depth]';
      if (value === null) return null;
      if (value === undefined) return undefined;

      var type = typeof value;

      if (type === 'string') {
        return value.length > maxStringLength
          ? value.substring(0, maxStringLength) + '...'
          : value;
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
        return '[Error: ' + value.message + ']';
      }
      if (value instanceof Element) {
        return '[Element: ' + value.tagName.toLowerCase() + ']';
      }
      if (Array.isArray(value)) {
        if (value.length > MAX_ARRAY_LENGTH) {
          return '[Array(' + value.length + ')]';
        }
        return value.slice(0, MAX_ARRAY_LENGTH).map(function(v) {
          return sanitizeValue(v, depth - 1, maxStringLength);
        });
      }
      if (type === 'object') {
        return sanitizeObject(value, depth - 1, maxStringLength);
      }

      return String(value);
    }

    function sanitizeObject(obj, depth, maxStringLength) {
      if (depth === undefined) depth = ${MAX_OBJECT_DEPTH};
      if (maxStringLength === undefined) maxStringLength = MAX_STRING_LENGTH;
      if (depth <= 0) return '[max depth]';
      if (!obj || typeof obj !== 'object') return obj;

      var result = {};
      var keys = Object.keys(obj);

      if (keys.length > MAX_OBJECT_KEYS) {
        keys = keys.slice(0, MAX_OBJECT_KEYS);
        result['...'] = '(' + (Object.keys(obj).length - MAX_OBJECT_KEYS) + ' more keys)';
      }

      keys.forEach(function(key) {
        if (key.startsWith('__') || key.startsWith('$$')) return;
        try {
          result[key] = sanitizeValue(obj[key], depth, maxStringLength);
        } catch (e) {
          result[key] = '[Error reading property]';
        }
      });

      return result;
    }
  `;
}

/**
 * Returns injectable code string for element utilities.
 * Use this when you need to run element capture in page context via eval().
 *
 * @returns {string} JavaScript code string
 */
export function getElementUtilsCode() {
  const propsJson = JSON.stringify(COMPUTED_STYLE_PROPERTIES);

  return `
    var COMPUTED_STYLE_PROPERTIES = ${propsJson};

    function getCssSelector(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';

      var path = [];
      var current = el;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        var selector = current.tagName.toLowerCase();

        if (current.id) {
          selector += '#' + current.id;
        }

        if (current.className && typeof current.className === 'string') {
          var classes = current.className.trim().split(/\\s+/).filter(function(c) { return c; });
          if (classes.length > 0) {
            selector += '.' + classes.join('.');
          }
        }

        if (current.parentElement) {
          var siblings = [];
          var child = current.parentElement.firstElementChild;
          while (child) {
            if (child.tagName === current.tagName) {
              siblings.push(child);
            }
            child = child.nextElementSibling;
          }
          if (siblings.length > 1) {
            var index = siblings.indexOf(current) + 1;
            selector += ':nth-of-type(' + index + ')';
          }
        }

        path.unshift(selector);
        current = current.parentElement;
      }

      return path.join(' > ');
    }

    function getXPath(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';

      var path = [];
      var current = el;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        var tagName = current.tagName.toLowerCase();
        var index = 1;
        var sibling = current.previousElementSibling;

        while (sibling) {
          if (sibling.tagName === current.tagName) {
            index++;
          }
          sibling = sibling.previousElementSibling;
        }

        var attrs = '';
        if (current.id) {
          attrs += '[@id="' + current.id + '"]';
        }
        if (current.className && typeof current.className === 'string') {
          var classStr = current.className.trim();
          if (classStr) {
            attrs += '[@class="' + classStr + '"]';
          }
        }

        path.unshift(tagName + attrs + '[' + index + ']');
        current = current.parentElement;
      }

      return '/' + path.join('/');
    }

    function getComputedStyles(el) {
      var computed = window.getComputedStyle(el);
      var result = {};

      for (var i = 0; i < COMPUTED_STYLE_PROPERTIES.length; i++) {
        var prop = COMPUTED_STYLE_PROPERTIES[i];
        result[prop] = computed.getPropertyValue(prop);
      }

      return result;
    }

    function getElementId(el) {
      var tag = el.tagName.toLowerCase();
      var identifier = tag;

      if (el.id) {
        identifier += '#' + el.id;
      } else if (el.className && typeof el.className === 'string') {
        var firstClass = el.className.trim().split(/\\s+/)[0];
        if (firstClass) {
          identifier += '.' + firstClass;
        }
      }

      return identifier;
    }

    function getTextContent(el, maxLength) {
      if (maxLength === undefined) maxLength = 30;
      var textContent = '';

      for (var i = 0; i < el.childNodes.length; i++) {
        if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
          textContent += el.childNodes[i].textContent;
        }
      }
      textContent = textContent.trim();

      if (!textContent && el.innerText) {
        textContent = el.innerText.trim();
      }

      if (textContent) {
        textContent = textContent.replace(/\\s+/g, ' ').substring(0, maxLength);
        if (el.innerText && el.innerText.trim().length > maxLength) {
          textContent += '...';
        }
      }

      return textContent;
    }

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

    function getEventListenerTypes(el) {
      var listeners = [];
      try {
        if (typeof getEventListeners === 'function') {
          var elListeners = getEventListeners(el);
          listeners = Object.keys(elListeners);
        }
      } catch (e) {}
      return listeners;
    }
  `;
}
