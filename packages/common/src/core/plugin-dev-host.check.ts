/**
 * The host's dev-session binding.
 *
 * What this file is really about: **hot reload must not depend on a page**.
 *
 * The studio used to install builds from its own React effect, so a project only
 * hot-reloaded while that page happened to be mounted — edit the plugin, look at
 * the plugin, and the watcher rebuilt into nothing. The binding now lives in a
 * host service that subscribes to the desktop bridge once, for the whole app:
 * "this project's builds are the code of that registry entry".
 *
 * Run with: pnpm check:plugin-dev-host
 */
import { createPluginDevHost } from "./plugin-dev-host";
import type { PluginDevHostService } from "./plugin-dev-host";
import type { DevBridge, DevSessionStatus } from "./desktop-bridge";
import type { PluginBundle, PluginInstallOutcome } from "./plugin-bundle";
import type { PluginManager } from "./PluginManager";
import { logger } from "../utils/logger";

let checks = 0;

const assert = (condition: unknown, message: string): void => {
  checks += 1;
  if (!condition) throw new Error(message);
};

/** Monotonic per-status timestamp: a real session stamps each build, and two
 *  builds never share a millisecond (a build takes longer than one). */
let stamp = Date.now();

const statusOf = (
  root: string,
  buildCount: number,
  overrides: Partial<DevSessionStatus> = {},
): DevSessionStatus => ({
  root,
  state: "watching",
  plugin: { pluginKey: "demo-plugin", name: "Demo Plugin" },
  build: {
    code: `// build ${buildCount}`,
    css: `.demo-${buildCount} {}`,
    bytes: 10 + buildCount,
    durationMs: 5,
    modules: ["src/index.tsx"],
  },
  buildCount,
  updatedAt: ++stamp,
  watching: true,
  ...overrides,
});

/** A dev bridge that only does what the binding uses. */
class FakeDev {
  sessions = new Map<string, DevSessionStatus>();
  listeners = new Set<(status: DevSessionStatus) => void>();
  buildCalls: Array<{ root: string; writeToDisk?: boolean; externals?: string[] }> = [];
  /** Builds the next `build()` call should report. */
  pendingBuildCount = new Map<string, number>();

  onBuild(handler: (status: DevSessionStatus) => void) {
    this.listeners.add(handler);
    return () => { this.listeners.delete(handler) };
  }

  async status(options: { root?: string } = {}) {
    if (options.root) {
      const found = this.sessions.get(options.root);
      return found ? [found] : [];
    }
    return [...this.sessions.values()];
  }

  async build(options: { root: string; writeToDisk?: boolean; externals?: string[] }) {
    this.buildCalls.push(options);
    const current = this.sessions.get(options.root) ?? statusOf(options.root, 0);
    const next = statusOf(options.root, this.pendingBuildCount.get(options.root) ?? current.buildCount + 1);
    this.emit(next);
    return next;
  }

  /** Pretend the session rebuilt on its own (a file save). */
  emit(status: DevSessionStatus) {
    this.sessions.set(status.root, status);
    for (const listener of [...this.listeners]) listener(status);
  }
}

/** Registry stub: records bundles and answers with a scripted outcome. */
class FakeManager {
  bundles: PluginBundle[] = [];
  outcome: PluginInstallOutcome = {
    ok: true,
    mode: "installed",
    key: "demo-plugin",
    name: "Demo Plugin",
  };

  async installBundle(bundle: PluginBundle): Promise<PluginInstallOutcome> {
    this.bundles.push(bundle);
    return this.outcome;
  }
}

const makeHost = (dev: FakeDev | undefined, manager: FakeManager): PluginDevHostService =>
  createPluginDevHost({
    manager: manager as unknown as PluginManager,
    dev: dev as unknown as DevBridge | undefined,
  });

/** Let queued microtasks (the service's fire-and-forget installs) settle. */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 5));

