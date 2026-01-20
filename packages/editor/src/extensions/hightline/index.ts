import { ExtensionWrapper } from '@kn/common'
import { Highlight } from '@tiptap/extension-highlight'
import { HighlightStaticMenu } from './static-menu'
import "./style.css"

// Predefined highlight colors that match the design system
// Each color has light and dark variants for proper theme adaptation
export const HIGHLIGHT_COLORS = [
    {
        name: 'yellow',
        light: { bg: '#fef9c3', text: '#713f12' },  // yellow-100, yellow-900
        dark: { bg: '#854d0e', text: '#fef9c3' }    // yellow-800, yellow-100
    },
    {
        name: 'green',
        light: { bg: '#dcfce7', text: '#14532d' },  // green-100, green-900
        dark: { bg: '#166534', text: '#dcfce7' }    // green-800, green-100
    },
    {
        name: 'blue',
        light: { bg: '#dbeafe', text: '#1e3a8a' },  // blue-100, blue-900
        dark: { bg: '#1e40af', text: '#dbeafe' }    // blue-800, blue-100
    },
    {
        name: 'pink',
        light: { bg: '#fce7f3', text: '#831843' },  // pink-100, pink-900
        dark: { bg: '#9d174d', text: '#fce7f3' }    // pink-800, pink-100
    },
    {
        name: 'purple',
        light: { bg: '#f3e8ff', text: '#581c87' },  // purple-100, purple-900
        dark: { bg: '#6b21a8', text: '#f3e8ff' }    // purple-800, purple-100
    },
    {
        name: 'orange',
        light: { bg: '#ffedd5', text: '#7c2d12' },  // orange-100, orange-900
        dark: { bg: '#9a3412', text: '#ffedd5' }    // orange-800, orange-100
    },
    {
        name: 'red',
        light: { bg: '#fee2e2', text: '#7f1d1d' },  // red-100, red-900
        dark: { bg: '#991b1b', text: '#fee2e2' }    // red-800, red-100
    },
    {
        name: 'gray',
        light: { bg: '#f3f4f6', text: '#111827' },  // gray-100, gray-900
        dark: { bg: '#374151', text: '#f3f4f6' }    // gray-700, gray-100
    },
] as const

export type HighlightColorName = typeof HIGHLIGHT_COLORS[number]['name']
export type HighlightColor = typeof HIGHLIGHT_COLORS[number]

export const HighlightExtension: ExtensionWrapper = {
    name: Highlight.name,
    extendsion: Highlight.configure({
        multicolor: true,
        HTMLAttributes: {
            class: 'highlight'
        }
    }),
    flotMenuConfig: [HighlightStaticMenu]
}