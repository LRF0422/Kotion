import HardBreak from "@tiptap/extension-hard-break";
import { ExtensionWrapper } from "@kn/common";

export * from "./hard-break";

export const HardBreakExtension: ExtensionWrapper = {
	name: HardBreak.name,
	extendsion: HardBreak
}
