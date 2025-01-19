import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@repo/ui/src/globals.css'
import '@repo/editor/src/styles/editor.css'

import * as React from "react"
import * as ui from "@repo/ui"
import * as common from "@repo/common"

window.React = React
// @ts-ignore
window.ui = ui
// @ts-ignore
window.common = common

ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)
