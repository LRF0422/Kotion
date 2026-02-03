import { app } from 'electron';
import { join } from 'path';
import {
  DatabaseManager,
  AuthRepository,
  SpaceRepository,
  PageRepository,
  PluginRepository,
  AuthManager,
  StorageAdapter,
  PluginCacheService,
  HttpClient,
  AuthApi,
  SpaceApi,
  PageApi,
  PluginApi,
  FileApi,
  getApiConfig,
} from '@kn/electron-adapter';

// Global service instances
let dbManager: DatabaseManager;
let authManager: AuthManager;
let storageAdapter: StorageAdapter;
let pluginCacheService: PluginCacheService;
let httpClient: HttpClient;

// API services
let authApi: AuthApi;
let spaceApi: SpaceApi;
let pageApi: PageApi;
let pluginApi: PluginApi;
let fileApi: FileApi;

// Repositories
let authRepository: AuthRepository;
let spaceRepository: SpaceRepository;
let pageRepository: PageRepository;
let pluginRepository: PluginRepository;

/**
 * Initialize all services
 */
export async function initializeServices(electronApp: typeof app): Promise<void> {
  const userDataPath = electronApp.getPath('userData');
  
  console.log('Initializing services...');
  console.log('User data path:', userDataPath);

  // 1. Initialize database
  const dbPath = join(userDataPath, 'knowledge.db');
  dbManager = new DatabaseManager(dbPath);
  const db = dbManager.getDatabase();

  // 2. Create repositories
  authRepository = new AuthRepository(db);
  spaceRepository = new SpaceRepository(db);
  pageRepository = new PageRepository(db);
  pluginRepository = new PluginRepository(db);

  // 3. Initialize HTTP client
  const apiConfig = getApiConfig();
  httpClient = new HttpClient(apiConfig);

  // 4. Create API services
  authApi = new AuthApi(httpClient);
  spaceApi = new SpaceApi(httpClient);
  pageApi = new PageApi(httpClient);
  pluginApi = new PluginApi(httpClient);
  fileApi = new FileApi(httpClient);

  // 5. Create AuthManager
  authManager = new AuthManager(authRepository, authApi);
  await authManager.initialize();

  // Setup token handlers for automatic token injection
  httpClient.setTokenHandlers(
    () => authManager.getAccessToken(),
    (token: string) => {
      // Token is automatically managed by AuthManager
    }
  );

  // Setup refresh token handler
  httpClient.setRefreshTokenHandler(() => authManager.refreshToken());

  // Listen to auth events
  httpClient.on('auth:expired', () => {
    console.warn('Auth expired, user needs to login again');
    // Send event to renderer process
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows()[0]?.webContents.send('auth:expired');
  });

  // 6. Create StorageAdapter
  storageAdapter = new StorageAdapter(
    spaceRepository,
    pageRepository,
    spaceApi,
    pageApi,
    authManager
  );

  // Listen to storage events
  storageAdapter.on('data:changed', (type, id) => {
    console.log(`Data changed: ${type} ${id}`);
    // Broadcast to renderer process
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed', { type, id });
  });

  // 7. Initialize PluginCacheService
  const pluginCacheDir = join(userDataPath, 'plugin-cache');
  pluginCacheService = new PluginCacheService(pluginCacheDir, pluginApi);
  await pluginCacheService.initialize();

  // 8. Check if user is logged in, if not, login as anonymous
  const authInfo = authManager.getAuthInfo();
  if (!authInfo) {
    console.log('No auth info found, logging in as anonymous...');
    try {
      await authManager.loginAsAnonymous();
      console.log('Anonymous login successful');
    } catch (error) {
      console.error('Anonymous login failed:', error);
      // Continue anyway, app can work offline
    }
  } else {
    console.log(`Logged in as: ${authInfo.account} (${authInfo.userRole})`);
  }

  console.log('Services initialized successfully');
}

/**
 * Cleanup services before app quit
 */
export async function cleanupServices(): Promise<void> {
  console.log('Cleaning up services...');
  
  if (dbManager) {
    dbManager.close();
  }

  console.log('Services cleaned up');
}

// Export service getters
export function getAuthManager(): AuthManager {
  return authManager;
}

export function getStorageAdapter(): StorageAdapter {
  return storageAdapter;
}

export function getPluginCacheService(): PluginCacheService {
  return pluginCacheService;
}

export function getHttpClient(): HttpClient {
  return httpClient;
}

export function getAuthApi(): AuthApi {
  return authApi;
}

export function getSpaceApi(): SpaceApi {
  return spaceApi;
}

export function getPageApi(): PageApi {
  return pageApi;
}

export function getPluginApi(): PluginApi {
  return pluginApi;
}

export function getFileApi(): FileApi {
  return fileApi;
}

export function getDatabaseManager(): DatabaseManager {
  return dbManager;
}

export function getRepositories() {
  return {
    auth: authRepository,
    space: spaceRepository,
    page: pageRepository,
    plugin: pluginRepository,
  };
}
