import { ExtensionWrapper } from "@repo/common";
import { Title } from "./title";

export { Title }


export const TitleExtension: ExtensionWrapper = {
	name: Title.name,
	extendsion: Title
}