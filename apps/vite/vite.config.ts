import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_API_BASE_URL;

  // Prepare all environment variables for client-side access
  const clientEnvVars: Record<string, string> = {};
  Object.entries(env).forEach(([key, value]) => {
    if (key.startsWith('VITE_')) {
      clientEnvVars[`process.env.${key}`] = JSON.stringify(value);
    }
  });

  // Add NODE_ENV as well
  clientEnvVars['process.env.NODE_ENV'] = JSON.stringify(
    process.env.NODE_ENV === 'production' ? 'production' : 'development'
  );

  return {
    plugins: [react(), tsconfigPaths()],
    define: clientEnvVars,
    server: {
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
