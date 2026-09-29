/**
 * Remembered login credentials for the desktop app.
 *
 * Goal: "remember account & password" + "auto login" without ever writing a
 * plaintext password to disk and without keeping the secret in a renderer-side
 * web store (localStorage / IndexedDB / leveldb) that any injected script reads
 * as a matter of course.
 *
 * Design and trust model:
 * - Electron's `safeStorage` encrypts with the OS keychain (macOS Keychain,
 *   Windows DPAPI, Linux libsecret/kwallet). Only ciphertext is persisted, in
 *   `<userData>/login-credentials.json`.
 * - The password stays plaintext only inside this process. The renderer obtains
 *   it through the `desktop:credentials.*` capabilities, so this is a *keychain
 *   at rest* guarantee, not a renderer-isolation one: any code running in the
 *   app shell (including a plugin bundle) that can call `window.knDesktop` can
 *   ask for it, exactly as it can ask for a file under the fs allowlist roots.
 *   `userData` is one of those roots, so the ciphertext file is readable by the
 *   shell too — it is just useless without the OS-bound key.
 * - When safeStorage cannot genuinely encrypt (no keyring; on Linux
 *   `getSelectedStorageBackend()` returns `basic_text`), no password is stored
 *   at all. The account name is still remembered so the form can be re-filled,
 *   and `credentials.available` reports false so the UI hides the option.
 */

import { app, safeStorage } from 'electron';
import * as fs from 'fs-extra';
import * as path from 'node:path';

export interface SavedCredentials {
  /** Login account (email / username). Not secret. */
  account: string;
  /** Decrypted password; `''` when only the account was remembered. */
  password: string;
  /** Sign in automatically when the login page mounts. */
  autoLogin: boolean;
  /** Epoch ms of the last write; absent when nothing has been saved yet. */
  updatedAt?: number;
}

export interface SaveCredentialsInput {
  account: string;
  password?: string;
  autoLogin?: boolean;
}

/** Stored shape. `password` is base64 ciphertext, never plaintext. */
interface StoredFile {
  version: 1;
  account: string;
  /** base64 of `safeStorage.encryptString(password)`. */
  passwordCipher?: string;
  autoLogin: boolean;
  updatedAt: number;
}

const FILE_NAME = 'login-credentials.json';

/**
 * Cap how long a password may be. The login form never accepts anything close
 * to this; the bound only keeps a malformed/abusive IPC payload from turning
 * into a huge file.
 */
const MAX_PASSWORD_LENGTH = 512;
const MAX_ACCOUNT_LENGTH = 320;

let cached: SavedCredentials | null | undefined;

const getFilePath = (): string => path.join(app.getPath('userData'), FILE_NAME);

/**
 * Whether the OS can actually encrypt at rest right now. Read lazily (not at
 * module load) because the keyring may only become reachable after app startup.
 *
 * On Linux a missing keyring daemon makes `isEncryptionAvailable()` report true
 * while the "encryption" is only a hardcoded-password obfuscation
 * (`getSelectedStorageBackend() === 'basic_text'`). A password must not be
 * stored under that pretense, so that counts as encryption being unavailable.
 */
export const isEncryptionAvailable = (): boolean => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform === 'linux') {
      const backend = (safeStorage as { getSelectedStorageBackend?: () => string })
        .getSelectedStorageBackend?.();
      if (backend === 'basic_text') return false;
    }
    return true;
  } catch {
    return false;
  }
};

const encryptPassword = (password: string): string | undefined => {
  if (!password) return undefined;
  if (!isEncryptionAvailable()) return undefined;
  try {
    return safeStorage.encryptString(password).toString('base64');
  } catch (error) {
    console.warn('[credentials] encrypt failed:', error);
    return undefined;
  }
};

const decryptPassword = (cipher?: string): string => {
  if (!cipher) return '';
  if (!isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch (error) {
    // A keychain change (new machine, restored profile, rotated key) makes old
    // ciphertext undecryptable. Treat it as "no saved password" rather than
    // failing the whole load.
    console.warn('[credentials] decrypt failed:', error);
    return '';
  }
};

const sanitizeAccount = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, MAX_ACCOUNT_LENGTH) : '';

const sanitizePassword = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MAX_PASSWORD_LENGTH) : '';

const readFile = async (): Promise<StoredFile | null> => {
  try {
    const raw = await fs.readFile(getFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredFile>;
    if (!parsed || typeof parsed !== 'object') return null;
    const account = sanitizeAccount(parsed.account);
    if (!account) return null;
    return {
      version: 1,
      account,
      passwordCipher: typeof parsed.passwordCipher === 'string' ? parsed.passwordCipher : undefined,
      autoLogin: Boolean(parsed.autoLogin),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn('[credentials] read failed:', error);
    }
    return null;
  }
};

const writeFile = async (data: StoredFile): Promise<void> => {
  const filePath = getFilePath();
  await fs.ensureDir(path.dirname(filePath));
  // 0600: the contents are encrypted, but there is no reason for other local
  // accounts to be able to read the ciphertext either.
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // Windows has no POSIX mode bits; ignore.
  }
};

const toPublic = (stored: StoredFile): SavedCredentials => ({
  account: stored.account,
  password: decryptPassword(stored.passwordCipher),
  autoLogin: stored.autoLogin,
  updatedAt: stored.updatedAt,
});

/** Read remembered credentials. Returns null when nothing is stored. */
export const loadCredentials = async (): Promise<SavedCredentials | null> => {
  if (cached !== undefined) return cached;
  const stored = await readFile();
  cached = stored ? toPublic(stored) : null;
  return cached;
};

/**
 * Persist credentials. A password is only kept when the OS can encrypt it;
 * otherwise the account is remembered on its own and `autoLogin` is forced
 * off, because auto-login without a stored password cannot succeed.
 *
 * When encryption is unavailable but a previously stored, still-encrypted
 * password exists for the same account, that ciphertext is preserved rather
 * than overwritten — a temporarily unreachable keyring must not destroy a
 * password the user asked us to keep.
 */
export const saveCredentials = async (input: SaveCredentialsInput): Promise<SavedCredentials> => {
  const account = sanitizeAccount(input?.account);
  if (!account) throw new Error('credentials.save: "account" is required');
  const password = sanitizePassword(input?.password);
  const encrypted = encryptPassword(password);

  let passwordCipher = encrypted;
  if (password && !encrypted) {
    const previous = await readFile();
    if (previous && previous.account === account && previous.passwordCipher) {
      passwordCipher = previous.passwordCipher;
    }
  }

  const stored: StoredFile = {
    version: 1,
    account,
    passwordCipher,
    // A preserved ciphertext proves only that a password exists; the caller
    // asked for the account to be remembered, not re-confirmed auto-login.
    autoLogin: Boolean(input?.autoLogin) && Boolean(encrypted),
    updatedAt: Date.now(),
  };
  await writeFile(stored);
  cached = toPublic(stored);
  return cached;
};

/** Forget the remembered credentials and remove the file. */
export const clearCredentials = async (): Promise<void> => {
  cached = null;
  try {
    await fs.remove(getFilePath());
  } catch (error) {
    console.warn('[credentials] clear failed:', error);
  }
};
