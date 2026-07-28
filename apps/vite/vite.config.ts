import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from 'path'

// Dev-only same-origin proxy for bookmark metadata fetching (bypasses browser CORS)
const bookmarkMetadataProxy = (): Plugin => ({
  name: 'bookmark-metadata-proxy',
  configureServer(server) {
    server.middlewares.use('/__bookmark-proxy', async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '', 'http://localhost');
        const target = reqUrl.searchParams.get('url');
        if (!target || !/^https?:\/\//i.test(target)) {
          res.statusCode = 400;
          res.end('Invalid url');
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(target, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timer);
        const html = await response.text();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = response.ok ? 200 : 502;
        res.end(html);
      } catch {
        res.statusCode = 502;
        res.end('');
      }
    });
  },
});

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
    plugins: [react(), bookmarkMetadataProxy()],
    define: clientEnvVars,
    resolve: {
      tsconfigPaths: true,
      dedupe: ['react', 'react-dom', 'react-router-dom'],
      alias: {
        'react': path.resolve('../../node_modules/react'),
        'react-dom': path.resolve('../../node_modules/react-dom'),
      }
    },
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
