import { ExtensionWrapper } from "../../editor";
import { EditorMenu } from "../../editor/EditorMenu";
import { PageContext } from "../../editor/context";
import { useEditorExtension } from "../../editor/use-extension";
import { TiptapCollabProvider } from "@hocuspocus/provider";
import { AnyExtension, Editor, NodeViewProps } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import Document from "@tiptap/extension-document";
import { EditorContent, NodeViewWrapper } from "@tiptap/react";
import { useSafeState } from "ahooks";
import React, { useCallback, useContext, useEffect, useMemo } from "react";
import { Doc } from 'yjs'


export const SyncBlockView: React.FC<NodeViewProps> = (props) => {

    const { editor, node, updateAttributes } = props
    const [extensions, extensionWrappers] = useEditorExtension('doc')
    const [_editor, setEditor] = useSafeState<Editor>()
    const [syncStatus, setSyncStatus] = useSafeState(false)
    const pageInfo = useContext(PageContext)
    const blockId = node.attrs.blockId

    const formatId = useCallback(() => {
        return "space:" + pageInfo?.spaceId + "|page:" + pageInfo?.id + "|block:" + blockId
    }, [pageInfo?.id, blockId])

    const provider = useMemo(() => {
        const doc = new Doc()
        return new TiptapCollabProvider({
            baseUrl: 'ws://www.simple-platform.cn:1234',
            name: formatId(),
            token: formatId(),
            document: doc,
            onSynced: () => {
                setSyncStatus(true)
            },
        })
    }, [node.attrs.id])

    useEffect(() => {
        console.log('pageInfo', pageInfo);
        const e = new Editor({
            editable: editor.isEditable,
            extensions: [
                ...extensions as AnyExtension[],
                Document.extend({
                    content: 'block*'
                }),
                Collaboration.configure({
                    document: provider.document
                })
            ] as AnyExtension[]
        })
        setEditor(e)
        return () => {
            provider && provider.disconnect()
        }
    }, [])

    useEffect(() => {
        if (syncStatus && _editor) {
            if (node.attrs.content && !node.attrs.init) {
                _editor.chain().focus().insertContent(node.attrs.content).run()
                updateAttributes({
                    ...node.attrs,
                    init: true
                })
            }
        }
    }, [syncStatus, _editor])

    return _editor && syncStatus && <NodeViewWrapper className="outline rounded-sm">
        <EditorContent editor={_editor} />
        <EditorMenu editor={_editor} extensionWrappers={extensionWrappers as ExtensionWrapper[]} toolbar={false} />
    </NodeViewWrapper>
}