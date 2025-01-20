import ReactDOM from 'react-dom/client'
// import App from './App.tsx'
import { App } from "@repo/core"

import { DefaultPluginInstance } from './App'
import React from 'react'
import "@repo/ui/src/globals.css"

ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode>
  <App plugins={[DefaultPluginInstance]} />
  // </React.StrictMode>,
)
