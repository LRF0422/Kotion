import { ai } from "@kn/plugin-ai";
import { bitable } from "@kn/plugin-bitable";
import { blockReference } from "@kn/plugin-block-reference";
import { chart } from "@kn/chart-plugin";
import { comment } from "@kn/plugin-comment";
import { stickyNote } from "@kn/plugin-sticky-note";
import { theme } from "@kn/plugin-theme";
import { office } from "@kn/plugin-office";
import { drawnix } from "@kn/plugin-drawnix";
import { fileManager } from "@kn/file-manager";
import { systemPlugins } from "./system-plugins";
import { mermaid } from "@kn/mermaid-plugin";
import { excalidraw } from "@kn/plugin-excalidraw";

// Development and public shares load the complete source-plugin compatibility
// set. Host-owned system plugins are shared with the production main boot.
export const bundledPlugins = [
  ai,
  // bitable,
  blockReference,
  chart,
  comment,
  stickyNote,
  theme,
  office,
  drawnix,
  ...systemPlugins,
  fileManager,
  mermaid,
  excalidraw,
];
