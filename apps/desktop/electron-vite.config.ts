import { defineConfig } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/main/index.ts'),
        },
        external: ['electron', 'better-sqlite3', 'fs-extra'],
      },
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
});
