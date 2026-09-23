import { resolve } from 'path'
import { copyFile, mkdir } from 'fs/promises'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * The plugin studio's bundler runs in a **child process**, not in the main
 * bundle: it must be a real file on disk so ELECTRON_RUN_AS_NODE can execute it
 * and so esbuild can resolve from the app's node_modules. Rollup never sees
 * these two modules as entries, so they are copied verbatim into out/main.
 */
const childProcessAssets = ['dev-server.mjs', 'bundler.mjs', 'tailwind.mjs']

const copyPluginDevAssets = () => ({
  name: 'kn-copy-plugin-dev-assets',
  apply: 'build' as const,
  async closeBundle() {
    const from = resolve(__dirname, 'src/main/plugin-dev')
    const to = resolve(__dirname, 'out/main/plugin-dev')
    await mkdir(to, { recursive: true })
    await Promise.all(
      childProcessAssets.map((file) => copyFile(resolve(from, file), resolve(to, file))),
    )
  },
})

export default defineConfig({
  main: {
    // `fs-extra` must be bundled (not left as a runtime require): the packaged
    // app.asar ships only `out/**` and excludes node_modules.
    //
    // `esbuild` is excluded for the opposite reason: the plugin studio's
    // dev-server child needs the real package (its JS + platform binary), not a
    // bundled copy, and it is resolved from the app's node_modules at runtime.
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@electron-toolkit/utils', 'fs-extra'],
        include: ['esbuild'],
      }),
      copyPluginDevAssets(),
    ],
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
