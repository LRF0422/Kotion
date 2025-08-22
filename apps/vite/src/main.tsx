import ReactDOM from 'react-dom/client'
import { App } from "@kn/core"

import { DefaultPluginInstance } from '@kn/plugin-main'
import React from 'react'
import "@kn/ui/globals.css"
import { fileManager } from '@kn/file-manager'
import { mermaid } from "@kn/mermaid-plugin"
import { database } from "@kn/plugin-database"
import { excalidraw } from "@kn/plugin-excalidraw"

import { ai } from "@kn/plugin-ai"

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App plugins={[ai, DefaultPluginInstance, fileManager, database, excalidraw, mermaid]} />
)
