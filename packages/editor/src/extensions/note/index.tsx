import { ExtensionWrapper } from "@repo/common";
import { NoteMark } from "./note";
import { NoteMarkStaticMenu } from "./menu/static";

export const NoteMarkExtension: ExtensionWrapper = {
    name: NoteMark.name,
    extendsion: NoteMark,
    flotMenuConfig: [
        NoteMarkStaticMenu
    ]
}