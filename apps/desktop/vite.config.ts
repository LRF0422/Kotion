import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve, join } from 'path'
import { readdirSync, existsSync } from 'fs'

// Auto-detect workspace packages
function getWorkspaceAliases() {
    const packagesDir = resolve(__dirname, '../../packages')
    const aliases: Record<string, string> = {}

    try {
        const packages = readdirSync(packagesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())

        for (const pkg of packages) {
            const pkgJsonPath = join(packagesDir, pkg.name, 'package.json')
            if (existsSync(pkgJsonPath)) {
                const pkgJson = require(pkgJsonPath)
                const pkgName = pkgJson.name as string

                // Check for src/index.ts or src/index.tsx
                const srcDir = join(packagesDir, pkg.name, 'src')
                if (existsSync(srcDir)) {
                    aliases[pkgName] = srcDir
                }
            }
        }
    } catch (e) {
        console.warn('Failed to auto-detect workspace packages:', e)
    }

    return aliases
}

const workspaceAliases = getWorkspaceAliases()

// https://vitejs.dev/config/
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
                            external: ['better-sqlite3', 'electron']
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
                        outDir: 'dist-electron/preload',
                        rollupOptions: {
                            external: ['electron']
                        }
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
            '@renderer': resolve(__dirname, 'src/renderer'),
            // Auto-detected workspace packages
            ...workspaceAliases
        }
    },
    optimizeDeps: {
        include: [
            'react',
            'react-dom',
            'react-router-dom',
        ],
        exclude: ['electron']
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            }
        }
    }
})
