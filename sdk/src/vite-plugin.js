/**
 * AI Context SDK - Vite Plugin
 *
 * Automatically injects the AI Context SDK into your development build
 * and optionally adds file path information to components.
 *
 * @example
 * ```js
 * // vite.config.js
 * import { defineConfig } from 'vite';
 * import { aiContextPlugin } from 'ai-context-sdk/vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     aiContextPlugin({
 *       repository: 'https://github.com/org/repo',
 *       include: ['src/components/**\/*.{tsx,jsx,vue}']
 *     })
 *   ]
 * });
 * ```
 */

import { createFilter } from '@rollup/pluginutils';
import path from 'path';

/**
 * @typedef {Object} AIContextPluginOptions
 * @property {string} [repository] - Git repository URL
 * @property {string} [branch] - Git branch (auto-detected if not provided)
 * @property {string[]} [include] - Glob patterns for files to process
 * @property {string[]} [exclude] - Glob patterns for files to exclude
 * @property {boolean} [injectSDK=true] - Whether to inject the SDK script
 * @property {boolean} [addFilePaths=true] - Whether to add file paths to components
 * @property {boolean} [devOnly=true] - Only enable in development mode
 */

/**
 * Vite plugin for AI Context SDK integration.
 *
 * Features:
 * - Auto-injects SDK initialization in development
 * - Adds file path information to component exports
 * - Works with React, Vue, and other frameworks
 *
 * @param {AIContextPluginOptions} [options={}] - Plugin options
 * @returns {import('vite').Plugin} Vite plugin
 */
function aiContextPlugin(options = {}) {
  const {
    repository = null,
    branch = null,
    include = ['**/*.{tsx,jsx,vue,svelte}'],
    exclude = ['**/node_modules/**', '**/dist/**'],
    injectSDK = true,
    addFilePaths = true,
    devOnly = true
  } = options;

  const filter = createFilter(include, exclude);
  let config;
  let isDev = true;

  return {
    name: 'ai-context-sdk',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      isDev = resolvedConfig.command === 'serve' || resolvedConfig.mode === 'development';
    },

    transformIndexHtml(html) {
      // Skip in production if devOnly is true
      if (devOnly && !isDev) {
        return html;
      }

      if (!injectSDK) {
        return html;
      }

      // Inject SDK initialization script
      const sdkConfig = {
        repository,
        branch: branch || process.env.GIT_BRANCH || process.env.VITE_GIT_BRANCH,
        commit: process.env.GIT_COMMIT || process.env.VITE_GIT_COMMIT,
        environment: isDev ? 'development' : 'production'
      };

      const initScript = `
<script type="module">
  // AI Context SDK - Auto-injected by vite-plugin
  (function() {
    const GLOBAL_KEY = '__AI_CONTEXT_REPORTER__';

    // Simple inline SDK for auto-injection
    class AIContextReporter {
      constructor(config = {}) {
        if (window[GLOBAL_KEY]) return window[GLOBAL_KEY];
        this.config = config;
        this.components = new Map();
        this.stateSnapshots = [];
        this.customContext = {};
        window[GLOBAL_KEY] = this;
      }

      registerComponent(name, opts) {
        this.components.set(name, { ...opts, registeredAt: Date.now() });
        return this;
      }

      registerComponents(components) {
        Object.entries(components).forEach(([name, opts]) => this.registerComponent(name, opts));
        return this;
      }

      getComponent(name) { return this.components.get(name) || null; }

      getAllComponents() {
        const result = {};
        this.components.forEach((v, k) => result[k] = v);
        return result;
      }

      captureState(name, value) {
        this.stateSnapshots.push({ name, value, timestamp: Date.now() });
        if (this.stateSnapshots.length > 50) this.stateSnapshots.shift();
        return this;
      }

      getStateSnapshots() { return [...this.stateSnapshots]; }
      clearStateSnapshots() { this.stateSnapshots = []; return this; }

      setContext(key, value) { this.customContext[key] = value; return this; }
      getContext(key) { return this.customContext[key]; }
      getAllContext() { return { ...this.customContext }; }

      getFullContext() {
        return {
          config: this.config,
          components: this.getAllComponents(),
          stateSnapshots: this.getStateSnapshots(),
          customContext: this.getAllContext(),
          timestamp: Date.now()
        };
      }
    }

    // Initialize
    new AIContextReporter(${JSON.stringify(sdkConfig)});
    console.debug('[AI Context SDK] Initialized via Vite plugin');
  })();
</script>`;

      // Inject before closing head tag
      return html.replace('</head>', `${initScript}\n</head>`);
    },

    transform(code, id) {
      // Skip in production if devOnly is true
      if (devOnly && !isDev) {
        return null;
      }

      if (!addFilePaths || !filter(id)) {
        return null;
      }

      // Get relative file path from project root
      const projectRoot = config?.root || process.cwd();
      const relativePath = path.relative(projectRoot, id).replace(/\\/g, '/');

      // Detect framework and transform accordingly
      const ext = path.extname(id).toLowerCase();

      if (ext === '.vue') {
        return transformVue(code, relativePath, id);
      }

      if (ext === '.tsx' || ext === '.jsx') {
        return transformReact(code, relativePath, id);
      }

      if (ext === '.svelte') {
        return transformSvelte(code, relativePath, id);
      }

      return null;
    }
  };
}

