import { Heading1, Heading2, Heading3, Heading4 } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { Heading } from "./heading";
import { HeadingStaticMenu } from "./menu";
import { createT } from "../../i18n";
import React from "react";

export * from "./heading";
export * from "./menu";

const t = createT();

export const HeadingExtension: ExtensionWrapper = {
	name: Heading.name,
	extendsion: Heading,
	menuConfig: {
		group: 'mark',
		menu: HeadingStaticMenu,
		tooltip: 'editor.tooltip.textStyle',
	},
	slashConfig: [
		{
			divider: true,
			title: t('slashCommands.headingGroup')
		},
		{
			icon: <Heading1 className="h-4 w-4" />,
			text: t('slashCommands.heading1'),
			slash: "/h1",
			action: editor =>
				editor
					.chain()
					.focus()
					.toggleHeading({ level: 1 })
					.run()
		},

		{
			icon: <Heading2 className="h-4 w-4" />,
			text: t('slashCommands.heading2'),
			slash: "/h2",
			action: editor =>
				editor
					.chain()
					.focus()
					.toggleHeading({ level: 2 })
					.run()
		},

		{
			icon: <Heading3 className="h-4 w-4" />,
			text: t('slashCommands.heading3'),
			slash: "/h3",
			action: editor =>
				editor
					.chain()
					.focus()
					.toggleHeading({ level: 3 })
					.run()
		},

		{
			icon: <Heading4 className="h-4 w-4" />,
			text: t('slashCommands.heading4'),
			slash: "/h4",
			action: editor =>
				editor
					.chain()
					.focus()
					.toggleHeading({ level: 4 })
					.run()
		},
	],
	flotMenuConfig: [HeadingStaticMenu]
}
