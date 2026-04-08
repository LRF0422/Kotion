import ReactDOM from 'react-dom/client'
import { App } from "@kn/core"

import React from 'react'
import "@kn/ui/globals.css"
import { DefaultPluginInstance } from "@kn/plugin-main"
import { ai } from "@kn/plugin-ai"


ReactDOM.createRoot(document.getElementById('root')!).render(
  <App plugins={[DefaultPluginInstance, ai]} />
)
