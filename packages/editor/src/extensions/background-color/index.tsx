import { ExtensionWrapper } from "@kn/common";
import { BackgroundColor } from "./background-color";
import { BackGroundColorStaticMenu } from "./static-menu";


export const BackGroundColorExtension: ExtensionWrapper = {
	name: BackgroundColor.name,
	extendsion: BackgroundColor,
	flotMenuConfig: [
		BackGroundColorStaticMenu
	]
}