import { Heading1, Heading2, Heading3, Heading4 } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { Heading } from "./heading";
import { HeadingStaticMenu } from "./menu";
import React from "react";

export * from "./heading";
export * from "./menu";

export const HeadingExtension: ExtensionWrapper = {
	name: Heading.name,
	extendsion: Heading,
	menuConfig: {
		group: 'mark',
		menu: HeadingStaticMenu
	},
	slashConfig: [
		{
			divider: true,
			title: "标题"
		},
		{
			icon: <Heading1 className="h-4 w-4" />,
			text: "标题一",
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
			text: "标题二",
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
			text: "标题三",
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
			text: "标题四",
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
