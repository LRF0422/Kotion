import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@kn/core";
import { DefaultPluginInstance } from "@kn/plugin-main";

import "@kn/ui/globals.css";

const webBootMode = import.meta.env.DEV
  ? "development"
  : window.location.pathname.startsWith("/share/")
    ? "share"
    : "main";

(window as any).__KN_WEB_BOOT_MODE__ = webBootMode;
const shouldLoadBundledPlugins = webBootMode !== "main";

const loadInitialPlugins = async () => {
  if (!shouldLoadBundledPlugins) {
    return [DefaultPluginInstance];
  }

  try {
    const { bundledPlugins } = await import("./bundled-plugins");
    return bundledPlugins;
  } catch (error) {
    window.__KN__.common.logger.error("Failed to load bundled plugins:", error);
    if (webBootMode === "share") throw error;
    return [DefaultPluginInstance];
  }
};

const bootstrap = async () => {
  const root = ReactDOM.createRoot(document.getElementById("root")!);

  if (shouldLoadBundledPlugins) {
    root.render(
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading plugins…
      </div>,
    );
  }

  try {
    const plugins = await loadInitialPlugins();
    root.render(<App plugins={plugins} />);
  } catch (error) {
    root.render(
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Failed to load the plugins required for this shared page.
        </p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>,
    );
  }
};

void bootstrap();