/**
 * Transform Vue SFC to include file path in component definition.
 * @private
 */
function transformVue(code, filePath, id) {
  // Check if it's a Vue SFC with <script> or <script setup>
  if (!code.includes('<script')) {
    return null;
  }

  // For Vue 3 script setup, add __file to the component
  if (code.includes('<script setup')) {
    // Add a normal script block to set __file
    const injection = `
<script>
// AI Context SDK - File path injection
export default { __file: '${filePath}' };
</script>
`;
    // Insert before <script setup>
    return {
      code: code.replace(/<script setup/, `${injection}\n<script setup`),
      map: null
    };
  }

  // For regular script, try to add __file to default export
  if (code.includes('export default')) {
    const modifiedCode = code.replace(
      /export\s+default\s*\{/,
      `export default {\n  __file: '${filePath}',`
    );

    if (modifiedCode !== code) {
      return { code: modifiedCode, map: null };
    }
  }

  return null;
}

/**
 * Transform React/JSX to register components with file paths.
 * @private
 */
function transformReact(code, filePath, id) {
  // Look for function component definitions or class components
  const componentNameMatch = code.match(/(?:export\s+(?:default\s+)?)?(?:function|const|class)\s+([A-Z][a-zA-Z0-9]*)/);

  if (!componentNameMatch) {
    return null;
  }

  const componentName = componentNameMatch[1];

  // Add registration at the end of the file
  const registration = `

// AI Context SDK - Component registration
if (typeof window !== 'undefined' && window.__AI_CONTEXT_REPORTER__) {
  window.__AI_CONTEXT_REPORTER__.registerComponent('${componentName}', {
    file: '${filePath}'
  });
}
`;

  return {
    code: code + registration,
    map: null
  };
}

/**
 * Transform Svelte components to include file path.
 * @private
 */
function transformSvelte(code, filePath, id) {
  // Add module context script with file path
  if (!code.includes('<script context="module"')) {
    const injection = `
<script context="module">
  // AI Context SDK - File path
  export const __file = '${filePath}';
</script>
`;
    return {
      code: injection + code,
      map: null
    };
  }

  // If module script exists, try to add __file export
  const modifiedCode = code.replace(
    /<script context="module">/,
    `<script context="module">\n  export const __file = '${filePath}';`
  );

  if (modifiedCode !== code) {
    return { code: modifiedCode, map: null };
  }

  return null;
}

/**
 * Create a component registration manifest from your source files.
 * Useful for pre-registering all components at build time.
 *
 * @param {string[]} files - Array of file paths
 * @param {string} [projectRoot] - Project root directory
 * @returns {Record<string, {file: string}>} Component manifest
 *
 * @example
 * ```js
 * import { createComponentManifest } from 'ai-context-sdk/vite';
 * import glob from 'fast-glob';
 *
 * const files = await glob('src/components/*.tsx');
 * const manifest = createComponentManifest(files);
 * // { 'UserCard': { file: 'src/components/UserCard.tsx' }, ... }
 * ```
 */
function createComponentManifest(files, projectRoot = process.cwd()) {
  const manifest = {};

  for (const file of files) {
    const relativePath = path.relative(projectRoot, file).replace(/\\/g, '/');
    const baseName = path.basename(file, path.extname(file));

    // Only include PascalCase names (likely components)
    if (/^[A-Z][a-zA-Z0-9]*$/.test(baseName)) {
      manifest[baseName] = { file: relativePath };
    }
  }

  return manifest;
}

export {
  aiContextPlugin,
  createComponentManifest
};

export default aiContextPlugin;
