import ReactDOM from 'react-dom/client'
import { App } from "@kn/core"

import { DefaultPluginInstance } from '@kn/plugin-main'
import React from 'react'
import "@kn/ui/globals.css"
import { fileManager } from '@kn/file-manager'
import { mermaid } from "@kn/mermaid-plugin"
import { database } from "@kn/plugin-database"
import { excalidraw } from "@kn/plugin-excalidraw"
import { drawnix } from "@kn/plugin-drawnix"
import { drawio } from "@kn/plugin-drawio"
import { blockReference } from "@kn/plugin-block-reference"

import { ai } from "@kn/plugin-ai"


ReactDOM.createRoot(document.getElementById('root')!).render(
  <App plugins={[DefaultPluginInstance, fileManager, database]} />
)