const bindingChecks = async (): Promise<void> => {
  const dev = new FakeDev();
  const manager = new FakeManager();
  const host = makeHost(dev, manager);
  const root = "/tmp/kn-dev-host-demo";

  /* -- bind a running session: its current build installs immediately ------- */
  dev.sessions.set(root, statusOf(root, 3));
  const binding = await host.watch({ root, pluginKey: "demo-plugin", name: "Demo Plugin" });
  assert(manager.bundles.length === 1, "watching must install the build the session already has");
  assert(binding.buildCount === 3, "the binding must remember which build it installed");
  assert(binding.outcome?.ok === true, "the binding must record what the install did");
  assert(
    manager.bundles[0].css === ".demo-3 {}" && manager.bundles[0].pluginKey === "demo-plugin",
    `the bundle must carry code, css and identity: ${JSON.stringify(manager.bundles[0])}`,
  );
  assert(
    manager.bundles[0].version === "dev.3" && manager.bundles[0].sourceLabel === root,
    "the bundle must carry its version and project root",
  );

  /* -- a later build installs with no page involved ------------------------ */
  dev.emit(statusOf(root, 4));
  await settle();
  assert(manager.bundles.length === 2, "an incoming build must install on its own");
  assert(manager.bundles[1].version === "dev.4", "the new build must be the one installed");

  /* -- the same build twice is not installed twice ------------------------- */
  // Re-broadcast the *same* status object: the session emits one status per build,
  // and both the awaited build call and the event carry that same object.
  dev.emit(dev.sessions.get(root)!);
  await settle();
  assert(manager.bundles.length === 2, "a repeated event for the same build must be ignored");

  /* -- a failed rebuild has nothing to install ----------------------------- */
  dev.emit(statusOf(root, 5, { error: "src/Panel.tsx:3: Expected \")\"" }));
  await settle();
  assert(manager.bundles.length === 2, "a failed rebuild must not install its previous output");

  /* -- a refused reload is recorded, and does not stop later ones ---------- */
  manager.outcome = { ok: false, key: "demo-plugin", reason: "the bundle threw while being evaluated" };
  dev.emit(statusOf(root, 6));
  await settle();
  const refused = host.list()[0];
  assert(manager.bundles.length === 3, "the refused build must still be attempted");
  assert(
    refused.lastRejected === true && refused.outcome?.ok === false,
    `the refusal must be visible to the UI: ${JSON.stringify(refused.outcome)}`,
  );
  manager.outcome = { ok: true, mode: "reloaded", key: "demo-plugin", name: "Demo Plugin" };
  dev.emit(statusOf(root, 7));
  await settle();
  assert(
    host.list()[0].lastRejected === false && manager.bundles.length === 4,
    "a later good build must clear the refusal and install",
  );

  /* -- unwatch stops the hot reload --------------------------------------- */
  host.unwatch(root);
  assert(host.list().length === 0, "unwatch must drop the binding");
  dev.emit(statusOf(root, 8));
  await settle();
  assert(manager.bundles.length === 4, "an unbound project must not install anything");

  /* -- a project whose key was edited still finds its own entry ------------ */
  // (The binding carries the manifest key; the reload carries the project root,
  // which is what lets a bundle whose `pluginKey` changed replace its own entry
  // instead of colliding with it.)
  await host.watch({ root, pluginKey: "demo-plugin-renamed", name: "Demo Plugin" });
  await settle();
  assert(
    manager.bundles[4]?.pluginKey === "demo-plugin-renamed",
    "the binding's current key must be used, not the one from the earlier session",
  );
};

const buildOnceChecks = async (): Promise<void> => {
  const dev = new FakeDev();
  const manager = new FakeManager();
  const host = makeHost(dev, manager);
  const root = "/tmp/kn-dev-host-build";
  dev.sessions.set(root, statusOf(root, 1));
  await host.watch({ root, pluginKey: "demo-plugin", name: "Demo Plugin" });
  const installed = manager.bundles.length;
  dev.pendingBuildCount.set(root, 2);

  const { status, outcome } = await host.build({ root, writeToDisk: true, externals: ["svelte"] });
  assert(dev.buildCalls.length === 1 && dev.buildCalls[0].writeToDisk === true,
    "an explicit build must reach dev.build with its options");
  assert(
    dev.buildCalls[0].externals?.[0] === "svelte",
    `externals must be forwarded: ${JSON.stringify(dev.buildCalls[0])}`,
  );
  assert(status?.buildCount === 2, `the fresh session status must come back: ${status?.buildCount}`);
  assert(outcome?.ok === true, "an explicit build must install its result");
  assert(manager.bundles.length === installed + 1, "exactly one install per explicit build");

  /* -- a session restarted behind the binding's back still installs -------- */
  // The count can move backwards (a restarted session), and an explicit build is
  // an explicit instruction: it must not be silently deduplicated away.
  dev.pendingBuildCount.set(root, 1);
  await host.build({ root });
  assert(
    manager.bundles.length === installed + 2,
    `an explicit rebuild after a session restart must install: ${manager.bundles.length}`,
  );
};

const rebindChecks = async (): Promise<void> => {
  /* -- a renderer reload must not lose a running session ------------------- */
  const dev = new FakeDev();
  const manager = new FakeManager();
  dev.sessions.set("/tmp/kn-dev-host-rebind", statusOf("/tmp/kn-dev-host-rebind", 2));
  const host = makeHost(dev, manager);
  await settle();
  assert(host.list().length === 1, "a session that is still watching must be re-bound at boot");
  assert(manager.bundles.length === 1, "and its current build re-installed");
  assert(manager.bundles[0].version === "dev.2", "the re-installed build is the session's current one");

  /* -- no desktop dev surface: the service is inert, not broken ----------- */
  const headless = makeHost(undefined, new FakeManager());
  assert(headless.list().length === 0, "a host without the dev bridge must expose no bindings");
  const idle = await headless.build({ root: "/tmp/none" });
  assert(idle.status === undefined && idle.outcome === undefined, "and building must be a no-op");
};

const run = async (): Promise<void> => {
  await bindingChecks();
  await buildOnceChecks();
  await rebindChecks();
  logger.info(`plugin dev-host checks passed (${checks} assertions)`);
};

run().catch((error) => {
  logger.error(error);
  throw error;
});
