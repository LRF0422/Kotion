import { ai } from "@kn/plugin-ai";
import { bitable } from "@kn/plugin-bitable";
import { blockReference } from "@kn/plugin-block-reference";
import { speechToText } from "@kn/plugin-speech-to-text";
import { chart } from "@kn/chart-plugin";
import { comment } from "@kn/plugin-comment";
import { stickyNote } from "@kn/plugin-sticky-note";
import { theme } from "@kn/plugin-theme";
import { office } from "@kn/plugin-office";
import { drawnix } from "@kn/plugin-drawnix";
import { DefaultPluginInstance } from "@kn/plugin-main";
import { fileManager } from "@kn/file-manager";
import { mermaid } from "@kn/mermaid-plugin";
import { excalidraw } from "@kn/plugin-excalidraw";

// Local development keeps the current source-plugin workflow. Production only
// loads this compatibility set for public shares; normal routes use main alone.
export const bundledPlugins = [
  ai,
  bitable,
  blockReference,
  speechToText,
  chart,
  comment,
  stickyNote,
  theme,
  office,
  drawnix,
  DefaultPluginInstance,
  fileManager,
  // mermaid,
  excalidraw,
];
