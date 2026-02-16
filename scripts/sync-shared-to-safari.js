#!/usr/bin/env node
/**
 * Sync Shared Code to Safari Extension
 *
 * Safari WebExtensions don't support ES modules in content scripts,
 * so we need to copy/inline the shared code into Safari's files.
 *
 * Run this script after modifying shared code in chrome-extension/lib/
 */

const fs = require('fs');
const path = require('path');

const CHROME_LIB = path.join(__dirname, '../chrome-extension/lib');
const SAFARI_EXT = path.join(__dirname, '../safari-extension/Claude Context Reporter/Claude Context Reporter Extension');

// Read shared utilities and constants
const constantsPath = path.join(CHROME_LIB, 'constants.js');
const sharedUtilsPath = path.join(CHROME_LIB, 'shared-utils.js');

console.log('Syncing shared code to Safari extension...');

// Read the files
const constantsContent = fs.readFileSync(constantsPath, 'utf8');
const sharedUtilsContent = fs.readFileSync(sharedUtilsPath, 'utf8');

// Extract just the constant values (without ES module syntax)
const constantsOnly = constantsContent
  .replace(/^\/\*\*[\s\S]*?\*\/\n/m, '') // Remove JSDoc header
  .replace(/export const /g, 'const ')   // Remove exports
  .replace(/import .+?;?\n/g, '');       // Remove imports

// Write to Safari as a standalone file
const safariConstantsPath = path.join(SAFARI_EXT, 'shared-constants.js');
const safariConstantsContent = `// Auto-generated from chrome-extension/lib/constants.js
// DO NOT EDIT - Run scripts/sync-shared-to-safari.js to update

${constantsOnly}`;

fs.writeFileSync(safariConstantsPath, safariConstantsContent);
console.log('Created:', safariConstantsPath);

// Extract sanitization and element utility functions
// For Safari, we need ES5-compatible code without module imports

const safariSharedUtilsContent = `// Auto-generated from chrome-extension/lib/shared-utils.js
// DO NOT EDIT - Run scripts/sync-shared-to-safari.js to update

(function() {
  "use strict";

  // Constants
  var MAX_STRING_LENGTH = 200;
  var MAX_OBJECT_DEPTH = 3;
  var MAX_OBJECT_KEYS = 20;
  var MAX_ARRAY_LENGTH = 10;
  var COMPUTED_STYLE_PROPERTIES = [
    'display', 'position', 'float', 'clear',
    'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
    'color', 'background-color', 'opacity', 'visibility',
    'flex-direction', 'justify-content', 'align-items'
  ];

  // ========== SANITIZATION FUNCTIONS ==========

  function sanitizeValue(value, depth, maxStringLength) {
    if (depth === undefined) depth = MAX_OBJECT_DEPTH;
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
    if (depth === undefined) depth = MAX_OBJECT_DEPTH;
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

  // ========== ELEMENT UTILITIES ==========

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

  // Export to global scope for Safari content script
  window.__AI_CONTEXT_SHARED__ = {
    sanitizeValue: sanitizeValue,
    sanitizeObject: sanitizeObject,
    getCssSelector: getCssSelector,
    getXPath: getXPath,
    getComputedStyles: getComputedStyles,
    getElementId: getElementId,
    getTextContent: getTextContent,
    getDataAttributes: getDataAttributes,
    COMPUTED_STYLE_PROPERTIES: COMPUTED_STYLE_PROPERTIES
  };
})();
`;

const safariSharedUtilsPath = path.join(SAFARI_EXT, 'shared-utils.js');
fs.writeFileSync(safariSharedUtilsPath, safariSharedUtilsContent);
console.log('Created:', safariSharedUtilsPath);

console.log('\\nSync complete! Remember to:');
console.log('1. Add shared-utils.js to Safari manifest.json content_scripts');
console.log('2. Update Safari content.js to use window.__AI_CONTEXT_SHARED__.*');
