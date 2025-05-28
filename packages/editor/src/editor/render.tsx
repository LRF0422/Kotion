import React, {
  ReactNode,
  forwardRef,
  useImperativeHandle
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { EditorKit } from "./kit";
import { EditorProvider } from "./provider";
import { AnyExtension, Content, Editor } from "@tiptap/core";
import { ExtensionWrapper } from "@repo/common";
import { useEditorExtension } from "./use-extension";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { ThemeProvider } from "styled-components";
import light from "../styles/theme";
import { StyledEditor } from "../styles/editor";
import { Dialog, DialogTrigger, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@repo/ui";
import { useSafeState } from "ahooks";
import { ToC } from "./ToC";
import { PageContext, PageContextProps } from "./context";
import { Contact2, MessageCircle, MessageCircleMore, TableOfContentsIcon } from "@repo/icon";
import { EditorMenu } from "./EditorMenu";

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
  user?: any
  toc?: boolean
  pageInfo?: PageContextProps
  withTitle?: boolean
}

// const MemorizedToC = React.memo(ToC)

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
    withTitle = true
  } = props;

  const [exts, wrappers] = useEditorExtension(undefined, withTitle)

  const editor = useEditor(
    {
      content: content,
      editable: isEditable,
      extensions: [
        ...(extensions as AnyExtension[] || []),
        ...(exts as AnyExtension[] || []),
      ],
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

  const [tableOfContents, setTableOfContents] = useSafeState<any[]>()

  useImperativeHandle(ref, () => editor as Editor);
  return (editor &&
    <PageContext.Provider value={pageInfo}>
      <ThemeProvider theme={light}>
        <div className={cn("w-[calc(100vw-350px)]", props.className)}>
          <div className="flex flex-row relative w-full h-full">
            <EditorMenu editor={editor} extensionWrappers={wrappers as ExtensionWrapper[]} toolbar={props.toolbar} />
            <StyledEditor className="overflow-auto grow">
              <EditorContent editor={editor} />
            </StyledEditor>
            <ToC editor={editor as Editor} className=" flex-none h-[calc(100vh-60px)] w-[300px] border-l sticky right-0 top-0" />
          </div>
        </div>
      </ThemeProvider>
    </PageContext.Provider>
  );
});

EditorRender.displayName = "EditorRender";
