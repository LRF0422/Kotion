import { RulerIcon } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { HorizontalRule } from "./horizontal-rule";
import { HorizontalRuleStaticMenu } from "./menu";
import React from "react";

export * from "./horizontal-rule";
export * from "./menu";

export const HorizontalRuleExtension: ExtensionWrapper = {
	name: HorizontalRule.name,
	extendsion: HorizontalRule,
	menuConfig: {
		group: 'block',
		menu: HorizontalRuleStaticMenu
	},
	slashConfig: [
		{
			icon: <RulerIcon />,
			text: "分割线",
			slash: '/horizontalRule',
			action: (editor) => {
				editor
					.chain()
					.focus()
					.setHorizontalRule()
					.run()
			}
		}
	]
}
