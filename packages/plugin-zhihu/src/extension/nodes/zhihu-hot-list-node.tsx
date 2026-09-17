import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from "@kn/editor";
import { ZhihuHotListCard } from "../../components/ZhihuHotListCard";

/**
 * Atom block that snapshots the Zhihu hot list in its attrs.
 * Inserted via the /zhihu-hot slash command.
 */
export const ZhihuHotListNode = Node.create({
    name: "zhihuHotList",
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            items: { default: [] },
            limit: { default: 10 },
            lastSyncAt: { default: "" },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-type="zhihu-hot-list"]' }];
    },

    renderHTML() {
        return ["div", mergeAttributes({ "data-type": "zhihu-hot-list" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(ZhihuHotListCard);
    },
});
