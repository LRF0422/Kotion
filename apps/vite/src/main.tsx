import ReactDOM from 'react-dom/client'
// import App from './App.tsx'
import { App } from "@repo/core"

import { DefaultPluginInstance } from './App'
import React from 'react'
import "@repo/ui/globals.css"
import { fileManager } from '@repo/file-manager'

ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode>
  <App plugins={[DefaultPluginInstance, fileManager]} />
  // </React.StrictMode>,
)
