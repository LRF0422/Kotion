import React from 'react'
import {
    Briefcase,
    ChefHat,
    Code2,
    FlaskConical,
    GraduationCap,
    HardHat,
    Palette,
    Plane,
    Scale,
    ShieldCheck,
    Stethoscope,
    Wheat,
} from '@kn/icon'
import { cn } from '../../lib/utils'
import { AGENT_AVATAR_SVG } from './agent-avatars.data'

/**
 * Profession avatars for custom agents.
 *
 * Each avatar pairs an open-source "Notionists" half-body character (artwork by
 * Zoish, generated with DiceBear, CC0 1.0 — see ./agent-avatars.data.ts) with a
 * monochrome profession badge from lucide. The characters are drawn with a
 * restrained expression (no mouth / no sunglasses) so they read as professional
 * rather than playful, and sit on a white disc that stays legible in dark mode.
 *
 * Lives in @kn/ui because both @kn/core and plugins render these; plugins may
 * not import @kn/core.
 */

export interface AgentAvatarProps {
    /** Profession id from AGENT_AVATAR_IDS. Unknown / empty falls back to a default person. */
    id?: string | null
    className?: string
    /** Hide the profession badge (e.g. for very tight layouts). */
    showBadge?: boolean
}

export interface ProfessionAvatarSpec {
    id: string
    /** Person artwork key in AGENT_AVATAR_SVG. */
    person: string
    Icon: React.ComponentType<{ className?: string }>
    /** Soft accent for the badge. */
    accent: string
}

/** Profession avatars, in display order. Ids are what CustomAgent.avatar stores. */
export const AGENT_AVATARS: ProfessionAvatarSpec[] = [
    { id: 'engineer', person: 'harper', Icon: HardHat, accent: '#FDE68A' },
    { id: 'doctor', person: 'avery', Icon: Stethoscope, accent: '#BFDBFE' },
    { id: 'teacher', person: 'casey', Icon: GraduationCap, accent: '#DDD6FE' },
    { id: 'developer', person: 'drew', Icon: Code2, accent: '#BBF7D0' },
    { id: 'lawyer', person: 'ellis', Icon: Scale, accent: '#E5E7EB' },
    { id: 'scientist', person: 'frankie', Icon: FlaskConical, accent: '#A5F3FC' },
    { id: 'chef', person: 'gray', Icon: ChefHat, accent: '#FED7AA' },
    { id: 'business', person: 'blake', Icon: Briefcase, accent: '#C7D2FE' },
    { id: 'designer', person: 'indie', Icon: Palette, accent: '#FBCFE8' },
    { id: 'pilot', person: 'jules', Icon: Plane, accent: '#BAE6FD' },
    { id: 'security', person: 'kai', Icon: ShieldCheck, accent: '#FCA5A5' },
    { id: 'farmer', person: 'lane', Icon: Wheat, accent: '#D9F99D' },
]

/** Stable avatar ids, in display order. */
export const AGENT_AVATAR_IDS: string[] = AGENT_AVATARS.map(avatar => avatar.id)

/** Avatar used when none is chosen. */
export const DEFAULT_AGENT_AVATAR = 'engineer'

const PersonArt: React.FC<{ person: string; className?: string }> = ({ person, className }) => {
    const key = AGENT_AVATAR_SVG[person] ? person : 'avery'
    return (
        <svg
            viewBox="0 0 1744 1744"
            className={className}
            fill="none"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            dangerouslySetInnerHTML={{ __html: AGENT_AVATAR_SVG[key] }}
        />
    )
}

/** Render a profession avatar; unknown ids fall back to a plain person. */
export const AgentAvatar: React.FC<AgentAvatarProps> = ({ id, className, showBadge = true }) => {
    const spec = id ? AGENT_AVATARS.find(avatar => avatar.id === id) : undefined
    const person = spec ? spec.person : id && AGENT_AVATAR_SVG[id] ? id : 'avery'
    return (
        <span className={cn('relative inline-flex shrink-0 rounded-full bg-white', className)}>
            <span className="h-full w-full overflow-hidden rounded-full">
                <PersonArt person={person} className="h-full w-full" />
            </span>
            {showBadge && spec && (
                <span
                    className="absolute -bottom-[6%] -right-[6%] flex h-[44%] w-[44%] items-center justify-center rounded-full ring-2 ring-white"
                    style={{ backgroundColor: spec.accent }}
                >
                    <spec.Icon className="h-[62%] w-[62%] text-[#37352f]" />
                </span>
            )}
        </span>
    )
}
