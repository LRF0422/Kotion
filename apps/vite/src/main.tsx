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


ReactDOM.createRoot(document.getElementById('root')!).render(
  <App plugins={[DefaultPluginInstance, ai, fileManager, blockReference, bitable, speechToText]} />
)
