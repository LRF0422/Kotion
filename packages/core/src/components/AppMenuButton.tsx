import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    cn,
    toast,
} from '@kn/ui'
import { BookOpen, Bug, Github, Globe, Info, Power, RefreshCw, Settings } from '@kn/icon'
import { logger, useDesktop, useTranslation } from '@kn/common'
import { SettingDlg } from './settings/SeetingDlg'

/** Brand mark — mirrors the app favicon.svg so the in-app icon never drifts. */
const LogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 18, className }) => {
    const rawId = React.useId()
    const gradientId = 'kn-app-menu-' + rawId.replace(/:/g, '')
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            className={className}
            aria-hidden="true"
            style={{ display: 'block', flexShrink: 0 }}
        >
            <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fb923c" />
                    <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
            </defs>
            <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
            <rect x="9.1" y="8.8" width="3.8" height="14.4" rx="1.9" fill="#ffffff" />
            <path
                d="M22.4 8.8 13.7 16 22.9 23.2"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

const GITHUB_URL = 'https://github.com/LRF0422/knowledge-repo'
const RELEASES_URL = `${GITHUB_URL}/releases`
const RELEASES_API = 'https://api.github.com/repos/LRF0422/knowledge-repo/releases/latest'
const DOCS_URL = 'https://kotion.top/doc'
const WEBSITE_URL = 'https://kotion.top'

const openExternal = (url: string) => {
    // The desktop host intercepts window.open in its main process and forwards
    // it to the OS browser; the web opens a normal tab.
    window.open(url, '_blank', 'noopener,noreferrer')
}

const parseVersion = (value: string): number[] =>
    value
        .replace(/^v/i, '')
        .split(/[.+-]/)
        .map((part) => Number.parseInt(part, 10))
        .filter((part) => !Number.isNaN(part))

/** True when `latest` is a strictly newer semantic version than `current`. */
const isNewerVersion = (latest: string, current: string): boolean => {
    const next = parseVersion(latest)
    const now = parseVersion(current)
    for (let i = 0; i < Math.max(next.length, now.length); i += 1) {
        const a = next[i] ?? 0
        const b = now[i] ?? 0
        if (a > b) return true
        if (a < b) return false
    }
    return false
}

interface AboutInfo {
    name: string
    version: string
    platform: string
}

/**
 * Application menu entry for the top shell band.
 *
 * Sits to the left of the capture control on every platform: the trigger is the
 * app icon and the menu carries app-level actions. The update / quit entries
 * only exist in the desktop shell because they need the native bridge, so the
 * web renders a shorter menu instead of hiding the whole band.
 */
export const AppMenuButton: React.FC = () => {
    const { t } = useTranslation()
    const desktop = useDesktop()
    const isDesktopApp = Boolean(desktop)
    const [aboutOpen, setAboutOpen] = useState(false)
    const [aboutInfo, setAboutInfo] = useState<AboutInfo | null>(null)
    const [checkingUpdates, setCheckingUpdates] = useState(false)
    const settingsTriggerRef = useRef<HTMLButtonElement | null>(null)

    // Defer opening so the dropdown's close animation does not steal focus.
    const openAbout = useCallback(() => {
        window.setTimeout(() => setAboutOpen(true), 0)
    }, [])

    const openSettings = useCallback(() => {
        window.setTimeout(() => settingsTriggerRef.current?.click(), 0)
    }, [])

    useEffect(() => {
        if (!aboutOpen) return
        if (!desktop) {
            setAboutInfo({ name: t('appMenu.brand'), version: '', platform: 'web' })
            return
        }
        let alive = true
        desktop
            .invoke('system.info')
            .then((info) => {
                if (alive) setAboutInfo({ name: info.name, version: info.version, platform: info.platform })
            })
            .catch((error) => {
                logger.warn('Failed to read desktop app info for the About dialog', error)
                if (alive) setAboutInfo({ name: t('appMenu.brand'), version: '', platform: desktop.platform })
            })
        return () => {
            alive = false
        }
    }, [aboutOpen, desktop, t])

    const handleCheckUpdates = useCallback(async () => {
        if (!desktop || checkingUpdates) return
        setCheckingUpdates(true)
        const toastId = toast.loading(t('appMenu.checkingUpdates'))
        try {
            const info = await desktop.invoke('system.info')
            const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
            // A repo with no published release yet is "up to date", not an error.
            if (response.status === 404) {
                toast.success(t('appMenu.upToDate'), { id: toastId })
                return
            }
            if (!response.ok) throw new Error(`GitHub API responded with ${response.status}`)
            const release = (await response.json()) as { tag_name?: string; html_url?: string }
            const latest = String(release.tag_name || '').replace(/^v/i, '')
            if (latest && isNewerVersion(latest, info.version)) {
                toast.success(t('appMenu.updateAvailable', { version: latest }), {
                    id: toastId,
                    duration: 8000,
                    action: {
                        label: t('appMenu.download'),
                        onClick: () => openExternal(release.html_url || RELEASES_URL),
                    },
                })
            } else {
                toast.success(t('appMenu.upToDate'), { id: toastId })
            }
        } catch (error) {
            logger.warn('Failed to check for desktop updates', error)
            toast.error(t('appMenu.updateCheckFailed'), { id: toastId })
        } finally {
            setCheckingUpdates(false)
        }
    }, [checkingUpdates, desktop, t])

    const handleToggleDevTools = useCallback(() => {
        void desktop?.invoke('window.toggleDevTools')
    }, [desktop])

    const handleQuit = useCallback(() => {
        void desktop?.invoke('app.quit')
    }, [desktop])

    const label = t('appMenu.trigger')

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        title={label}
                        aria-label={label}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <LogoMark size={18} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={8} className="w-[224px]">
                    <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold">
                        <LogoMark size={16} />
                        <span>{t('appMenu.brand')}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={openAbout} className="cursor-pointer gap-2">
                        <Info className="h-4 w-4" />
                        <span>{t('appMenu.about')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openSettings} className="cursor-pointer gap-2">
                        <Settings className="h-4 w-4" />
                        <span>{t('appMenu.settings')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openExternal(DOCS_URL)} className="cursor-pointer gap-2">
                        <BookOpen className="h-4 w-4" />
                        <span>{t('appMenu.help')}</span>
                    </DropdownMenuItem>
                    {isDesktopApp && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onSelect={() => void handleCheckUpdates()}
                                disabled={checkingUpdates}
                                className="cursor-pointer gap-2"
                            >
                                <RefreshCw className={cn('h-4 w-4', checkingUpdates && 'animate-spin')} />
                                <span>{t('appMenu.checkForUpdates')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={handleToggleDevTools}
                                className="cursor-pointer gap-2"
                            >
                                <Bug className="h-4 w-4" />
                                <span>{t('appMenu.toggleDevTools')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={handleQuit}
                                className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                            >
                                <Power className="h-4 w-4" />
                                <span>{t('appMenu.quit')}</span>
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Hidden trigger so the dropdown can open the settings dialog, which
                owns its own open state and is already mounted by the rail. */}
            <SettingDlg>
                <button ref={settingsTriggerRef} type="button" className="hidden" aria-hidden="true" tabIndex={-1} />
            </SettingDlg>

            <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{t('appMenu.aboutTitle')}</DialogTitle>
                        <DialogDescription>{t('appMenu.aboutTitle')}</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-3 pt-2 text-center">
                        <LogoMark size={56} />
                        <div className="space-y-0.5">
                            <div className="text-lg font-semibold text-foreground">
                                {aboutInfo?.name || t('appMenu.brand')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {aboutInfo?.version ? `v${aboutInfo.version}` : t('appMenu.webVersion')}
                                {aboutInfo?.platform ? ` · ${aboutInfo.platform}` : ''}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                            <Button variant="outline" size="sm" onClick={() => openExternal(WEBSITE_URL)}>
                                <Globe className="mr-1.5 h-4 w-4" />
                                {t('appMenu.website')}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openExternal(GITHUB_URL)}>
                                <Github className="mr-1.5 h-4 w-4" />
                                GitHub
                            </Button>
                        </div>
                        <button
                            type="button"
                            onClick={() => openExternal(RELEASES_URL)}
                            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                        >
                            {t('appMenu.changelog')}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
