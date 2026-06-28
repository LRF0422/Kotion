import { ExtensionWrapper } from "@kn/common"
import { Color } from "./color"
import { ColorStaticMenu } from "./menu/static"
import { TextStyle } from "@tiptap/extension-text-style"
import "./style.css"

export type TextColorName =
	| 'gray' | 'gray-light'
	| 'brown' | 'brown-light'
	| 'red' | 'red-light'
	| 'orange' | 'orange-light'
	| 'yellow' | 'yellow-light'
	| 'green' | 'green-light'
	| 'blue' | 'blue-light'
	| 'purple' | 'purple-light'
	| 'pink' | 'pink-light'
	| 'cyan' | 'cyan-light'
	| 'indigo' | 'indigo-light'
	| 'teal' | 'teal-light'

export interface TextColor {
	name: TextColorName
	light: string
	dark: string
}

// Curated text color palette following design system conventions
// Each hue has a default (saturated) and light variant
// Colors are organized in rows: default shades + light shades
export const TEXT_COLORS: TextColor[] = [
	// Default (saturated) shades
	{ name: 'gray', light: '#737373', dark: '#a3a3a3' },   // neutral-500 / neutral-400
	{ name: 'brown', light: '#78350f', dark: '#d97706' },   // amber-900 / amber-600
	{ name: 'red', light: '#dc2626', dark: '#f87171' },   // red-600 / red-400
	{ name: 'orange', light: '#ea580c', dark: '#fb923c' },   // orange-600 / orange-400
	{ name: 'yellow', light: '#ca8a04', dark: '#facc15' },   // yellow-600 / yellow-400
	{ name: 'green', light: '#16a34a', dark: '#4ade80' },   // green-600 / green-400
	{ name: 'blue', light: '#2563eb', dark: '#60a5fa' },   // blue-600 / blue-400
	{ name: 'purple', light: '#9333ea', dark: '#c084fc' },   // purple-600 / purple-400
	{ name: 'pink', light: '#db2777', dark: '#f472b6' },   // pink-600 / pink-400
	{ name: 'cyan', light: '#0891b2', dark: '#22d3ee' },   // cyan-600 / cyan-400
	{ name: 'indigo', light: '#4f46e5', dark: '#818cf8' },   // indigo-600 / indigo-400
	{ name: 'teal', light: '#0d9488', dark: '#2dd4bf' },   // teal-600 / teal-400
	// Light (pastel) shades
	{ name: 'gray-light', light: '#a3a3a3', dark: '#d4d4d4' },   // neutral-400 / neutral-300
	{ name: 'brown-light', light: '#b45309', dark: '#fbbf24' },   // amber-700 / amber-400
	{ name: 'red-light', light: '#f87171', dark: '#fca5a5' },   // red-400 / red-300
	{ name: 'orange-light', light: '#fb923c', dark: '#fdba74' },   // orange-400 / orange-300
	{ name: 'yellow-light', light: '#facc15', dark: '#fde047' },   // yellow-400 / yellow-300
	{ name: 'green-light', light: '#4ade80', dark: '#86efac' },   // green-400 / green-300
	{ name: 'blue-light', light: '#60a5fa', dark: '#93c5fd' },   // blue-400 / blue-300
	{ name: 'purple-light', light: '#c084fc', dark: '#d8b4fe' },   // purple-400 / purple-300
	{ name: 'pink-light', light: '#f472b6', dark: '#f9a8d4' },   // pink-400 / pink-300
	{ name: 'cyan-light', light: '#22d3ee', dark: '#67e8f9' },   // cyan-400 / cyan-300
	{ name: 'indigo-light', light: '#818cf8', dark: '#a5b4fc' },   // indigo-400 / indigo-300
	{ name: 'teal-light', light: '#2dd4bf', dark: '#5eead4' },   // teal-400 / teal-300
]

export * from "./color"
export * from "./menu/static"


export const ColorExtension: ExtensionWrapper = {
	name: Color.name,
	extendsion: [Color, TextStyle],
	menuConfig: {
		group: 'mark',
		menu: ColorStaticMenu,
		tooltip: 'editor.tooltip.textColor',
	},
	flotMenuConfig: [ColorStaticMenu]
}
