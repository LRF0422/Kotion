/**
 * SkillsMP Marketplace Component
 *
 * Browse and install skills from SkillsMP marketplace
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
    Button,
    Input,
    Badge,
    Skeleton,
    cn,
    toast,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@kn/ui'
import {
    Search,
    Store,
    Zap,
    ExternalLink,
    Download,
    Star,
    ChevronDown,
    AlertCircle,
    Github
} from '@kn/icon'
import { useSkillsMP } from '@kn/common'
import { convertToSerializableSkill } from '@kn/common'
import type { SkillsMPSkill } from '@kn/common'
import type { SerializableSkill } from '@kn/common'

export interface SkillsMPMarketplaceProps {
    onInstall: (skill: SerializableSkill) => Promise<void>
    isInstalled: (skillId: string) => boolean
    onViewDetails: (skill: SerializableSkill) => void
    apiKey?: string
    loading?: boolean
    className?: string
}

// Try to get API key from environment variable
const getApiKey = (propKey?: string): string | undefined => {
    if (propKey) return propKey
    // Check various environment variable names
    if (typeof window !== 'undefined') {
        // @ts-ignore
        return window.__KN__?.SKILLSMP_API_KEY
    }
    return undefined
}

export const SkillsMPMarketplace: React.FC<SkillsMPMarketplaceProps> = ({
    onInstall,
    isInstalled,
    onViewDetails,
    apiKey: propApiKey,
    loading: actionLoading,
    className
}) => {
    // API Key state - try to load from localStorage
    const [localApiKey, setLocalApiKey] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('skillsmp_api_key') || ''
        }
        return ''
    })
    const [showApiKeyInput, setShowApiKeyInput] = useState(false)

    const apiKey = getApiKey(propApiKey) || localApiKey || undefined

    const {
        skills,
        categories,
        loading,
        error,
        hasMore,
        total,
        search,
        aiSearch,
        loadMore,
        loadCategories
    } = useSkillsMP({ apiKey })

    const [searchQuery, setSearchQuery] = useState('')
    const [searchMode, setSearchMode] = useState<'keyword' | 'ai'>('keyword')
    const [selectedCategory, setSelectedCategory] = useState<string>('')
    const [installingId, setInstallingId] = useState<string | null>(null)

    // Save API key to localStorage
    const handleSaveApiKey = () => {
        if (localApiKey) {
            localStorage.setItem('skillsmp_api_key', localApiKey)
            setShowApiKeyInput(false)
            toast.success('API Key 已保存')
        }
    }

    // Load categories on mount
    useEffect(() => {
        loadCategories()
    }, [loadCategories])

    // Handle search
    const handleSearch = useCallback(() => {
        if (!searchQuery.trim()) return

        if (searchMode === 'ai') {
            aiSearch(searchQuery)
        } else {
            search(searchQuery, selectedCategory || undefined)
        }
    }, [searchQuery, searchMode, selectedCategory, search, aiSearch])

    // Handle key press
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch()
        }
    }

    // Handle install
    const handleInstall = async (skill: SkillsMPSkill) => {
        setInstallingId(skill.id)
        try {
            const serializableSkill = convertToSerializableSkill(skill)
            await onInstall(serializableSkill)
            toast.success(`技能 "${skill.name}" 安装成功`)
        } catch (err) {
            toast.error('安装失败')
        } finally {
            setInstallingId(null)
        }
    }

    // Handle view details
    const handleViewDetails = (skill: SkillsMPSkill) => {
        const serializableSkill = convertToSerializableSkill(skill)
        onViewDetails(serializableSkill)
    }

    return (
        <div className={cn("space-y-4", className)}>
            {/* Header with SkillsMP branding */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-primary" />
                    <span className="font-medium">SkillsMP</span>
                    <Badge variant="secondary" className="text-xs">
                        145,000+ 技能
                    </Badge>
                </div>
                <a
                    href="https://skillsmp.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                >
                    访问官网
                    <ExternalLink className="h-3 w-3" />
                </a>
            </div>

            {/* Search controls */}
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={searchMode === 'ai' ? "用自然语言描述你需要的技能..." : "搜索技能..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="pl-9"
                    />
                </div>
                <Select value={searchMode} onValueChange={(v: 'keyword' | 'ai') => setSearchMode(v)}>
                    <SelectTrigger className="w-[120px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="keyword">
                            <div className="flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                关键词
                            </div>
                        </SelectItem>
                        <SelectItem value="ai">
                            <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4" />
                                AI 搜索
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>
                <Button onClick={handleSearch} disabled={loading || !searchQuery.trim()}>
                    搜索
                </Button>
            </div>

            {/* Category filter */}
            {categories.length > 0 && searchMode === 'keyword' && (
                <div className="flex flex-wrap gap-2">
                    <Badge
                        variant={selectedCategory === '' ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => setSelectedCategory('')}
                    >
                        全部
                    </Badge>
                    {categories.slice(0, 8).map(cat => (
                        <Badge
                            key={cat.id}
                            variant={selectedCategory === cat.id ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setSelectedCategory(cat.id)}
                        >
                            {cat.name}
                            <span className="ml-1 text-xs opacity-70">({cat.count})</span>
                        </Badge>
                    ))}
                </div>
            )}

            {/* API Key configuration */}
            {!apiKey || showApiKeyInput ? (
                <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                        <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <span className="text-muted-foreground">
                            SkillsMP API 需要认证才能搜索。
                            <a
                                href="https://skillsmp.com/docs/api"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline ml-1"
                            >
                                获取 API Key →
                            </a>
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            type="password"
                            placeholder="sk_live_..."
                            value={localApiKey}
                            onChange={e => setLocalApiKey(e.target.value)}
                            className="flex-1 font-mono text-sm"
                        />
                        <Button
                            size="sm"
                            onClick={handleSaveApiKey}
                            disabled={!localApiKey}
                        >
                            保存
                        </Button>
                        {showApiKeyInput && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setShowApiKeyInput(false)}
                            >
                                取消
                            </Button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>已配置 API Key</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setShowApiKeyInput(true)}
                    >
                        修改
                    </Button>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Results */}
            {loading && skills.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <Skeleton key={i} className="h-40" />
                    ))}
                </div>
            ) : skills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Store className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">搜索 SkillsMP 技能市场</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md">
                        输入关键词或使用 AI 搜索来发现 145,000+ 技能。
                        支持 Claude Code、OpenAI Codex 等多种 AI 助手。
                    </p>
                </div>
            ) : (
                <>
                    {/* Results count */}
                    <div className="text-sm text-muted-foreground">
                        找到 {total} 个技能
                    </div>

                    {/* Skills grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {skills.map(skill => (
                            <SkillsMPCard
                                key={skill.id}
                                skill={skill}
                                isInstalled={isInstalled(`skillsmp-${skill.id}`)}
                                installing={installingId === skill.id}
                                onInstall={() => handleInstall(skill)}
                                onViewDetails={() => handleViewDetails(skill)}
                            />
                        ))}
                    </div>

                    {/* Load more */}
                    {hasMore && (
                        <div className="flex justify-center pt-4">
                            <Button
                                variant="outline"
                                onClick={loadMore}
                                disabled={loading}
                            >
                                {loading ? (
                                    '加载中...'
                                ) : (
                                    <>
                                        加载更多
                                        <ChevronDown className="h-4 w-4 ml-2" />
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

/**
 * SkillsMP Skill Card
 */
interface SkillsMPCardProps {
    skill: SkillsMPSkill
    isInstalled: boolean
    installing: boolean
    onInstall: () => void
    onViewDetails: () => void
}

const SkillsMPCard: React.FC<SkillsMPCardProps> = ({
    skill,
    isInstalled,
    installing,
    onInstall,
    onViewDetails
}) => {
    return (
        <div className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{skill.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {skill.description}
                    </p>
                </div>
            </div>

            {/* Meta info */}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                    <Github className="h-3 w-3" />
                    {skill.author}
                </span>
                <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {skill.stars}
                </span>
                <Badge variant="outline" className="text-xs">
                    {skill.category}
                </Badge>
            </div>

            {/* Tags */}
            {skill.tags && skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                    {skill.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                        </Badge>
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4">
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={onViewDetails}
                >
                    查看详情
                </Button>
                {isInstalled ? (
                    <Button size="sm" disabled className="flex-1">
                        已安装
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        className="flex-1"
                        onClick={onInstall}
                        disabled={installing}
                    >
                        {installing ? (
                            '安装中...'
                        ) : (
                            <>
                                <Download className="h-4 w-4 mr-1" />
                                安装
                            </>
                        )}
                    </Button>
                )}
            </div>
        </div>
    )
}
