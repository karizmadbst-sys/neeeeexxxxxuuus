import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const rootDir = import.meta.dirname;
  return {
    base: process.env.VITE_BASE_PATH || './',
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
        '@core': path.resolve(rootDir, 'src/core'),
        '@game': path.resolve(rootDir, 'src/game'),
        '@ui': path.resolve(rootDir, 'src/ui'),
        '@input': path.resolve(rootDir, 'src/input'),
        '@utils': path.resolve(rootDir, 'src/utils'),
        '@audio': path.resolve(rootDir, 'src/audio'),
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        input: {
          main: path.resolve(rootDir, 'index.html'),
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) {
              return 'three';
            }
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
