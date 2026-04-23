import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from 'path'

// https://vitejs.dev/config/
const nodeEnv = process.env.NODE_ENV === 'production' ? '"production"' : '"development"';

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': nodeEnv },
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      'react': path.resolve('../../node_modules/react'),
      'react-dom': path.resolve('../../node_modules/react-dom'),
    }
  },
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
        }
      }
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'https://kotion.top:888/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: true
      }
    }
  }
});
