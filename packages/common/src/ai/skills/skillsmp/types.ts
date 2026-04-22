/**
 * SkillsMP API Types
 *
 * Type definitions for SkillsMP marketplace integration
 * @see https://skillsmp.com/docs/api
 */

/**
 * SkillsMP skill item from API response
 */
export interface SkillsMPSkill {
    id: string
    name: string
    description: string
    author: string
    repository: string
    stars: number
    category: string
    tags: string[]
    downloadUrl: string
    skillMdUrl: string
    createdAt: string
    updatedAt: string
}

/**
 * SkillsMP search response
 */
export interface SkillsMPSearchResponse {
    skills: SkillsMPSkill[]
    total: number
    page: number
    pageSize: number
    hasMore: boolean
}

/**
 * SkillsMP category
 */
export interface SkillsMPCategory {
    id: string
    name: string
    description: string
    count: number
    icon?: string
}

/**
 * SkillsMP API configuration
 */
export interface SkillsMPConfig {
    baseUrl: string
    apiKey?: string
}

/**
 * Parsed SKILL.md content
 */
export interface ParsedSkillMd {
    frontmatter: {
        name: string
        description: string
        [key: string]: unknown
    }
    content: string
}

/**
 * Search parameters
 */
export interface SkillsMPSearchParams {
    query: string
    category?: string
    page?: number
    pageSize?: number
    sort?: 'stars' | 'updated' | 'name'
}
