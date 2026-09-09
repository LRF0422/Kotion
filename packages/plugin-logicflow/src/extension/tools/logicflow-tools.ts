import { resolveBlockInsertPosition } from "@kn/common";
import type { Editor } from "@kn/editor";
import { z } from "@kn/ui";
import { nanoid } from "nanoid";
import { LOGICFLOW_LIMITS } from "../../model/types";
import {
  SHAPE_CATEGORIES,
  searchShapes,
  type ShapeCategory,
} from "../../shapes/shape-registry";
import {
  listLogicFlowDiagramRefs,
  readLogicFlowDiagramAtTarget,
  readLogicFlowDiagramRef,
  resolveLogicFlowDiagramRef,
  updateLogicFlowDiagramAtTarget,
  type LogicFlowDiagramTarget,
} from "./logicflow-document-access";
import {
  applyLogicFlowGraphEdits,
  buildLogicFlowDocumentFromGraph,
  LOGICFLOW_EDGE_TYPES,
  prepareSemanticLogicFlowGraph,
  type BuildLogicFlowDocumentInput,
  type LogicFlowGraphEdit,
} from "./logicflow-graph";

interface InsertParams {
  nearText?: string;
  placement?: "before" | "after";
  blockIndex?: number;
  position?: number;
}

interface GetDiagramParams extends LogicFlowDiagramTarget {
  pageId?: string;
}

interface ApplyEditsParams extends LogicFlowDiagramTarget {
  pageId?: string;
  edits: LogicFlowGraphEdit[];
}

const propertiesSchema = z
  .record(z.string(), z.any())
  .describe("LogicFlow 元素属性，必须可 JSON 序列化")
  .optional();

const targetFields = {
  diagramId: z
    .string()
    .describe("listLogicFlowDiagrams 返回的稳定流程图 ID（推荐）")
    .optional(),
  position: z
    .number()
    .int()
    .describe("兼容用 ProseMirror 位置；优先使用 diagramId")
    .optional(),
};

const placementFields = {
  nearText: z.string().describe("在包含该文本的文档块附近插入").optional(),
  placement: z
    .enum(["before", "after"])
    .describe("相对匹配块或 position 的插入方向，默认 after")
    .optional(),
  blockIndex: z
    .number()
    .int()
    .describe("在指定的顶层块索引之后插入")
    .optional(),
  position: z
    .number()
    .int()
    .describe("ProseMirror 绝对位置；优先使用 nearText")
    .optional(),
};

const nodeSchema = z.object({
  id: z
    .string()
    .describe("节点唯一 ID，例如 start、review、decision；省略时自动生成")
    .optional(),
  label: z.string().describe("节点显示文字"),
  type: z
    .string()
    .describe("LogicFlow 形状类型；流程图通常使用 rect、ellipse、diamond")
    .optional(),
  color: z
    .string()
    .describe("可选 CSS 填充色或颜色名称，会转换为 properties.fill")
    .optional(),
  properties: propertiesSchema,
});

const edgeSchema = z.object({
  id: z.string().describe("连线唯一 ID；省略时自动生成").optional(),
  from: z.string().describe("起点节点 ID"),
  to: z.string().describe("终点节点 ID"),
  label: z.string().describe("连线或分支标签").optional(),
  type: z.enum(LOGICFLOW_EDGE_TYPES).describe("连线类型").optional(),
  properties: propertiesSchema,
});

const editSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("addNode"),
    id: z.string(),
    type: z.string().optional(),
    x: z.number(),
    y: z.number(),
    text: z.string().optional(),
    properties: propertiesSchema,
  }),
  z.object({
    op: z.literal("updateNode"),
    id: z.string(),
    type: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    text: z.string().nullable().optional(),
    properties: propertiesSchema,
  }),
  z.object({ op: z.literal("deleteNode"), id: z.string() }),
  z.object({
    op: z.literal("addEdge"),
    id: z.string(),
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
    type: z.enum(LOGICFLOW_EDGE_TYPES).optional(),
    text: z.string().optional(),
    properties: propertiesSchema,
  }),
  z.object({
    op: z.literal("updateEdge"),
    id: z.string(),
    sourceNodeId: z.string().optional(),
    targetNodeId: z.string().optional(),
    type: z.enum(LOGICFLOW_EDGE_TYPES).optional(),
    text: z.string().nullable().optional(),
    properties: propertiesSchema,
  }),
  z.object({ op: z.literal("deleteEdge"), id: z.string() }),
]);

