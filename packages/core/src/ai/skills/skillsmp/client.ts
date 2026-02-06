/**
 * SkillsMP API Client
 *
 * Client for interacting with the SkillsMP marketplace
 * @see https://skillsmp.com/docs/api
 */

import type {
    SkillsMPSkill,
    SkillsMPSearchResponse,
    SkillsMPCategory,
    SkillsMPConfig,
    SkillsMPSearchParams,
    ParsedSkillMd
} from './types'
import type { SerializableSkill } from '../skill-registry'

const DEFAULT_CONFIG: SkillsMPConfig = {
    baseUrl: 'https://skillsmp.com/api/v1'
}

/**
 * Parse SKILL.md content into structured data
 */
export function parseSkillMd(content: string): ParsedSkillMd | null {
    try {
        // Match YAML frontmatter between --- markers
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)

        if (!frontmatterMatch) {
            // Try without trailing content
            const simpleMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
            if (!simpleMatch) {
                return null
            }
            const yamlContent = simpleMatch[1]
            const frontmatter = parseYamlFrontmatter(yamlContent)
            return {
                frontmatter,
                content: content.slice(simpleMatch[0].length).trim()
            }
        }

        const yamlContent = frontmatterMatch[1]
        const markdownContent = frontmatterMatch[2]

        const frontmatter = parseYamlFrontmatter(yamlContent)

        return {
            frontmatter,
            content: markdownContent.trim()
        }
    } catch (error) {
        console.error('Failed to parse SKILL.md:', error)
        return null
    }
}

/**
 * Simple YAML frontmatter parser (handles basic key: value pairs)
 */
function parseYamlFrontmatter(yaml: string): ParsedSkillMd['frontmatter'] {
    const result: Record<string, unknown> = {
        name: '',
        description: ''
    }

    const lines = yaml.split('\n')
    let currentKey = ''
    let currentValue = ''
    let isMultiline = false

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        // Check for key: value pattern
        const keyValueMatch = line.match(/^(\w+):\s*(.*)$/)

        if (keyValueMatch && !isMultiline) {
            const [, key, value] = keyValueMatch

            if (value.startsWith('|') || value.startsWith('>')) {
                // Multiline value
                currentKey = key
                currentValue = ''
                isMultiline = true
            } else if (value.startsWith('"') && value.endsWith('"')) {
                // Quoted string
                result[key] = value.slice(1, -1)
            } else if (value.startsWith("'") && value.endsWith("'")) {
                // Single quoted string
                result[key] = value.slice(1, -1)
            } else {
                result[key] = value
            }
        } else if (isMultiline) {
            // Continue multiline value
            if (line.startsWith('  ') || line.startsWith('\t')) {
                currentValue += (currentValue ? '\n' : '') + line.trim()
            } else {
                // End of multiline
                result[currentKey] = currentValue
                isMultiline = false

                // Process this line as new key
                const newKeyValue = line.match(/^(\w+):\s*(.*)$/)
                if (newKeyValue) {
                    const [, key, value] = newKeyValue
                    result[key] = value
                }
            }
        }
    }

    // Handle remaining multiline value
    if (isMultiline && currentKey) {
        result[currentKey] = currentValue
    }

    return result as ParsedSkillMd['frontmatter']
}

/**
 * Convert SkillsMP skill to our SerializableSkill format
 */
export function convertToSerializableSkill(
    skillsMpSkill: SkillsMPSkill,
    parsedMd?: ParsedSkillMd
): SerializableSkill {
    return {
        id: `skillsmp-${skillsMpSkill.id}`,
        name: skillsMpSkill.name.toLowerCase().replace(/\s+/g, '-'),
        displayName: skillsMpSkill.name,
        description: skillsMpSkill.description,
        version: '1.0.0',
        author: skillsMpSkill.author,
        requiredTools: [], // SKILL.md format doesn't specify tools
        optionalTools: [],
        systemPromptFragment: parsedMd?.content || '',
        tags: skillsMpSkill.tags,
        homepage: skillsMpSkill.repository
    }
}

