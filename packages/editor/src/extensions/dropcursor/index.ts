import { ExtensionWrapper } from "@kn/common";
import { DropCursor } from "./dropcursor";

export * from "./dropcursor";

export const DropcursorExtension: ExtensionWrapper = {
	name: DropCursor.name,
	extendsion: DropCursor
}
