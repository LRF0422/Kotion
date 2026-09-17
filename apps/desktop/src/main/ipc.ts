import { ipcMain, dialog, app, BrowserWindow, desktopCapturer, nativeImage, screen, systemPreferences } from 'electron';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { join } from 'node:path';
import * as dns from 'node:dns';
import * as net from 'node:net';

/**
 * Desktop capability IPC handlers.
 *
 * The preload bridge only forwards the fixed desktop:<capability> channels, and
 * every handler validates its arguments here. File-system access is limited to
 * an allowlist of roots expressed as absolute paths + path.sep, which is
 * portable across macOS / Windows / Linux / HarmonyOS. Any path returned by a
 * native dialog is granted into the runtime allowlist.
 */

const resolveAllowedRoots = (): string[] => {
  const names = ['documents', 'downloads', 'desktop', 'temp', 'userData'] as const;
  const roots: string[] = [];
  for (const name of names) {
    try {
      roots.push(path.resolve(app.getPath(name)));
    } catch {
      // Some platforms lack a given standard directory; skip it.
    }
  }
  return roots;
};

const allowedRoots = resolveAllowedRoots();
const grantedPaths = new Set<string>();

const grantPath = (target?: string | null): void => {
  if (!target) return;
  try {
    grantedPaths.add(path.resolve(target));
  } catch {
    // ignore malformed paths
  }
};

const isWithin = (root: string, target: string): boolean =>
  target === root || target.startsWith(root + path.sep);

const assertAllowedPath = (target: unknown, field = 'path'): string => {
  if (typeof target !== 'string' || !target.trim()) {
    throw new Error('desktop fs: "' + field + '" must be a non-empty string');
  }
  const resolved = path.resolve(target);
  const allowed =
    allowedRoots.some((root) => isWithin(root, resolved)) ||
    [...grantedPaths].some((root) => isWithin(root, resolved));
  if (!allowed) {
    throw new Error('desktop fs: path is outside the allowed roots: ' + resolved);
  }
  return resolved;
};

// ---- http.request guards (SSRF) ------------------------------------------
// The Postman-style plugin proxies arbitrary APIs through the main process.
// Block loopback / private / link-local / metadata targets, on every redirect
// hop. Trusted-plugin model, but a compromised plugin must not reach the LAN.

const BLOCKED_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

const isBlockedAddress = (address: string): boolean => {
  if (net.isIPv4(address)) return BLOCKED_V4.some((re) => re.test(address));
  const lower = address.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) return isBlockedAddress(lower.slice(7));
  return false;
};

const assertPublicTarget = async (raw: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('desktop http: invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('desktop http: only http/https is allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('desktop http: localhost is blocked');
  }
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error('desktop http: private address is blocked');
    return url;
  }
  const records = await dns.promises.lookup(host, { all: true });
  if (!records.length) throw new Error('desktop http: cannot resolve host');
  if (records.some((record) => isBlockedAddress(record.address))) {
    throw new Error('desktop http: resolves to a private address');
  }
  return url;
};

const toHeaderRecord = (value: unknown): Record<string, string> => {
  const result: Record<string, string> = {};
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string') result[key] = entry;
    }
  }
  return result;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {};

type CapabilityHandler = (event: Electron.IpcMainInvokeEvent, params: unknown) => unknown;

const handle = (capability: string, fn: CapabilityHandler): void => {
  ipcMain.handle('desktop:' + capability, (event, params) => fn(event, params));
};

