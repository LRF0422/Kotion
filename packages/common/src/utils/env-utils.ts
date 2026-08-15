/**
 * Environment Variable Utilities
 * Provides utilities for plugins to safely access environment variables
 */

/**
 * Host-injected environment access for plugin bundles.
 *
 * Plugin UMD bundles are NOT built by Vite, so `import.meta.env` is neither
 * replaced at build time nor available in a classic-script UMD context. The
 * host (the Vite app) instead publishes its build-time env on
 * `window.__KN__.env`; plugins read it through this helper.
 *
 * Resolution order:
 *  1. `window.__KN__.env` (host-injected — authoritative for plugins)
 *  2. `import.meta.env` (build-time replacement for ESM consumers)
 *  3. `process.env` (node / polyfilled environments)
 */
export function getAppEnv(key: string): string | undefined {
    const g = globalThis as any
    const read = (env: any): string | undefined => {
        if (!env || !(key in env)) return undefined
        const v = env[key]
        return typeof v === 'string' ? v : v == null ? undefined : String(v)
    }

    try {
        const fromKn = read(g.__KN__?.env)
        if (fromKn !== undefined) return fromKn
    } catch { /* ignore */ }

    try {
        const fromMeta = read((import.meta as any)?.env)
        if (fromMeta !== undefined) return fromMeta
    } catch { /* import.meta unavailable in classic scripts */ }

    try {
        const fromProcess = read(g.process?.env)
        if (fromProcess !== undefined) return fromProcess
    } catch { /* ignore */ }

    return undefined
}

/**
 * Safely gets an environment variable with a fallback value
 * @param key The environment variable key (without VITE_ prefix if using VITE_ variables)
 * @param fallback The fallback value if the environment variable is not set
 * @returns The value of the environment variable or the fallback
 */
export function getEnvVariable(key: string, fallback?: string): string | undefined {
    // Vite automatically exposes VITE_* variables to client-side code
    const envKey = key.startsWith('VITE_') ? key : `VITE_${key}`;
    const value = (globalThis as any).process?.env?.[envKey] || fallback;
    return value;
}

/**
 * Checks if a VITE_* environment variable is truthy
 * @param key The environment variable key (without VITE_ prefix)
 * @returns Boolean indicating if the variable is truthy
 */
export function isEnvVarEnabled(key: string): boolean {
    const value = getEnvVariable(key, 'false');
    return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Gets the current environment mode
 * @returns 'development', 'production', or 'test'
 */
export function getEnvironment(): 'development' | 'production' | 'test' | string {
    return (globalThis as any).process?.env?.NODE_ENV || 'development';
}

/**
 * Checks if running in development mode
 * @returns Boolean indicating if in development mode
 */
export function isDevelopment(): boolean {
    return getEnvironment() === 'development';
}

/**
 * Checks if running in production mode
 * @returns Boolean indicating if in production mode
 */
export function isProduction(): boolean {
    return getEnvironment() === 'production';
}