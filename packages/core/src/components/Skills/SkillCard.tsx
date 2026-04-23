/**
 * Skill Card Component
 *
 * Displays a skill in a card format for marketplace and installed lists
 */

import React from 'react'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Button,
    Badge,
    Switch,
    cn,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider
} from '@kn/ui'
import {
    Download,
    Star,
    Check,
    Trash2,
    ExternalLink,
    Zap,
    Shield
} from '@kn/icon'
import type { InstalledSkill, SerializableSkill } from '@kn/common'

export interface SkillCardProps {
    skill: InstalledSkill | (SerializableSkill & {
        downloads?: number
        rating?: number
        ratingCount?: number
        verified?: boolean
        featured?: boolean
    })
    variant?: 'installed' | 'marketplace'
    isInstalled?: boolean
    onInstall?: () => void
    onUninstall?: () => void
    onToggleEnabled?: (enabled: boolean) => void
    onViewDetails?: () => void
    loading?: boolean
}

export const SkillCard: React.FC<SkillCardProps> = ({
    skill,
    variant = 'marketplace',
    isInstalled = false,
    onInstall,
    onUninstall,
    onToggleEnabled,
    onViewDetails,
    loading = false
}) => {
    const isInstalledSkill = 'installedAt' in skill
    const marketplaceSkill = skill as SerializableSkill & {
        downloads?: number
        rating?: number
        verified?: boolean
        featured?: boolean
    }

    return (
        <Card className={cn(
            "relative overflow-hidden transition-all hover:shadow-md",
            marketplaceSkill.featured && variant === 'marketplace' && "ring-2 ring-primary/20"
        )}>
            {/* Featured badge */}
            {marketplaceSkill.featured && variant === 'marketplace' && (
                <div className="absolute top-0 right-0">
                    <div className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-bl">
                        推荐
                    </div>
                </div>
            )}

            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                            <span className="truncate">
                                {skill.displayName || skill.name}
                            </span>
                            {marketplaceSkill.verified && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Shield className="h-4 w-4 text-blue-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>官方认证</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                            {skill.author && `by ${skill.author}`}
                            {skill.version && ` · v${skill.version}`}
                        </CardDescription>
                    </div>

                    {/* Enable/Disable switch for installed skills */}
                    {variant === 'installed' && isInstalledSkill && onToggleEnabled && (
                        <Switch
                            checked={(skill as InstalledSkill).enabled}
                            onCheckedChange={onToggleEnabled}
                            disabled={loading}
                        />
                    )}
                </div>
            </CardHeader>

            <CardContent className="pb-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                    {skill.description}
                </p>

                {/* Tags */}
                {skill.tags && skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                        {skill.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                        {skill.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                                +{skill.tags.length - 3}
                            </Badge>
                        )}
                    </div>
                )}

                {/* Required tools count */}
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <Zap className="h-3 w-3" />
                    <span>需要 {skill.requiredTools.length} 个工具</span>
                </div>
            </CardContent>

            <CardFooter className="pt-0 flex items-center justify-between">
                {/* Stats for marketplace */}
                {variant === 'marketplace' && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {marketplaceSkill.downloads !== undefined && (
                            <span className="flex items-center gap-1">
                                <Download className="h-3 w-3" />
                                {formatNumber(marketplaceSkill.downloads)}
                            </span>
                        )}
                        {marketplaceSkill.rating !== undefined && (
                            <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                {marketplaceSkill.rating.toFixed(1)}
                            </span>
                        )}
                    </div>
                )}

                {/* Source info for installed */}
                {variant === 'installed' && isInstalledSkill && (
                    <div className="text-xs text-muted-foreground">
                        {getSourceLabel((skill as InstalledSkill).source)}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {onViewDetails && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onViewDetails}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    )}

                    {variant === 'marketplace' && (
                        isInstalled ? (
                            <Button size="sm" variant="secondary" disabled>
                                <Check className="h-4 w-4 mr-1" />
                                已安装
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={onInstall}
                                disabled={loading}
                            >
                                <Download className="h-4 w-4 mr-1" />
                                安装
                            </Button>
                        )
                    )}

                    {variant === 'installed' && onUninstall && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onUninstall}
                            disabled={loading}
                            className="text-destructive hover:text-destructive"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </CardFooter>
        </Card>
    )
}

function formatNumber(num: number): string {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k'
    }
    return num.toString()
}

function getSourceLabel(source: InstalledSkill['source']): string {
    switch (source) {
        case 'marketplace':
            return '来自市场'
        case 'custom':
            return '自定义'
        case 'import':
            return '导入'
        default:
            return source
    }
}
