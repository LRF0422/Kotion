import { ExtensionWrapper } from "@kn/common";
import StickyNoteMark from "./sticky-note";
import { StickyNoteStaticMenu } from "./menu/static";
import { StickyNoteMarginPanel } from "./menu/StickyNoteMarginPanel";

export const StickyNoteExtension: ExtensionWrapper = {
    name: StickyNoteMark.name,
    extendsion: [StickyNoteMark],
    flotMenuConfig: [StickyNoteStaticMenu],
    floatingUI: StickyNoteMarginPanel,
};
