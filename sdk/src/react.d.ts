/**
 * AI Context SDK - React Integration TypeScript Definitions
 */

import { ComponentType, ReactNode } from 'react';
import { AIContextReporter, ComponentRegistration } from './ai-context-sdk';

export interface AIContextOptions {
  /** File path relative to repository root */
  file: string;
  /** Component description */
  description?: string;
  /** Component tags */
  tags?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Higher-Order Component that adds AI context to a component.
 */
export function withAIContext<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: AIContextOptions
): ComponentType<P>;

/**
 * Hook that registers the current component with AI context.
 */
export function useAIContext(options: AIContextOptions, deps?: unknown[]): void;

/**
 * Hook that captures component state for AI context.
 */
export function useAIState(name: string, state: unknown, deps?: unknown[]): void;

/**
 * Creates props for adding AI context to a DOM element.
 */
export function aiContextProps(options: AIContextOptions & { component?: string }): {
  'data-ai-context': string;
};

/**
 * Initialize the React integration with a React instance.
 */
export function initReact(React: typeof import('react')): void;

/**
 * Context provider for AI configuration.
 */
export const AIContextProvider: ComponentType<{
  config: {
    repository?: string;
    branch?: string;
    commit?: string;
    environment?: string;
  };
  children: ReactNode;
}>;

/**
 * Context consumer for AI configuration.
 */
export const AIContextConsumer: ComponentType<{
  children: (config: Record<string, unknown> | null) => ReactNode;
}>;

/**
 * Hook to get AI context configuration.
 */
export function useAIContextConfig(): Record<string, unknown> | null;
