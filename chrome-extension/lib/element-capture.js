/**
 * Element Capture Module
 *
 * Provides code generation for extracting element data via
 * chrome.devtools.inspectedWindow.eval(). The returned code
 * executes in the inspected page context with access to $0.
 */

import { getElementUtilsCode } from './shared-utils.js';

/**
 * Returns an eval-ready code string that extracts comprehensive
 * element data from the currently selected element ($0).
 *
 * @returns {string} JavaScript code string to execute via eval
 *
 * Returns object structure:
 * {
 *   selector: string,      // Full CSS selector path from html > body
 *   xpath: string,         // Absolute XPath from /html[1]/body[1]
 *   computedStyles: {},    // Filtered subset of computed styles
 *   url: string            // location.href
 * }
 *
 * Returns null if no element is selected ($0 is null/undefined).
 */
export function getElementCaptureCode() {
  return `
    (function() {
      if (!$0) return null;

      // Element utilities (injected from shared-utils)
      ${getElementUtilsCode()}

      var elemId = getElementId($0);
      var textContent = getTextContent($0);

      return {
        selector: getCssSelector($0),
        xpath: getXPath($0),
        computedStyles: getComputedStyles($0),
        url: location.href,
        tagName: $0.tagName.toLowerCase(),
        elementId: elemId,
        textContent: textContent
      };
    })()
  `;
}
