import { CheckCircle2, CircleAlert, TriangleAlert, XCircle, Lightbulb, Bookmark } from "@kn/icon";

export type InfoPanelType = 'default' | 'info' | 'success' | 'warning' | 'error' | 'tip' | 'bookmark';

export interface InfoPanelTypeConfig {
    label: string;
    color: {
        light: string;
        dark: string;
    };
    icon: React.ComponentType<any> | null;
    iconColor: string;
}

export const INFO_PANEL_TYPES: Record<InfoPanelType, InfoPanelTypeConfig> = {
    default: {
        label: 'Default',
        color: {
            light: '#f5f5f5',
            dark: '#262626'
        },
        icon: null,  // No icon by default
        iconColor: '#737373'
    },
    info: {
        label: 'Info',
        color: {
            light: '#eff6ff',
            dark: '#1e3a5f'
        },
        icon: CircleAlert,
        iconColor: '#3b82f6'
    },
    success: {
        label: 'Success',
        color: {
            light: '#f0fdf4',
            dark: '#14532d'
        },
        icon: CheckCircle2,
        iconColor: '#22c55e'
    },
    warning: {
        label: 'Warning',
        color: {
            light: '#fffbeb',
            dark: '#451a03'
        },
        icon: TriangleAlert,
        iconColor: '#f59e0b'
    },
    error: {
        label: 'Error',
        color: {
            light: '#fef2f2',
            dark: '#450a0a'
        },
        icon: XCircle,
        iconColor: '#ef4444'
    },
    tip: {
        label: 'Tip',
        color: {
            light: '#f0fdf4',
            dark: '#1c2a22'
        },
        icon: Lightbulb,
        iconColor: '#10b981'
    },
    bookmark: {
        label: 'Bookmark',
        color: {
            light: '#faf5ff',
            dark: '#3b0764'
        },
        icon: Bookmark,
        iconColor: '#8b5cf6'
    }
} as const;

// Preset color schemes for quick selection (no icon, just colors)
export interface PresetColor {
    name: string;
    light: string;
    dark: string;
}

export const PRESET_COLORS: PresetColor[] = [
    { name: 'Gray', light: '#f5f5f5', dark: '#262626' },
    { name: 'Blue', light: '#eff6ff', dark: '#1e3a5f' },
    { name: 'Green', light: '#f0fdf4', dark: '#14532d' },
    { name: 'Yellow', light: '#fffbeb', dark: '#451a03' },
    { name: 'Red', light: '#fef2f2', dark: '#450a0a' },
    { name: 'Purple', light: '#faf5ff', dark: '#3b0764' },
    { name: 'Pink', light: '#fdf2f8', dark: '#500724' },
    { name: 'Orange', light: '#fff7ed', dark: '#431407' },
    { name: 'Cyan', light: '#ecfeff', dark: '#083344' },
];

export const DEFAULT_INFO_PANEL_TYPE: InfoPanelType = 'default';
export const DEFAULT_INFO_PANEL_TIPS = '';
