import { ExtensionWrapper } from "@repo/common";
import CommentExt from "./comment";
import { CommentStaticMenu } from "./menu/static";




export const CommentExtension: ExtensionWrapper = {
    name: CommentExt.name,
    extendsion: [CommentExt],
    flotMenuConfig: [CommentStaticMenu]
}