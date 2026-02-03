export const API_CONFIG = {
  development: {
    baseURL: 'http://localhost:1889',
    timeout: 30000,
  },
  production: {
    baseURL: 'https://api.knowledge.com', // Replace with actual production URL
    timeout: 30000,
  },
};

export const getApiConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  return API_CONFIG[env as keyof typeof API_CONFIG] || API_CONFIG.development;
};

export const DEFAULT_CONFIG = {
  syncInterval: 5 * 60 * 1000, // 5 minutes
  pluginCacheDir: 'plugins',
  dbFileName: 'knowledge.db',
};

export const DB_SCHEMA_VERSION = 1;