export function setupIpcHandlers() {
  // ==================== system ====================
  handle('system.info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    locale: app.getLocale(),
  }));

  handle('system.paths', () => ({
    userData: app.getPath('userData'),
    downloads: app.getPath('downloads'),
    documents: app.getPath('documents'),
    desktop: app.getPath('desktop'),
    temp: app.getPath('temp'),
  }));

  // ==================== screen capture sources ====================
  // desktopCapturer is main-process only in Electron 17+. The renderer turns the
  // returned source ids into a MediaStream via getUserMedia(chromeMediaSource).
  handle('capture.sources', async (_event, raw) => {
    const params = asRecord(raw);
    const requested = Array.isArray(params.types) ? params.types : [];
    const types = requested.filter(
      (type: unknown) => type === 'screen' || type === 'window',
    ) as Array<'screen' | 'window'>;
    const thumbnailWidth = Math.min(Math.max(Number(params.thumbnailWidth) || 320, 64), 640);
    let sources: Electron.DesktopCapturerSource[];
    try {
      sources = await desktopCapturer.getSources({
        types: types.length ? types : ['screen', 'window'],
        thumbnailSize: { width: thumbnailWidth, height: Math.round(thumbnailWidth * 9 / 16) },
        fetchWindowIcons: false,
      });
    } catch (error) {
      // macOS gates screen capture behind TCC; surface an actionable message
      // instead of the raw "Failed to get sources." error.
      const status = process.platform === 'darwin'
        ? systemPreferences.getMediaAccessStatus('screen')
        : 'unknown';
      console.warn('[capture] getSources failed:', error);
      // The renderer localizes CAPTURE_PERMISSION:<status> into a full hint.
      throw new Error('CAPTURE_PERMISSION:' + status);
    }
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id ?? '',
      thumbnail: source.thumbnail?.isEmpty() ? '' : source.thumbnail.toDataURL(),
    }));
  });

  // ==================== full-screen region capture ====================
  // Main captures the display at full resolution, opens an always-on-top window
  // covering it, and crops the selection itself — the frame never travels
  // through IPC and only the cropped PNG comes back.
  interface RegionSession {
    context: { url: string; width: number; height: number; locale: 'zh' | 'en' };
    resolve: (result: { imageDataUrl: string; width: number; height: number } | null) => void;
    win: BrowserWindow;
  }
  const regionSessions = new Map<number, RegionSession>();

  const permissionError = (): Error => {
    const status = process.platform === 'darwin'
      ? systemPreferences.getMediaAccessStatus('screen')
      : 'unknown';
    return new Error('CAPTURE_PERMISSION:' + status);
  };

  handle('capture.selectRegion', async (_event, raw) => {
    const params = asRecord(raw);
    const displays = screen.getAllDisplays();
    const display =
      displays.find((item) => params.displayId && String(item.id) === String(params.displayId)) ??
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const pixelWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor));
    const pixelHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor));

    let frame: Electron.NativeImage | undefined;
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: pixelWidth, height: pixelHeight },
      });
      const match = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
      frame = match?.thumbnail;
    } catch (error) {
      console.warn('[capture] region frame failed:', error);
    }
    if (!frame || frame.isEmpty()) throw permissionError();

    const size = frame.getSize();
    const context = {
      url: frame.toDataURL(),
      width: size.width,
      height: size.height,
      locale: (params.locale === 'en' ? 'en' : 'zh') as 'zh' | 'en',
    };

    return new Promise<{ imageDataUrl: string; width: number; height: number } | null>((resolve) => {
      const win = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        show: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: '#000000',
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          sandbox: false,
        },
      });
      win.setAlwaysOnTop(true, 'screen-saver');
      regionSessions.set(win.webContents.id, { context, resolve, win });

      win.on('closed', () => {
        const session = regionSessions.get(win.webContents.id);
        if (session) {
          regionSessions.delete(win.webContents.id);
          session.resolve(null);
        }
      });
      win.webContents.on('did-finish-load', () => {
        win.show();
        win.focus();
      });

      const devUrl = process.env['ELECTRON_RENDERER_URL'];
      if (!app.isPackaged && devUrl) {
        win.loadURL(devUrl + '/region.html');
      } else {
        win.loadURL('app://./region.html');
      }
    });
  });

  handle('capture.region.context', (event) => {
    const session = regionSessions.get(event.sender.id);
    if (!session) throw new Error('no active region session');
    return session.context;
  });

  handle('capture.region.submit', async (event, raw) => {
    const session = regionSessions.get(event.sender.id);
    if (!session) return;
    regionSessions.delete(event.sender.id);

    const rect =
      raw && typeof raw === 'object'
        ? (raw as { x: number; y: number; width: number; height: number })
        : null;

    try {
      if (!rect || rect.width < 1 || rect.height < 1) {
        session.resolve(null);
        return;
      }
      const x = Math.max(0, Math.round(rect.x));
      const y = Math.max(0, Math.round(rect.y));
      const width = Math.max(1, Math.min(Math.round(rect.width), session.context.width - x));
      const height = Math.max(1, Math.min(Math.round(rect.height), session.context.height - y));
      const cropped = nativeImage
        .createFromDataURL(session.context.url)
        .crop({ x, y, width, height });
      session.resolve({ imageDataUrl: cropped.toDataURL(), width, height });
    } catch (error) {
      console.warn('[capture] crop failed:', error);
      session.resolve(null);
    } finally {
      session.win.close();
    }
  });

  // ==================== http (main-process fetch; no CORS) ====================
  // Never injects the Kotion session token: the target is an arbitrary
  // third-party API, so credentials must come from the request itself.
  handle('http.request', async (_event, raw) => {
    const params = asRecord(raw);
    if (typeof params.url !== 'string' || !params.url.trim()) {
      throw new Error('desktop http: "url" is required');
    }
    const timeoutMs = Math.min(Math.max(Number(params.timeoutMs) || 30000, 1000), 120000);
    const maxBytes = Math.min(
      Math.max(Number(params.maxResponseBytes) || 5 * 1024 * 1024, 1024),
      20 * 1024 * 1024,
    );
    const method = String(params.method || 'GET').toUpperCase();
    const headers = toHeaderRecord(params.headers);
    const hasBody = method !== 'GET' && method !== 'HEAD';
    // Prefer a base64 binary body (e.g. release-asset uploads) over a text body.
    const body: string | Buffer | undefined = !hasBody
      ? undefined
      : typeof params.bodyBase64 === 'string' && params.bodyBase64.length > 0
        ? Buffer.from(params.bodyBase64, 'base64')
        : typeof params.body === 'string'
          ? params.body
          : undefined;

    const started = Date.now();
    const redirects: Array<{ status: number; location: string }> = [];
    let current = params.url;
    let response: Response | undefined;

    for (let hop = 0; hop <= 5; hop++) {
      const target = await assertPublicTarget(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetch(target, {
          method,
          headers,
          // Buffer is a valid undici BodyInit at runtime; the DOM lib types omit it.
          body: body as any,
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        throw new Error('desktop http: request failed (' + (error as Error).message + ')');
      }
      clearTimeout(timer);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          redirects.push({ status: response.status, location });
          current = new URL(location, target).toString();
          continue;
        }
      }
      break;
    }
    if (!response) throw new Error('desktop http: no response');

    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = false;
    const reader = response.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const remaining = maxBytes - total;
        if (value.byteLength >= remaining) {
          chunks.push(Buffer.from(value.subarray(0, remaining)));
          total += remaining;
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(Buffer.from(value));
        total += value.byteLength;
      }
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      bodyText: Buffer.concat(chunks).toString('utf8'),
      bodyBytes: total,
      durationMs: Date.now() - started,
      truncated,
      redirects,
      finalUrl: current,
    };
  });

  // ==================== dialog ====================
  handle('dialog.openFile', async (_event, raw) => {
    const options = asRecord(raw);
    const result = await dialog.showOpenDialog({
      title: typeof options.title === 'string' ? options.title : 'Select File',
      filters: Array.isArray(options.filters) ? options.filters : [{ name: 'All Files', extensions: ['*'] }],
      properties: options.multiSelections ? ['openFile', 'multiSelections'] : ['openFile'],
    });
    if (result.canceled) return { canceled: true, filePaths: [] };
    result.filePaths.forEach((filePath) => grantPath(filePath));
    return { canceled: false, filePaths: result.filePaths };
  });

  handle('dialog.openFolder', async (_event, raw) => {
    const options = asRecord(raw);
    const result = await dialog.showOpenDialog({
      title: typeof options.title === 'string' ? options.title : 'Select Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled) return { canceled: true, folderPath: null };
    const folderPath = result.filePaths[0] ?? null;
    grantPath(folderPath);
    return { canceled: false, folderPath };
  });

  handle('dialog.saveFile', async (_event, raw) => {
    const options = asRecord(raw);
    const result = await dialog.showSaveDialog({
      title: typeof options.title === 'string' ? options.title : 'Save File',
      defaultPath: typeof options.defaultPath === 'string' ? options.defaultPath : app.getPath('downloads'),
      filters: Array.isArray(options.filters) ? options.filters : [{ name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true, filePath: null };
    grantPath(result.filePath);
    return { canceled: false, filePath: result.filePath };
  });

  handle('dialog.message', async (_event, raw) => {
    const options = asRecord(raw);
    const result = await dialog.showMessageBox({
      type: options.type || 'info',
      title: typeof options.title === 'string' ? options.title : '',
      message: typeof options.message === 'string' ? options.message : '',
      detail: typeof options.detail === 'string' ? options.detail : undefined,
      buttons: Array.isArray(options.buttons) ? options.buttons : ['OK'],
    });
    return { response: result.response };
  });

  // ==================== fs (allowlisted) ====================
  handle('fs.readFile', async (_event, raw) => {
    try {
      const params = asRecord(raw);
      const filePath = assertAllowedPath(params.path);
      const encoding = params.encoding === 'base64' ? 'base64' : 'utf-8';
      return { data: await fs.readFile(filePath, encoding as BufferEncoding) };
    } catch (error) {
      return { data: null, error: (error as Error).message };
    }
  });

  handle('fs.writeFile', async (_event, raw) => {
    try {
      const params = asRecord(raw);
      const filePath = assertAllowedPath(params.path);
      const encoding = params.encoding === 'base64' ? 'base64' : 'utf-8';
      await fs.writeFile(filePath, String(params.data ?? ''), encoding as BufferEncoding);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  handle('fs.exists', async (_event, raw) => {
    return fs.pathExists(assertAllowedPath(asRecord(raw).path));
  });

  handle('fs.mkdir', async (_event, raw) => {
    try {
      await fs.ensureDir(assertAllowedPath(asRecord(raw).path));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  handle('fs.remove', async (_event, raw) => {
    try {
      await fs.remove(assertAllowedPath(asRecord(raw).path));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  handle('fs.readdir', async (_event, raw) => {
    try {
      const dirPath = assertAllowedPath(asRecord(raw).path);
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      return {
        data: files.map((entry) => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
        })),
      };
    } catch (error) {
      return { data: [], error: (error as Error).message };
    }
  });

  handle('fs.stat', async (_event, raw) => {
    try {
      const stat = await fs.stat(assertAllowedPath(asRecord(raw).path));
      return {
        data: {
          size: stat.size,
          isDirectory: stat.isDirectory(),
          isFile: stat.isFile(),
          createdAt: stat.birthtime.getTime(),
          modifiedAt: stat.mtime.getTime(),
        },
      };
    } catch (error) {
      return { data: null, error: (error as Error).message };
    }
  });

  handle('fs.copy', async (_event, raw) => {
    try {
      const params = asRecord(raw);
      await fs.copy(assertAllowedPath(params.src, 'src'), assertAllowedPath(params.dest, 'dest'));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  handle('fs.move', async (_event, raw) => {
    try {
      const params = asRecord(raw);
      await fs.move(assertAllowedPath(params.src, 'src'), assertAllowedPath(params.dest, 'dest'));
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ==================== window (host controls) ====================
  handle('window.setFullScreen', (event, raw) => {
    BrowserWindow.fromWebContents(event.sender)?.setFullScreen(Boolean(asRecord(raw).value));
  });

  handle('window.isFullScreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });

  handle('window.setTrafficLights', (event, raw) => {
    if (process.platform !== 'darwin') return;
    const win = BrowserWindow.fromWebContents(event.sender) as any;
    // Electron 33 exposes setWindowButtonPosition; older builds used
    // setTrafficLightPosition. Never throw here.
    const setPosition = win?.setWindowButtonPosition ?? win?.setTrafficLightPosition;
    if (typeof setPosition !== 'function') return;
    const { x, y } = asRecord(raw);
    if (typeof x !== 'number' || typeof y !== 'number') return;
    try {
      setPosition.call(win, { x, y });
    } catch (error) {
      console.warn('[desktop] failed to set traffic light position', error);
    }
  });

  console.log('Desktop capability handlers ready');
}
