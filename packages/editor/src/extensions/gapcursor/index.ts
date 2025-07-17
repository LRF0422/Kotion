import { ExtensionWrapper } from "@kn/common";
import { GapCursor } from "./gapcursor";

export * from "./gapcursor";

export const GapcursorExtension: ExtensionWrapper = {
	name: GapCursor.name,
	extendsion: GapCursor
}
