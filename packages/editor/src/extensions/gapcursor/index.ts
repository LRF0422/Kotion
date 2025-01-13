import { ExtensionWrapper } from "../../editor";
import { GapCursor } from "./gapcursor";

export * from "./gapcursor";

export const GapcursorExtension: ExtensionWrapper = {
	name: GapCursor.name,
	extendsion: GapCursor
}
