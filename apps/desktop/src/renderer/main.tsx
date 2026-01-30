import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from '@kn/core'

// Import styles
import '@kn/ui/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
