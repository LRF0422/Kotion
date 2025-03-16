import { ExtensionWrapper } from "@repo/common";
import CommentExt from "./comment";
import { CommentStaticMenu } from "./menu/static";
import { CommentBubbleView } from "./menu/bubble";




export const CommentExtension: ExtensionWrapper = {
    name: CommentExt.name,
    extendsion: [CommentExt],
    flotMenuConfig: [CommentStaticMenu],
    bubbleMenu: CommentBubbleView
}