/**
 * SkillsMP API Client
 */
export class SkillsMPClient {
    private config: SkillsMPConfig

    constructor(config: Partial<SkillsMPConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config }
    }

    /**
     * Set API key for authenticated requests
     */
    setApiKey(apiKey: string): void {
        this.config.apiKey = apiKey
    }

    /**
     * Get request headers
     */
    private getHeaders(): HeadersInit {
        const headers: HeadersInit = {
            'Content-Type': 'application/json'
        }
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`
        }
        return headers
    }

    /**
     * Search skills using keywords
     */
    async search(params: SkillsMPSearchParams): Promise<SkillsMPSearchResponse> {
        const searchParams = new URLSearchParams({
            q: params.query,
            ...(params.page && { page: String(params.page) }),
            ...(params.pageSize && { pageSize: String(params.pageSize) }),
            ...(params.category && { category: params.category }),
            ...(params.sort && { sort: params.sort })
        })

        const response = await fetch(
            `${this.config.baseUrl}/skills/search?${searchParams}`,
            { headers: this.getHeaders() }
        )

        // Handle 204 No Content
        if (response.status === 204) {
            return { skills: [], total: 0, page: 1, pageSize: 20, hasMore: false }
        }

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('API Key 无效或未提供，请配置有效的 SkillsMP API Key')
            }
            throw new Error(`SkillsMP API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        // Handle empty or malformed response
        if (!data || !data.skills) {
            return { skills: [], total: 0, page: 1, pageSize: 20, hasMore: false }
        }

        return data
    }

    /**
     * Search skills using AI semantic search
     */
    async aiSearch(query: string, page = 1, pageSize = 20): Promise<SkillsMPSearchResponse> {
        const searchParams = new URLSearchParams({
            q: query,
            page: String(page),
            pageSize: String(pageSize)
        })

        const response = await fetch(
            `${this.config.baseUrl}/skills/ai-search?${searchParams}`,
            { headers: this.getHeaders() }
        )

        // Handle 204 No Content
        if (response.status === 204) {
            return { skills: [], total: 0, page: 1, pageSize: 20, hasMore: false }
        }

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('API Key 无效或未提供，请配置有效的 SkillsMP API Key')
            }
            throw new Error(`SkillsMP API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        if (!data || !data.skills) {
            return { skills: [], total: 0, page: 1, pageSize: 20, hasMore: false }
        }

        return data
    }

    /**
     * Get skill categories
     */
    async getCategories(): Promise<SkillsMPCategory[]> {
        try {
            const response = await fetch(
                `${this.config.baseUrl}/categories`,
                { headers: this.getHeaders() }
            )

            if (response.status === 204 || !response.ok) {
                return []
            }

            const data = await response.json()
            return Array.isArray(data) ? data : []
        } catch {
            // Silently fail for categories - not critical
            return []
        }
    }

    /**
     * Get skill details by ID
     */
    async getSkill(id: string): Promise<SkillsMPSkill> {
        const response = await fetch(
            `${this.config.baseUrl}/skills/${id}`,
            { headers: this.getHeaders() }
        )

        if (!response.ok) {
            throw new Error(`SkillsMP API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    /**
     * Fetch and parse SKILL.md content from a skill
     */
    async fetchSkillMd(skill: SkillsMPSkill): Promise<ParsedSkillMd | null> {
        try {
            const response = await fetch(skill.skillMdUrl)
            if (!response.ok) {
                return null
            }
            const content = await response.text()
            return parseSkillMd(content)
        } catch (error) {
            console.error('Failed to fetch SKILL.md:', error)
            return null
        }
    }

    /**
     * Install a skill from SkillsMP (fetch and convert)
     */
    async installSkill(skill: SkillsMPSkill): Promise<SerializableSkill> {
        const parsedMd = await this.fetchSkillMd(skill)
        return convertToSerializableSkill(skill, parsedMd || undefined)
    }
}

/**
 * Default client instance
 */
export const skillsMPClient = new SkillsMPClient()
