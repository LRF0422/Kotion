import { AnyExtension } from "@tiptap/core";

import { Focus } from "../extensions/focus";
import { Loading } from "../extensions/loading";
import { Paragraph } from "../extensions/paragraph";
import { Text } from "../extensions/text";
import { HardBreak } from "../extensions/hard-break";
import { TrailingNode } from "../extensions/trailing-node";
import { Perf } from "../extensions/perf";
import { ExtensionWrapper } from "@repo/common";
import { buildInExtension } from "./build-in-extension";
import Document from "@tiptap/extension-document";
import { useState } from "react";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import { createSlash } from "../extensions/slash";
import { UniqueID } from "../extensions/unique-id";

export interface EditorKit {
  extensions?: Array<AnyExtension | AnyExtension[]>;
  extensionConfig?: ExtensionWrapper[];
}

export const resolveExtesions = (extensions?: ExtensionWrapper[] | any[]) => {

  let editorExtensions: AnyExtension[] = []
  extensions && extensions.forEach(it => {
    if (Array.isArray(it?.extendsion)) {
      editorExtensions = [...it.extendsion, ...editorExtensions]
    } else {
      editorExtensions.push(it.extendsion)
    }
  })
  return editorExtensions;
}

export const resloveSlash = (extensions?: ExtensionWrapper[]) => {
  let slash: any[] = []
  extensions && extensions.forEach(it => {
    if (it.slashConfig) {
      slash = [...slash, ...it.slashConfig]
    }
  })

  return createSlash('slash-/', {
    char: '/',
    pluginKey: "slash-/",
    items: slash
  })
}


export const resolveEditorKit = (props: EditorKit) => {

  const { extensions, extensionConfig } = props;
  const [inited, setInited] = useState(false)
  // const [remoteExtensions, setRemoteExtensions] = useState<ExtensionWrapper[]>([])
  const [runtimeExtensions, setRuntimeExtensions] = useState<any>(
    [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Focus.configure({
        mode: 'shallowest'
      }),
      Loading,
      TrailingNode,
      Perf,
      UniqueID.configure({
        filterTransaction: (t: any) => !isChangeOrigin(t)
      }),
      ...(extensions ? extensions : []),
      ...resolveExtesions(extensionConfig),
      ...resolveExtesions(buildInExtension),
      // ...resolveExtesions(remoteExtensions),
      // resloveSlash(buildInExtension)
    ]
  )


  return [
    runtimeExtensions,
    [...(extensionConfig ? extensionConfig : []), ...buildInExtension],
    inited
  ]
}
