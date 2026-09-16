import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  main: {
    // `fs-extra` must be bundled (not left as a runtime require): the packaged
    // app.asar ships only `out/**` and excludes node_modules.
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/utils', 'fs-extra'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/preload'] })]
  },
  renderer: {
    root: './src/renderer',
    // Force a single React/ReactDOM instance. Without dedupe, workspace packages
    // such as @kn/ui resolve their own React copy, so react-dom sees an undefined
    // internals object and the renderer dies at startup with
    // "Cannot read properties of undefined (reading 'ReactCurrentBatchConfig')".
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router-dom'],
      alias: {
        react: resolve(__dirname, '../../node_modules/react'),
        'react-dom': resolve(__dirname, '../../node_modules/react-dom'),
      },
    },
    // Desktop loads the renderer from the `app://` protocol in production, so the
    // HTTP client must hit the cloud API via an absolute URL (see request.tsx).
    // Desktop talks to the cloud directly. The main process sets
    // webPreferences.webSecurity = false because the gateway does not answer
    // CORS preflight, so the app:// origin cannot call it cross-origin.
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://kotion.top:888/api')
    },
    server: {
      proxy: {
        '/api': {
          target: 'https://kotion.top:888/api',
          rewrite: (path) => path.replace(/^\/api/, ''),
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        // Two entries: the app shell and the full-screen region-capture overlay.
        input: {
          main: resolve(__dirname, 'src/renderer/index.html'),
          region: resolve(__dirname, 'src/renderer/region.html'),
        },
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': ['@kn/ui']
          }
        }
      }
    },
    plugins: [react(), tsconfigPaths()]
  }
})
