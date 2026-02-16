/**
 * AI Context SDK - Vue Integration TypeScript Definitions
 */

import { Plugin, Directive, ObjectDirective } from 'vue';
import { AIContextReporter } from './ai-context-sdk';

export interface VueAIContextOptions {
  /** File path relative to repository root */
  file: string;
  /** Component description */
  description?: string;
  /** Component tags */
  tags?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface AIContextPluginOptions {
  /** Git repository URL */
  repository?: string;
  /** Current git branch */
  branch?: string;
  /** Current git commit hash */
  commit?: string;
  /** Environment name */
  environment?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Vue plugin that installs AI Context integration.
 */
export const AIContextPlugin: Plugin;

/**
 * Vue directive for adding AI context to elements.
 */
export const aiContextDirective: ObjectDirective<HTMLElement, VueAIContextOptions>;

/**
 * Vue 3 Composition API composable for AI context.
 */
export function useAIContext(options?: VueAIContextOptions): {
  /**
   * Capture state for AI debugging.
   */
  captureState(name: string, value: unknown): void;

  /**
   * Set custom context.
   */
  setContext(key: string, value: unknown): void;

  /**
   * Get the reporter instance.
   */
  getReporter(): AIContextReporter | null;
};

/**
 * Vue mixin for Vue 2 class components or options API.
 */
export function aiContextMixin(options: VueAIContextOptions): {
  mounted(): void;
};

/**
 * Create context attribute helper for templates.
 */
export function aiContextAttr(options: VueAIContextOptions & { component?: string }): string;

export default AIContextPlugin;
