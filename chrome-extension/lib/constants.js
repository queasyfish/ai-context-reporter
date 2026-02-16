/**
 * Shared Constants Module
 *
 * Centralizes all configuration constants used across the extension
 * to ensure consistency and easy maintenance.
 */

// Capture buffer limits
export const MAX_CONSOLE_ENTRIES = 50;
export const MAX_NETWORK_ENTRIES = 50;
export const MAX_INTERACTIONS = 500;

// Session recording limits (more generous for deep inspection)
export const MAX_SESSION_CONSOLE = 200;
export const MAX_SESSION_NETWORK = 100;
export const MAX_SESSION_INTERACTIONS = 500;
export const MAX_SESSION_SNAPSHOTS = 50;

// Content limits
export const MAX_TEXT_LENGTH = 500;
export const MAX_HTML_LENGTH = 1000;
export const MAX_STRING_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_STACK_LENGTH = 3000;
export const MAX_URL_LENGTH = 500;
export const MAX_BODY_LENGTH = 5000;
export const MAX_ATTR_LENGTH = 200;

// Object sanitization limits
export const MAX_OBJECT_DEPTH = 3;
export const MAX_OBJECT_KEYS = 20;
export const MAX_ARRAY_LENGTH = 10;

// CSS property subset for computed styles
export const COMPUTED_STYLE_PROPERTIES = [
  // Layout
  'display', 'position', 'float', 'clear',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  // Box model
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  // Typography
  'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
  // Visual
  'color', 'background-color', 'opacity', 'visibility',
  // Flexbox
  'flex-direction', 'justify-content', 'align-items'
];

// Storage keys
export const STORAGE_KEY_REPORTS = 'ai-context-reports';
export const STORAGE_KEY_SETTINGS = 'ai-context-settings';

// Export folder
export const BASE_EXPORT_FOLDER = 'ai-agent-reports';
