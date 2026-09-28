import { AnyExtension, Editor } from "@tiptap/core";
import { ElementType, ReactNode } from "react";
import type { AgentArtifact } from "../ai/plugin-agent/types";

export type Group = "block" | "inline" | "mark" | "custom";
export interface MenuConfigItem {
  group: Group;
  menu: ElementType;
  tooltip?: string;
}
export interface ExtensionWrapper {
  extendsion: AnyExtension | AnyExtension[] | any;
  name: string;
  bubbleMenu?: ElementType | ElementType[];
  menuConfig?: MenuConfigItem | MenuConfigItem[];
  slashConfig?: (
    | {
        icon?: ReactNode;
        text?: string;
        slash?: string;
        action?: (editor: Editor, props?: any) => void;
        render?: ElementType;
      }
    | { divider: true; title: string }
  )[];
  flotMenuConfig?: ElementType[];
  floatingUI?: ElementType; // Floating UI component (e.g., chat widget)
  /**
   * Rendered once below EditorContent after content is ready (e.g. backlinks panel).
   * Receives `{ editor }` as prop, same convention as floatingUI/flotMenuConfig.
   */
  pageFooter?: ElementType;
  tools?: {
    name: string;
    description: string;
    inputSchema: any;
    readOnly?: boolean;
    /**
     * 1-10, default 5. A provider's `tools` ceiling cannot fit every plugin tool,
     * so the surplus goes to a callable-but-unadvertised overflow directory (see
     * `buildAgentRunInputs`); higher priority is advertised first. Document
     * INSERTION tools should declare 9: a plugin's `get*`/`list*` tools degrade
     * gracefully through that directory, while a missing "insert X here" makes
     * the user's request impossible.
     */
    priority?: number;
    /**
     * Optional artifact mapping (kernel spec). Legacy editor plugins can
     * declare it without migrating to `agent.tools`.
     */
    artifactFromResult?: (result: unknown, args: unknown) => AgentArtifact | null;
    execute: (editor: Editor) => (params: any) => any;
  }[];
  skills?: {
    name: string;
    description: string;
    requiredTools: string[];
    optionalTools?: string[];
    systemPromptFragment?: string;
    tags?: string[];
  }[];
  blockMenuConfig?: {
    icon?: ReactNode;
    label: string;
    action: (editor: Editor, node: any, pos: number) => void;
  }[];
}
