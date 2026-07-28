import React from 'react'
import { FlatEmoji, DateIcon, DateIconConfig, cn } from '@kn/ui'
import { useOptionalService, FileService } from '@kn/common'

/**
 * 侧边栏/列表里的页面小图标统一渲染：
 * - EMOJI：扁平化（Twemoji）渲染，与页面头部保持一致
 * - IMAGE：解析文件名为下载 URL 后以圆角小图展示
 * - DATE：有 config 时渲染迷你日历卡片，否则降级为 icon 里的 📅
 */

export interface PageIconData {
    type?: string
    icon: string
    config?: DateIconConfig
}

interface PageItemIconProps {
    icon?: PageIconData | null
    /** 像素尺寸（宽=高），默认 14 */
    size?: number
    className?: string
}

export const PageItemIcon: React.FC<PageItemIconProps> = ({ icon, size = 14, className }) => {
    const fileService = useOptionalService('fileService') as FileService | undefined

    if (!icon?.icon) return null

    if (icon.type === 'DATE' && icon.config) {
        return <DateIcon config={icon.config} size={size} className={className} />
    }

    if (icon.type === 'IMAGE') {
        const name = icon.icon
        const url = /^(https?:|data:)/.test(name)
            ? name
            : fileService
                ? fileService.getDownloadUrl(name)
                : `https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName=${name}`
        return (
            <img
                src={url}
                alt=""
                style={{ width: size, height: size }}
                className={cn('rounded-sm object-cover flex-shrink-0', className)}
                draggable={false}
            />
        )
    }

    return <FlatEmoji emoji={icon.icon} size={size} className={cn('flex-shrink-0', className)} />
}
