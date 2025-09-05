import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
const nodeEnv = process.env.NODE_ENV === 'production' ? '"production"' : '"development"';
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  define: { 'process.env.NODE_ENV': nodeEnv },
  server: {
    proxy: {
      '/api': {
        target: 'http://www.simple-platform.cn:88',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