function createDiagramId(editor: Editor): string {
  const used = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (typeof node.attrs.id === "string" && node.attrs.id)
      used.add(node.attrs.id);
  });
  let id = `logicflow-${nanoid(10)}`;
  while (used.has(id)) id = `logicflow-${nanoid(10)}`;
  return id;
}

async function waitForInsertedDiagram(
  editor: Editor,
  requestedId: string,
  previousIds: Set<string>,
  previousCount: number,
): Promise<ReturnType<typeof resolveLogicFlowDiagramRef>> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const refs = listLogicFlowDiagramRefs(editor);
    const exact = refs.find((ref) => ref.diagramId === requestedId);
    if (exact) return exact;
    if (refs.length > previousCount) {
      const inserted = refs.find(
        (ref) => ref.diagramId !== null && !previousIds.has(ref.diagramId),
      );
      if (inserted) return inserted;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("LogicFlow 流程图已提交插入，但编辑器未及时返回新节点");
}

function resolveInsertError(
  resolved: ReturnType<typeof resolveBlockInsertPosition>,
  nearText?: string,
): string | null {
  if (!resolved || resolved.pos !== -1) return null;
  if (resolved.strategy === "nearText-not-found")
    return `未找到包含 "${nearText}" 的文档块`;
  if (resolved.strategy === "blockIndex-out-of-range")
    return "blockIndex 超出文档块范围";
  return "插入位置无效或超出文档范围";
}

function pageSummary(
  document: ReturnType<typeof readLogicFlowDiagramRef>["document"],
) {
  return document.pages.map((page) => ({
    id: page.id,
    name: page.name,
    nodeCount: page.graph.nodes.length,
    edgeCount: page.graph.edges.length,
  }));
}

