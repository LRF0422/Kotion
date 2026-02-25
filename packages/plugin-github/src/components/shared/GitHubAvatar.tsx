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

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={login}
                title={`@${login}`}
                className={cn(sizeClass, 'rounded-full', className)}
            />
        )
    }

    return (
        <div
            title={`@${login}`}
            className={cn(
                sizeClass,
                'rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground',
                className
            )}
        >
            {login.charAt(0).toUpperCase()}
        </div>
    )
}
