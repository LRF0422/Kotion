/**
 * Persistence for the desktop network policy (see ./net-policy).
 *
 * The switch is a *user* preference, so it must survive a restart and must not
 * live in a renderer store (localStorage / IndexedDB) where any injected script
 * or plugin bundle could flip it without the user seeing a settings toggle. It
 * is a plain JSON file in `userData` — the same trust level as the rest of the
 * app's own files — read once and cached.
 *
 * Failure is not fatal: an unreadable or corrupted file degrades to the
 * deny-by-default policy, and a failed write still answers with the policy the
 * main process is now enforcing, so the settings UI never shows a value the
 * guard is not using.
 */

import { app } from 'electron';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { DEFAULT_NET_POLICY, normalizeNetPolicy, type DesktopNetPolicy } from './net-policy';

const FILE_NAME = 'net-policy.json';

let cached: DesktopNetPolicy | undefined;

const getFilePath = (): string => path.join(app.getPath('userData'), FILE_NAME);

const readPolicy = (): DesktopNetPolicy => {
  try {
    const file = getFilePath();
    if (!fs.existsSync(file)) return { ...DEFAULT_NET_POLICY };
    return normalizeNetPolicy(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (error) {
    console.warn('[desktop] unreadable net policy; private targets stay blocked', error);
    return { ...DEFAULT_NET_POLICY };
  }
};

/** The policy the guard is enforcing right now. */
export const getNetPolicy = (): DesktopNetPolicy => {
  if (!cached) cached = readPolicy();
  return cached;
};

/**
 * Replace the policy. Anything other than an explicit `true` means "deny":
 * a malformed IPC payload must not be able to widen access by accident.
 *
 * Written via a temp file + rename so a crash mid-write leaves the previous
 * policy readable instead of a truncated JSON file.
 */
export const setNetPolicy = async (raw: unknown): Promise<DesktopNetPolicy> => {
  const next = normalizeNetPolicy(raw);
  cached = next;
  try {
    const file = getFilePath();
    const tmp = file + '.tmp';
    await fs.outputFile(tmp, JSON.stringify(next, null, 2), 'utf-8');
    await fs.move(tmp, file, { overwrite: true });
  } catch (error) {
    console.warn('[desktop] failed to persist net policy (in-memory value still applies)', error);
  }
  return next;
};
