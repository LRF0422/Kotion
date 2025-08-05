import { ExtensionWrapper } from "@kn/common";
import { Gapcursor } from "./gapcursor";

export * from "./gapcursor";

export const GapcursorExtension: ExtensionWrapper = {
	name: Gapcursor.name,
	extendsion: Gapcursor
}
