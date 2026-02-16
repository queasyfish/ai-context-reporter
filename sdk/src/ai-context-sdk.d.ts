/**
 * AI Context SDK TypeScript Definitions
 */

export interface AIContextConfig {
  /** Git repository URL */
  repository?: string;
  /** Current git branch */
  branch?: string;
  /** Current git commit hash */
  commit?: string;
  /** Environment name */
  environment?: 'development' | 'staging' | 'production' | string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ComponentRegistration {
  /** File path relative to repository root */
  file: string;
  /** Human-readable description */
  description?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface StateSnapshot {
  /** Name of the state slice */
  name: string;
  /** Current state value */
  value: unknown;
  /** Timestamp when captured */
  timestamp: number;
}

export interface FullContext {
  config: AIContextConfig;
  components: Record<string, ComponentRegistration>;
  stateSnapshots: StateSnapshot[];
  customContext: Record<string, unknown>;
  timestamp: number;
}

export class AIContextReporter {
  constructor(config?: AIContextConfig);

  /** Current configuration */
  config: AIContextConfig;

  /**
   * Register a component with its file path and metadata.
   */
  registerComponent(componentName: string, registration: ComponentRegistration): this;

  /**
   * Register multiple components at once.
   */
  registerComponents(components: Record<string, ComponentRegistration>): this;

  /**
   * Get registration info for a component.
   */
  getComponent(componentName: string): ComponentRegistration | null;

  /**
   * Get all registered components.
   */
  getAllComponents(): Record<string, ComponentRegistration>;

  /**
   * Capture a snapshot of application state.
   */
  captureState(name: string, value: unknown): this;

  /**
   * Get all captured state snapshots.
   */
  getStateSnapshots(): StateSnapshot[];

  /**
   * Clear all state snapshots.
   */
  clearStateSnapshots(): this;

  /**
   * Set custom context.
   */
  setContext(key: string, value: unknown): this;

  /**
   * Get a custom context value.
   */
  getContext(key: string): unknown;

  /**
   * Get all custom context.
   */
  getAllContext(): Record<string, unknown>;

  /**
   * Get the full context object for the extension.
   */
  getFullContext(): FullContext;
}

/**
 * Create data-ai-context attribute value.
 */
export function createContextAttribute(context: {
  component?: string;
  file?: string;
  description?: string;
  [key: string]: unknown;
}): string;

/**
 * Get the global AIContextReporter instance.
 */
export function getReporter(): AIContextReporter | null;

/**
 * Check if the AI Context Reporter extension is installed.
 */
export function isExtensionInstalled(): boolean;

export default AIContextReporter;