export const logicFlowTools = [
  {
    name: "createLogicFlowFromGraph",
    description: `根据语义节点和连线创建可编辑的 LogicFlow 流程图，并自动计算稳定布局。优先用于流程、工作流和带判断分支的图，不要手写节点坐标。`,
    inputSchema: z.object({
      title: z.string().describe("流程图标题").optional(),
      pageName: z.string().describe("首个画布页面名称").optional(),
      nodes: z
        .array(nodeSchema)
        .min(1)
        .max(LOGICFLOW_LIMITS.maxNodes)
        .describe("流程图节点"),
      edges: z
        .array(edgeSchema)
        .max(LOGICFLOW_LIMITS.maxEdges)
        .describe("节点之间的有向连线"),
      layout: z
        .enum(["vertical", "horizontal"])
        .describe("vertical 适合流程树，horizontal 适合管道或时间线")
        .optional(),
      ...placementFields,
    }),
    execute:
      (editor: Editor) =>
      async (params: BuildLogicFlowDocumentInput & InsertParams) => {
        const prepared = prepareSemanticLogicFlowGraph(
          params.nodes,
          params.edges,
        );
        const document = buildLogicFlowDocumentFromGraph({
          ...params,
          ...prepared,
        });
        const resolved = resolveBlockInsertPosition(
          editor,
          "logicflowDiagram",
          params,
        );
        const insertError = resolveInsertError(resolved, params.nearText);
        if (insertError) throw new Error(insertError);

        const before = listLogicFlowDiagramRefs(editor);
        const previousIds = new Set(
          before
            .map((ref) => ref.diagramId)
            .filter((id): id is string => id !== null),
        );
        const requestedId = createDiagramId(editor);
        const node = {
          type: "logicflowDiagram",
          attrs: { id: requestedId, data: document },
        };
        const inserted = resolved
          ? editor.chain().focus().insertContentAt(resolved.pos, node).run()
          : editor.chain().focus().insertContent(node).run();
        if (!inserted) throw new Error("LogicFlow 流程图插入失败");

        const ref = await waitForInsertedDiagram(
          editor,
          requestedId,
          previousIds,
          before.length,
        );
        const diagramId = ref.diagramId ?? requestedId;
        const page = document.pages[0];
        return {
          success: true,
          diagramId,
          position: ref.position,
          pageId: page.id,
          nodeCount: page.graph.nodes.length,
          edgeCount: page.graph.edges.length,
          layout: params.layout ?? "vertical",
          insertionStrategy: resolved?.strategy ?? "selection",
        };
      },
  },
  {
    name: "listLogicFlowDiagrams",
    description:
      "列出当前文档中的所有 LogicFlow 流程图及稳定 ID、页面和节点/连线统计。修改流程图前先调用此工具。",
    inputSchema: z.object({}),
    readOnly: true,
    execute: (editor: Editor) => async () => {
      const diagrams = listLogicFlowDiagramRefs(editor).map((ref) => {
        const { document } = readLogicFlowDiagramRef(editor, ref);
        const pages = pageSummary(document);
        return {
          index: ref.index,
          diagramId: ref.diagramId,
          position: ref.position,
          nodeSize: ref.nodeSize,
          title: document.title,
          pageCount: document.pages.length,
          nodeCount: pages.reduce((total, page) => total + page.nodeCount, 0),
          edgeCount: pages.reduce((total, page) => total + page.edgeCount, 0),
          pages,
        };
      });
      return { success: true, count: diagrams.length, diagrams };
    },
  },
  {
    name: "getLogicFlowDiagram",
    description:
      "读取指定 LogicFlow 流程图的页面摘要以及一个页面的完整节点、连线、分组、图层和设置。优先用 diagramId 定位。",
    inputSchema: z.object({
      ...targetFields,
      pageId: z.string().describe("要读取的页面 ID；默认第一页").optional(),
    }),
    readOnly: true,
    execute: (editor: Editor) => async (params: GetDiagramParams) => {
      const { ref, document } = readLogicFlowDiagramAtTarget(editor, params);
      const pageId = params.pageId ?? document.pages[0]?.id;
      const page = document.pages.find((candidate) => candidate.id === pageId);
      if (!page) throw new Error(`未找到 pageId 为 "${pageId}" 的页面`);
      return {
        success: true,
        diagramId: ref.diagramId,
        position: ref.position,
        title: document.title,
        pages: pageSummary(document),
        page,
      };
    },
  },
  {
    name: "searchLogicFlowShapes",
    description:
      "搜索 LogicFlow 已注册形状。只有 rect、ellipse、diamond 等基础形状不够表达需求时再调用。",
    inputSchema: z.object({
      query: z.string().describe("形状名称、类型、别名或关键词").optional(),
      category: z
        .enum(
          SHAPE_CATEGORIES.map((item) => item.id) as [
            ShapeCategory,
            ...ShapeCategory[],
          ],
        )
        .describe("形状分类")
        .optional(),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .describe("结果上限，默认 20")
        .optional(),
    }),
    readOnly: true,
    execute:
      (_editor: Editor) =>
      async (params: {
        query?: string;
        category?: ShapeCategory;
        limit?: number;
      }) => {
        const limit = params.limit ?? 20;
        const shapes = searchShapes(params.query ?? "")
          .filter(
            (shape) => !params.category || shape.category === params.category,
          )
          .slice(0, limit)
          .map((shape) => ({
            type: shape.type,
            label: shape.label,
            category: shape.category,
            aliases: shape.aliases,
            defaultText: shape.defaultText,
            width: shape.width,
            height: shape.height,
            directlyInsertable: !shape.containerId,
          }));
        return { success: true, count: shapes.length, shapes };
      },
  },
  {
    name: "applyLogicFlowEdits",
    description: `对指定 LogicFlow 页面原子地批量新增、更新或删除节点和连线。先用 listLogicFlowDiagrams 和 getLogicFlowDiagram 获取真实 ID；不要猜测 diagramId、pageId 或元素 ID。`,
    inputSchema: z.object({
      ...targetFields,
      pageId: z.string().describe("目标页面 ID；默认第一页").optional(),
      edits: z
        .array(editSchema)
        .min(1)
        .max(200)
        .describe("按顺序执行的节点和连线编辑；后续编辑可引用本批次新增元素"),
    }),
    execute: (editor: Editor) => async (params: ApplyEditsParams) => {
      const current = readLogicFlowDiagramAtTarget(editor, params);
      const pageId = params.pageId ?? current.document.pages[0]?.id;
      if (!pageId) throw new Error("LogicFlow 文档没有可编辑页面");
      const result = applyLogicFlowGraphEdits(
        current.document,
        pageId,
        params.edits,
      );
      const updated = updateLogicFlowDiagramAtTarget(
        editor,
        current.ref.diagramId
          ? { diagramId: current.ref.diagramId }
          : { position: current.ref.position },
        result.document,
      );
      const page = updated.document.pages.find(
        (candidate) => candidate.id === pageId,
      )!;
      return {
        success: true,
        diagramId: updated.ref.diagramId,
        position: updated.ref.position,
        pageId,
        applied: result.applied,
        changed: updated.changed,
        cascadeDeletedEdgeIds: result.cascadeDeletedEdgeIds,
        nodeCount: page.graph.nodes.length,
        edgeCount: page.graph.edges.length,
      };
    },
  },
];
