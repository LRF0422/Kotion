import { ExtensionWrapper } from "@repo/common"
import { Color } from "./color"
import { ColorStaticMenu } from "./menu/static"
import { TextStyle } from "@tiptap/extension-text-style"

export * from "./color"
export * from "./menu/static"


export const ColorExtension: ExtensionWrapper = {
	name: Color.name,
	extendsion: [Color, TextStyle],
	menuConfig: {
		group: 'mark',
		menu: ColorStaticMenu
	},
	flotMenuConfig: [ColorStaticMenu]
}