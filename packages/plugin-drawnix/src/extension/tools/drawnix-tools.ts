import { resolveBlockInsertPosition } from "@kn/common";
import type { Editor } from "@kn/editor";
import { z } from "@kn/ui";
import { nanoid } from "nanoid";
import { createDefaultMindmapDocument } from "../data";
import { parseMarkdownOutline } from "../importers/markdown";
import { parseMermaidMindmap } from "../importers/mermaid";
import { normalizeDrawnixData } from "../model/normalize";
import {
  addMindmapChild,
  createMindmapNode,
  deleteMindmapNode,
  extractMindmapStructure,
  updateMindmapNodeText,
} from "../model/operations";
import { serializeDrawnixDocument } from "../model/serialize";
import type { MindmapDocument, MindmapNode } from "../model/types";

interface InsertParams {
  nearText?: string;
  placement?: "before" | "after";
  blockIndex?: number;
  position?: number;
}

interface StructureInput {
  text: string;
  children?: StructureInput[];
}

function findAllDrawnixNodes(
  editor: Editor,
): Array<{ pos: number; data: unknown }> {
  const results: Array<{ pos: number; data: unknown }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "drawnix")
      results.push({ pos, data: node.attrs.data });
  });
  return results;
}

function getDrawnixAtPos(
  editor: Editor,
  pos: number,
): { data: unknown } | null {
  const node = editor.state.doc.nodeAt(pos);
  return node?.type.name === "drawnix" ? { data: node.attrs.data } : null;
}

function buildNode(item: StructureInput): MindmapNode {
  return createMindmapNode(
    nanoid(6),
    item.text,
    (item.children ?? []).map(buildNode),
  );
}

function createStructuredDocument(
  rootText: string,
  children: StructureInput[],
): MindmapDocument {
  return {
    schemaVersion: 2,
    layout: "standard",
    root: {
      id: nanoid(6),
      text: rootText,
      children: children.map((child, index) => ({
        ...buildNode(child),
        side: index % 2 === 0 ? "right" : "left",
      })),
    },
  };
}

function resolveInsertError(
  resolved: ReturnType<typeof resolveBlockInsertPosition>,
  nearText?: string,
) {
  if (!resolved || resolved.pos !== -1) return null;
  if (resolved.strategy === "nearText-not-found") {
    return `未找到包含 "${nearText}" 的块。请使用 getDocumentStructure 查看文档结构`;
  }
  if (resolved.strategy === "blockIndex-out-of-range") {
    return "块索引越界，请使用 getDocumentStructure 查看文档结构";
  }
  return "插入位置超出文档范围";
}

function insertDocument(
  editor: Editor,
  document: MindmapDocument,
  params: InsertParams,
): string | null {
  const resolved = resolveBlockInsertPosition(editor, "drawnix", params);
  const error = resolveInsertError(resolved, params.nearText);
  if (error) return error;
  const data = serializeDrawnixDocument(document);
  if (resolved) {
    editor
      .chain()
      .focus()
      .insertContentAt(resolved.pos, {
        type: "drawnix",
        attrs: { data },
      })
      .run();
  } else {
    editor.chain().focus().insertDrawnixWithData(data).run();
  }
  return null;
}

