import { ExtensionWrapper } from "@repo/common";
import { GapCursor } from "./gapcursor";

export * from "./gapcursor";

export const GapcursorExtension: ExtensionWrapper = {
	name: GapCursor.name,
	extendsion: GapCursor
}
