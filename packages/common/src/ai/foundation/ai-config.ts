/**
 * AI Configuration Management
 *
 * Manages AI configuration including API keys, model selection, and settings.
 * Supports persistent storage and environment-based configuration.
 */

import type { AIFoundationConfig, AIModelConfig } from './types'

const STORAGE_KEY = 'kn_ai_config'

const DEFAULT_CONFIG: AIFoundationConfig = {
    defaultModel: {
        provider: 'deepseek',
        model: 'deepseek-chat'
    },
    maxTokens: 4096,
    temperature: 0.7,
    debug: false
}

const MODEL_PRESETS: Record<string, AIModelConfig> = {
    'deepseek-chat': {
        provider: 'deepseek',
        model: 'deepseek-chat'
    },
    'deepseek-reasoner': {
        provider: 'deepseek',
        model: 'deepseek-reasoner'
    },
    'claude-3-sonnet': {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229'
    },
    'claude-3-opus': {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229'
    },
    'gpt-4': {
        provider: 'openai',
        model: 'gpt-4-turbo-preview'
    },
    'gpt-4o': {
        provider: 'openai',
        model: 'gpt-4o'
    }
}

export interface AIConfigManager {
    /** Get current configuration */
    getConfig(): AIFoundationConfig

    /** Update configuration */
    setConfig(config: Partial<AIFoundationConfig>): void

    /** Get model config */
    getModelConfig(): AIModelConfig

    /** Set model */
    setModel(provider: AIModelConfig['provider'], model: string): void

    /** Set API key for provider */
    setApiKey(provider: AIModelConfig['provider'], apiKey: string): void

    /** Get API key for provider */
    getApiKey(provider: AIModelConfig['provider']): string | undefined

    /** Reset to defaults */
    reset(): void

    /** Get available model presets */
    getModelPresets(): Record<string, AIModelConfig>

    /** Subscribe to config changes */
    subscribe(listener: () => void): () => void
}

class AIConfigManagerImpl implements AIConfigManager {
    private config: AIFoundationConfig
    private listeners: Set<() => void> = new Set()

    constructor() {
        this.config = this.loadConfig()
    }

    private loadConfig(): AIFoundationConfig {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
                const parsed = JSON.parse(stored)
                return { ...DEFAULT_CONFIG, ...parsed }
            }
        } catch (error) {
            console.warn('Failed to load AI config from storage:', error)
        }
        return { ...DEFAULT_CONFIG }
    }

    private saveConfig(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config))
        } catch (error) {
            console.warn('Failed to save AI config to storage:', error)
        }
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener())
    }

    getConfig(): AIFoundationConfig {
        return { ...this.config }
    }

    setConfig(config: Partial<AIFoundationConfig>): void {
        this.config = { ...this.config, ...config }
        this.saveConfig()
        this.notifyListeners()
    }

    getModelConfig(): AIModelConfig {
        return this.config.defaultModel || DEFAULT_CONFIG.defaultModel!
    }

    setModel(provider: AIModelConfig['provider'], model: string): void {
        this.config.defaultModel = {
            ...this.config.defaultModel,
            provider,
            model
        }
        this.saveConfig()
        this.notifyListeners()
    }

    setApiKey(provider: AIModelConfig['provider'], apiKey: string): void {
        if (!this.config.defaultModel) {
            this.config.defaultModel = { ...DEFAULT_CONFIG.defaultModel! }
        }
        if (this.config.defaultModel.provider === provider) {
            this.config.defaultModel.apiKey = apiKey
        }
        // Also store in a separate map for other providers
        if (!(this.config as any).apiKeys) {
            (this.config as any).apiKeys = {}
        }
        (this.config as any).apiKeys[provider] = apiKey
        this.saveConfig()
        this.notifyListeners()
    }

    getApiKey(provider: AIModelConfig['provider']): string | undefined {
        const config = this.config as any
        if (config.apiKeys?.[provider]) {
            return config.apiKeys[provider]
        }
        if (this.config.defaultModel?.provider === provider) {
            return this.config.defaultModel.apiKey
        }
        // Fall back to environment variable
        // Note: import.meta.env is only available in Vite runtime
        // For other environments, environment variables should be passed through config
        try {
            // @ts-ignore - Vite specific
            if (typeof globalThis !== 'undefined' && globalThis.__VITE_ENV__) {
                // @ts-ignore
                const envKey = `VITE_${provider.toUpperCase()}_API_KEY`
                // @ts-ignore
                return globalThis.__VITE_ENV__[envKey]
            }
        } catch {
            // Ignore if not available
        }
        return undefined
    }

    reset(): void {
        this.config = { ...DEFAULT_CONFIG }
        this.saveConfig()
        this.notifyListeners()
    }

    getModelPresets(): Record<string, AIModelConfig> {
        return { ...MODEL_PRESETS }
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
}

// Singleton instance
let configManagerInstance: AIConfigManager | null = null

export function getAIConfigManager(): AIConfigManager {
    if (!configManagerInstance) {
        configManagerInstance = new AIConfigManagerImpl()
    }
    return configManagerInstance
}

export function createAIConfigManager(): AIConfigManager {
    return new AIConfigManagerImpl()
}
