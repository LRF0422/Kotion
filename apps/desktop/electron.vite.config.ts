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
