import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const external = ['react', 'vue', '@rollup/pluginutils', 'path'];

const plugins = [
  resolve()
];

const minifyPlugin = terser({
  format: {
    comments: false
  }
});

export default [
  // Main SDK - ESM
  {
    input: 'src/ai-context-sdk.js',
    output: {
      file: 'dist/ai-context-sdk.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins
  },
  // Main SDK - CJS
  {
    input: 'src/ai-context-sdk.js',
    output: {
      file: 'dist/ai-context-sdk.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    plugins
  },
  // Main SDK - UMD (for script tag)
  {
    input: 'src/ai-context-sdk.js',
    output: {
      file: 'dist/ai-context-sdk.umd.js',
      format: 'umd',
      name: 'AIContextSDK',
      sourcemap: true
    },
    plugins: [...plugins, minifyPlugin]
  },

  // React helpers - ESM
  {
    input: 'src/react.js',
    output: {
      file: 'dist/react.esm.js',
      format: 'esm',
      sourcemap: true
    },
    external,
    plugins
  },
  // React helpers - CJS
  {
    input: 'src/react.js',
    output: {
      file: 'dist/react.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    external,
    plugins
  },

  // Vue helpers - ESM
  {
    input: 'src/vue.js',
    output: {
      file: 'dist/vue.esm.js',
      format: 'esm',
      sourcemap: true
    },
    external,
    plugins
  },
  // Vue helpers - CJS
  {
    input: 'src/vue.js',
    output: {
      file: 'dist/vue.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    external,
    plugins
  },

  // Vite plugin - ESM
  {
    input: 'src/vite-plugin.js',
    output: {
      file: 'dist/vite-plugin.esm.js',
      format: 'esm',
      sourcemap: true
    },
    external,
    plugins
  },
  // Vite plugin - CJS
  {
    input: 'src/vite-plugin.js',
    output: {
      file: 'dist/vite-plugin.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    external,
    plugins
  }
];
