import { Extension, type Editor } from "@tiptap/core";
import type {
  TiptapCollabProvider,
  WebSocketStatus,
} from "@hocuspocus/provider";
import type * as Y from "yjs";

export interface CollaborationRuntimeOptions {
  provider: TiptapCollabProvider;
}

export interface CollaborationRuntimeStorage {
  readonly provider: TiptapCollabProvider;
  readonly document: Y.Doc;
  readonly awareness: TiptapCollabProvider["awareness"];
  readonly status: WebSocketStatus;
}

declare module "@tiptap/core" {
  interface Storage {
    collaborationRuntime?: CollaborationRuntimeStorage;
  }
}

/** Runtime collaboration resources exposed to editor extensions and NodeViews. */
export const CollaborationRuntime = Extension.create<
  CollaborationRuntimeOptions,
  CollaborationRuntimeStorage
>({
  name: "collaborationRuntime",

  addStorage() {
    const provider = this.options.provider;

    return {
      provider,
      document: provider.document,
      awareness: provider.awareness,
      get status() {
        return provider.status;
      },
    };
  },
});

export const getCollaborationRuntime = (
  editor: Editor,
): CollaborationRuntimeStorage | undefined =>
  editor.storage.collaborationRuntime;
