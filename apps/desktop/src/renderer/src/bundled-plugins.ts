import { DefaultPluginInstance } from '@kn/plugin-main'
import { fileManager } from '@kn/file-manager'
import { blockReference } from '@kn/plugin-block-reference'
import { ai } from '@kn/plugin-ai'
import { bitable } from '@kn/plugin-bitable'
import { theme } from '@kn/plugin-theme'
import { speechToText } from '@kn/plugin-speech-to-text'
import { logicFlow } from '@kn/plugin-logicflow'
import { apiClient } from '@kn/plugin-api-client'
import { github } from '@kn/plugin-github'

/**
 * Development-only compatibility set. Imported lazily behind `import.meta.env.DEV`
 * so production builds tree-shake it and ship only {@link systemPlugins}.
 */
export const bundledPlugins = [
    DefaultPluginInstance,
    fileManager,
    bitable,
    blockReference,
    ai,
    theme,
    speechToText,
    logicFlow,
    apiClient,
    github,
]
