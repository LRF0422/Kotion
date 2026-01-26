import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                entry: 'src/main/index.ts',
                onstart(options) {
                    options.startup()
                },
                vite: {
                    build: {
                        sourcemap: true,
                        outDir: 'dist-electron/main',
                        rollupOptions: {
                            external: ['better-sqlite3']
                        }
                    }
                }
            },
            {
                entry: 'src/preload/index.ts',
                onstart(options) {
                    options.reload()
                },
                vite: {
                    build: {
                        sourcemap: true,
                        outDir: 'dist-electron/preload'
                    }
                }
            }
        ]),
        renderer()
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@main': resolve(__dirname, 'src/main'),
            '@preload': resolve(__dirname, 'src/preload'),
            '@renderer': resolve(__dirname, 'src/renderer')
        }
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            }
        }
    }
})
