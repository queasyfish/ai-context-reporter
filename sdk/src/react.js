/**
 * AI Context SDK - React Integration
 *
 * Provides React-specific helpers for the AI Context Reporter.
 * Includes HOC, hooks, and context provider for automatic component registration.
 *
 * @example
 * ```jsx
 * import { withAIContext, useAIContext } from 'ai-context-sdk/react';
 *
 * // Using HOC
 * const UserCard = withAIContext(({ user }) => (
 *   <div>{user.name}</div>
 * ), { file: 'src/components/UserCard.tsx' });
 *
 * // Using hook
 * function UserCard({ user }) {
 *   useAIContext({ file: 'src/components/UserCard.tsx' });
 *   return <div>{user.name}</div>;
 * }
 * ```
 */

import { getReporter, createContextAttribute } from './ai-context-sdk.js';

/**
 * @typedef {Object} AIContextOptions
 * @property {string} file - File path relative to repository root
 * @property {string} [description] - Component description
 * @property {string[]} [tags] - Component tags
 * @property {Record<string, unknown>} [metadata] - Additional metadata
 */

/**
 * Higher-Order Component that adds AI context to a component.
 * Automatically registers the component and adds a data-ai-context wrapper.
 *
 * @param {React.ComponentType} WrappedComponent - The component to wrap
 * @param {AIContextOptions} options - Context options including file path
 * @returns {React.ComponentType} Wrapped component with AI context
 *
 * @example
 * ```jsx
 * const UserCard = withAIContext(
 *   ({ user }) => <div className="user-card">{user.name}</div>,
 *   {
 *     file: 'src/components/UserCard.tsx',
 *     description: 'Displays user profile information',
 *     tags: ['user', 'profile']
 *   }
 * );
 * ```
 */
function withAIContext(WrappedComponent, options) {
  if (!options || !options.file) {
    console.error('withAIContext: options.file is required');
    return WrappedComponent;
  }

  // Get component name for registration
  const componentName = WrappedComponent.displayName ||
                        WrappedComponent.name ||
                        'AnonymousComponent';

  // Register with reporter if available
  const reporter = getReporter();
  if (reporter) {
    reporter.registerComponent(componentName, options);
  }

  // Create the wrapper component
  function AIContextWrapper(props) {
    // Build context attribute
    const contextValue = {
      component: componentName,
      file: options.file,
      description: options.description,
      ...options.metadata
    };

    // Use React if available (allows this to work without explicit React import in some bundlers)
    const React = AIContextWrapper._react;
    if (!React) {
      // Fallback: just render the component without wrapper
      return WrappedComponent(props);
    }

    return React.createElement(
      'div',
      {
        'data-ai-context': JSON.stringify(contextValue),
        style: { display: 'contents' } // Invisible wrapper
      },
      React.createElement(WrappedComponent, props)
    );
  }

  // Copy static properties
  AIContextWrapper.displayName = `withAIContext(${componentName})`;
  AIContextWrapper._wrappedComponent = WrappedComponent;
  AIContextWrapper._aiContextOptions = options;

  return AIContextWrapper;
}

/**
 * React hook that registers the current component with AI context.
 * Call this at the top of your functional component.
 *
 * @param {AIContextOptions} options - Context options including file path
 * @param {Array} [deps=[]] - Dependencies array (like useEffect)
 *
 * @example
 * ```jsx
 * function UserCard({ user }) {
 *   useAIContext({
 *     file: 'src/components/UserCard.tsx',
 *     description: 'User profile card'
 *   });
 *
 *   return <div className="user-card">{user.name}</div>;
 * }
 * ```
 */
function useAIContext(options, deps = []) {
  // This hook primarily registers the component
  // The actual context is picked up by the extension via data attributes

  if (!options || !options.file) {
    console.error('useAIContext: options.file is required');
    return;
  }

  // Try to get component name from React internals (works in dev mode)
  let componentName = 'UnknownComponent';
  try {
    // This is a bit of a hack but works in development
    const stack = new Error().stack;
    if (stack) {
      const match = stack.match(/at\s+(\w+)\s+\(/);
      if (match && match[1] && match[1] !== 'useAIContext') {
        componentName = match[1];
      }
    }
  } catch (e) {
    // Ignore errors in stack parsing
  }

  // Register on mount
  const reporter = getReporter();
  if (reporter) {
    reporter.registerComponent(componentName, options);
  }
}

/**
 * React hook that captures component state for AI context.
 * Use this to expose relevant state to the AI agent.
 *
 * @param {string} name - Name for this state snapshot
 * @param {unknown} state - The state to capture
 * @param {Array} [deps] - Dependencies array (defaults to [state])
 *
 * @example
 * ```jsx
 * function ShoppingCart() {
 *   const [items, setItems] = useState([]);
 *   const [total, setTotal] = useState(0);
 *
 *   // Capture cart state for AI debugging
 *   useAIState('cart', { items, total });
 *
 *   return <div>...</div>;
 * }
 * ```
 */
function useAIState(name, state, deps) {
  const reporter = getReporter();
  if (reporter) {
    // Capture state whenever deps change
    reporter.captureState(name, state);
  }
}

/**
 * Creates props for adding AI context to a DOM element.
 * Use this when you can't use the HOC or hook.
 *
 * @param {AIContextOptions} options - Context options
 * @returns {Object} Props object with data-ai-context attribute
 *
 * @example
 * ```jsx
 * <div {...aiContextProps({
 *   component: 'UserCard',
 *   file: 'src/components/UserCard.tsx'
 * })}>
 *   ...
 * </div>
 * ```
 */
function aiContextProps(options) {
  return {
    'data-ai-context': createContextAttribute({
      component: options.component,
      file: options.file,
      description: options.description,
      ...options.metadata
    })
  };
}

/**
 * React Context for providing AI context configuration to child components.
 * Use this at the root of your app to configure the SDK.
 */
let AIContextProviderComponent = null;
let AIContextConsumerComponent = null;
let useAIContextConfig = null;

// Initialize React context if React is available
function initReactContext(React) {
  if (AIContextProviderComponent) return;

  const AIContext = React.createContext(null);

  AIContextProviderComponent = function AIContextProvider({ config, children }) {
    // Initialize reporter with config
    React.useEffect(() => {
      const reporter = getReporter();
      if (reporter && config) {
        Object.assign(reporter.config, config);
      }
    }, [config]);

    return React.createElement(AIContext.Provider, { value: config }, children);
  };

  AIContextConsumerComponent = AIContext.Consumer;

  useAIContextConfig = function() {
    return React.useContext(AIContext);
  };
}

// Try to initialize with global React
if (typeof window !== 'undefined' && window.React) {
  try {
    initReactContext(window.React);
    // Also set React reference for HOC
    withAIContext._react = window.React;
  } catch (e) {
    // React not available
  }
}

/**
 * Initialize the React integration with a React instance.
 * Call this if React is not available globally.
 *
 * @param {Object} React - The React library
 *
 * @example
 * ```js
 * import React from 'react';
 * import { initReact } from 'ai-context-sdk/react';
 *
 * initReact(React);
 * ```
 */
function initReact(React) {
  initReactContext(React);
  withAIContext._react = React;
}

export {
  withAIContext,
  useAIContext,
  useAIState,
  aiContextProps,
  initReact,
  AIContextProviderComponent as AIContextProvider,
  AIContextConsumerComponent as AIContextConsumer,
  useAIContextConfig
};
