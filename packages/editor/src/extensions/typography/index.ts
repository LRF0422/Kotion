import { ExtensionWrapper } from "@kn/common";
import { Typography } from "@tiptap/extension-typography";

export const TypographyExtension: ExtensionWrapper = {
	name: Typography.name,
	extendsion: Typography.configure({
		emDash: false,
		leftArrow: false,
		rightArrow: false
	})
}