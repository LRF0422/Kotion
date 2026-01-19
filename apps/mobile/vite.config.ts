import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_API_BASE_URL || 'https://kotion.top:888/api';

  const nodeEnv = process.env.NODE_ENV === 'production' ? '"production"' : '"development"';

  return {
    plugins: [react(), tsconfigPaths()],
    define: { 'process.env.NODE_ENV': nodeEnv },
    base: '/',
    build: {
      target: 'es2020',
      minify: 'terser',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': ['framer-motion', '@use-gesture/react']
          }
        }
      }
    },
    optimizeDeps: {
      include: ['@kn/core', '@kn/ui', '@kn/editor', '@kn/common']
    },
    server: {
      host: '0.0.0.0',
      port: 3001,
      proxy: {
        '/api': {
          target: apiBaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          secure: true
        }
      }
    }
  };
});
