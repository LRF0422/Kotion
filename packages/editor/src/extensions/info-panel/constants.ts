import { CheckCircle2, CircleAlert, TriangleAlert, XCircle } from "@kn/icon";

export type InfoPanelType = 'info' | 'success' | 'file' | 'error' | 'custom';

export interface InfoPanelTypeConfig {
    color: {
        light: string;
        dark: string;
    };
    icon: React.ComponentType<any>;
    iconColor: string;
}

export const INFO_PANEL_TYPES: Record<InfoPanelType, InfoPanelTypeConfig> = {
    info: {
        color: {
            light: '#eff6ff',
            dark: '#1e293b'  // Slate-800, subtle blue-gray
        },
        icon: CircleAlert,
        iconColor: '#3b82f6'
    },
    success: {
        color: {
            light: '#f0fdf4',
            dark: '#1c2a22',  // Subtle dark green
        },
        icon: CheckCircle2,
        iconColor: '#22c55e'
    },
    file: {
        color: {
            light: '#fefce8',
            dark: '#292524'  // Subtle warm dark
        },
        icon: TriangleAlert,
        iconColor: '#eab308'
    },
    error: {
        color: {
            light: '#fef2f2',
            dark: '#2a2020'  // Subtle dark red
        },
        icon: XCircle,
        iconColor: '#ef4444'
    },
    custom: {
        color: {
            light: '#f3f4f6',
            dark: '#27272a'  // Zinc-800
        },
        icon: CircleAlert,
        iconColor: '#71717a'
    }
} as const;

export const DEFAULT_INFO_PANEL_TYPE: InfoPanelType = 'info';
export const DEFAULT_INFO_PANEL_TIPS = 'Tips';
