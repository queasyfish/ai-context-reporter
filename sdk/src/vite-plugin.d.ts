/**
 * AI Context SDK - Vite Plugin TypeScript Definitions
 */

import { Plugin } from 'vite';

export interface AIContextPluginOptions {
  /** Git repository URL */
  repository?: string;
  /** Git branch (auto-detected if not provided) */
  branch?: string;
  /** Glob patterns for files to process */
  include?: string[];
  /** Glob patterns for files to exclude */
  exclude?: string[];
  /** Whether to inject the SDK script (default: true) */
  injectSDK?: boolean;
  /** Whether to add file paths to components (default: true) */
  addFilePaths?: boolean;
  /** Only enable in development mode (default: true) */
  devOnly?: boolean;
}

/**
 * Vite plugin for AI Context SDK integration.
 */
export function aiContextPlugin(options?: AIContextPluginOptions): Plugin;

/**
 * Create a component registration manifest from source files.
 */
export function createComponentManifest(
  files: string[],
  projectRoot?: string
): Record<string, { file: string }>;

export default aiContextPlugin;
