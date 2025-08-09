import React, {
  ReactNode,
  forwardRef,
  useImperativeHandle
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { EditorKit } from "./kit";
import { EditorProvider } from "./provider";
import { AnyExtension, Content, Editor, JSONContent, getSchema, rewriteUnknownContent } from "@tiptap/core";
import { ExtensionWrapper } from "@kn/common";
import { useEditorExtension } from "./use-extension";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { ThemeProvider } from "styled-components";
import light from "../styles/theme";
import { StyledEditor } from "../styles/editor";
import { cn } from "@kn/ui";
import { ToC } from "./ToC";
import { PageContext, PageContextProps } from "./context";

export interface EditorRenderProps extends EditorProvider, EditorKit {
  content?: Content;
  extensionConfig?: ExtensionWrapper[];
  isEditable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  id: string;
  offsetTop?: number,
  isColl?: boolean
  provider?: HocuspocusProvider,
  className?: string,
  toolbar?: boolean,
  width?: string,
  user?: any
  toc?: boolean
  pageInfo?: PageContextProps
  withTitle?: boolean
  onBlur?: (editor: Editor) => void
}

export const EditorRender = forwardRef<
  Editor | null,
  React.PropsWithChildren<EditorRenderProps>
>((props, ref) => {
  const {
    content,
    extensions,
    isEditable,
    toc = true,
    pageInfo,
    withTitle = true,
    onBlur,
    width = 'w-[calc(100vw-320px)]'
  } = props;

  const [exts] = useEditorExtension(undefined, withTitle)

  const editor = useEditor(
    {
      content: content ? rewriteUnknownContent(content as JSONContent,
        getSchema([...(exts as AnyExtension[] || []), ...(extensions as AnyExtension[] || [])])).json : null,
      editable: isEditable,
      extensions: [
        ...(extensions as AnyExtension[] || []),
        ...(exts as AnyExtension[] || []),
      ],
      onBlur: ({ editor }) => { onBlur && onBlur(editor) },
      editorProps: {
        attributes: {
          class: "magic-editor",
          spellcheck: "false",
          suppressContentEditableWarning: "true",
        }
      }
    },
    []
  );

  useImperativeHandle(ref, () => editor as Editor);
  return (editor &&
    <PageContext.Provider value={pageInfo}>
      <ThemeProvider theme={light}>
        <div className={cn("grow z-30", width)}>
          <div className={cn("w-full", props.className)}>
            <div className="flex relative w-full ">
              <StyledEditor className="w-full grow overflow-auto">
                <EditorContent editor={editor} id="editor-container" />
              </StyledEditor>
              {
                toc && (<div className={cn("border-l w-[300px] sticky top-0 right-0 box-border h-full", props.className)}>
                  <ToC editor={editor} />
                </div>)
              }
            </div>
          </div>
        </div>
      </ThemeProvider >
    </PageContext.Provider>
  );
});

EditorRender.displayName = "EditorRender";
