import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from 'path';
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var apiBaseUrl = env.VITE_API_BASE_URL;
    // Prepare all environment variables for client-side access
    var clientEnvVars = {};
    Object.entries(env).forEach(function (_a) {
        var key = _a[0], value = _a[1];
        if (key.startsWith('VITE_')) {
            clientEnvVars["process.env.".concat(key)] = JSON.stringify(value);
        }
    });
    clientEnvVars['process.env.NODE_ENV'] = JSON.stringify(process.env.NODE_ENV === 'production' ? 'production' : 'development');
    return {
        plugins: [react()],
        define: clientEnvVars,
        resolve: {
            tsconfigPaths: true,
            dedupe: ['react', 'react-dom', 'react-router-dom'],
            alias: {
                '@': path.resolve(__dirname, './src'),
                'react': path.resolve('../../node_modules/react'),
                'react-dom': path.resolve('../../node_modules/react-dom'),
            }
        },
        server: {
            port: 5175,
            proxy: {
                '/api': {
                    target: apiBaseUrl,
                    changeOrigin: true,
                    rewrite: function (path) { return path.replace(/^\/api/, ''); },
                    secure: true
                }
            }
        }
    };
});
