import ReactDOM from 'react-dom/client'
import { App } from "@kn/core"
import { DefaultPluginInstance } from '@kn/plugin-main'
import "@kn/ui/globals.css"
import { fileManager } from '@kn/file-manager'
import { blockReference } from "@kn/plugin-block-reference"
import { ai } from "@kn/plugin-ai"
import { bitable } from "@kn/plugin-bitable"
import { weaverOA } from "@kn/plugin-weaver-oa"
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <App plugins={[DefaultPluginInstance, fileManager, bitable, blockReference, ai, weaverOA]} />
)
