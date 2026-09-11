import React, { useId } from 'react'

/**
 * Octocat path (Bootstrap Icons / MIT). The path draws a filled disc with the
 * cat knocked out, so it is used through a mask to render the solid cat.
 */
const OCTOCAT_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z'

export interface GitHubLogoProps {
    /** Rendered square size in pixels. Defaults to 40. */
    size?: number
    className?: string
    /** Accessible label. */
    title?: string
}

/**
 * Colorful GitHub plugin logo (app-icon style): a dark squircle with the
 * Octocat mark and a document badge that hints at changelogs and project docs.
 */
export const GitHubLogo: React.FC<GitHubLogoProps> = ({ size = 40, className, title = 'GitHub' }) => {
    const reactId = useId()
    const uid = reactId.replace(/[^a-zA-Z0-9_-]/g, '')
    const bgId = 'kn-gh-bg-' + uid
    const discId = 'kn-gh-disc-' + uid
    const docId = 'kn-gh-doc-' + uid
    const catId = 'kn-gh-cat-' + uid

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            role="img"
            aria-label={title}
            focusable="false"
        >
            <defs>
                <linearGradient id={bgId} x1="8" y1="2" x2="58" y2="62" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#333A44" />
                    <stop offset="1" stopColor="#0B0F14" />
                </linearGradient>
                <linearGradient id={discId} x1="0.12" y1="0" x2="0.72" y2="1">
                    <stop stopColor="#FFFFFF" />
                    <stop offset="1" stopColor="#D7E0EC" />
                </linearGradient>
                <linearGradient id={docId} x1="0.1" y1="0" x2="0.9" y2="1">
                    <stop stopColor="#6CB6FF" />
                    <stop offset="1" stopColor="#2F6FEB" />
                </linearGradient>
                <mask id={catId}>
                    <rect width="16" height="16" fill="#ffffff" />
                    <path fill="#000000" d={OCTOCAT_PATH} />
                </mask>
            </defs>
            <rect x="2" y="2" width="60" height="60" rx="16" fill={'url(#' + bgId + ')'} />
            <rect
                x="2.75"
                y="2.75"
                width="58.5"
                height="58.5"
                rx="15.25"
                stroke="#FFFFFF"
                strokeOpacity="0.10"
                strokeWidth="1.5"
            />
            <g transform="translate(11.5,5) scale(1.95)">
                <circle cx="8" cy="8" r="7.9" fill={'url(#' + discId + ')'} mask={'url(#' + catId + ')'} />
            </g>
            <rect x="39.5" y="38.5" width="19.5" height="20.5" rx="5.75" fill="#0B0F14" />
            <rect x="42" y="41" width="14.5" height="15.5" rx="3.3" fill={'url(#' + docId + ')'} />
            <rect x="45" y="44.6" width="8.5" height="1.9" rx="0.95" fill="#FFFFFF" fillOpacity="0.96" />
            <rect x="45" y="48.3" width="8.5" height="1.9" rx="0.95" fill="#FFFFFF" fillOpacity="0.78" />
            <rect x="45" y="52" width="5.6" height="1.9" rx="0.95" fill="#FFFFFF" fillOpacity="0.58" />
        </svg>
    )
}

export interface GitHubMarkProps {
    /** Rendered square size in pixels. Omit to inherit the surrounding font/icon size. */
    size?: number
    className?: string
    title?: string
}

/**
 * Monochrome GitHub mark that inherits `currentColor`, tuned for small sizes
 * such as the settings navigation (16px).
 */
export const GitHubMark: React.FC<GitHubMarkProps> = ({ size, className, title = 'GitHub' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label={title}
        focusable="false"
    >
        <path fill="currentColor" d={OCTOCAT_PATH} />
    </svg>
)
