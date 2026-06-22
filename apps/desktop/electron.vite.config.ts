import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/utils'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@electron-toolkit/preload'] })]
  },
  renderer: {
    root: './src/renderer',
    // Desktop loads the renderer from the `app://` protocol in production, so the
    // HTTP client must hit the cloud API via an absolute URL (see request.tsx).
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
        input: resolve(__dirname, 'src/renderer/index.html'),
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
