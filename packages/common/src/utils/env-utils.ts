/**
 * Environment Variable Utilities
 * Provides utilities for plugins to safely access environment variables
 */

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