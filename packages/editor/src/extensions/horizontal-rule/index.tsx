import { RulerDimensionLine, RulerIcon } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { HorizontalRule } from "./horizontal-rule";
import { HorizontalRuleStaticMenu } from "./menu";
import { createT } from "../../i18n";
import React from "react";

export * from "./horizontal-rule";
export * from "./menu";

const t = createT();

export const HorizontalRuleExtension: ExtensionWrapper = {
	name: HorizontalRule.name,
	extendsion: HorizontalRule,
	menuConfig: {
		group: 'block',
		menu: HorizontalRuleStaticMenu,
		tooltip: 'editor.tooltip.horizontalRule',
	},
	slashConfig: [
		{
			icon: <RulerDimensionLine className="h-4 w-4" />,
			text: t('slashCommands.horizontalRule'),
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
