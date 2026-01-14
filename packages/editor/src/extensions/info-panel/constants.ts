import { CheckCircle2, CircleAlert, TriangleAlert, XCircle } from "@kn/icon";

export type InfoPanelType = 'info' | 'success' | 'file' | 'error';

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
            light: '#cffafe',
            dark: '#083344'
        },
        icon: CircleAlert,
        iconColor: '#1D7AFC'
    },
    success: {
        color: {
            light: '#bbf7d0',
            dark: '#052e16',
        },
        icon: CheckCircle2,
        iconColor: '#22A06B'
    },
    file: {
        color: {
            light: '#fef3c7',
            dark: '#451a03'
        },
        icon: TriangleAlert,
        iconColor: '#E56910'
    },
    error: {
        color: {
            light: '#fecaca',
            dark: '#450a0a'
        },
        icon: XCircle,
        iconColor: '#C9372C'
    }
} as const;

export const DEFAULT_INFO_PANEL_TYPE: InfoPanelType = 'info';
export const DEFAULT_INFO_PANEL_TIPS = 'Tips';
