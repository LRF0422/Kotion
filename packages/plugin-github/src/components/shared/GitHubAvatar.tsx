import React from 'react'
import { cn } from '@kn/ui'

interface GitHubAvatarProps {
    login: string
    avatarUrl?: string
    size?: 'sm' | 'md'
    className?: string
}

export const GitHubAvatar: React.FC<GitHubAvatarProps> = ({ login, avatarUrl, size = 'sm', className }) => {
    const sizeClass = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
    const base = cn(sizeClass, 'shrink-0 rounded-full ring-1 ring-inset ring-border', className)

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={login}
                title={'@' + login}
                loading="lazy"
                className={cn(base, 'bg-muted object-cover')}
            />
        )
    }

    return (
        <span
            title={'@' + login}
            className={cn(base, 'inline-flex items-center justify-center bg-muted text-[10px] font-semibold text-muted-foreground')}
        >
            {login.charAt(0).toUpperCase()}
        </span>
    )
}
