import { ExtensionWrapper } from "../../editor";
import { DropCursor } from "./dropcursor";

export * from "./dropcursor";

export const DropcursorExtension: ExtensionWrapper = {
	name: DropCursor.name,
	extendsion: DropCursor
}
