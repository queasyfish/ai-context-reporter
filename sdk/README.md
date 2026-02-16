# AI Context SDK

Optional SDK for providing rich context to AI coding agents via the [AI Context Reporter](https://github.com/anthropics/ai-context-reporter) browser extension.

## Why Use This SDK?

The AI Context Reporter browser extension automatically detects frameworks and extracts component information. However, some context can only be provided by your application:

- **File paths**: Know exactly which file to edit
- **Component descriptions**: Understand what components do
- **Application state**: Debug state-related issues
- **Custom metadata**: Repository info, feature flags, etc.

## Installation

```bash
npm install ai-context-sdk
# or
yarn add ai-context-sdk
# or
pnpm add ai-context-sdk
```

Or use via CDN:

```html
<script src="https://unpkg.com/ai-context-sdk/dist/ai-context-sdk.umd.js"></script>
```

## Quick Start

### Basic Usage

```javascript
import { AIContextReporter } from 'ai-context-sdk';

// Initialize once at app startup
const reporter = new AIContextReporter({
  repository: 'https://github.com/your-org/your-repo',
  branch: process.env.GIT_BRANCH
});

// Register components with file paths
reporter.registerComponent('UserCard', {
  file: 'src/components/UserCard.tsx',
  description: 'Displays user profile information'
});

reporter.registerComponent('ShoppingCart', {
  file: 'src/components/ShoppingCart.tsx',
  description: 'Shopping cart with item list and checkout'
});
```

### Using Data Attributes

For simple cases, add context directly to DOM elements:

```html
<div data-ai-context='{"component":"UserCard","file":"src/components/UserCard.tsx"}'>
  <!-- component content -->
</div>
```

Or use the helper:

```javascript
import { createContextAttribute } from 'ai-context-sdk';

const contextAttr = createContextAttribute({
  component: 'UserCard',
  file: 'src/components/UserCard.tsx'
});
// Returns: '{"component":"UserCard","file":"src/components/UserCard.tsx"}'
```

## Framework Integrations

### React

```jsx
import { withAIContext, useAIContext, useAIState } from 'ai-context-sdk/react';

// Option 1: Higher-Order Component
const UserCard = withAIContext(
  ({ user }) => <div className="user-card">{user.name}</div>,
  { file: 'src/components/UserCard.tsx' }
);

// Option 2: Hook
function UserCard({ user }) {
  useAIContext({ file: 'src/components/UserCard.tsx' });

  return <div className="user-card">{user.name}</div>;
}

// Option 3: State capture for debugging
function ShoppingCart() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  // Capture state for AI debugging
  useAIState('cart', { items, total });

  return <div>...</div>;
}
```

### Vue

```javascript
// main.js
import { createApp } from 'vue';
import { AIContextPlugin } from 'ai-context-sdk/vue';

const app = createApp(App);
app.use(AIContextPlugin, {
  repository: 'https://github.com/your-org/your-repo'
});
```

```vue
<!-- UserCard.vue -->
<template>
  <div v-ai-context="{ file: 'src/components/UserCard.vue' }">
    {{ user.name }}
  </div>
</template>
```

Or with Composition API:

```vue
<script setup>
import { useAIContext } from 'ai-context-sdk/vue';

const { captureState, setContext } = useAIContext({
  file: 'src/components/UserCard.vue'
});
</script>
```

### Vite Plugin (Recommended)

The Vite plugin automatically injects the SDK and adds file paths to components:

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { aiContextPlugin } from 'ai-context-sdk/vite';

export default defineConfig({
  plugins: [
    aiContextPlugin({
      repository: 'https://github.com/your-org/your-repo',
      // Auto-add file paths to these components
      include: ['src/components/**/*.{tsx,jsx,vue}'],
      // Only enable in development (default: true)
      devOnly: true
    })
  ]
});
```

## API Reference

### AIContextReporter

#### Constructor

```typescript
new AIContextReporter(config?: {
  repository?: string;    // Git repository URL
  branch?: string;        // Current branch
  commit?: string;        // Current commit hash
  environment?: string;   // 'development' | 'staging' | 'production'
  metadata?: object;      // Additional metadata
})
```

#### Methods

##### `registerComponent(name, options)`

Register a component with its file path and metadata.

```typescript
reporter.registerComponent('UserCard', {
  file: 'src/components/UserCard.tsx',
  description: 'User profile card component',
  tags: ['user', 'profile'],
  metadata: { author: 'team-a' }
});
```

##### `registerComponents(components)`

Register multiple components at once.

```typescript
reporter.registerComponents({
  'UserCard': { file: 'src/components/UserCard.tsx' },
  'Button': { file: 'src/components/Button.tsx' },
  'Modal': { file: 'src/components/Modal.tsx' }
});
```

##### `captureState(name, value)`

Capture application state for debugging.

```typescript
reporter.captureState('user', { id: 1, name: 'John' });
reporter.captureState('cart', { items: [], total: 0 });
```

##### `setContext(key, value)`

Set custom context that will be included in reports.

```typescript
reporter.setContext('featureFlags', { newCheckout: true });
reporter.setContext('experimentGroup', 'variant-b');
```

##### `getFullContext()`

Get the complete context object (used by the extension).

```typescript
const context = reporter.getFullContext();
// {
//   config: { repository, branch, ... },
//   components: { ... },
//   stateSnapshots: [...],
//   customContext: { ... },
//   timestamp: 1234567890
// }
```

### Utility Functions

##### `getReporter()`

Get the global AIContextReporter instance.

```typescript
import { getReporter } from 'ai-context-sdk';

const reporter = getReporter();
if (reporter) {
  reporter.captureState('debug', someValue);
}
```

##### `isExtensionInstalled()`

Check if the AI Context Reporter extension is active.

```typescript
import { isExtensionInstalled } from 'ai-context-sdk';

if (isExtensionInstalled()) {
  console.log('Extension is active');
}
```

##### `createContextAttribute(options)`

Create a JSON string for the `data-ai-context` attribute.

```typescript
import { createContextAttribute } from 'ai-context-sdk';

const attr = createContextAttribute({
  component: 'UserCard',
  file: 'src/components/UserCard.tsx'
});
```

## Best Practices

### 1. Initialize Early

Initialize the SDK as early as possible in your application:

```javascript
// index.js or main.js
import { AIContextReporter } from 'ai-context-sdk';

new AIContextReporter({
  repository: process.env.VITE_REPOSITORY_URL,
  branch: process.env.VITE_GIT_BRANCH
});
```

### 2. Use Consistent Component Names

Ensure your registered component names match your actual component names:

```jsx
// Good - names match
function UserCard() { ... }
reporter.registerComponent('UserCard', { file: '...' });

// Bad - names don't match
function UserCard() { ... }
reporter.registerComponent('UserProfileCard', { file: '...' });
```

### 3. Capture Relevant State

Only capture state that would help debug issues:

```javascript
// Good - relevant debugging state
reporter.captureState('auth', { isLoggedIn, userId });
reporter.captureState('cart', { itemCount, total });

// Bad - too much detail
reporter.captureState('everything', entireReduxStore);
```

### 4. Development Only

Use the SDK only in development to avoid overhead in production:

```javascript
if (process.env.NODE_ENV === 'development') {
  new AIContextReporter({ ... });
}
```

Or use the Vite plugin's `devOnly` option (enabled by default).

## TypeScript

TypeScript definitions are included. Import types as needed:

```typescript
import type {
  AIContextConfig,
  ComponentRegistration
} from 'ai-context-sdk';

const config: AIContextConfig = {
  repository: 'https://github.com/org/repo'
};

const registration: ComponentRegistration = {
  file: 'src/components/UserCard.tsx',
  description: 'User profile component'
};
```

## License

MIT
