import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
const nodeEnv = process.env.NODE_ENV === 'production' ? '"production"' : '"development"';
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  define: { 'process.env.NODE_ENV': nodeEnv },
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