export const drawnixTools = [
  {
    name: "insertDrawnix",
    description: `插入一个新的思维导图。可以在指定位置插入空白思维导图

插入位置定位（优先级从高到低）：
1. nearText + placement：在包含指定文本的块之前/之后插入（推荐，最精确）
2. blockIndex：在指定块索引之后插入
3. position：使用 ProseMirror 绝对位置，默认吸附到块边界`,
    inputSchema: z.object({
      nearText: z
        .string()
        .describe(
          "搜索文档中包含此文本的块，在该块附近插入（优先使用此参数定位）",
        )
        .optional(),
      placement: z
        .enum(["before", "after"])
        .describe(
          "插入位置：'before' 在匹配块之前，'after' 在匹配块之后。默认 'after'",
        )
        .optional(),
      blockIndex: z
        .number()
        .describe("在该块索引之后插入（从0开始）")
        .optional(),
      position: z
        .number()
        .optional()
        .describe("插入位置（ProseMirror 绝对位置），推荐使用 nearText 代替"),
    }),
    execute: (editor: Editor) => async (params: InsertParams) => {
      const error = insertDocument(
        editor,
        createDefaultMindmapDocument(),
        params,
      );
      return error
        ? { error }
        : { success: true, message: "已插入空白思维导图" };
    },
  },
  {
    name: "insertDrawnixFromStructure",
    description: `根据JSON结构创建并插入思维导图。结构包含根节点文本和子节点数组

插入位置定位（优先级从高到低）：
1. nearText + placement：在包含指定文本的块之前/之后插入（推荐）
2. blockIndex：在指定块索引之后插入
3. position：使用 ProseMirror 绝对位置`,
    inputSchema: z.object({
      rootText: z.string().describe("根节点文本"),
      children: z
        .array(
          z.object({
            text: z.string().describe("节点文本"),
            children: z.array(z.any()).optional().describe("子节点数组"),
          }),
        )
        .optional()
        .describe("子节点数组"),
      nearText: z
        .string()
        .describe("搜索文档中包含此文本的块，在该块附近插入")
        .optional(),
      placement: z
        .enum(["before", "after"])
        .describe("插入位置：'before' 或 'after'，默认 'after'")
        .optional(),
      blockIndex: z.number().describe("在该块索引之后插入").optional(),
      position: z
        .number()
        .optional()
        .describe("插入位置（ProseMirror 绝对位置）"),
    }),
    execute:
      (editor: Editor) =>
      async (
        params: InsertParams & {
          rootText: string;
          children?: StructureInput[];
        },
      ) => {
        const document = createStructuredDocument(
          params.rootText,
          params.children ?? [],
        );
        const error = insertDocument(editor, document, params);
        return error
          ? { error }
          : {
              success: true,
              message: `已创建思维导图，根节点: "${params.rootText}"，包含 ${(params.children ?? []).length} 个子节点`,
              rootId: document.root.id,
              schemaVersion: document.schemaVersion,
            };
      },
  },
  {
    name: "insertDrawnixFromMarkdown",
    description: `将Markdown大纲格式转换为思维导图并插入。支持标准Markdown标题格式（# ## ### 等）和列表格式（- 或 *）`,
    inputSchema: z.object({
      markdown: z
        .string()
        .describe("Markdown格式的大纲文本，支持标题(#)和列表(-)格式"),
      nearText: z.string().optional(),
      placement: z.enum(["before", "after"]).optional(),
      blockIndex: z.number().optional(),
      position: z.number().optional(),
    }),
    execute:
      (editor: Editor) =>
      async (params: InsertParams & { markdown: string }) => {
        try {
          const parsed = parseMarkdownOutline(params.markdown);
          if (!parsed) return { error: "无法解析Markdown内容，请确保格式正确" };
          const document = createStructuredDocument(
            parsed.text,
            parsed.children,
          );
          const error = insertDocument(editor, document, params);
          return error
            ? { error }
            : { success: true, message: "已从Markdown创建思维导图" };
        } catch (error) {
          return {
            error: `Markdown解析失败: ${error instanceof Error ? error.message : "未知错误"}`,
          };
        }
      },
  },
  {
    name: "insertDrawnixFromMermaid",
    description:
      "将Mermaid图表代码转换为思维导图并插入。支持mindmap和flowchart语法",
    inputSchema: z.object({
      mermaid: z.string().describe("Mermaid格式的图表代码"),
      nearText: z.string().optional(),
      placement: z.enum(["before", "after"]).optional(),
      blockIndex: z.number().optional(),
      position: z.number().optional(),
    }),
    execute:
      (editor: Editor) =>
      async (params: InsertParams & { mermaid: string }) => {
        try {
          const parsed = parseMermaidMindmap(params.mermaid);
          if (!parsed) return { error: "无法解析Mermaid代码，请确保语法正确" };
          const document = createStructuredDocument(
            parsed.text,
            parsed.children,
          );
          const error = insertDocument(editor, document, params);
          return error
            ? { error }
            : { success: true, message: "已从Mermaid创建思维导图" };
        } catch (error) {
          return {
            error: `Mermaid解析失败: ${error instanceof Error ? error.message : "未知错误"}`,
          };
        }
      },
  },
  {
    name: "getDrawnixAtPos",
    description: "获取指定位置的思维导图数据，返回结构化的节点信息",
    inputSchema: z.object({
      pos: z.number().describe("思维导图节点在文档中的位置"),
    }),
    execute:
      (editor: Editor) =>
      async ({ pos }: { pos: number }) => {
        const result = getDrawnixAtPos(editor, pos);
        if (!result) return { error: `位置 ${pos} 没有找到思维导图节点` };
        const document = normalizeDrawnixData(result.data as never).document;
        const structure = extractMindmapStructure(document.root);
        return {
          success: true,
          pos,
          structure,
          schemaVersion: document.schemaVersion,
          message: `找到思维导图，根节点: "${structure.text}"`,
        };
      },
  },
  {
    name: "listAllDrawnix",
    description: "列出文档中所有思维导图及其位置和根节点信息",
    inputSchema: z.object({}),
    execute: (editor: Editor) => async () => {
      const nodes = findAllDrawnixNodes(editor);
      if (nodes.length === 0)
        return { success: true, count: 0, message: "文档中没有思维导图" };
      const items = nodes.map((item, index) => {
        const document = normalizeDrawnixData(item.data as never).document;
        return {
          index,
          pos: item.pos,
          rootText: document.root.text || "(空)",
          childCount: document.root.children.length,
          rootId: document.root.id,
          schemaVersion: document.schemaVersion,
        };
      });
      return {
        success: true,
        count: nodes.length,
        items,
        message: `找到 ${nodes.length} 个思维导图`,
      };
    },
  },
  {
    name: "addNodeToDrawnix",
    description: "向思维导图中添加新节点。可以添加到根节点或指定父节点下",
    inputSchema: z.object({
      pos: z.number().describe("思维导图在文档中的位置"),
      parentId: z.string().describe("父节点ID，添加到该节点下"),
      text: z.string().describe("新节点的文本内容"),
      children: z
        .array(
          z.object({
            text: z.string(),
            children: z.array(z.any()).optional(),
          }),
        )
        .optional(),
    }),
    execute:
      (editor: Editor) =>
      async (params: {
        pos: number;
        parentId: string;
        text: string;
        children?: StructureInput[];
      }) => {
        const result = getDrawnixAtPos(editor, params.pos);
        if (!result)
          return { error: `位置 ${params.pos} 没有找到思维导图节点` };
        const document = normalizeDrawnixData(result.data as never).document;
        const newNode = buildNode({
          text: params.text,
          children: params.children,
        });
        const updated = addMindmapChild(document, params.parentId, newNode);
        if (!updated) return { error: `未找到父节点 ID: ${params.parentId}` };
        editor
          .chain()
          .focus()
          .updateDrawnixAtPos(params.pos, serializeDrawnixDocument(updated))
          .run();
        return {
          success: true,
          newNodeId: newNode.id,
          message: `已添加节点 "${params.text}" 到父节点 ${params.parentId}`,
        };
      },
  },
  {
    name: "deleteNodeFromDrawnix",
    description: "从思维导图中删除指定节点及其所有子节点。注意：不能删除根节点",
    inputSchema: z.object({
      pos: z.number().describe("思维导图在文档中的位置"),
      nodeId: z.string().describe("要删除的节点ID"),
    }),
    execute:
      (editor: Editor) =>
      async ({ pos, nodeId }: { pos: number; nodeId: string }) => {
        const result = getDrawnixAtPos(editor, pos);
        if (!result) return { error: `位置 ${pos} 没有找到思维导图节点` };
        const document = normalizeDrawnixData(result.data as never).document;
        const updated = deleteMindmapNode(document, nodeId);
        if (!updated)
          return { error: `未找到节点 ID: ${nodeId}，或尝试删除根节点` };
        editor
          .chain()
          .focus()
          .updateDrawnixAtPos(pos, serializeDrawnixDocument(updated))
          .run();
        return { success: true, message: `已删除节点 ${nodeId}` };
      },
  },
  {
    name: "updateDrawnixNodeText",
    description: "更新思维导图中指定节点的文本内容",
    inputSchema: z.object({
      pos: z.number().describe("思维导图在文档中的位置"),
      nodeId: z.string().describe("要更新的节点ID"),
      newText: z.string().describe("新的文本内容"),
    }),
    execute:
      (editor: Editor) =>
      async ({
        pos,
        nodeId,
        newText,
      }: {
        pos: number;
        nodeId: string;
        newText: string;
      }) => {
        const result = getDrawnixAtPos(editor, pos);
        if (!result) return { error: `位置 ${pos} 没有找到思维导图节点` };
        const document = normalizeDrawnixData(result.data as never).document;
        const updated = updateMindmapNodeText(document, nodeId, newText);
        if (!updated) return { error: `未找到节点 ID: ${nodeId}` };
        editor
          .chain()
          .focus()
          .updateDrawnixAtPos(pos, serializeDrawnixDocument(updated))
          .run();
        return {
          success: true,
          message: `已更新节点 ${nodeId} 的文本为 "${newText}"`,
        };
      },
  },
];
