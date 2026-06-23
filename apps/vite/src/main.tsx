import ReactDOM from 'react-dom/client'
import { App } from "@kn/core"

import React from 'react'
import "@kn/ui/globals.css"
import { DefaultPluginInstance } from "@kn/plugin-main"
import { fileManager } from "@kn/file-manager"
import { blockReference } from "@kn/plugin-block-reference"
import { bitable } from "@kn/plugin-bitable"
import { speechToText } from "@kn/plugin-speech-to-text"
import { ai } from "@kn/plugin-ai"
import { chart } from "@kn/chart-plugin"
import { drawnix } from "@kn/plugin-drawnix"
import { mermaid } from "@kn/mermaid-plugin"
import { excalidraw } from "@kn/plugin-excalidraw"
import { comment } from "@kn/plugin-comment"
import { stickyNote } from "@kn/plugin-sticky-note"
import { theme } from "@kn/plugin-theme"
import { office} from "@kn/plugin-office"


ReactDOM.createRoot(document.getElementById('root')!).render(
  <App plugins={[ai, bitable, blockReference, speechToText, chart,
    comment, stickyNote, theme, office,
    drawnix, DefaultPluginInstance, fileManager, mermaid, excalidraw]} />
)
 